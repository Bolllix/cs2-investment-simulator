import {
  CaseMeta,
  DailyHistoryPoint,
  DailyPrice,
  HoldingItem,
  PortfolioState,
  Rule,
  SimulationConfig,
  SimulationResult,
  Transaction
} from '../types/simulator';
import { RuleEvaluator } from './ruleEvaluator';

export class SimulationEngine {
  public static runSimulation(allCases: CaseMeta[], config: SimulationConfig): SimulationResult {
    // 1. Build lookup maps
    const caseMapByName = new Map<string, CaseMeta>();
    const caseMapById = new Map<string, CaseMeta>();
    const casePriceHistoryMap = new Map<string, DailyPrice[]>();
    const dateCasePriceMap = new Map<string, Map<string, DailyPrice>>();

    for (const c of allCases) {
      caseMapByName.set(c.name, c);
      caseMapById.set(c.id, c);
      casePriceHistoryMap.set(c.id, c.dailyPrices);

      for (const dp of c.dailyPrices) {
        let dateMap = dateCasePriceMap.get(dp.dateStr);
        if (!dateMap) {
          dateMap = new Map<string, DailyPrice>();
          dateCasePriceMap.set(dp.dateStr, dateMap);
        }
        dateMap.set(c.id, dp);
      }
    }

    // 2. Build filtered timeline
    const allDates = Array.from(dateCasePriceMap.keys()).sort();
    const startDate = config.startDate || allDates[0];
    const endDate = config.endDate || allDates[allDates.length - 1];

    const timeline = allDates.filter(d => d >= startDate && d <= endDate);

    // 3. Initialize state
    const portfolio: PortfolioState = {
      cash: config.initialCash,
      holdings: new Map<string, HoldingItem>()
    };

    const history: DailyHistoryPoint[] = [];
    const transactions: Transaction[] = [];
    let peakValue = config.initialCash;
    let maxDrawdown = 0;
    let winningTrades = 0;
    let losingTrades = 0;
    let totalFeesPaid = 0;

    const ruleStats: Record<string, { triggers: number; totalVolumeEur: number; profitEur: number }> = {};
    for (const r of config.rules) {
      ruleStats[r.name] = { triggers: 0, totalVolumeEur: 0, profitEur: 0 };
    }

    const simStartTimestamp = timeline.length > 0 ? (dateCasePriceMap.get(timeline[0])?.values().next().value?.timestamp || 0) : 0;

    // 4. Day-by-day simulation loop
    for (let dayIdx = 0; dayIdx < timeline.length; dayIdx++) {
      const dateStr = timeline[dayIdx];
      const todayPricesMap = dateCasePriceMap.get(dateStr)!;
      const todayTimestamp = todayPricesMap.values().next().value?.timestamp || 0;

      // Active cases on this date
      const activeCasesOnDate: { meta: CaseMeta; price: number }[] = [];
      for (const [caseId, dp] of todayPricesMap.entries()) {
        const meta = caseMapById.get(caseId);
        if (meta && dp.price > 0) {
          activeCasesOnDate.push({ meta, price: dp.price });
        }
      }

      if (activeCasesOnDate.length === 0) continue;

      // Evaluate rules in order
      for (const rule of config.rules) {
        if (!rule.enabled) continue;

        // Resolve target cases
        const targetCases = this.resolveTargetCases(rule.target, activeCasesOnDate, casePriceHistoryMap, dateStr);

        for (const targetObj of targetCases) {
          const { meta, price } = targetObj;

          const triggered = RuleEvaluator.evaluateRule(
            rule,
            meta,
            price,
            dateStr,
            todayTimestamp,
            casePriceHistoryMap,
            portfolio,
            simStartTimestamp
          );

          if (!triggered) continue;

          // Process Action
          if (rule.action === 'BUY') {
            let budgetToSpend = 0;

            if (rule.budgetMode === 'FIXED_EUR') {
              budgetToSpend = Math.min(rule.budgetValue, portfolio.cash);
            } else if (rule.budgetMode === 'PERCENT_CASH') {
              budgetToSpend = portfolio.cash * (Math.min(100, Math.max(0, rule.budgetValue)) / 100);
            } else if (rule.budgetMode === 'FIXED_UNITS') {
              const maxUnits = Math.min(rule.budgetValue, Math.floor(portfolio.cash / price));
              budgetToSpend = maxUnits * price;
            }

            const unitsToBuy = Math.floor(budgetToSpend / price);
            if (unitsToBuy > 0) {
              const grossTotal = unitsToBuy * price;
              if (grossTotal <= portfolio.cash + 0.0001) {
                portfolio.cash -= grossTotal;

                // Update holding
                let holding = portfolio.holdings.get(meta.name);
                if (!holding) {
                  holding = {
                    caseName: meta.name,
                    quantity: 0,
                    totalCost: 0,
                    avgBuyPrice: 0,
                    firstBuyDate: dateStr,
                    buyTimestamps: []
                  };
                  portfolio.holdings.set(meta.name, holding);
                }

                holding.quantity += unitsToBuy;
                holding.totalCost += grossTotal;
                holding.avgBuyPrice = holding.totalCost / holding.quantity;
                holding.buyTimestamps.push({
                  timestamp: todayTimestamp,
                  price,
                  count: unitsToBuy
                });

                // Log Transaction
                const tx: Transaction = {
                  id: `tx-${transactions.length + 1}`,
                  timestamp: todayTimestamp,
                  dateStr,
                  ruleName: rule.name,
                  action: 'BUY',
                  caseName: meta.name,
                  units: unitsToBuy,
                  pricePerUnit: price,
                  grossTotal,
                  feePaid: 0,
                  netTotal: grossTotal,
                  reason: `Regel "${rule.name}" ausgelöst`
                };
                transactions.push(tx);

                // Stats
                if (!ruleStats[rule.name]) ruleStats[rule.name] = { triggers: 0, totalVolumeEur: 0, profitEur: 0 };
                ruleStats[rule.name].triggers++;
                ruleStats[rule.name].totalVolumeEur += grossTotal;
              }
            }
          } else if (rule.action === 'SELL') {
            const holding = portfolio.holdings.get(meta.name);
            if (holding && holding.quantity > 0) {
              let unitsToSell = 0;

              if (rule.budgetMode === 'PERCENT_HOLDING') {
                unitsToSell = Math.floor(holding.quantity * (Math.min(100, Math.max(0, rule.budgetValue)) / 100));
              } else if (rule.budgetMode === 'FIXED_UNITS') {
                unitsToSell = Math.min(rule.budgetValue, holding.quantity);
              } else if (rule.budgetMode === 'FIXED_EUR') {
                const targetUnits = Math.ceil(rule.budgetValue / price);
                unitsToSell = Math.min(targetUnits, holding.quantity);
              } else if (rule.budgetMode === 'PERCENT_CASH') {
                // Default to selling 100% of holdings if specified percent
                unitsToSell = holding.quantity;
              }

              if (unitsToSell > 0) {
                const grossTotal = unitsToSell * price;
                const feePaid = grossTotal * (Math.max(0, config.feePercent) / 100);
                const netTotal = grossTotal - feePaid;

                portfolio.cash += netTotal;
                totalFeesPaid += feePaid;

                // Profit calculation on sold portion
                const costBasis = holding.avgBuyPrice * unitsToSell;
                const tradeProfit = netTotal - costBasis;

                if (tradeProfit > 0) winningTrades++;
                else losingTrades++;

                holding.quantity -= unitsToSell;
                holding.totalCost -= costBasis;
                if (holding.quantity <= 0) {
                  holding.quantity = 0;
                  holding.totalCost = 0;
                  holding.avgBuyPrice = 0;
                  holding.buyTimestamps = [];
                }

                // Log Transaction
                const tx: Transaction = {
                  id: `tx-${transactions.length + 1}`,
                  timestamp: todayTimestamp,
                  dateStr,
                  ruleName: rule.name,
                  action: 'SELL',
                  caseName: meta.name,
                  units: unitsToSell,
                  pricePerUnit: price,
                  grossTotal,
                  feePaid,
                  netTotal,
                  reason: `Regel "${rule.name}" ausgelöst`
                };
                transactions.push(tx);

                // Stats
                if (!ruleStats[rule.name]) ruleStats[rule.name] = { triggers: 0, totalVolumeEur: 0, profitEur: 0 };
                ruleStats[rule.name].triggers++;
                ruleStats[rule.name].totalVolumeEur += netTotal;
                ruleStats[rule.name].profitEur += tradeProfit;
              }
            }
          }
        }
      }

      // Record daily snapshot
      let dailyAssetValue = 0;
      for (const [caseName, h] of portfolio.holdings.entries()) {
        if (h.quantity > 0) {
          const meta = caseMapByName.get(caseName);
          if (meta) {
            const dp = todayPricesMap.get(meta.id);
            const p = dp ? dp.price : meta.currentPrice;
            dailyAssetValue += h.quantity * p;
          }
        }
      }

      const dailyTotalValue = portfolio.cash + dailyAssetValue;
      if (dailyTotalValue > peakValue) {
        peakValue = dailyTotalValue;
      }
      const drawdown = peakValue > 0 ? ((peakValue - dailyTotalValue) / peakValue) * 100 : 0;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }

      const roiPercent = ((dailyTotalValue - config.initialCash) / config.initialCash) * 100;

      history.push({
        dateStr,
        timestamp: todayTimestamp,
        cash: parseFloat(portfolio.cash.toFixed(2)),
        assetValue: parseFloat(dailyAssetValue.toFixed(2)),
        totalValue: parseFloat(dailyTotalValue.toFixed(2)),
        roiPercent: parseFloat(roiPercent.toFixed(2))
      });
    }

    // Calculate final metrics
    let finalAssetValue = 0;
    const finalHoldings: HoldingItem[] = [];
    const lastDateStr = timeline[timeline.length - 1] || endDate;
    const lastDayPrices = dateCasePriceMap.get(lastDateStr) || new Map();

    for (const [caseName, h] of portfolio.holdings.entries()) {
      if (h.quantity > 0) {
        const meta = caseMapByName.get(caseName);
        const p = meta ? (lastDayPrices.get(meta.id)?.price || meta.currentPrice) : 0;
        finalAssetValue += h.quantity * p;
        finalHoldings.push({ ...h });
      }
    }

    const finalCash = portfolio.cash;
    const finalTotalValue = finalCash + finalAssetValue;
    const totalProfit = finalTotalValue - config.initialCash;
    const totalRoiPercent = (totalProfit / config.initialCash) * 100;

    return {
      config,
      initialCash: config.initialCash,
      finalCash: parseFloat(finalCash.toFixed(2)),
      finalAssetValue: parseFloat(finalAssetValue.toFixed(2)),
      finalTotalValue: parseFloat(finalTotalValue.toFixed(2)),
      totalProfit: parseFloat(totalProfit.toFixed(2)),
      totalRoiPercent: parseFloat(totalRoiPercent.toFixed(2)),
      totalFeesPaid: parseFloat(totalFeesPaid.toFixed(2)),
      totalTransactions: transactions.length,
      winningTrades,
      losingTrades,
      maxDrawdownPercent: parseFloat(maxDrawdown.toFixed(2)),
      history,
      transactions,
      finalHoldings,
      ruleStats
    };
  }

  private static resolveTargetCases(
    target: string,
    activeCasesOnDate: { meta: CaseMeta; price: number }[],
    casePriceHistoryMap: Map<string, DailyPrice[]>,
    dateStr: string
  ): { meta: CaseMeta; price: number }[] {
    if (target === 'ALL_CASES') {
      return activeCasesOnDate;
    }

    if (target === 'CHEAPEST_CASE') {
      let cheapest = activeCasesOnDate[0];
      for (const item of activeCasesOnDate) {
        if (item.price < cheapest.price) cheapest = item;
      }
      return cheapest ? [cheapest] : [];
    }

    if (target === 'MOST_EXPENSIVE_CASE') {
      let expensive = activeCasesOnDate[0];
      for (const item of activeCasesOnDate) {
        if (item.price > expensive.price) expensive = item;
      }
      return expensive ? [expensive] : [];
    }

    if (target === 'TOP_GAINER_7D') {
      let topGainer = activeCasesOnDate[0];
      let maxGain = -Infinity;

      for (const item of activeCasesOnDate) {
        const history = casePriceHistoryMap.get(item.meta.id) || [];
        const idx = history.findIndex(h => h.dateStr === dateStr);
        if (idx > 7) {
          const pastP = history[idx - 7].price;
          const gain = ((item.price - pastP) / pastP) * 100;
          if (gain > maxGain) {
            maxGain = gain;
            topGainer = item;
          }
        }
      }
      return topGainer ? [topGainer] : [];
    }

    if (target === 'TOP_LOSER_7D') {
      let topLoser = activeCasesOnDate[0];
      let maxDrop = -Infinity;

      for (const item of activeCasesOnDate) {
        const history = casePriceHistoryMap.get(item.meta.id) || [];
        const idx = history.findIndex(h => h.dateStr === dateStr);
        if (idx > 7) {
          const pastP = history[idx - 7].price;
          const drop = ((pastP - item.price) / pastP) * 100;
          if (drop > maxDrop) {
            maxDrop = drop;
            topLoser = item;
          }
        }
      }
      return topLoser ? [topLoser] : [];
    }

    // Specific Case Target
    const found = activeCasesOnDate.find(
      c => c.meta.name.toLowerCase() === target.toLowerCase() || c.meta.id.toLowerCase() === target.toLowerCase()
    );
    return found ? [found] : [];
  }
}

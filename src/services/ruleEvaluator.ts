import { CaseMeta, Condition, DailyPrice, HoldingItem, PortfolioState, Rule } from '../types/simulator';

export class RuleEvaluator {
  public static evaluateCondition(
    condition: Condition,
    currentCase: CaseMeta,
    currentPrice: number,
    currentDateStr: string,
    currentTimestamp: number,
    casePriceHistoryMap: Map<string, DailyPrice[]>,
    portfolio: PortfolioState,
    simulationStartTimestamp: number
  ): boolean {
    const history = casePriceHistoryMap.get(currentCase.id) || [];
    const holding = portfolio.holdings.get(currentCase.name);

    switch (condition.type) {
      case 'ALWAYS':
        return true;

      case 'PRICE_LESS_THAN':
        return currentPrice <= condition.value;

      case 'PRICE_GREATER_THAN':
        return currentPrice >= condition.value;

      case 'PRICE_DROP_PERCENT_N_DAYS': {
        const days = condition.daysLookback || 7;
        const pastPrice = this.getPastPrice(history, currentDateStr, days);
        if (!pastPrice || pastPrice <= 0) return false;
        const dropPercent = ((pastPrice - currentPrice) / pastPrice) * 100;
        return dropPercent >= condition.value;
      }

      case 'PRICE_RISE_PERCENT_N_DAYS': {
        const days = condition.daysLookback || 7;
        const pastPrice = this.getPastPrice(history, currentDateStr, days);
        if (!pastPrice || pastPrice <= 0) return false;
        const risePercent = ((currentPrice - pastPrice) / pastPrice) * 100;
        return risePercent >= condition.value;
      }

      case 'HOLDING_TIME_DAYS': {
        if (!holding || holding.quantity <= 0) return false;
        const firstBuyTime = holding.buyTimestamps[0]?.timestamp || currentTimestamp;
        const daysHeld = Math.floor((currentTimestamp - firstBuyTime) / (86400 * 1000));
        return daysHeld >= condition.value;
      }

      case 'PROFIT_PERCENT_GREATER': {
        if (!holding || holding.quantity <= 0 || holding.avgBuyPrice <= 0) return false;
        const gainPercent = ((currentPrice - holding.avgBuyPrice) / holding.avgBuyPrice) * 100;
        return gainPercent >= condition.value;
      }

      case 'PROFIT_PERCENT_LESS': {
        if (!holding || holding.quantity <= 0 || holding.avgBuyPrice <= 0) return false;
        const gainPercent = ((currentPrice - holding.avgBuyPrice) / holding.avgBuyPrice) * 100;
        // Allows negative values (e.g., -10 for 10% loss stop-loss) or positive limit
        return gainPercent <= condition.value;
      }

      case 'CALENDAR_MONTHLY': {
        const dayOfMonth = parseInt(currentDateStr.split('-')[2], 10);
        return dayOfMonth === Math.min(condition.value, 28);
      }

      case 'CALENDAR_INTERVAL_DAYS': {
        const daysElapsed = Math.floor((currentTimestamp - simulationStartTimestamp) / (86400 * 1000));
        return daysElapsed > 0 && daysElapsed % Math.max(1, condition.value) === 0;
      }

      case 'PORTFOLIO_CASH_GREATER':
        return portfolio.cash >= condition.value;

      case 'PORTFOLIO_UNITS_LESS': {
        const unitsHeld = holding ? holding.quantity : 0;
        return unitsHeld < condition.value;
      }

      default:
        return false;
    }
  }

  public static evaluateRule(
    rule: Rule,
    currentCase: CaseMeta,
    currentPrice: number,
    currentDateStr: string,
    currentTimestamp: number,
    casePriceHistoryMap: Map<string, DailyPrice[]>,
    portfolio: PortfolioState,
    simulationStartTimestamp: number
  ): boolean {
    if (!rule.enabled) return false;

    const res1 = this.evaluateCondition(
      rule.condition1,
      currentCase,
      currentPrice,
      currentDateStr,
      currentTimestamp,
      casePriceHistoryMap,
      portfolio,
      simulationStartTimestamp
    );

    if (rule.operator === 'NONE' || !rule.condition2) {
      return res1;
    }

    const res2 = this.evaluateCondition(
      rule.condition2,
      currentCase,
      currentPrice,
      currentDateStr,
      currentTimestamp,
      casePriceHistoryMap,
      portfolio,
      simulationStartTimestamp
    );

    if (rule.operator === 'AND') {
      return res1 && res2;
    } else if (rule.operator === 'OR') {
      return res1 || res2;
    }

    return res1;
  }

  private static getPastPrice(history: DailyPrice[], currentDateStr: string, daysAgo: number): number | null {
    const currentIndex = history.findIndex(p => p.dateStr === currentDateStr);
    if (currentIndex <= 0) return null;

    const pastIndex = Math.max(0, currentIndex - daysAgo);
    return history[pastIndex]?.price || null;
  }
}

import { Rule, StrategyPreset } from '../types/simulator';

export const DEFAULT_PRESETS: StrategyPreset[] = [
  {
    id: 'dip-buyer',
    title: '📉 Dip Buyer (Billigste Kiste im 20% Dip kaufen, bei 100% Gewinn verkaufen)',
    description: 'Sucht jeden Tag die aktuell günstigste CS2-Kiste. Wenn diese 20% unter dem Preis vor 7 Tagen liegt, kauft die Strategie für 100€ ein. Sobald der Gewinn 100% erreicht, wird komplett verkauft.',
    initialCash: 500,
    feePercent: 15,
    rules: [
      {
        id: 'r1',
        name: 'Günstigste Kiste im Dip kaufen',
        enabled: true,
        target: 'CHEAPEST_CASE',
        action: 'BUY',
        budgetMode: 'FIXED_EUR',
        budgetValue: 100,
        condition1: { type: 'PRICE_DROP_PERCENT_N_DAYS', value: 20, daysLookback: 7 },
        operator: 'NONE'
      },
      {
        id: 'r2',
        name: 'Bei 100% Gewinn verkaufen',
        enabled: true,
        target: 'ALL_CASES',
        action: 'SELL',
        budgetMode: 'PERCENT_HOLDING',
        budgetValue: 100,
        condition1: { type: 'PROFIT_PERCENT_GREATER', value: 100 },
        operator: 'NONE'
      }
    ]
  },
  {
    id: 'monthly-dca',
    title: '📅 DCA Sparplan (Jeden 1. im Monat für 50€ die günstigste Kiste kaufen)',
    description: 'Dollar-Cost-Averaging: Kaufe am 1. jedes Monats automatisch für 50€ die aktuell günstigste Kiste auf dem Markt. Verkaufe erst, wenn eine Position 150% Gewinn hat oder 365 Tage gehalten wurde.',
    initialCash: 1000,
    feePercent: 15,
    rules: [
      {
        id: 'r_dca_1',
        name: 'Monatlicher Kistenkauf (1. im Monat)',
        enabled: true,
        target: 'CHEAPEST_CASE',
        action: 'BUY',
        budgetMode: 'FIXED_EUR',
        budgetValue: 50,
        condition1: { type: 'CALENDAR_MONTHLY', value: 1 },
        operator: 'AND',
        condition2: { type: 'PORTFOLIO_CASH_GREATER', value: 50 }
      },
      {
        id: 'r_dca_2',
        name: 'Verkauf bei 150% Gewinn ODER nach 1 Jahr Haltedauer',
        enabled: true,
        target: 'ALL_CASES',
        action: 'SELL',
        budgetMode: 'PERCENT_HOLDING',
        budgetValue: 100,
        condition1: { type: 'PROFIT_PERCENT_GREATER', value: 150 },
        operator: 'OR',
        condition2: { type: 'HOLDING_TIME_DAYS', value: 365 }
      }
    ]
  },
  {
    id: 'csfloat-momentum',
    title: '⚡ CSFloat Low Fee Momentum Trader (2% Gebühr)',
    description: 'Nutzt die niedrige CSFloat-Gebühr von 2%. Kaufe den stärksten Gewinner der letzten 7 Tage mit 25% des Cash-Bestands und verkaufe schnell bei 30% Gewinn oder 10% Stop-Loss.',
    initialCash: 500,
    feePercent: 2,
    rules: [
      {
        id: 'r_mom_1',
        name: 'Momentum Kaufen',
        enabled: true,
        target: 'TOP_GAINER_7D',
        action: 'BUY',
        budgetMode: 'PERCENT_CASH',
        budgetValue: 25,
        condition1: { type: 'PRICE_RISE_PERCENT_N_DAYS', value: 15, daysLookback: 7 },
        operator: 'NONE'
      },
      {
        id: 'r_mom_2',
        name: 'Take Profit 30%',
        enabled: true,
        target: 'ALL_CASES',
        action: 'SELL',
        budgetMode: 'PERCENT_HOLDING',
        budgetValue: 100,
        condition1: { type: 'PROFIT_PERCENT_GREATER', value: 30 },
        operator: 'NONE'
      },
      {
        id: 'r_mom_3',
        name: 'Stop Loss 10%',
        enabled: true,
        target: 'ALL_CASES',
        action: 'SELL',
        budgetMode: 'PERCENT_HOLDING',
        budgetValue: 100,
        condition1: { type: 'PROFIT_PERCENT_LESS', value: -10 },
        operator: 'NONE'
      }
    ]
  }
];

export class PresetStore {
  private static STORAGE_KEY = 'cs2_invest_rules_saved';

  public static getSavedRules(): Rule[] | null {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  public static saveRules(rules: Rule[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(rules));
    } catch (e) {
      console.error('Failed to save rules to localStorage', e);
    }
  }
}

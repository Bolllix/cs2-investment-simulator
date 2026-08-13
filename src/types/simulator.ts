// Hält alle Types und Interfaces

export type TargetType =
  | 'ALL_CASES'
  | 'CHEAPEST_CASE'
  | 'MOST_EXPENSIVE_CASE'
  | 'TOP_GAINER_7D'
  | 'TOP_LOSER_7D'
  | string; // Specific case name

export type ActionType = 'BUY' | 'SELL';

export type BudgetMode = 'FIXED_EUR' | 'PERCENT_CASH' | 'PERCENT_HOLDING' | 'FIXED_UNITS';

export type ConditionType = 
  | 'ALWAYS'
  | 'PRICE_LESS_THAN'
  | 'PRICE_GREATER_THAN'
  | 'PRICE_DROP_PERCENT_N_DAYS'
  | 'PRICE_RISE_PERCENT_N_DAYS'
  | 'HOLDING_TIME_DAYS'
  | 'PROFIT_PERCENT_GREATER'
  | 'PROFIT_PERCENT_LESS'
  | 'CALENDAR_MONTHLY'
  | 'CALENDAR_INTERVAL_DAYS'
  | 'PORTFOLIO_CASH_GREATER'
  | 'PORTFOLIO_UNITS_LESS';

export type LogicalOperator = 'NONE' | 'AND' | 'OR';

export interface Condition {
  type: ConditionType;
  value: number;
  daysLookback?: number;
}

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  target: TargetType;
  action: ActionType;
  budgetMode: BudgetMode;
  budgetValue: number;
  condition1: Condition;
  operator: LogicalOperator;
  condition2?: Condition;
}

export interface RawPriceEntry {
  dateStr: string; // e.g. "Aug 14 2013 01: +0"
  price: number;
  volume: number;
}

export interface DailyPrice {
  dateStr: string; // ISO format "YYYY-MM-DD"
  timestamp: number;
  price: number;
  volume: number;
}

export interface CaseMeta {
  id: string;
  filename: string;
  name: string;
  orderNumber: number;
  dailyPrices: DailyPrice[];
  minPrice: number;
  maxPrice: number;
  currentPrice: number;
  firstDateStr: string;
  lastDateStr: string;
}

export interface HoldingItem {
  caseName: string;
  quantity: number;
  totalCost: number;
  avgBuyPrice: number;
  firstBuyDate: string;
  buyTimestamps: { timestamp: number; price: number; count: number }[];
}

export interface PortfolioState {
  cash: number;
  holdings: Map<string, HoldingItem>;
}

export interface Transaction {
  id: string;
  timestamp: number;
  dateStr: string;
  ruleName: string;
  action: ActionType;
  caseName: string;
  units: number;
  pricePerUnit: number;
  grossTotal: number;
  feePaid: number;
  netTotal: number;
  reason: string;
}

export interface DailyHistoryPoint {
  dateStr: string;
  timestamp: number;
  cash: number;
  assetValue: number;
  totalValue: number;
  roiPercent: number;
}

export interface SimulationConfig {
  initialCash: number;
  startDate: string; // "YYYY-MM-DD"
  endDate: string;   // "YYYY-MM-DD"
  feePercent: number; // e.g. 15 for Steam, 2 for CSFloat
  rules: Rule[];
}

export interface SimulationResult {
  config: SimulationConfig;
  initialCash: number;
  finalCash: number;
  finalAssetValue: number;
  finalTotalValue: number;
  totalProfit: number;
  totalRoiPercent: number;
  totalFeesPaid: number;
  totalTransactions: number;
  winningTrades: number;
  losingTrades: number;
  maxDrawdownPercent: number;
  history: DailyHistoryPoint[];
  transactions: Transaction[];
  finalHoldings: HoldingItem[];
  ruleStats: Record<string, { triggers: number; totalVolumeEur: number; profitEur: number }>;
}

export interface StrategyPreset {
  id: string;
  title: string;
  description: string;
  initialCash: number;
  feePercent: number;
  rules: Rule[];
}

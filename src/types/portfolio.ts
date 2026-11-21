export type AppTab = 'overview' | 'market' | 'watchlist' | 'menu';
export type ThemeMode = 'dark' | 'light';
export type ChartRange = '1d' | '5d' | '1m' | '3m' | 'ytd' | '1y' | '3y' | '5y' | 'max';

export type TransactionType =
  | 'BUY'
  | 'SELL'
  | 'DIVIDEND'
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'TAX'
  | 'FEE'
  | 'INTEREST'
  | 'SPLIT_IN'
  | 'SPLIT_OUT'
  | 'FX'
  | 'OTHER';

export interface Transaction {
  id: string;
  numericId: number;
  rowIndex: number;
  bookingDate: string; // YYYY-MM-DD
  tradeDate: string; // YYYY-MM-DD
  account: string;
  rawType: string;
  type: TransactionType;
  instrumentType?: string;
  securityName: string;
  isin: string;
  quantity: number;
  price: number;
  priceCurrency: string;
  amount: number; // Cash impact in amountCurrency (negative for buy, positive for sell/div)
  amountCurrency: string;
  amountSek: number; // Exact cash impact converted to SEK
  currency: string; // Primary instrument currency
  exchangeRate: number;
  brokerage: number;
  realizedResultSek?: number;
  totalQuantityAfter?: number; // Nordnet "Totalt antal" column if present
  balanceAfter?: number; // Nordnet "Saldo" column if present
  transactionText?: string;
}

export interface Holding {
  key: string;
  securityName: string;
  isin: string;
  symbol: string;
  account: string;
  quantity: number;
  avgPrice: number; // GAV in instrument currency
  avgPriceSek: number; // GAV in SEK
  currency: string;
  csvLastPrice?: number;
  csvMarketValueSek?: number;
  totalDividendsSek: number;
  realizedPnLSek: number;
  totalBrokerageSek: number;
  totalBoughtQty: number;
  totalSoldQty: number;
  totalBoughtSek: number;
  totalSoldSek: number;
  firstTradeDate?: string;
  lastTradeDate?: string;
  sector?: string;
}

export interface ClosedHolding {
  key: string;
  securityName: string;
  isin: string;
  symbol: string;
  account: string;
  currency: string;
  totalBoughtQty: number;
  totalSoldQty: number;
  avgBuyPrice: number;
  avgSellPrice: number;
  totalBoughtSek: number;
  totalSoldSek: number;
  realizedPnLSek: number;
  realizedPnLPercent: number;
  totalDividendsSek: number;
  totalBrokerageSek: number;
  firstTradeDate: string;
  lastTradeDate: string;
  sector?: string;
}

export interface CsvImportDiagnostics {
  delimiter: string;
  detectedColumns: string[];
  skippedCancelledRows: number;
  typeCounts: Record<string, number>;
  unclassifiedTypes: string[];
  activeHoldingsCount: number;
  closedHoldingsCount: number;
}

export interface ImportedFileMeta {
  id: string;
  fileName: string;
  importedAt: string;
  format: 'transactions' | 'holdings' | 'demo';
  rowCount: number;
  accounts: string[];
  diagnostics?: CsvImportDiagnostics;
}

export interface MarketQuote {
  symbol: string;
  shortName: string;
  longName: string;
  currency: string;
  exchange: string;
  marketState: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketPreviousClose: number;
  regularMarketOpen: number | null;
  regularMarketDayHigh: number | null;
  regularMarketDayLow: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  regularMarketVolume: number | null;
  averageDailyVolume3Month: number | null;
  marketCap: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  epsTrailingTwelveMonths: number | null;
  dividendYield: number | null;
  dividendRate: number | null;
  bid: number | null;
  ask: number | null;
  fiftyDayAverage: number | null;
  twoHundredDayAverage: number | null;
  regularMarketTime: string;
  displayName?: string;
}

export interface ChartPoint {
  time: number;
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
}

export interface StockChartResponse {
  symbol: string;
  range: ChartRange;
  currency: string;
  regularMarketPrice: number;
  previousClose: number;
  points: ChartPoint[];
}

export interface StockFundamentals {
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  priceToSales: number | null;
  enterpriseToEbitda: number | null;
  enterpriseValue: number | null;
  marketCap: number | null;
  epsTrailing: number | null;
  epsForward: number | null;
  dividendYield: number | null;
  dividendRate: number | null;
  payoutRatio: number | null;
  exDividendDate: string | null;
  nextEarningsDate: string | null;
  profitMargins: number | null;
  operatingMargins: number | null;
  grossMargins: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  totalRevenue: number | null;
  totalDebt: number | null;
  totalCash: number | null;
  debtToEquity: number | null;
  freeCashflow: number | null;
  beta: number | null;
  fiftyDayAverage: number | null;
  twoHundredDayAverage: number | null;
  targetMeanPrice: number | null;
  targetHighPrice: number | null;
  targetLowPrice: number | null;
  recommendationKey: string | null;
  numberOfAnalystOpinions: number | null;
  sharesOutstanding: number | null;
}

export interface StockProfile {
  sector: string | null;
  industry: string | null;
  country: string | null;
  city: string | null;
  website: string | null;
  employees: number | null;
  ceo: string | null;
  description: string | null;
}

export interface StockNewsItem {
  uuid: string;
  title: string;
  publisher: string;
  link: string | null;
  publishedAt: string;
}

export interface StockDetailData {
  symbol: string;
  quote: MarketQuote | null;
  fundamentals: StockFundamentals;
  profile: StockProfile;
  news: StockNewsItem[];
}

export interface SearchQuote {
  symbol: string;
  shortName: string;
  longName: string;
  exchange: string;
  quoteType: string;
  sector: string | null;
}

export interface WatchlistItem {
  symbol: string;
  name: string;
  addedAt: string;
}

export type FxRates = Record<string, number>;

export interface PortfolioState {
  transactions: Transaction[];
  directHoldings: Holding[];
  cashByAccount: Record<string, number>;
  imports: ImportedFileMeta[];
  customTickerMap: Record<string, string>;
  watchlist: WatchlistItem[];
  cachedQuotes: Record<string, MarketQuote>;
  fxRates: FxRates;
  lastSyncedAt: string | null;
}

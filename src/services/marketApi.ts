import type {
  ChartRange,
  FxRates,
  MarketQuote,
  SearchQuote,
  StockChartResponse,
  StockDetailData,
} from '../types/portfolio';

const DETAIL_CACHE_PREFIX = 'nordvyn_detail_v1_';
const CHART_CACHE_PREFIX = 'nordvyn_chart_v1_';

function readLocalCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeLocalCache<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

export async function fetchBatchQuotes(symbols: string[]): Promise<Record<string, MarketQuote>> {
  const unique = Array.from(new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)));
  if (unique.length === 0) return {};

  const res = await fetch(`/api/market/quotes?symbols=${encodeURIComponent(unique.join(','))}`);
  if (!res.ok) {
    throw new Error('Kunde inte hämta kurser');
  }
  const data = (await res.json()) as { quotes?: Record<string, MarketQuote> };
  return data.quotes ?? {};
}

export async function fetchFxRates(): Promise<FxRates> {
  const res = await fetch('/api/market/fx');
  if (!res.ok) {
    throw new Error('Kunde inte hämta växelkurser');
  }
  const data = (await res.json()) as { rates?: FxRates };
  return data.rates ?? { SEK: 1, USD: 10.65, EUR: 11.45, DKK: 1.535, NOK: 0.975 };
}

export async function fetchStockChart(symbol: string, range: ChartRange): Promise<StockChartResponse> {
  const cacheKey = `${CHART_CACHE_PREFIX}${symbol.toUpperCase()}_${range}`;
  try {
    const res = await fetch(
      `/api/market/chart?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`
    );
    if (!res.ok) throw new Error('Kunde inte hämta kursgraf');
    const data = (await res.json()) as StockChartResponse;
    if (data.points && data.points.length > 0) {
      writeLocalCache(cacheKey, data);
    }
    return data;
  } catch (err) {
    const cached = readLocalCache<StockChartResponse>(cacheKey);
    if (cached) return cached;
    throw err;
  }
}

export async function fetchStockSummary(symbol: string): Promise<StockDetailData> {
  const cacheKey = `${DETAIL_CACHE_PREFIX}${symbol.toUpperCase()}`;
  try {
    const res = await fetch(`/api/market/summary?symbol=${encodeURIComponent(symbol)}`);
    if (!res.ok) throw new Error('Kunde inte hämta aktiedetaljer');
    const data = (await res.json()) as StockDetailData;
    writeLocalCache(cacheKey, data);
    return data;
  } catch (err) {
    const cached = readLocalCache<StockDetailData>(cacheKey);
    if (cached) return cached;
    throw err;
  }
}

export async function searchSecurities(query: string): Promise<SearchQuote[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const res = await fetch(`/api/market/search?q=${encodeURIComponent(trimmed)}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: SearchQuote[] };
  return data.results ?? [];
}

export async function fetchMarketOverview(): Promise<{
  indices: MarketQuote[];
  popular: MarketQuote[];
  updatedAt: string;
}> {
  const cacheKey = 'nordvyn_market_overview_v1';
  try {
    const res = await fetch('/api/market/overview');
    if (!res.ok) throw new Error('Kunde inte hämta marknadsöversikt');
    const data = (await res.json()) as {
      indices: MarketQuote[];
      popular: MarketQuote[];
      updatedAt: string;
    };
    writeLocalCache(cacheKey, data);
    return data;
  } catch (err) {
    const cached = readLocalCache<{ indices: MarketQuote[]; popular: MarketQuote[]; updatedAt: string }>(cacheKey);
    if (cached) return cached;
    throw err;
  }
}

/**
 * Attempts to resolve an unknown ISIN or Swedish stock name via Yahoo Finance search
 */
export async function resolveTickerOnline(name: string, isin: string): Promise<string | null> {
  try {
    if (isin && isin.length >= 10) {
      const byIsin = await searchSecurities(isin);
      if (byIsin.length > 0) return byIsin[0].symbol;
    }
    if (name.trim().length >= 2) {
      const byName = await searchSecurities(name);
      if (byName.length > 0) return byName[0].symbol;
    }
    return null;
  } catch {
    return null;
  }
}

import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import YahooFinance from 'yahoo-finance2';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const yf = new YahooFinance({
  suppressNotices: ['yahooSurvey', 'ripHistorical'],
});

const app = express();
app.use(express.json({ limit: '1mb' }));

// Simple bounded in-memory TTL cache to reduce Yahoo Finance rate limits
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const MAX_CACHE_ENTRIES = 600;

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

function setCached<T>(key: string, value: T, ttlMs: number): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// Strict input validators
const SYMBOL_REGEX = /^[A-Z0-9^.=_-]{1,22}$/i;
const ALLOWED_RANGES = new Set(['1d', '5d', '1m', '3m', 'ytd', '1y', '3y', '5y', 'max']);

function validateSymbol(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().toUpperCase();
  if (!SYMBOL_REGEX.test(cleaned)) return null;
  return cleaned;
}

function toSafeHttpsUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function num(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (val && typeof val === 'object' && 'raw' in val) {
    const raw = (val as { raw?: unknown }).raw;
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  }
  return null;
}

function mapQuote(q: Record<string, unknown>) {
  return {
    symbol: String(q.symbol ?? ''),
    shortName: String(q.shortName ?? q.longName ?? q.symbol ?? ''),
    longName: String(q.longName ?? q.shortName ?? q.symbol ?? ''),
    currency: String(q.currency ?? 'SEK'),
    exchange: String(q.fullExchangeName ?? q.exchange ?? ''),
    marketState: String(q.marketState ?? 'REGULAR'),
    regularMarketPrice: num(q.regularMarketPrice) ?? 0,
    regularMarketChange: num(q.regularMarketChange) ?? 0,
    regularMarketChangePercent: num(q.regularMarketChangePercent) ?? 0,
    regularMarketPreviousClose: num(q.regularMarketPreviousClose) ?? 0,
    regularMarketOpen: num(q.regularMarketOpen),
    regularMarketDayHigh: num(q.regularMarketDayHigh),
    regularMarketDayLow: num(q.regularMarketDayLow),
    fiftyTwoWeekHigh: num(q.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: num(q.fiftyTwoWeekLow),
    regularMarketVolume: num(q.regularMarketVolume),
    averageDailyVolume3Month: num(q.averageDailyVolume3Month),
    marketCap: num(q.marketCap),
    trailingPE: num(q.trailingPE),
    forwardPE: num(q.forwardPE),
    priceToBook: num(q.priceToBook),
    epsTrailingTwelveMonths: num(q.epsTrailingTwelveMonths),
    dividendYield: num(q.trailingAnnualDividendYield) ?? num(q.dividendYield),
    dividendRate: num(q.trailingAnnualDividendRate) ?? num(q.dividendRate),
    bid: num(q.bid),
    ask: num(q.ask),
    fiftyDayAverage: num(q.fiftyDayAverage),
    twoHundredDayAverage: num(q.twoHundredDayAverage),
    regularMarketTime: q.regularMarketTime ? new Date(q.regularMarketTime as string | number | Date).toISOString() : new Date().toISOString(),
  };
}

function getRangeParams(range: string): { period1: Date; interval: '5m' | '15m' | '1h' | '1d' | '1wk' | '1mo' } {
  const now = new Date();
  const d = new Date(now);
  switch (range) {
    case '1d':
      d.setDate(d.getDate() - 2);
      return { period1: d, interval: '5m' };
    case '5d':
      d.setDate(d.getDate() - 7);
      return { period1: d, interval: '15m' };
    case '1m':
      d.setMonth(d.getMonth() - 1);
      return { period1: d, interval: '1d' };
    case '3m':
      d.setMonth(d.getMonth() - 3);
      return { period1: d, interval: '1d' };
    case 'ytd':
      return { period1: new Date(now.getFullYear(), 0, 1), interval: '1d' };
    case '1y':
      d.setFullYear(d.getFullYear() - 1);
      return { period1: d, interval: '1d' };
    case '3y':
      d.setFullYear(d.getFullYear() - 3);
      return { period1: d, interval: '1wk' };
    case '5y':
      d.setFullYear(d.getFullYear() - 5);
      return { period1: d, interval: '1wk' };
    case 'max':
    default:
      d.setFullYear(d.getFullYear() - 15);
      return { period1: d, interval: '1mo' };
  }
}

// 1. Batch quotes endpoint
app.get('/api/market/quotes', async (req: Request, res: Response) => {
  try {
    const rawSymbols = typeof req.query.symbols === 'string' ? req.query.symbols : '';
    const symbols = Array.from(
      new Set(
        rawSymbols
          .split(',')
          .map((s) => validateSymbol(s))
          .filter((s): s is string => Boolean(s))
      )
    ).slice(0, 60);

    if (symbols.length === 0) {
      res.status(400).json({ error: 'Inga giltiga aktiesymboler angivna.' });
      return;
    }

    const cacheKey = `quotes:${symbols.slice().sort().join(',')}`;
    const cached = getCached<Record<string, ReturnType<typeof mapQuote>>>(cacheKey);
    if (cached) {
      res.json({ quotes: cached, cached: true });
      return;
    }

    const resultMap: Record<string, ReturnType<typeof mapQuote>> = {};
    try {
      const results = await yf.quote(symbols, {}, { validateResult: false });
      const list = Array.isArray(results) ? results : results ? [results] : [];
      for (const item of list) {
        if (item && typeof item === 'object' && 'symbol' in item) {
          const mapped = mapQuote(item as unknown as Record<string, unknown>);
          if (mapped.symbol) {
            resultMap[mapped.symbol.toUpperCase()] = mapped;
          }
        }
      }
    } catch {
      // Fallback: fetch individually so one invalid ticker does not break the whole batch
      await Promise.allSettled(
        symbols.map(async (sym) => {
          try {
            const single = await yf.quote(sym, {}, { validateResult: false });
            if (single && typeof single === 'object') {
              const mapped = mapQuote(single as unknown as Record<string, unknown>);
              if (mapped.symbol) {
                resultMap[mapped.symbol.toUpperCase()] = mapped;
              }
            }
          } catch {
            // Skip invalid individual symbol
          }
        })
      );
    }

    setCached(cacheKey, resultMap, 45_000);
    res.json({ quotes: resultMap, cached: false });
  } catch (err) {
    console.error('Error in /api/market/quotes:', err);
    res.status(502).json({ error: 'Kunde inte hämta aktiekurser just nu.' });
  }
});

// 2. Live FX rates to SEK
app.get('/api/market/fx', async (_req: Request, res: Response) => {
  const fallbackRates: Record<string, number> = {
    SEK: 1,
    USD: 10.65,
    EUR: 11.45,
    DKK: 1.535,
    NOK: 0.975,
    GBP: 13.55,
    CAD: 7.65,
    CHF: 12.15,
  };

  try {
    const cacheKey = 'fx:sek';
    const cached = getCached<Record<string, number>>(cacheKey);
    if (cached) {
      res.json({ rates: cached, updatedAt: new Date().toISOString() });
      return;
    }

    const pairs = ['USDSEK=X', 'EURSEK=X', 'DKKSEK=X', 'NOKSEK=X', 'GBPSEK=X', 'CADSEK=X', 'CHFSEK=X'];
    const quotes = await yf.quote(pairs, {}, { validateResult: false });
    const list = Array.isArray(quotes) ? quotes : quotes ? [quotes] : [];
    const rates: Record<string, number> = { ...fallbackRates };

    for (const q of list) {
      const rec = q as unknown as Record<string, unknown>;
      const sym = String(rec.symbol ?? '');
      const price = num(rec.regularMarketPrice);
      if (sym.endsWith('SEK=X') && price && price > 0) {
        const code = sym.replace('SEK=X', '');
        rates[code] = price;
      }
    }

    setCached(cacheKey, rates, 5 * 60_000);
    res.json({ rates, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('Error in /api/market/fx:', err);
    res.json({ rates: fallbackRates, fallback: true, updatedAt: new Date().toISOString() });
  }
});

// 3. Historical chart data
app.get('/api/market/chart', async (req: Request, res: Response) => {
  try {
    const symbol = validateSymbol(req.query.symbol);
    const rangeRaw = typeof req.query.range === 'string' ? req.query.range.toLowerCase() : '1y';
    const range = ALLOWED_RANGES.has(rangeRaw) ? rangeRaw : '1y';

    if (!symbol) {
      res.status(400).json({ error: 'Ogiltig aktiesymbol.' });
      return;
    }

    const cacheKey = `chart:${symbol}:${range}`;
    const cached = getCached<unknown>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const { period1, interval } = getRangeParams(range);
    const chartRes = (await yf.chart(
      symbol,
      {
        period1,
        period2: new Date(),
        interval,
      },
      { validateResult: false }
    )) as {
      meta?: { currency?: string; regularMarketPrice?: number; chartPreviousClose?: number };
      quotes?: Array<{
        date: string | number | Date;
        close?: number | null;
        open?: number | null;
        high?: number | null;
        low?: number | null;
        volume?: number | null;
      }>;
    };

    const rawQuotes = Array.isArray(chartRes?.quotes) ? chartRes.quotes : [];
    let points = rawQuotes
      .filter((pt) => pt && typeof pt.close === 'number' && Number.isFinite(pt.close))
      .map((pt) => ({
        time: new Date(pt.date).getTime(),
        close: Number(pt.close),
        open: typeof pt.open === 'number' && Number.isFinite(pt.open) ? pt.open : Number(pt.close),
        high: typeof pt.high === 'number' && Number.isFinite(pt.high) ? pt.high : Number(pt.close),
        low: typeof pt.low === 'number' && Number.isFinite(pt.low) ? pt.low : Number(pt.close),
        volume: typeof pt.volume === 'number' && Number.isFinite(pt.volume) ? pt.volume : 0,
      }));

    // For 1d view, keep only the most recent trading session
    if (range === '1d' && points.length > 1) {
      const lastDay = new Date(points[points.length - 1].time).toDateString();
      const sameDayPoints = points.filter((p) => new Date(p.time).toDateString() === lastDay);
      if (sameDayPoints.length >= 2) {
        points = sameDayPoints;
      }
    }

    const payload = {
      symbol,
      range,
      currency: chartRes?.meta?.currency ?? 'SEK',
      regularMarketPrice: num(chartRes?.meta?.regularMarketPrice) ?? (points[points.length - 1]?.close ?? 0),
      previousClose: num(chartRes?.meta?.chartPreviousClose) ?? (points[0]?.close ?? 0),
      points,
    };

    const ttl = range === '1d' || range === '5d' ? 60_000 : 10 * 60_000;
    setCached(cacheKey, payload, ttl);
    res.json(payload);
  } catch (err) {
    console.error('Error in /api/market/chart:', err);
    res.status(502).json({ error: 'Kunde inte hämta historisk kursgraf.' });
  }
});

// 4. Full stock detail summary (fundamentals, profile, analyst targets, news)
app.get('/api/market/summary', async (req: Request, res: Response) => {
  try {
    const symbol = validateSymbol(req.query.symbol);
    if (!symbol) {
      res.status(400).json({ error: 'Ogiltig aktiesymbol.' });
      return;
    }

    const cacheKey = `summary:${symbol}`;
    const cached = getCached<unknown>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const [quoteRes, summaryRes, newsRes] = await Promise.allSettled([
      yf.quote(symbol, {}, { validateResult: false }),
      yf.quoteSummary(
        symbol,
        {
          modules: [
            'summaryDetail',
            'defaultKeyStatistics',
            'financialData',
            'assetProfile',
            'calendarEvents',
          ],
        },
        { validateResult: false }
      ),
      yf.search(symbol, { quotesCount: 1, newsCount: 8 }, { validateResult: false }),
    ]);

    const rawQuote = quoteRes.status === 'fulfilled' && quoteRes.value ? (quoteRes.value as unknown as Record<string, unknown>) : null;
    const summary = summaryRes.status === 'fulfilled' && summaryRes.value ? (summaryRes.value as unknown as Record<string, Record<string, unknown>>) : {};
    const searchData = newsRes.status === 'fulfilled' && newsRes.value ? (newsRes.value as unknown as { news?: Array<Record<string, unknown>> }) : {};

    const sd = summary.summaryDetail ?? {};
    const ks = summary.defaultKeyStatistics ?? {};
    const fd = summary.financialData ?? {};
    const ap = summary.assetProfile ?? {};
    const ce = summary.calendarEvents ?? {};

    const quote = rawQuote ? mapQuote(rawQuote) : null;
    const companyOfficers = Array.isArray(ap.companyOfficers) ? (ap.companyOfficers as Array<Record<string, unknown>>) : [];
    const ceo = companyOfficers.find((o) => String(o.title ?? '').toLowerCase().includes('ceo') || String(o.title ?? '').toLowerCase().includes('chief executive')) ?? companyOfficers[0];

    const newsItems = Array.isArray(searchData.news)
      ? searchData.news
          .map((item) => {
            const safeLink = toSafeHttpsUrl(item.link);
            return {
              uuid: String(item.uuid ?? item.title ?? Math.random()),
              title: String(item.title ?? ''),
              publisher: String(item.publisher ?? 'Marknadsnyhet'),
              link: safeLink,
              publishedAt: item.providerPublishTime
                ? new Date(
                    typeof item.providerPublishTime === 'number'
                      ? item.providerPublishTime * 1000
                      : (item.providerPublishTime as string | Date)
                  ).toISOString()
                : new Date().toISOString(),
            };
          })
          .filter((n) => n.title.length > 0)
      : [];

    const dividendDateRaw = ce.exDividendDate ?? sd.exDividendDate;
    const earningsObj = ce.earnings as Record<string, unknown> | undefined;
    const earningsDates = Array.isArray(earningsObj?.earningsDate) ? (earningsObj?.earningsDate as Array<unknown>) : [];

    const payload = {
      symbol,
      quote,
      fundamentals: {
        trailingPE: num(sd.trailingPE) ?? quote?.trailingPE ?? null,
        forwardPE: num(sd.forwardPE) ?? num(ks.forwardPE) ?? quote?.forwardPE ?? null,
        priceToBook: num(ks.priceToBook) ?? quote?.priceToBook ?? null,
        priceToSales: num(sd.priceToSalesTrailing12Months) ?? null,
        enterpriseToEbitda: num(ks.enterpriseToEbitda) ?? null,
        enterpriseValue: num(ks.enterpriseValue) ?? null,
        marketCap: num(sd.marketCap) ?? quote?.marketCap ?? null,
        epsTrailing: num(ks.trailingEps) ?? quote?.epsTrailingTwelveMonths ?? null,
        epsForward: num(ks.forwardEps) ?? null,
        dividendYield: num(sd.dividendYield) ?? num(sd.trailingAnnualDividendYield) ?? quote?.dividendYield ?? null,
        dividendRate: num(sd.dividendRate) ?? num(sd.trailingAnnualDividendRate) ?? quote?.dividendRate ?? null,
        payoutRatio: num(sd.payoutRatio) ?? null,
        exDividendDate: dividendDateRaw ? new Date(dividendDateRaw as string | number | Date).toISOString() : null,
        nextEarningsDate: earningsDates[0] ? new Date(earningsDates[0] as string | number | Date).toISOString() : null,
        profitMargins: num(fd.profitMargins) ?? num(ks.profitMargins) ?? null,
        operatingMargins: num(fd.operatingMargins) ?? null,
        grossMargins: num(fd.grossMargins) ?? null,
        returnOnEquity: num(fd.returnOnEquity) ?? null,
        returnOnAssets: num(fd.returnOnAssets) ?? null,
        revenueGrowth: num(fd.revenueGrowth) ?? null,
        earningsGrowth: num(fd.earningsGrowth) ?? null,
        totalRevenue: num(fd.totalRevenue) ?? null,
        totalDebt: num(fd.totalDebt) ?? null,
        totalCash: num(fd.totalCash) ?? null,
        debtToEquity: num(fd.debtToEquity) ?? null,
        freeCashflow: num(fd.freeCashflow) ?? null,
        beta: num(sd.beta) ?? num(ks.beta) ?? null,
        fiftyDayAverage: num(sd.fiftyDayAverage) ?? quote?.fiftyDayAverage ?? null,
        twoHundredDayAverage: num(sd.twoHundredDayAverage) ?? quote?.twoHundredDayAverage ?? null,
        targetMeanPrice: num(fd.targetMeanPrice) ?? null,
        targetHighPrice: num(fd.targetHighPrice) ?? null,
        targetLowPrice: num(fd.targetLowPrice) ?? null,
        recommendationKey: typeof fd.recommendationKey === 'string' ? fd.recommendationKey : null,
        numberOfAnalystOpinions: num(fd.numberOfAnalystOpinions) ?? null,
        sharesOutstanding: num(ks.sharesOutstanding) ?? null,
      },
      profile: {
        sector: typeof ap.sector === 'string' ? ap.sector : null,
        industry: typeof ap.industry === 'string' ? ap.industry : null,
        country: typeof ap.country === 'string' ? ap.country : null,
        city: typeof ap.city === 'string' ? ap.city : null,
        website: toSafeHttpsUrl(ap.website),
        employees: num(ap.fullTimeEmployees),
        ceo: ceo && typeof ceo.name === 'string' ? ceo.name : null,
        description: typeof ap.longBusinessSummary === 'string' ? ap.longBusinessSummary : null,
      },
      news: newsItems,
    };

    setCached(cacheKey, payload, 5 * 60_000);
    res.json(payload);
  } catch (err) {
    console.error('Error in /api/market/summary:', err);
    res.status(502).json({ error: 'Kunde inte hämta bolagsdata.' });
  }
});

// 5. Search securities (supports Swedish names, tickers, ISINs)
app.get('/api/market/search', async (req: Request, res: Response) => {
  try {
    const rawQuery = typeof req.query.q === 'string' ? req.query.q : '';
    const q = rawQuery.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 80);
    if (q.length < 1) {
      res.json({ results: [] });
      return;
    }

    const cacheKey = `search:${q.toLowerCase()}`;
    const cached = getCached<unknown[]>(cacheKey);
    if (cached) {
      res.json({ results: cached });
      return;
    }

    const searchRes = (await yf.search(
      q,
      { quotesCount: 12, newsCount: 0 },
      { validateResult: false }
    )) as { quotes?: Array<Record<string, unknown>> };
    const rawQuotes = Array.isArray(searchRes?.quotes) ? searchRes.quotes : [];

    const results = rawQuotes
      .filter((item) => item && typeof item === 'object' && 'symbol' in item && Boolean(item.symbol))
      .map((rec) => ({
        symbol: String(rec.symbol ?? ''),
        shortName: String(rec.shortname ?? rec.longname ?? rec.symbol ?? ''),
        longName: String(rec.longname ?? rec.shortname ?? rec.symbol ?? ''),
        exchange: String(rec.exchDisp ?? rec.exchange ?? ''),
        quoteType: String(rec.quoteType ?? 'EQUITY'),
        sector: typeof rec.sectorDisp === 'string' ? rec.sectorDisp : null,
      }))
      .filter((r) => ['EQUITY', 'ETF', 'MUTUALFUND', 'INDEX'].includes(r.quoteType.toUpperCase()))
      .sort((a, b) => {
        // Slightly prioritize Stockholm (.ST) & Nordic listings for Swedish users
        const isNordic = (s: string) => /\.(ST|HE|CO|OL)$/i.test(s);
        const aN = isNordic(a.symbol) ? 1 : 0;
        const bN = isNordic(b.symbol) ? 1 : 0;
        return bN - aN;
      });

    setCached(cacheKey, results, 10 * 60_000);
    res.json({ results });
  } catch (err) {
    console.error('Error in /api/market/search:', err);
    res.status(502).json({ error: 'Sökningen misslyckades.', results: [] });
  }
});

// 6. Market overview (Major Nordic/Global indices + popular stocks)
app.get('/api/market/overview', async (_req: Request, res: Response) => {
  try {
    const cacheKey = 'market:overview';
    const cached = getCached<unknown>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const indexSymbols = ['^OMX', '^OMXSPI', '^GSPC', '^NDX', '^GDAXI', 'USDSEK=X', 'EURSEK=X'];
    const popularSymbols = [
      'INVE-B.ST',
      'VOLV-B.ST',
      'SAAB-B.ST',
      'ATCO-A.ST',
      'EVO.ST',
      'SHB-A.ST',
      'SEB-A.ST',
      'AZN.ST',
      'ABB.ST',
      'ERIC-B.ST',
      'NIBE-B.ST',
      'HM-B.ST',
      'NOVO-B.CO',
      'AAPL',
      'MSFT',
      'NVDA',
    ];

    const allSymbols = [...indexSymbols, ...popularSymbols];
    const quotes = await yf.quote(allSymbols, {}, { validateResult: false });
    const list = Array.isArray(quotes) ? quotes : quotes ? [quotes] : [];
    const bySym = new Map<string, ReturnType<typeof mapQuote>>();
    for (const item of list) {
      if (item && typeof item === 'object') {
        const mapped = mapQuote(item as unknown as Record<string, unknown>);
        if (mapped.symbol) {
          bySym.set(mapped.symbol.toUpperCase(), mapped);
        }
      }
    }

    const indexLabels: Record<string, string> = {
      '^OMX': 'OMXS30',
      '^OMXSPI': 'OMXSPI',
      '^GSPC': 'S&P 500',
      '^NDX': 'Nasdaq 100',
      '^GDAXI': 'DAX',
      'USDSEK=X': 'USD/SEK',
      'EURSEK=X': 'EUR/SEK',
    };

    const indices = indexSymbols
      .map((sym) => {
        const q = bySym.get(sym.toUpperCase());
        if (!q) return null;
        return {
          ...q,
          displayName: indexLabels[sym] ?? q.shortName,
        };
      })
      .filter(Boolean);

    const popular = popularSymbols
      .map((sym) => bySym.get(sym.toUpperCase()))
      .filter((q): q is ReturnType<typeof mapQuote> => Boolean(q));

    const payload = {
      indices,
      popular,
      updatedAt: new Date().toISOString(),
    };

    setCached(cacheKey, payload, 60_000);
    res.json(payload);
  } catch (err) {
    console.error('Error in /api/market/overview:', err);
    res.status(502).json({ error: 'Kunde inte hämta marknadsöversikt.' });
  }
});

// Mount Vite in dev, or serve static dist in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  const port = Number(process.env.PORT) || 3000;

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (req: Request, res: Response) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'Endpoint hittades inte.' });
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`NordVyn server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start NordVyn server:', err);
  process.exit(1);
});

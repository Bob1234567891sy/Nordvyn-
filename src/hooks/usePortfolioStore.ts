import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchBatchQuotes,
  fetchFxRates,
  resolveTickerOnline,
} from '../services/marketApi';
import type {
  ClosedHolding,
  FxRates,
  Holding,
  MarketQuote,
  PortfolioState,
  ThemeMode,
  Transaction,
} from '../types/portfolio';
import {
  buildHoldingsFromTransactions,
  classifyTransactionType,
  createDemoTransactions,
  type ParsedCsvResult,
} from '../utils/nordnetParser';
import { normalizeSecurityKey, resolveTickerLocal } from '../utils/tickerResolver';

const STORAGE_KEY = 'nordvyn_portfolio_state_v1';
const THEME_KEY = 'nordvyn_theme_v1';

const DEFAULT_FX: FxRates = {
  SEK: 1,
  USD: 10.65,
  EUR: 11.45,
  DKK: 1.535,
  NOK: 0.975,
  GBP: 13.55,
  CAD: 7.65,
  CHF: 12.15,
};

const DEFAULT_WATCHLIST = [
  { symbol: 'INVE-B.ST', name: 'Investor B', addedAt: '2026-01-01T00:00:00.000Z' },
  { symbol: 'VOLV-B.ST', name: 'Volvo B', addedAt: '2026-01-01T00:00:00.000Z' },
  { symbol: 'SAAB-B.ST', name: 'Saab B', addedAt: '2026-01-01T00:00:00.000Z' },
  { symbol: 'NOVO-B.CO', name: 'Novo Nordisk B', addedAt: '2026-01-01T00:00:00.000Z' },
  { symbol: 'NVDA', name: 'NVIDIA', addedAt: '2026-01-01T00:00:00.000Z' },
];

const EMPTY_STATE: PortfolioState = {
  transactions: [],
  directHoldings: [],
  cashByAccount: {},
  imports: [],
  customTickerMap: {},
  watchlist: DEFAULT_WATCHLIST,
  cachedQuotes: {},
  fxRates: DEFAULT_FX,
  lastSyncedAt: null,
};

/**
 * Re-normalizes any previously stored transactions in localStorage so older imports
 * immediately benefit from fixed SÅLT/SÅLD sell classification without requiring re-upload!
 */
function migrateTransactions(rawTxs: Transaction[]): Transaction[] {
  return rawTxs.map((tx, idx) => {
    const hasSecurity = Boolean(tx.securityName || tx.isin);
    const reclassified = classifyTransactionType(tx.rawType || tx.type, hasSecurity);
    const type =
      reclassified === 'OTHER' && hasSecurity && tx.quantity > 0
        ? tx.amount < 0
          ? 'BUY'
          : tx.amount > 0
            ? 'SELL'
            : tx.type
        : reclassified;
    const fx = tx.exchangeRate > 0 && tx.exchangeRate !== 1 ? tx.exchangeRate : DEFAULT_FX[tx.currency] ?? 1;
    const amountCurrency = tx.amountCurrency || tx.currency || 'SEK';
    const amountSek =
      typeof tx.amountSek === 'number' && Number.isFinite(tx.amountSek)
        ? tx.amountSek
        : amountCurrency === 'SEK'
          ? tx.amount
          : tx.amount * fx;

    return {
      ...tx,
      type,
      numericId: typeof tx.numericId === 'number' ? tx.numericId : 10000 + idx,
      rowIndex: typeof tx.rowIndex === 'number' ? tx.rowIndex : idx,
      priceCurrency: tx.priceCurrency || tx.currency || 'SEK',
      amountCurrency,
      amountSek,
    };
  });
}

function loadInitialState(): PortfolioState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<PortfolioState>;
    const migratedTxs = Array.isArray(parsed.transactions) ? migrateTransactions(parsed.transactions) : [];
    const fxRates = { ...DEFAULT_FX, ...(parsed.fxRates ?? {}) };
    let cashByAccount = parsed.cashByAccount ?? {};
    if (migratedTxs.length > 0) {
      const rebuilt = buildHoldingsFromTransactions(migratedTxs, parsed.customTickerMap ?? {}, fxRates);
      cashByAccount = rebuilt.cashByAccount;
    }

    return {
      ...EMPTY_STATE,
      ...parsed,
      transactions: migratedTxs,
      cashByAccount,
      fxRates,
      watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : DEFAULT_WATCHLIST,
    };
  } catch {
    return EMPTY_STATE;
  }
}

function loadInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // ignore
  }
  return 'dark';
}

export interface EnrichedHolding extends Holding {
  quote?: MarketQuote;
  livePrice: number;
  priceCurrency: string;
  fxToSek: number;
  marketValueSek: number;
  costBasisSek: number;
  unrealizedPnLSek: number;
  unrealizedPnLPercent: number;
  dayChangeSek: number;
  dayChangePercent: number;
  weightPercent: number;
  isLive: boolean;
}

export function usePortfolioStore() {
  const [state, setState] = useState<PortfolioState>(loadInitialState);
  const [theme, setThemeState] = useState<ThemeMode>(loadInitialTheme);
  const [selectedAccount, setSelectedAccount] = useState<string>('ALL');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#090C10' : '#FFFFFF');
    }
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [state]);

  const setTheme = useCallback((next: ThemeMode) => setThemeState(next), []);
  const toggleTheme = useCallback(() => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark')), []);

  // Recompute active + closed holdings and exact cash from transactions + directHoldings
  const computedFromLedger = useMemo(() => {
    const active: Holding[] = [];
    const closed: ClosedHolding[] = [];
    let ledgerCash: Record<string, number> = { ...state.cashByAccount };

    if (state.transactions.length > 0) {
      const built = buildHoldingsFromTransactions(
        state.transactions,
        state.customTickerMap,
        state.fxRates
      );
      active.push(...built.holdings);
      closed.push(...built.closedHoldings);
      ledgerCash = built.cashByAccount;
    }

    if (state.directHoldings.length > 0) {
      for (const h of state.directHoldings) {
        const resolved = resolveTickerLocal(h.securityName, h.isin, h.currency, state.customTickerMap);
        active.push({
          ...h,
          symbol: resolved.symbol,
          sector: h.sector || resolved.sector,
        });
      }
    }

    return { active, closed, cashByAccount: ledgerCash };
  }, [state.transactions, state.directHoldings, state.customTickerMap, state.fxRates, state.cashByAccount]);

  const rawHoldings = computedFromLedger.active;
  const rawClosedHoldings = computedFromLedger.closed;

  const accounts = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const h of rawHoldings) set.add(h.account);
    for (const c of rawClosedHoldings) set.add(c.account);
    for (const tx of state.transactions) set.add(tx.account);
    for (const acc of Object.keys(computedFromLedger.cashByAccount)) set.add(acc);
    return Array.from(set).sort();
  }, [rawHoldings, rawClosedHoldings, state.transactions, computedFromLedger.cashByAccount]);

  useEffect(() => {
    if (selectedAccount !== 'ALL' && !accounts.includes(selectedAccount)) {
      setSelectedAccount('ALL');
    }
  }, [accounts, selectedAccount]);

  const filteredHoldings = useMemo<EnrichedHolding[]>(() => {
    const scoped =
      selectedAccount === 'ALL'
        ? rawHoldings
        : rawHoldings.filter((h) => h.account === selectedAccount);

    const aggMap = new Map<string, Holding>();
    for (const h of scoped) {
      const aggKey = selectedAccount === 'ALL' ? normalizeSecurityKey(h.securityName, h.isin) : h.key;
      const existing = aggMap.get(aggKey);
      if (!existing) {
        aggMap.set(aggKey, { ...h });
      } else {
        const totalQty = existing.quantity + h.quantity;
        const avgPrice =
          totalQty > 0
            ? (existing.avgPrice * existing.quantity + h.avgPrice * h.quantity) / totalQty
            : existing.avgPrice;
        const avgPriceSek =
          totalQty > 0
            ? (existing.avgPriceSek * existing.quantity + h.avgPriceSek * h.quantity) / totalQty
            : existing.avgPriceSek;
        aggMap.set(aggKey, {
          ...existing,
          account: 'Flera konton',
          quantity: totalQty,
          avgPrice,
          avgPriceSek,
          totalDividendsSek: existing.totalDividendsSek + h.totalDividendsSek,
          realizedPnLSek: existing.realizedPnLSek + h.realizedPnLSek,
          totalBrokerageSek: existing.totalBrokerageSek + h.totalBrokerageSek,
          totalBoughtQty: existing.totalBoughtQty + h.totalBoughtQty,
          totalSoldQty: existing.totalSoldQty + h.totalSoldQty,
          totalBoughtSek: existing.totalBoughtSek + h.totalBoughtSek,
          totalSoldSek: existing.totalSoldSek + h.totalSoldSek,
        });
      }
    }

    const preliminary = Array.from(aggMap.values()).map((h) => {
      const quote = state.cachedQuotes[h.symbol.toUpperCase()];
      const priceCurrency = quote?.currency || h.currency || 'SEK';
      const fxToSek = state.fxRates[priceCurrency] ?? (priceCurrency === 'SEK' ? 1 : 10.5);
      const isLive = Boolean(quote && quote.regularMarketPrice > 0);
      const livePrice = isLive
        ? quote!.regularMarketPrice
        : h.csvLastPrice && h.csvLastPrice > 0
          ? h.csvLastPrice
          : h.avgPrice;

      const marketValueSek =
        !isLive && h.csvMarketValueSek && h.csvMarketValueSek > 0
          ? h.csvMarketValueSek
          : h.quantity * livePrice * fxToSek;

      const costBasisSek =
        h.avgPriceSek > 0
          ? h.quantity * h.avgPriceSek
          : h.quantity * h.avgPrice * (state.fxRates[h.currency] ?? fxToSek);

      const unrealizedPnLSek = marketValueSek - costBasisSek;
      const unrealizedPnLPercent = costBasisSek > 0 ? (unrealizedPnLSek / costBasisSek) * 100 : 0;

      const dayChangeLocal = quote?.regularMarketChange ?? 0;
      const dayChangeSek = h.quantity * dayChangeLocal * fxToSek;
      const dayChangePercent = quote?.regularMarketChangePercent ?? 0;

      return {
        ...h,
        quote,
        livePrice,
        priceCurrency,
        fxToSek,
        marketValueSek,
        costBasisSek,
        unrealizedPnLSek,
        unrealizedPnLPercent,
        dayChangeSek,
        dayChangePercent,
        weightPercent: 0,
        isLive,
      };
    });

    const totalStockValue = preliminary.reduce((sum, h) => sum + h.marketValueSek, 0);
    return preliminary.map((h) => ({
      ...h,
      weightPercent: totalStockValue > 0 ? (h.marketValueSek / totalStockValue) * 100 : 0,
    }));
  }, [rawHoldings, selectedAccount, state.cachedQuotes, state.fxRates]);

  const filteredClosedHoldings = useMemo<ClosedHolding[]>(() => {
    const scoped =
      selectedAccount === 'ALL'
        ? rawClosedHoldings
        : rawClosedHoldings.filter((h) => h.account === selectedAccount);
    return [...scoped].sort((a, b) => b.lastTradeDate.localeCompare(a.lastTradeDate));
  }, [rawClosedHoldings, selectedAccount]);

  const cashBalanceSek = useMemo(() => {
    const map = computedFromLedger.cashByAccount;
    if (selectedAccount === 'ALL') {
      return Object.values(map).reduce((s, v) => s + v, 0);
    }
    return map[selectedAccount] ?? 0;
  }, [computedFromLedger.cashByAccount, selectedAccount]);

  const summary = useMemo(() => {
    const holdingsValueSek = filteredHoldings.reduce((s, h) => s + h.marketValueSek, 0);
    const totalCostBasisSek = filteredHoldings.reduce((s, h) => s + h.costBasisSek, 0);
    const totalValueSek = holdingsValueSek + cashBalanceSek;
    const dayChangeSek = filteredHoldings.reduce((s, h) => s + h.dayChangeSek, 0);
    const prevValue = holdingsValueSek - dayChangeSek;
    const dayChangePercent = prevValue > 0 ? (dayChangeSek / prevValue) * 100 : 0;

    const unrealizedPnLSek = holdingsValueSek - totalCostBasisSek;
    const unrealizedPnLPercent = totalCostBasisSek > 0 ? (unrealizedPnLSek / totalCostBasisSek) * 100 : 0;

    const realizedActiveSek = filteredHoldings.reduce((s, h) => s + h.realizedPnLSek, 0);
    const realizedClosedSek = filteredClosedHoldings.reduce((s, h) => s + h.realizedPnLSek, 0);
    const totalRealizedPnLSek = realizedActiveSek + realizedClosedSek;

    const scopedTx =
      selectedAccount === 'ALL'
        ? state.transactions
        : state.transactions.filter((t) => t.account === selectedAccount);

    const totalDividendsSek = scopedTx
      .filter((t) => t.type === 'DIVIDEND')
      .reduce((s, t) => s + Math.abs(t.amountSek), 0);

    const totalBrokerageSek = scopedTx.reduce((s, t) => {
      const rate = t.exchangeRate > 0 && t.exchangeRate !== 1 ? t.exchangeRate : state.fxRates[t.currency] ?? 1;
      return s + t.brokerage * (t.amountCurrency === 'SEK' ? 1 : rate);
    }, 0);

    const netDepositsSek = scopedTx.reduce((s, t) => {
      if (t.type === 'DEPOSIT') return s + Math.abs(t.amountSek);
      if (t.type === 'WITHDRAWAL') return s - Math.abs(t.amountSek);
      return s;
    }, 0);

    const totalReturnSek = unrealizedPnLSek + totalRealizedPnLSek + totalDividendsSek;
    const returnBase = netDepositsSek > 0 ? netDepositsSek : totalCostBasisSek;
    const totalReturnPercent = returnBase > 0 ? (totalReturnSek / returnBase) * 100 : 0;

    return {
      totalValueSek,
      holdingsValueSek,
      cashBalanceSek,
      totalCostBasisSek,
      netDepositsSek,
      dayChangeSek,
      dayChangePercent,
      unrealizedPnLSek,
      unrealizedPnLPercent,
      totalRealizedPnLSek,
      totalDividendsSek,
      totalBrokerageSek,
      totalReturnSek,
      totalReturnPercent,
      holdingCount: filteredHoldings.length,
      closedCount: filteredClosedHoldings.length,
    };
  }, [filteredHoldings, filteredClosedHoldings, cashBalanceSek, state.transactions, selectedAccount, state.fxRates]);

  const refreshMarketData = useCallback(
    async (extraSymbols: string[] = []) => {
      const symbols = Array.from(
        new Set([
          ...rawHoldings.map((h) => h.symbol),
          ...state.watchlist.map((w) => w.symbol),
          ...extraSymbols,
        ])
      ).filter(Boolean);

      if (symbols.length === 0) return;

      setIsSyncing(true);
      setSyncError(null);
      try {
        const [quotes, fx] = await Promise.all([
          fetchBatchQuotes(symbols),
          fetchFxRates().catch(() => state.fxRates),
        ]);
        setState((prev) => ({
          ...prev,
          cachedQuotes: { ...prev.cachedQuotes, ...quotes },
          fxRates: { ...prev.fxRates, ...fx },
          lastSyncedAt: new Date().toISOString(),
        }));
      } catch (err) {
        setSyncError(err instanceof Error ? err.message : 'Kunde inte uppdatera kurser');
      } finally {
        setIsSyncing(false);
      }
    },
    [rawHoldings, state.watchlist, state.fxRates]
  );

  const symbolSignature = useMemo(
    () =>
      Array.from(new Set([...rawHoldings.map((h) => h.symbol), ...state.watchlist.map((w) => w.symbol)]))
        .sort()
        .join(','),
    [rawHoldings, state.watchlist]
  );

  useEffect(() => {
    if (!symbolSignature) return;
    void refreshMarketData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolSignature]);

  const importCsvResult = useCallback(
    async (parsed: ParsedCsvResult, fileName: string, mode: 'replace' | 'merge') => {
      const newlyResolved: Record<string, string> = {};
      if (parsed.unresolvedTickers.length > 0 && navigator.onLine) {
        await Promise.allSettled(
          parsed.unresolvedTickers.slice(0, 14).map(async (item) => {
            const sym = await resolveTickerOnline(item.name, item.isin);
            if (sym) {
              newlyResolved[item.key] = sym;
            }
          })
        );
      }

      setState((prev) => {
        const mergedCustom = { ...prev.customTickerMap, ...newlyResolved };
        const importMeta = {
          id: `imp-${Date.now()}`,
          fileName,
          importedAt: new Date().toISOString(),
          format: parsed.format,
          rowCount: parsed.rowCount,
          accounts: parsed.accounts,
          diagnostics: parsed.diagnostics,
        };

        if (parsed.format === 'transactions') {
          let nextTransactions: Transaction[];
          if (mode === 'merge' && prev.transactions.length > 0) {
            const existingIds = new Set(prev.transactions.map((t) => t.id));
            const uniqueNew = parsed.transactions.filter((t) => !existingIds.has(t.id));
            nextTransactions = [...prev.transactions, ...uniqueNew];
          } else {
            nextTransactions = parsed.transactions;
          }

          const built = buildHoldingsFromTransactions(nextTransactions, mergedCustom, prev.fxRates);

          return {
            ...prev,
            transactions: nextTransactions,
            directHoldings: mode === 'replace' ? [] : prev.directHoldings,
            cashByAccount: built.cashByAccount,
            customTickerMap: mergedCustom,
            imports: mode === 'replace' ? [importMeta] : [importMeta, ...prev.imports].slice(0, 15),
          };
        }

        const nextDirect =
          mode === 'merge'
            ? [
                ...prev.directHoldings.filter(
                  (old) => !parsed.holdings.some((n) => n.key === old.key)
                ),
                ...parsed.holdings,
              ]
            : parsed.holdings;

        return {
          ...prev,
          transactions: mode === 'replace' ? [] : prev.transactions,
          directHoldings: nextDirect,
          cashByAccount: mode === 'replace' ? {} : prev.cashByAccount,
          customTickerMap: mergedCustom,
          imports: mode === 'replace' ? [importMeta] : [importMeta, ...prev.imports].slice(0, 15),
        };
      });
    },
    []
  );

  const loadDemoPortfolio = useCallback(() => {
    const demoTx = createDemoTransactions();
    const built = buildHoldingsFromTransactions(demoTx, state.customTickerMap, state.fxRates);
    setState((prev) => ({
      ...prev,
      transactions: demoTx,
      directHoldings: [],
      cashByAccount: built.cashByAccount,
      imports: [
        {
          id: `demo-${Date.now()}`,
          fileName: 'nordnet-exempelportfolj.csv',
          importedAt: new Date().toISOString(),
          format: 'demo',
          rowCount: demoTx.length,
          accounts: ['ISK Nordnet', 'KF Utland'],
        },
      ],
    }));
    setSelectedAccount('ALL');
  }, [state.customTickerMap, state.fxRates]);

  const clearPortfolio = useCallback(() => {
    setState((prev) => ({
      ...EMPTY_STATE,
      watchlist: prev.watchlist,
      fxRates: prev.fxRates,
    }));
    setSelectedAccount('ALL');
  }, []);

  const toggleWatchlist = useCallback((symbol: string, name: string) => {
    const clean = symbol.trim().toUpperCase();
    setState((prev) => {
      const exists = prev.watchlist.some((w) => w.symbol.toUpperCase() === clean);
      if (exists) {
        return {
          ...prev,
          watchlist: prev.watchlist.filter((w) => w.symbol.toUpperCase() !== clean),
        };
      }
      return {
        ...prev,
        watchlist: [
          { symbol: clean, name: name || clean, addedAt: new Date().toISOString() },
          ...prev.watchlist,
        ],
      };
    });
  }, []);

  const isInWatchlist = useCallback(
    (symbol: string) => state.watchlist.some((w) => w.symbol.toUpperCase() === symbol.toUpperCase()),
    [state.watchlist]
  );

  const updateCustomTicker = useCallback((securityKey: string, newSymbol: string) => {
    const clean = newSymbol.trim().toUpperCase();
    if (!clean) return;
    setState((prev) => ({
      ...prev,
      customTickerMap: {
        ...prev.customTickerMap,
        [securityKey]: clean,
      },
    }));
  }, []);

  const removeStock = useCallback(
    (target: { securityName: string; isin: string; symbol?: string }) => {
      const targetKey = normalizeSecurityKey(target.securityName, target.isin);
      const targetIsin = target.isin.trim().toUpperCase();
      const targetName = target.securityName.trim().toLowerCase().replace(/\s+/g, ' ');
      const targetSym = target.symbol?.trim().toUpperCase();
      const scopeAccount = selectedAccount !== 'ALL' ? selectedAccount : null;

      const matchesSecurity = (name: string, isin: string, sym?: string) => {
        if (targetIsin && isin && isin.trim().toUpperCase() === targetIsin) return true;
        if (normalizeSecurityKey(name, isin) === targetKey) return true;
        if (targetName && name && name.trim().toLowerCase().replace(/\s+/g, ' ') === targetName) return true;
        if (targetSym && sym && sym.trim().toUpperCase() === targetSym) return true;
        return false;
      };

      setState((prev) => {
        const nextTransactions = prev.transactions.filter((tx) => {
          if (scopeAccount && tx.account !== scopeAccount) return true;
          if (!tx.securityName && !tx.isin) return true;
          return !matchesSecurity(tx.securityName, tx.isin);
        });

        const nextDirectHoldings = prev.directHoldings.filter((h) => {
          if (scopeAccount && h.account !== scopeAccount) return true;
          return !matchesSecurity(h.securityName, h.isin, h.symbol);
        });

        const rebuilt =
          nextTransactions.length > 0
            ? buildHoldingsFromTransactions(nextTransactions, prev.customTickerMap, prev.fxRates)
            : { cashByAccount: {} };

        return {
          ...prev,
          transactions: nextTransactions,
          directHoldings: nextDirectHoldings,
          cashByAccount: nextTransactions.length > 0 ? rebuilt.cashByAccount : prev.cashByAccount,
        };
      });
    },
    [selectedAccount]
  );

  const hasPortfolioData = rawHoldings.length > 0 || rawClosedHoldings.length > 0 || state.transactions.length > 0;

  return {
    state,
    theme,
    setTheme,
    toggleTheme,
    selectedAccount,
    setSelectedAccount,
    accounts,
    holdings: filteredHoldings,
    closedHoldings: filteredClosedHoldings,
    allRawHoldings: rawHoldings,
    summary,
    hasPortfolioData,
    isSyncing,
    syncError,
    refreshMarketData,
    importCsvResult,
    loadDemoPortfolio,
    clearPortfolio,
    toggleWatchlist,
    isInWatchlist,
    updateCustomTicker,
    removeStock,
  };
}

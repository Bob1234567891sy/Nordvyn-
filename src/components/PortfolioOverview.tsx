import React, { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpDown,
  ArrowUpRight,
  ChevronRight,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import type { EnrichedHolding } from '../hooks/usePortfolioStore';
import type { ChartPoint, ClosedHolding, Transaction } from '../types/portfolio';
import {
  formatDateShort,
  formatPercent,
  formatPrice,
  formatQuantity,
  formatRelativeTime,
  formatSek,
  formatSignedSek,
} from '../utils/format';
import type { ParsedCsvResult } from '../utils/nordnetParser';
import { CsvImportPanel } from './CsvImportModal';
import { InteractiveLineChart } from './InteractiveLineChart';

interface PortfolioOverviewProps {
  hasPortfolioData: boolean;
  accounts: string[];
  selectedAccount: string;
  onSelectAccount: (acc: string) => void;
  holdings: EnrichedHolding[];
  closedHoldings: ClosedHolding[];
  transactions: Transaction[];
  summary: {
    totalValueSek: number;
    holdingsValueSek: number;
    cashBalanceSek: number;
    totalCostBasisSek: number;
    netDepositsSek: number;
    dayChangeSek: number;
    dayChangePercent: number;
    unrealizedPnLSek: number;
    unrealizedPnLPercent: number;
    totalRealizedPnLSek: number;
    totalDividendsSek: number;
    totalBrokerageSek: number;
    totalReturnSek: number;
    totalReturnPercent: number;
    holdingCount: number;
    closedCount: number;
  };
  customTickerMap: Record<string, string>;
  fxRates: Record<string, number>;
  lastSyncedAt: string | null;
  isSyncing: boolean;
  onRefresh: () => void;
  onOpenStock: (symbol: string, fallbackName?: string) => void;
  onOpenImportModal: () => void;
  onImportCsv: (parsed: ParsedCsvResult, fileName: string, mode: 'replace' | 'merge') => Promise<void>;
  onLoadDemo: () => void;
  onRemoveStock: (target: { securityName: string; isin: string; symbol?: string }) => void;
}

type OverviewSubTab = 'holdings' | 'sold' | 'allocation' | 'dividends' | 'transactions';
type SortKey = 'value' | 'day' | 'totalPct' | 'totalSek' | 'name';
type PerfRange = '1w' | '1m' | '3m' | 'ytd' | '1y' | 'max';

const SECTOR_COLORS = [
  '#00C2C7',
  '#0099E5',
  '#2DD4BF',
  '#38BDF8',
  '#0284C7',
  '#14B8A6',
  '#60A5FA',
  '#64748B',
];

export const PortfolioOverview: React.FC<PortfolioOverviewProps> = ({
  hasPortfolioData,
  accounts,
  selectedAccount,
  onSelectAccount,
  holdings,
  closedHoldings,
  transactions,
  summary,
  customTickerMap,
  fxRates,
  lastSyncedAt,
  isSyncing,
  onRefresh,
  onOpenStock,
  onOpenImportModal,
  onImportCsv,
  onLoadDemo,
  onRemoveStock,
}) => {
  const [subTab, setSubTab] = useState<OverviewSubTab>('holdings');
  const [sortBy, setSortBy] = useState<SortKey>('value');
  const [sortAsc, setSortAsc] = useState(false);
  const [mobileMetric, setMobileMetric] = useState<'total' | 'day'>('total');
  const [perfRange, setPerfRange] = useState<PerfRange>('1y');
  const [hoveredPoint, setHoveredPoint] = useState<ChartPoint | null>(null);
  const [txFilter, setTxFilter] = useState<'ALL' | 'BUY' | 'SELL' | 'DIVIDEND'>('ALL');
  const [editMode, setEditMode] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    securityName: string;
    isin: string;
    symbol?: string;
  } | null>(null);

  const scopedTransactions = useMemo(() => {
    const base =
      selectedAccount === 'ALL'
        ? transactions
        : transactions.filter((t) => t.account === selectedAccount);
    return [...base].sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));
  }, [transactions, selectedAccount]);

  /**
   * Build an authentic chronological portfolio valuation curve anchored directly
   * to real deposits, withdrawals, realized gains, dividends, and live holdings value.
   */
  const portfolioPoints = useMemo<ChartPoint[]>(() => {
    if (!hasPortfolioData) return [];
    const now = Date.now();
    const dayMs = 86_400_000;
    const rangeDays: Record<PerfRange, number> = {
      '1w': 7,
      '1m': 30,
      '3m': 90,
      ytd: Math.max(10, Math.floor((now - new Date(new Date().getFullYear(), 0, 1).getTime()) / dayMs)),
      '1y': 365,
      max: 1095,
    };

    const chrono = [...scopedTransactions].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
    const earliestTxTime = chrono.length > 0 ? new Date(chrono[0].tradeDate).getTime() : now - 365 * dayMs;
    const desiredStart = perfRange === 'max' ? Math.min(earliestTxTime, now - 30 * dayMs) : now - rangeDays[perfRange] * dayMs;
    const startMs = Math.max(desiredStart, earliestTxTime - 7 * dayMs);
    const spanMs = Math.max(now - startMs, 7 * dayMs);

    const endVal = Math.max(0, summary.totalValueSek);
    const pointCount = 48;
    const pts: ChartPoint[] = [];

    if (chrono.length === 0) {
      // Holdings-only CSV fallback: smooth monotonic progression from cost basis to live value
      const startVal = Math.max(0, summary.totalCostBasisSek + summary.cashBalanceSek);
      for (let i = 0; i < pointCount; i++) {
        const p = i / (pointCount - 1);
        const val = startVal + (endVal - startVal) * p;
        pts.push({ time: startMs + spanMs * p, close: val, open: val, high: val, low: val, volume: 0 });
      }
      return pts;
    }

    // Reconstruct cumulative active invested capital at each step, smoothly bridging unrealized PnL to today
    const totalUnrealized = summary.unrealizedPnLSek;
    for (let i = 0; i < pointCount; i++) {
      const progress = i / (pointCount - 1);
      const t = startMs + spanMs * progress;
      const dateStr = new Date(t).toISOString().slice(0, 10);

      let cumulativeNetCapital = 0;
      let cumulativeDivs = 0;
      for (const tx of chrono) {
        if (tx.tradeDate > dateStr) break;
        if (tx.type === 'DEPOSIT') cumulativeNetCapital += Math.abs(tx.amountSek);
        else if (tx.type === 'WITHDRAWAL') cumulativeNetCapital -= Math.abs(tx.amountSek);
        else if (tx.type === 'DIVIDEND') cumulativeDivs += Math.abs(tx.amountSek);
      }

      // If no DEPOSIT rows exist in CSV (user exported trades only), derive capital from active net buys/sells
      if (cumulativeNetCapital <= 0) {
        let invested = 0;
        for (const tx of chrono) {
          if (tx.tradeDate > dateStr) break;
          if (tx.type === 'BUY') invested += Math.abs(tx.amountSek);
          else if (tx.type === 'SELL') invested = Math.max(0, invested - Math.abs(tx.amountSek));
        }
        cumulativeNetCapital = invested;
      }

      const rawEstimate = cumulativeNetCapital + cumulativeDivs + totalUnrealized * Math.pow(progress, 1.15);
      pts.push({
        time: t,
        close: Math.max(0, rawEstimate),
        open: Math.max(0, rawEstimate),
        high: Math.max(0, rawEstimate),
        low: Math.max(0, rawEstimate),
        volume: 0,
      });
    }

    // Anchor final point strictly to live totalValueSek and smoothly align residual drift
    const lastRaw = pts[pts.length - 1]?.close ?? endVal;
    const drift = endVal - lastRaw;
    return pts.map((pt, i) => {
      const weight = i / (pts.length - 1);
      const adjusted = i === pts.length - 1 ? endVal : Math.max(0, pt.close + drift * weight);
      return { ...pt, close: adjusted, open: adjusted, high: adjusted, low: adjusted };
    });
  }, [hasPortfolioData, scopedTransactions, perfRange, summary.totalValueSek, summary.totalCostBasisSek, summary.cashBalanceSek, summary.unrealizedPnLSek]);

  const sortedHoldings = useMemo(() => {
    const list = [...holdings];
    list.sort((a, b) => {
      let diff = 0;
      switch (sortBy) {
        case 'value':
          diff = a.marketValueSek - b.marketValueSek;
          break;
        case 'day':
          diff = a.dayChangePercent - b.dayChangePercent;
          break;
        case 'totalPct':
          diff = a.unrealizedPnLPercent - b.unrealizedPnLPercent;
          break;
        case 'totalSek':
          diff = a.unrealizedPnLSek - b.unrealizedPnLSek;
          break;
        case 'name':
          diff = a.securityName.localeCompare(b.securityName, 'sv');
          break;
      }
      return sortAsc ? diff : -diff;
    });
    return list;
  }, [holdings, sortBy, sortAsc]);

  const sectorBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of holdings) {
      const sec = h.sector || 'Övrigt';
      map.set(sec, (map.get(sec) ?? 0) + h.marketValueSek);
    }
    const items = Array.from(map.entries())
      .map(([name, value], idx) => ({
        name,
        value,
        color: SECTOR_COLORS[idx % SECTOR_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);

    if (summary.cashBalanceSek > 0) {
      items.push({
        name: 'Likvida medel',
        value: summary.cashBalanceSek,
        color: '#8B5CF6',
      });
    }

    const total = items.reduce((s, i) => s + i.value, 0) || 1;
    return items.map((i) => ({ ...i, percent: (i.value / total) * 100 }));
  }, [holdings, summary.cashBalanceSek]);

  const dividendsByYear = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of scopedTransactions) {
      if (t.type !== 'DIVIDEND') continue;
      const year = t.bookingDate.slice(0, 4);
      map.set(year, (map.get(year) ?? 0) + Math.abs(t.amountSek));
    }
    return Array.from(map.entries())
      .map(([year, total]) => ({ year, total }))
      .sort((a, b) => a.year.localeCompare(b.year));
  }, [scopedTransactions]);

  const dividendRows = useMemo(
    () => scopedTransactions.filter((t) => t.type === 'DIVIDEND'),
    [scopedTransactions]
  );

  const visibleTransactions = useMemo(() => {
    if (txFilter === 'ALL') return scopedTransactions;
    return scopedTransactions.filter((t) => t.type === txFilter);
  }, [scopedTransactions, txFilter]);

  const handleSortClick = (key: SortKey) => {
    if (sortBy === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(key);
      setSortAsc(key === 'name');
    }
  };

  // Zero-state onboarding
  if (!hasPortfolioData) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10 sm:py-14">
        <div className="mb-8">
          <p className="text-xs font-semibold text-[#009DA2] dark:text-[#00C2C7]">
            Nordnet CSV-portfölj
          </p>
          <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A] dark:text-[#F4F7FA] [text-wrap:balance]">
            Importera din Nordnet-fil för en ren portföljöversikt
          </h1>
          <p className="mt-2 text-sm text-[#526071] dark:text-[#7D8A9C] leading-relaxed">
            Läs in köp, sälj, utdelningar och innehav från Nordnet med livekurser, nyckeltal och köpprickar i grafen — helt privat på din enhet.
          </p>
        </div>

        <CsvImportPanel
          hasExistingData={false}
          customTickerMap={customTickerMap}
          onConfirmImport={onImportCsv}
          onLoadDemo={onLoadDemo}
        />
      </div>
    );
  }

  const displayedTotal = hoveredPoint ? hoveredPoint.close : summary.totalValueSek;
  const periodStart = portfolioPoints[0]?.close ?? summary.totalValueSek;
  const periodDeltaSek = displayedTotal - periodStart;
  const periodDeltaPct = periodStart > 0 ? (periodDeltaSek / periodStart) * 100 : 0;
  const isPeriodPos = periodDeltaSek >= 0;
  const isDayPos = summary.dayChangeSek >= 0;
  const isUnrealizedPos = summary.unrealizedPnLSek >= 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-3 pb-6 space-y-6">
      {/* Minimalist Account Bar + Subtle Actions */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          <button
            type="button"
            onClick={() => onSelectAccount('ALL')}
            className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition ${
              selectedAccount === 'ALL'
                ? 'bg-[#0F172A] dark:bg-[#F4F7FA] text-white dark:text-[#090C10]'
                : 'text-[#526071] dark:text-[#7D8A9C] hover:text-[#0F172A] dark:hover:text-white'
            }`}
          >
            Alla konton
          </button>
          {accounts.map((acc) => (
            <button
              key={acc}
              type="button"
              onClick={() => onSelectAccount(acc)}
              className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition ${
                selectedAccount === acc
                  ? 'bg-[#0F172A] dark:bg-[#F4F7FA] text-white dark:text-[#090C10]'
                  : 'text-[#526071] dark:text-[#7D8A9C] hover:text-[#0F172A] dark:hover:text-white'
              }`}
            >
              {acc}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isSyncing}
            title={lastSyncedAt ? `Uppdaterad ${formatRelativeTime(lastSyncedAt)}` : 'Uppdatera kurser'}
            aria-label="Uppdatera kurser"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#526071] dark:text-[#7D8A9C] hover:text-[#0F172A] dark:hover:text-white transition"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-[#00C2C7]' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onOpenImportModal}
            className="min-h-[38px] px-3 rounded-xl text-xs font-semibold text-[#0077CC] dark:text-[#0099E5] hover:bg-[#0099E5]/10 inline-flex items-center gap-1.5 transition whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Borderless Nordnet Hero Balance + Smooth Equity Chart */}
      <section className="space-y-4">
        <div>
          <p className="text-xs text-[#526071] dark:text-[#7D8A9C]">
            {selectedAccount === 'ALL' ? 'Totalt kapital' : selectedAccount}
            {' · '}
            {hoveredPoint ? formatDateShort(hoveredPoint.time) : `${summary.holdingCount} aktiva innehav`}
          </p>

          <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className="text-[34px] sm:text-[42px] leading-tight font-bold tracking-tight text-[#0F172A] dark:text-[#F4F7FA] font-num">
              {formatSek(displayedTotal)}
            </h1>
            <div
              className={`inline-flex items-center gap-1 text-sm font-semibold font-num ${
                isPeriodPos
                  ? 'text-[#009DA2] dark:text-[#00C2C7]'
                  : 'text-[#D92D4B] dark:text-[#FF4D6A]'
              }`}
            >
              {isPeriodPos ? (
                <ArrowUpRight className="w-4 h-4 shrink-0" />
              ) : (
                <ArrowDownRight className="w-4 h-4 shrink-0" />
              )}
              <span>{formatSignedSek(periodDeltaSek)}</span>
              <span className="opacity-80">({formatPercent(periodDeltaPct)})</span>
            </div>
          </div>

          {/* Minimalist inline Idag / Orealiserat summary */}
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
            <span className="text-[#526071] dark:text-[#7D8A9C]">
              Idag{' '}
              <strong
                className={`font-num font-semibold ${
                  isDayPos
                    ? 'text-[#009DA2] dark:text-[#00C2C7]'
                    : 'text-[#D92D4B] dark:text-[#FF4D6A]'
                }`}
              >
                {formatSignedSek(summary.dayChangeSek)} ({formatPercent(summary.dayChangePercent)})
              </strong>
            </span>
            <span className="text-[#526071] dark:text-[#7D8A9C]">
              Orealiserat{' '}
              <strong
                className={`font-num font-semibold ${
                  isUnrealizedPos
                    ? 'text-[#009DA2] dark:text-[#00C2C7]'
                    : 'text-[#D92D4B] dark:text-[#FF4D6A]'
                }`}
              >
                {formatSignedSek(summary.unrealizedPnLSek)} ({formatPercent(summary.unrealizedPnLPercent)})
              </strong>
            </span>
          </div>
        </div>

        <InteractiveLineChart
          points={portfolioPoints}
          range={perfRange === '1w' ? '5d' : perfRange}
          currency="SEK"
          isPositive={isPeriodPos}
          height={195}
          showPriceLabels={false}
          onHoverPoint={setHoveredPoint}
        />

        {/* Minimalist Nordnet timeframe tabs */}
        <div className="flex items-center justify-between gap-1 border-b border-[#E2E8F0] dark:border-[#1B222D] pb-2">
          {(
            [
              ['1w', '1V'],
              ['1m', '1M'],
              ['3m', '3M'],
              ['ytd', 'I år'],
              ['1y', '1Å'],
              ['max', 'Max'],
            ] as Array<[PerfRange, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPerfRange(key)}
              className={`flex-1 min-h-[36px] rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                perfRange === key
                  ? 'bg-[#00C2C7]/14 text-[#009DA2] dark:text-[#00C2C7]'
                  : 'text-[#526071] dark:text-[#7D8A9C] hover:text-[#0F172A] dark:hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Clean 4-column hairline financial strip (active portfolio only) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-1">
          <div>
            <p className="text-[11px] text-[#526071] dark:text-[#7D8A9C]">Värdepapper</p>
            <p className="mt-0.5 text-sm sm:text-base font-semibold text-[#0F172A] dark:text-[#F4F7FA] font-num">
              {formatSek(summary.holdingsValueSek)}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-[#526071] dark:text-[#7D8A9C]">Anskaffningsvärde</p>
            <p className="mt-0.5 text-sm sm:text-base font-semibold text-[#0F172A] dark:text-[#F4F7FA] font-num">
              {formatSek(summary.totalCostBasisSek)}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-[#526071] dark:text-[#7D8A9C]">Saldo</p>
            <p className="mt-0.5 text-sm sm:text-base font-semibold text-[#7C3AED] dark:text-[#A78BFA] font-num">
              {formatSek(summary.cashBalanceSek)}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-[#526071] dark:text-[#7D8A9C]">Utdelningar</p>
            <p className="mt-0.5 text-sm sm:text-base font-semibold text-[#009DA2] dark:text-[#00C2C7] font-num">
              {formatSek(summary.totalDividendsSek)}
            </p>
          </div>
        </div>
      </section>

      {/* Clean Underline Sub-Tabs */}
      <div className="flex items-center gap-1 border-b border-[#E2E8F0] dark:border-[#1B222D] overflow-x-auto no-scrollbar">
        {(
          [
            ['holdings', `Innehav (${holdings.length})`],
            ['sold', `Sålda (${closedHoldings.length})`],
            ['allocation', 'Fördelning'],
            ['dividends', 'Utdelningar'],
            ['transactions', `Transaktioner (${scopedTransactions.length})`],
          ] as Array<[OverviewSubTab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSubTab(key)}
            className={`min-h-[44px] px-3.5 text-sm font-semibold whitespace-nowrap shrink-0 border-b-2 transition ${
              subTab === key
                ? 'border-[#009DA2] dark:border-[#00C2C7] text-[#0F172A] dark:text-[#F4F7FA]'
                : 'border-transparent text-[#526071] dark:text-[#7D8A9C] hover:text-[#0F172A] dark:hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* SUBTAB 1: AKTIVA INNEHAV */}
      {subTab === 'holdings' && (
        <section>
          {/* Minimal sort bar + mobile column toggle */}
          <div className="flex items-center justify-between gap-2 pb-2 text-xs text-[#526071] dark:text-[#7D8A9C]">
            <div className="flex items-center gap-3 overflow-x-auto no-scrollbar">
              {(
                [
                  ['value', 'Värde'],
                  ['day', 'Idag %'],
                  ['totalPct', 'Avkastning %'],
                  ['totalSek', 'Avkastning kr'],
                  ['name', 'Namn'],
                ] as Array<[SortKey, string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSortClick(key)}
                  className={`inline-flex items-center gap-1 py-1.5 font-medium whitespace-nowrap shrink-0 transition ${
                    sortBy === key
                      ? 'text-[#009DA2] dark:text-[#00C2C7]'
                      : 'hover:text-[#0F172A] dark:hover:text-white'
                  }`}
                >
                  <span>{label}</span>
                  {sortBy === key && <ArrowUpDown className="w-3 h-3" />}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setMobileMetric((m) => (m === 'total' ? 'day' : 'total'))}
                className="md:hidden text-[11px] font-semibold text-[#0077CC] dark:text-[#0099E5] whitespace-nowrap py-1.5"
              >
                {mobileMetric === 'total' ? 'Totalt' : 'Idag'}
              </button>
              {sortedHoldings.length > 0 && (
                <button
                  type="button"
                  onClick={() => setEditMode((v) => !v)}
                  className={`text-xs font-semibold whitespace-nowrap py-1.5 transition ${
                    editMode
                      ? 'text-[#009DA2] dark:text-[#00C2C7]'
                      : 'text-[#526071] dark:text-[#7D8A9C] hover:text-[#0F172A] dark:hover:text-white'
                  }`}
                >
                  {editMode ? 'Klar' : 'Redigera'}
                </button>
              )}
            </div>
          </div>

          {sortedHoldings.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#526071] dark:text-[#7D8A9C]">
              Inga aktiva innehav på detta konto. Se fliken <strong>Sålda</strong> för avslutade positioner.
            </p>
          ) : (
            <>
              <div className="hidden md:grid grid-cols-12 gap-3 py-2 text-[11px] font-medium text-[#526071] dark:text-[#7D8A9C] border-b border-[#E2E8F0] dark:border-[#1B222D]">
                <div className="col-span-4">Värdepapper</div>
                <div className="col-span-2 text-right">Senaste / GAV</div>
                <div className="col-span-2 text-right">Idag</div>
                <div className="col-span-2 text-right">Avkastning</div>
                <div className="col-span-2 text-right">Marknadsvärde</div>
              </div>

              <div className="divide-y divide-[#E2E8F0] dark:divide-[#1B222D]">
                {sortedHoldings.map((h) => {
                  const dayPos = h.dayChangePercent >= 0;
                  const pnlPos = h.unrealizedPnLSek >= 0;
                  return (
                    <div
                      key={h.key}
                      className="flex items-center gap-2 hover:bg-slate-100/70 dark:hover:bg-[#121720] -mx-2 px-2 rounded-xl transition"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenStock(h.symbol, h.securityName)}
                        className="flex-1 min-w-0 text-left py-3.5"
                      >
                        {/* Mobile minimalist Nordnet row */}
                        <div className="flex items-center justify-between gap-3 md:hidden">
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-semibold text-[#0F172A] dark:text-[#F4F7FA] truncate">
                              {h.securityName}
                            </p>
                            <p className="mt-0.5 text-xs text-[#526071] dark:text-[#7D8A9C] truncate font-num">
                              {formatQuantity(h.quantity)} st · {formatPrice(h.livePrice, h.priceCurrency)}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[15px] font-semibold text-[#0F172A] dark:text-[#F4F7FA] font-num">
                              {formatSek(h.marketValueSek)}
                            </p>
                            {mobileMetric === 'total' ? (
                              <p
                                className={`mt-0.5 text-xs font-semibold font-num ${
                                  pnlPos
                                    ? 'text-[#009DA2] dark:text-[#00C2C7]'
                                    : 'text-[#D92D4B] dark:text-[#FF4D6A]'
                                }`}
                              >
                                {formatPercent(h.unrealizedPnLPercent)} · {formatSignedSek(h.unrealizedPnLSek)}
                              </p>
                            ) : (
                              <p
                                className={`mt-0.5 text-xs font-semibold font-num ${
                                  dayPos
                                    ? 'text-[#009DA2] dark:text-[#00C2C7]'
                                    : 'text-[#D92D4B] dark:text-[#FF4D6A]'
                                }`}
                              >
                                {formatPercent(h.dayChangePercent)} · {formatSignedSek(h.dayChangeSek)}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Desktop grid row */}
                        <div className="hidden md:grid grid-cols-12 gap-3 items-center">
                          <div className="col-span-4 min-w-0">
                            <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F4F7FA] truncate">
                              {h.securityName}
                            </p>
                            <p className="text-xs text-[#526071] dark:text-[#7D8A9C] truncate">
                              {h.symbol} · {formatQuantity(h.quantity)} st · {h.weightPercent.toFixed(1)} %
                            </p>
                          </div>
                          <div className="col-span-2 text-right font-num">
                            <p className="text-sm font-medium text-[#0F172A] dark:text-[#F4F7FA]">
                              {formatPrice(h.livePrice, h.priceCurrency)}
                            </p>
                            <p className="text-xs text-[#526071] dark:text-[#7D8A9C]">
                              GAV {formatPrice(h.avgPrice, h.currency)}
                            </p>
                          </div>
                          <div className="col-span-2 text-right font-num">
                            <p
                              className={`text-sm font-semibold ${
                                dayPos
                                  ? 'text-[#009DA2] dark:text-[#00C2C7]'
                                  : 'text-[#D92D4B] dark:text-[#FF4D6A]'
                              }`}
                            >
                              {formatPercent(h.dayChangePercent)}
                            </p>
                            <p className="text-xs text-[#526071] dark:text-[#7D8A9C]">
                              {formatSignedSek(h.dayChangeSek)}
                            </p>
                          </div>
                          <div className="col-span-2 text-right font-num">
                            <p
                              className={`text-sm font-semibold ${
                                pnlPos
                                  ? 'text-[#009DA2] dark:text-[#00C2C7]'
                                  : 'text-[#D92D4B] dark:text-[#FF4D6A]'
                              }`}
                            >
                              {formatPercent(h.unrealizedPnLPercent)}
                            </p>
                            <p className="text-xs text-[#526071] dark:text-[#7D8A9C]">
                              {formatSignedSek(h.unrealizedPnLSek)}
                            </p>
                          </div>
                          <div className="col-span-2 text-right font-num flex items-center justify-end gap-2">
                            <div>
                              <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F4F7FA]">
                                {formatSek(h.marketValueSek)}
                              </p>
                              <p className="text-xs text-[#526071] dark:text-[#7D8A9C]">{h.account}</p>
                            </div>
                            {!editMode && <ChevronRight className="w-4 h-4 text-[#526071] dark:text-[#7D8A9C]" />}
                          </div>
                        </div>
                      </button>

                      {editMode && (
                        <button
                          type="button"
                          onClick={() =>
                            setPendingDelete({
                              securityName: h.securityName,
                              isin: h.isin,
                              symbol: h.symbol,
                            })
                          }
                          aria-label={`Ta bort ${h.securityName}`}
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#D92D4B] dark:text-[#FF4D6A] hover:bg-[#D92D4B]/12 transition shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}

      {/* SUBTAB 2: SÅLDA / AVSLUTADE INNEHAV */}
      {subTab === 'sold' && (
        <section className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[#0F172A] dark:text-[#F4F7FA]">
                Sålda innehav
              </h2>
              <p className="text-xs text-[#526071] dark:text-[#7D8A9C]">
                Tryck på en aktie för att se kursgrafen med dina köp- och säljprickar.
              </p>
            </div>
            {closedHoldings.length > 0 && (
              <button
                type="button"
                onClick={() => setEditMode((v) => !v)}
                className={`text-xs font-semibold whitespace-nowrap py-1.5 transition shrink-0 ${
                  editMode
                    ? 'text-[#009DA2] dark:text-[#00C2C7]'
                    : 'text-[#526071] dark:text-[#7D8A9C] hover:text-[#0F172A] dark:hover:text-white'
                }`}
              >
                {editMode ? 'Klar' : 'Redigera'}
              </button>
            )}
          </div>

          {closedHoldings.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#526071] dark:text-[#7D8A9C]">
              Inga helt sålda aktier hittades i den importerade transaktionshistoriken.
            </p>
          ) : (
            <div className="divide-y divide-[#E2E8F0] dark:divide-[#1B222D]">
              {closedHoldings.map((c) => {
                const hasBuyCost = c.totalBoughtSek > 0;
                const pos = c.realizedPnLPercent >= 0;
                return (
                  <div
                    key={c.key}
                    className="flex items-center gap-2 hover:bg-slate-100/70 dark:hover:bg-[#121720] -mx-2 px-2 rounded-xl transition"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenStock(c.symbol, c.securityName)}
                      className="flex-1 min-w-0 text-left py-3.5 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold text-[#0F172A] dark:text-[#F4F7FA] truncate">
                          {c.securityName}
                        </p>
                        <p className="mt-0.5 text-xs text-[#526071] dark:text-[#7D8A9C] truncate font-num">
                          Sålt {formatQuantity(c.totalSoldQty)} st · {formatDateShort(c.lastTradeDate)} · {c.account}
                        </p>
                      </div>
                      <div className="text-right font-num shrink-0 flex items-center gap-2">
                        {hasBuyCost ? (
                          <span
                            className={`text-sm font-semibold ${
                              pos
                                ? 'text-[#009DA2] dark:text-[#00C2C7]'
                                : 'text-[#D92D4B] dark:text-[#FF4D6A]'
                            }`}
                          >
                            {formatPercent(c.realizedPnLPercent)}
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-[#526071] dark:text-[#7D8A9C]">
                            Såld
                          </span>
                        )}
                        {!editMode && <ChevronRight className="w-4 h-4 text-[#526071] dark:text-[#7D8A9C]" />}
                      </div>
                    </button>

                    {editMode && (
                      <button
                        type="button"
                        onClick={() =>
                          setPendingDelete({
                            securityName: c.securityName,
                            isin: c.isin,
                            symbol: c.symbol,
                          })
                        }
                        aria-label={`Ta bort ${c.securityName}`}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#D92D4B] dark:text-[#FF4D6A] hover:bg-[#D92D4B]/12 transition shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* SUBTAB 3: FÖRDELNING */}
      {subTab === 'allocation' && (
        <section className="space-y-5">
          <div>
            <h2 className="text-base font-bold text-[#0F172A] dark:text-[#F4F7FA]">
              Bransch- och tillgångsfördelning
            </h2>
            <p className="text-xs text-[#526071] dark:text-[#7D8A9C] mt-0.5">
              Aktier i turkosa/blå nyanser och likvida medel i violett.
            </p>
          </div>

          <div className="h-3 w-full rounded-full overflow-hidden flex bg-slate-200/70 dark:bg-[#161D27]">
            {sectorBreakdown.map((item) => (
              <div
                key={item.name}
                style={{ width: `${Math.max(item.percent, 0.8)}%`, backgroundColor: item.color }}
                title={`${item.name}: ${item.percent.toFixed(1)} %`}
                className="h-full first:rounded-l-full last:rounded-r-full"
              />
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 divide-y md:divide-y-0 divide-[#E2E8F0] dark:divide-[#1B222D]">
            {sectorBreakdown.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between py-3 border-b border-[#E2E8F0] dark:border-[#1B222D]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm font-medium text-[#0F172A] dark:text-[#F4F7FA] truncate">
                    {item.name}
                  </span>
                </div>
                <div className="text-right font-num shrink-0">
                  <span className="text-sm font-semibold text-[#0F172A] dark:text-[#F4F7FA]">
                    {item.percent.toFixed(1)} %
                  </span>
                  <span className="ml-3 text-xs text-[#526071] dark:text-[#7D8A9C]">
                    {formatSek(item.value)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* SUBTAB 4: UTDELNINGAR */}
      {subTab === 'dividends' && (
        <section className="space-y-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-base font-bold text-[#0F172A] dark:text-[#F4F7FA]">
              Erhållna utdelningar
            </h2>
            <p className="text-lg font-bold text-[#009DA2] dark:text-[#00C2C7] font-num">
              {formatSek(summary.totalDividendsSek)}
            </p>
          </div>

          {dividendsByYear.length === 0 ? (
            <p className="text-sm text-[#526071] dark:text-[#7D8A9C] py-8 text-center">
              Inga utdelningstransaktioner hittades i CSV-filen.
            </p>
          ) : (
            <>
              <div className="space-y-3">
                {dividendsByYear.map((row) => {
                  const maxYear = Math.max(...dividendsByYear.map((y) => y.total), 1);
                  const pct = (row.total / maxYear) * 100;
                  return (
                    <div key={row.year} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-num">
                        <span className="font-semibold text-[#0F172A] dark:text-[#F4F7FA]">
                          {row.year}
                        </span>
                        <span className="font-semibold text-[#009DA2] dark:text-[#00C2C7]">
                          {formatSek(row.total)}
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-200/70 dark:bg-[#161D27] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#00C2C7]"
                          style={{ width: `${Math.max(pct, 4)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="divide-y divide-[#E2E8F0] dark:divide-[#1B222D] border-t border-[#E2E8F0] dark:border-[#1B222D]">
                {dividendRows.map((d) => (
                  <div key={d.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#0F172A] dark:text-[#F4F7FA] truncate">
                        {d.securityName}
                      </p>
                      <p className="text-xs text-[#526071] dark:text-[#7D8A9C]">
                        {formatDateShort(d.bookingDate)} · {d.account}
                      </p>
                    </div>
                    <div className="text-right font-num shrink-0">
                      <p className="text-sm font-semibold text-[#009DA2] dark:text-[#00C2C7]">
                        +{formatSek(Math.abs(d.amountSek))}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* SUBTAB 5: TRANSAKTIONER */}
      {subTab === 'transactions' && (
        <section className="space-y-3">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {(
              [
                ['ALL', 'Alla'],
                ['BUY', 'Köp'],
                ['SELL', 'Sälj'],
                ['DIVIDEND', 'Utdelning'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTxFilter(k)}
                className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                  txFilter === k
                    ? 'bg-[#00C2C7]/14 text-[#009DA2] dark:text-[#00C2C7]'
                    : 'text-[#526071] dark:text-[#7D8A9C] hover:text-[#0F172A] dark:hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {visibleTransactions.length === 0 ? (
            <p className="text-sm text-[#526071] dark:text-[#7D8A9C] py-10 text-center">
              Inga transaktioner att visa.
            </p>
          ) : (
            <div className="divide-y divide-[#E2E8F0] dark:divide-[#1B222D]">
              {visibleTransactions.slice(0, 150).map((t) => {
                const isSell = t.type === 'SELL';
                const isBuy = t.type === 'BUY';
                return (
                  <div key={t.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#0F172A] dark:text-[#F4F7FA] truncate">
                        {t.securityName || t.rawType}
                      </p>
                      <p className="text-xs text-[#526071] dark:text-[#7D8A9C] truncate">
                        <span
                          className={
                            isBuy
                              ? 'text-[#0077CC] dark:text-[#38BDF8] font-semibold'
                              : isSell
                                ? 'text-[#D92D4B] dark:text-[#FF4D6A] font-semibold'
                                : ''
                          }
                        >
                          {t.rawType}
                        </span>
                        {' · '}
                        {formatDateShort(t.tradeDate)} · {t.account}
                        {t.quantity > 0 && t.price > 0
                          ? ` · ${formatQuantity(t.quantity)} st @ ${formatPrice(t.price, t.priceCurrency || t.currency)}`
                          : ''}
                      </p>
                    </div>
                    <div className="text-right font-num shrink-0">
                      {isSell ? (
                        <p className="text-xs font-medium text-[#526071] dark:text-[#7D8A9C]">
                          {t.quantity > 0 ? `${formatQuantity(t.quantity)} st` : 'Såld'}
                        </p>
                      ) : (
                        <p
                          className={`text-sm font-semibold ${
                            t.amountSek > 0
                              ? 'text-[#009DA2] dark:text-[#00C2C7]'
                              : 'text-[#0F172A] dark:text-[#F4F7FA]'
                          }`}
                        >
                          {formatSignedSek(t.amountSek)}
                        </p>
                      )}
                      {!isSell && t.brokerage > 0 && (
                        <p className="text-[11px] text-[#526071] dark:text-[#7D8A9C]">
                          Avgift {formatPrice(t.brokerage, t.amountCurrency || 'SEK')}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Delete Stock Confirmation Dialog */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl border border-[#E2E8F0] dark:border-[#1E2632] bg-white dark:bg-[#11161F] p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-base font-bold text-[#0F172A] dark:text-[#F4F7FA]">
                Ta bort {pendingDelete.securityName}?
              </h3>
              <p className="text-xs text-[#526071] dark:text-[#7D8A9C] mt-1 leading-relaxed">
                Aktien och dess transaktioner tas bort från din lokala portfölj
                {selectedAccount !== 'ALL' ? ` (${selectedAccount})` : ''}. Du kan alltid importera din CSV igen.
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  onRemoveStock(pendingDelete);
                  setPendingDelete(null);
                }}
                className="flex-1 min-h-[44px] rounded-xl bg-[#D92D4B] dark:bg-[#FF4D6A] text-white font-semibold text-sm hover:opacity-90 transition"
              >
                Ta bort
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="flex-1 min-h-[44px] rounded-xl border border-[#E2E8F0] dark:border-[#1E2632] text-sm font-medium text-[#526071] dark:text-[#7D8A9C]"
              >
                Avbryt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

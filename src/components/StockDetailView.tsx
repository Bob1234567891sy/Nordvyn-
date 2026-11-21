import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Check,
  Edit3,
  ExternalLink,
  RefreshCw,
  Star,
  Trash2,
} from 'lucide-react';
import type { EnrichedHolding } from '../hooks/usePortfolioStore';
import { fetchStockChart, fetchStockSummary, searchSecurities } from '../services/marketApi';
import type {
  ChartPoint,
  ChartRange,
  ClosedHolding,
  MarketQuote,
  SearchQuote,
  StockChartResponse,
  StockDetailData,
  Transaction,
} from '../types/portfolio';
import {
  formatChartDate,
  formatCompactNumber,
  formatDateShort,
  formatPercent,
  formatPrice,
  formatQuantity,
  formatRatio,
  formatRelativeTime,
  formatSek,
  formatSignedChange,
  formatSignedSek,
  translateMarketState,
  translateRecommendation,
} from '../utils/format';
import { normalizeSecurityKey } from '../utils/tickerResolver';
import { InteractiveLineChart, type ChartMarker } from './InteractiveLineChart';

interface StockDetailViewProps {
  symbol: string;
  fallbackName?: string;
  cachedQuote?: MarketQuote;
  holding?: EnrichedHolding;
  closedHolding?: ClosedHolding;
  transactions: Transaction[];
  isWatchlisted: boolean;
  onToggleWatchlist: (symbol: string, name: string) => void;
  onUpdateCustomTicker: (securityKey: string, newSymbol: string) => void;
  onRemoveStock: (target: { securityName: string; isin: string; symbol?: string }) => void;
  onBack: () => void;
  onChangeSymbol: (newSymbol: string, name?: string) => void;
}

type DetailTab = 'overview' | 'fundamentals' | 'about' | 'news';

const RANGES: Array<[ChartRange, string]> = [
  ['1d', '1D'],
  ['5d', '1V'],
  ['1m', '1M'],
  ['3m', '3M'],
  ['ytd', 'I år'],
  ['1y', '1Å'],
  ['3y', '3Å'],
  ['5y', '5Å'],
  ['max', 'Max'],
];

function pickBestInitialRange(trades: Transaction[]): ChartRange {
  const tradeDates = trades
    .filter((t) => t.type === 'BUY' || t.type === 'SELL')
    .map((t) => new Date(t.tradeDate).getTime())
    .filter((ms) => Number.isFinite(ms));

  if (tradeDates.length === 0) return '1y';
  const earliest = Math.min(...tradeDates);
  const ageDays = (Date.now() - earliest) / 86_400_000;
  if (ageDays <= 350) return '1y';
  if (ageDays <= 1080) return '3y';
  if (ageDays <= 1800) return '5y';
  return 'max';
}

const RangeBar: React.FC<{
  label: string;
  low: number | null;
  high: number | null;
  current: number;
  currency: string;
}> = ({ label, low, high, current, currency }) => {
  if (low === null || high === null || high <= low) return null;
  const pct = Math.max(0, Math.min(100, ((current - low) / (high - low)) * 100));
  return (
    <div className="space-y-1.5">
      <div className="text-xs text-[#526071] dark:text-[#7D8A9C]">{label}</div>
      <div className="relative h-1.5 rounded-full bg-slate-200 dark:bg-[#1B222D]">
        <div
          className="absolute top-0 bottom-0 left-0 rounded-full bg-[#00C2C7]/45"
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-[#009DA2] dark:bg-[#00C2C7] ring-2 ring-white dark:ring-[#090C10]"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs font-num text-[#0F172A] dark:text-[#F4F7FA]">
        <span>{formatPrice(low, currency)}</span>
        <span>{formatPrice(high, currency)}</span>
      </div>
    </div>
  );
};

const MetricRow: React.FC<{ label: string; value: string; accent?: 'pos' | 'neg' | 'none' }> = ({
  label,
  value,
  accent = 'none',
}) => (
  <div className="flex items-center justify-between gap-4 py-2.5 border-b border-[#E2E8F0] dark:border-[#1B222D] last:border-b-0">
    <span className="text-sm text-[#526071] dark:text-[#7D8A9C]">{label}</span>
    <span
      className={`text-sm font-semibold font-num text-right ${
        accent === 'pos'
          ? 'text-[#009DA2] dark:text-[#00C2C7]'
          : accent === 'neg'
            ? 'text-[#D92D4B] dark:text-[#FF4D6A]'
            : 'text-[#0F172A] dark:text-[#F4F7FA]'
      }`}
    >
      {value}
    </span>
  </div>
);

export const StockDetailView: React.FC<StockDetailViewProps> = ({
  symbol,
  fallbackName,
  cachedQuote,
  holding,
  closedHolding,
  transactions,
  isWatchlisted,
  onToggleWatchlist,
  onUpdateCustomTicker,
  onRemoveStock,
  onBack,
  onChangeSymbol,
}) => {
  const positionRef = holding ?? closedHolding;

  // Match all user transactions for this security (whether currently held OR previously sold!)
  const stockTransactions = useMemo(() => {
    const targetIsin = positionRef?.isin?.toUpperCase() ?? '';
    const targetName = (positionRef?.securityName || fallbackName || '').toLowerCase();
    const targetSym = symbol.toUpperCase();
    return transactions
      .filter((t) => {
        if (targetIsin && t.isin && t.isin.toUpperCase() === targetIsin) return true;
        if (targetName && t.securityName && t.securityName.toLowerCase() === targetName) return true;
        if (t.securityName && t.securityName.toUpperCase() === targetSym) return true;
        return false;
      })
      .sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));
  }, [positionRef, fallbackName, symbol, transactions]);

  const [range, setRange] = useState<ChartRange>(() => pickBestInitialRange(stockTransactions));
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [showTradesOverlay, setShowTradesOverlay] = useState(true);
  const [detail, setDetail] = useState<StockDetailData | null>(null);
  const [chart, setChart] = useState<StockChartResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [loadingChart, setLoadingChart] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<ChartPoint | null>(null);
  const [hoveredMarker, setHoveredMarker] = useState<ChartMarker | null>(null);

  const [editingTicker, setEditingTicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tickerQuery, setTickerQuery] = useState('');
  const [tickerResults, setTickerResults] = useState<SearchQuote[]>([]);
  const [searchingTicker, setSearchingTicker] = useState(false);

  // Re-pick ideal initial range whenever navigating to a different stock
  useEffect(() => {
    setRange(pickBestInitialRange(stockTransactions));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const loadSummary = async () => {
    setLoadingDetail(true);
    setError(null);
    try {
      const data = await fetchStockSummary(symbol);
      setDetail(data);
    } catch {
      setError('Kunde inte hämta fullständig bolagsdata från Yahoo Finance.');
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    setHoveredPoint(null);
    setHoveredMarker(null);
    void loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  useEffect(() => {
    let cancelled = false;
    setLoadingChart(true);
    setHoveredPoint(null);
    setHoveredMarker(null);
    fetchStockChart(symbol, range)
      .then((res) => {
        if (!cancelled) setChart(res);
      })
      .catch(() => {
        if (!cancelled) setChart(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingChart(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, range]);

  useEffect(() => {
    if (!editingTicker || tickerQuery.trim().length < 2) {
      setTickerResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setSearchingTicker(true);
      searchSecurities(tickerQuery)
        .then(setTickerResults)
        .finally(() => setSearchingTicker(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [editingTicker, tickerQuery]);

  const quote = detail?.quote ?? cachedQuote ?? null;
  const currency = quote?.currency ?? chart?.currency ?? positionRef?.currency ?? 'SEK';
  const displayName =
    positionRef?.securityName || quote?.longName || quote?.shortName || fallbackName || symbol;
  const currentPrice = quote?.regularMarketPrice || chart?.regularMarketPrice || holding?.livePrice || 0;

  const allTradeMarkers = useMemo<ChartMarker[]>(() => {
    return stockTransactions
      .filter((t) => (t.type === 'BUY' || t.type === 'SELL') && t.quantity > 0)
      .map((t) => ({
        id: t.id,
        time: new Date(t.tradeDate).getTime(),
        dateStr: t.tradeDate,
        price: t.price,
        type: t.type as 'BUY' | 'SELL',
        quantity: t.quantity,
        currency: t.priceCurrency || t.currency || currency,
      }));
  }, [stockTransactions, currency]);

  const buyCount = allTradeMarkers.filter((m) => m.type === 'BUY').length;
  const sellCount = allTradeMarkers.filter((m) => m.type === 'SELL').length;

  const visibleTradeCount = useMemo(() => {
    const pts = chart?.points ?? [];
    if (pts.length < 2) return 0;
    const firstT = pts[0].time - 3 * 86_400_000;
    const lastT = pts[pts.length - 1].time + 3 * 86_400_000;
    return allTradeMarkers.filter((m) => m.time >= firstT && m.time <= lastT).length;
  }, [chart?.points, allTradeMarkers]);

  const { shownPrice, shownChange, shownChangePct, periodLabel } = useMemo(() => {
    const pts = chart?.points ?? [];
    if (hoveredPoint && pts.length > 0) {
      const base = range === '1d' && chart?.previousClose ? chart.previousClose : pts[0].close;
      const diff = hoveredPoint.close - base;
      const pct = base > 0 ? (diff / base) * 100 : 0;
      return {
        shownPrice: hoveredPoint.close,
        shownChange: diff,
        shownChangePct: pct,
        periodLabel: formatChartDate(hoveredPoint.time, range),
      };
    }

    if (range === '1d' && quote) {
      return {
        shownPrice: currentPrice,
        shownChange: quote.regularMarketChange,
        shownChangePct: quote.regularMarketChangePercent,
        periodLabel: 'Idag',
      };
    }

    if (pts.length >= 2) {
      const first = pts[0].close;
      const last = currentPrice > 0 ? currentPrice : pts[pts.length - 1].close;
      const diff = last - first;
      const pct = first > 0 ? (diff / first) * 100 : 0;
      const label = RANGES.find(([r]) => r === range)?.[1] ?? range;
      return {
        shownPrice: last,
        shownChange: diff,
        shownChangePct: pct,
        periodLabel: label,
      };
    }

    return {
      shownPrice: currentPrice,
      shownChange: quote?.regularMarketChange ?? 0,
      shownChangePct: quote?.regularMarketChangePercent ?? 0,
      periodLabel: 'Idag',
    };
  }, [hoveredPoint, chart, range, quote, currentPrice]);

  const isPositive = shownChange >= 0;
  const f = detail?.fundamentals;
  const p = detail?.profile;
  const targetUpside =
    f?.targetMeanPrice && currentPrice > 0
      ? ((f.targetMeanPrice - currentPrice) / currentPrice) * 100
      : null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-10">
      {/* Minimalist Sticky Top Bar */}
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2.5 bg-[#FFFFFF]/95 dark:bg-[#090C10]/95 backdrop-blur-md border-b border-[#E2E8F0] dark:border-[#1B222D] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onBack}
            aria-label="Tillbaka"
            className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center rounded-xl text-[#0F172A] dark:text-[#F4F7FA] hover:bg-slate-100 dark:hover:bg-[#161D27] transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-[#0F172A] dark:text-[#F4F7FA] truncate">
              {displayName}
            </h1>
            <p className="text-xs text-[#526071] dark:text-[#7D8A9C] truncate">
              {symbol}
              {quote?.exchange ? ` · ${quote.exchange}` : ''}
              {positionRef?.isin ? ` · ${positionRef.isin}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {positionRef && (
            <>
              <button
                type="button"
                onClick={() => {
                  setTickerQuery(positionRef.securityName);
                  setEditingTicker(true);
                }}
                aria-label="Byt Yahoo-ticker"
                title="Byt matchad ticker"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#526071] dark:text-[#7D8A9C] hover:text-[#0F172A] dark:hover:text-white transition"
              >
                <Edit3 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                aria-label="Ta bort aktie från portfölj"
                title="Ta bort aktie från portfölj"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#526071] dark:text-[#7D8A9C] hover:text-[#D92D4B] dark:hover:text-[#FF4D6A] transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => onToggleWatchlist(symbol, displayName)}
            aria-label={isWatchlisted ? 'Ta bort från bevakning' : 'Lägg till i bevakning'}
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition ${
              isWatchlisted
                ? 'text-amber-500'
                : 'text-[#526071] dark:text-[#7D8A9C] hover:text-amber-500'
            }`}
          >
            <Star className={`w-5 h-5 ${isWatchlisted ? 'fill-amber-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* Borderless Nordnet Hero Price & Smooth Chart */}
      <section className="pt-5 space-y-4">
        <div>
          <p className="text-xs text-[#526071] dark:text-[#7D8A9C]">
            {quote?.marketState ? translateMarketState(quote.marketState) : 'Marknadskurs'}
            {' · '}
            {currency}
            {quote?.regularMarketTime ? ` · ${formatRelativeTime(quote.regularMarketTime)}` : ''}
          </p>

          <div className="mt-1 flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
            <span className="text-[34px] sm:text-[40px] leading-tight font-bold tracking-tight text-[#0F172A] dark:text-[#F4F7FA] font-num">
              {formatPrice(shownPrice, currency)}
            </span>
            <span
              className={`inline-flex items-center gap-1 text-sm font-semibold font-num ${
                isPositive
                  ? 'text-[#009DA2] dark:text-[#00C2C7]'
                  : 'text-[#D92D4B] dark:text-[#FF4D6A]'
              }`}
            >
              {isPositive ? (
                <ArrowUpRight className="w-4 h-4 shrink-0" />
              ) : (
                <ArrowDownRight className="w-4 h-4 shrink-0" />
              )}
              <span>{formatSignedChange(shownChange, currency)}</span>
              <span>({formatPercent(shownChangePct)})</span>
              <span className="text-xs font-normal text-[#526071] dark:text-[#7D8A9C] ml-1">
                {periodLabel}
              </span>
            </span>
          </div>

          {/* Interactive Buy/Sell Dot Callout (shows exact trade when touching/hovering a dot!) */}
          <div className="min-h-[24px] mt-1.5 flex items-center">
            {hoveredMarker ? (
              <div className="inline-flex items-center gap-2 text-xs font-medium text-[#0F172A] dark:text-[#F4F7FA]">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: hoveredMarker.type === 'BUY' ? '#0099E5' : '#FF4D6A' }}
                />
                <span className="font-semibold">
                  {hoveredMarker.type === 'BUY' ? 'Köpt' : 'Sålt'} {formatQuantity(hoveredMarker.quantity)} st
                </span>
                <span className="text-[#526071] dark:text-[#7D8A9C] font-num">
                  @ {formatPrice(hoveredMarker.price, hoveredMarker.currency)} · {formatDateShort(hoveredMarker.dateStr)}
                </span>
              </div>
            ) : allTradeMarkers.length > 0 && showTradesOverlay ? (
              <p className="text-xs text-[#526071] dark:text-[#7D8A9C]">
                Hovra eller dra över en prick i grafen för att se din affär.
              </p>
            ) : null}
          </div>
        </div>

        <InteractiveLineChart
          points={chart?.points ?? []}
          range={range}
          currency={currency}
          referencePrice={chart?.previousClose}
          gavPrice={holding && holding.currency === currency ? holding.avgPrice : null}
          showGav={showTradesOverlay}
          markers={showTradesOverlay ? allTradeMarkers : []}
          height={240}
          isPositive={isPositive}
          onHoverPoint={setHoveredPoint}
          onHoverMarker={setHoveredMarker}
          loading={loadingChart}
        />

        {/* Timeframe Selector */}
        <div className="flex items-center justify-between gap-1 overflow-x-auto no-scrollbar border-b border-[#E2E8F0] dark:border-[#1B222D] pb-2">
          {RANGES.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setRange(key)}
              className={`flex-1 min-w-[38px] min-h-[36px] rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                range === key
                  ? 'bg-[#00C2C7]/14 text-[#009DA2] dark:text-[#00C2C7]'
                  : 'text-[#526071] dark:text-[#7D8A9C] hover:text-[#0F172A] dark:hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Clean Buy/Sell Dot Legend & Toggle */}
        {(allTradeMarkers.length > 0 || holding) && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[#526071] dark:text-[#7D8A9C]">
              {buyCount > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#0099E5]" />
                  <span>{buyCount} köp</span>
                </span>
              )}
              {sellCount > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#FF4D6A]" />
                  <span>{sellCount} sälj</span>
                </span>
              )}
              {holding && (
                <span className="inline-flex items-center gap-1.5 font-num">
                  <span className="w-3.5 border-t border-dashed border-[#0099E5]" />
                  <span>GAV {formatPrice(holding.avgPrice, holding.currency)}</span>
                </span>
              )}
              {allTradeMarkers.length > visibleTradeCount && showTradesOverlay && (
                <button
                  type="button"
                  onClick={() => setRange('max')}
                  className="text-[#0077CC] dark:text-[#0099E5] font-semibold hover:underline"
                >
                  Visa alla ({allTradeMarkers.length}) i Max
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowTradesOverlay((v) => !v)}
              className="text-xs font-semibold text-[#526071] dark:text-[#7D8A9C] hover:text-[#0F172A] dark:hover:text-white py-1"
            >
              {showTradesOverlay ? 'Dölj affärer i graf' : 'Visa affärer i graf'}
            </button>
          </div>
        )}
      </section>

      {error && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void loadSummary()}
            className="inline-flex items-center gap-1 font-semibold underline shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Försök igen
          </button>
        </div>
      )}

      {/* Nordnet 4-Tab Bar */}
      <div className="mt-6 flex items-center gap-1 border-b border-[#E2E8F0] dark:border-[#1B222D] overflow-x-auto no-scrollbar">
        {(
          [
            ['overview', 'Översikt'],
            ['fundamentals', 'Nyckeltal'],
            ['about', 'Om bolaget'],
            ['news', `Nyheter${detail?.news?.length ? ` (${detail.news.length})` : ''}`],
          ] as Array<[DetailTab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`min-h-[44px] px-4 text-sm font-semibold whitespace-nowrap shrink-0 border-b-2 transition ${
              activeTab === key
                ? 'border-[#009DA2] dark:border-[#00C2C7] text-[#0F172A] dark:text-[#F4F7FA]'
                : 'border-transparent text-[#526071] dark:text-[#7D8A9C] hover:text-[#0F172A] dark:hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* TAB 1: ÖVERSIKT */}
      {activeTab === 'overview' && (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Mitt aktiva innehav */}
          {holding && (
            <section className="lg:col-span-6 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-bold text-[#0F172A] dark:text-[#F4F7FA]">
                  Mitt innehav
                </h2>
                <span className="text-xs text-[#526071] dark:text-[#7D8A9C]">
                  {holding.account} · {holding.weightPercent.toFixed(1)} % av portfölj
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 py-3 border-y border-[#E2E8F0] dark:border-[#1B222D]">
                <div>
                  <p className="text-xs text-[#526071] dark:text-[#7D8A9C]">Marknadsvärde</p>
                  <p className="mt-0.5 text-lg font-bold text-[#0F172A] dark:text-[#F4F7FA] font-num">
                    {formatSek(holding.marketValueSek)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[#526071] dark:text-[#7D8A9C]">Avkastning</p>
                  <p
                    className={`mt-0.5 text-lg font-bold font-num ${
                      holding.unrealizedPnLSek >= 0
                        ? 'text-[#009DA2] dark:text-[#00C2C7]'
                        : 'text-[#D92D4B] dark:text-[#FF4D6A]'
                    }`}
                  >
                    {formatSignedSek(holding.unrealizedPnLSek)}
                  </p>
                </div>
              </div>

              <div>
                <MetricRow label="Antal aktier" value={`${formatQuantity(holding.quantity)} st`} />
                <MetricRow label="Genomsnittligt inköpspris (GAV)" value={formatPrice(holding.avgPrice, holding.currency)} />
                <MetricRow label="Anskaffningsvärde" value={formatSek(holding.costBasisSek)} />
                <MetricRow
                  label="Utveckling (%)"
                  value={formatPercent(holding.unrealizedPnLPercent)}
                  accent={holding.unrealizedPnLPercent >= 0 ? 'pos' : 'neg'}
                />
                <MetricRow
                  label="Utveckling idag"
                  value={`${formatSignedSek(holding.dayChangeSek)} (${formatPercent(holding.dayChangePercent)})`}
                  accent={holding.dayChangeSek >= 0 ? 'pos' : 'neg'}
                />
                <MetricRow
                  label="Erhållna utdelningar"
                  value={formatSek(holding.totalDividendsSek)}
                  accent={holding.totalDividendsSek > 0 ? 'pos' : 'none'}
                />
              </div>
            </section>
          )}

          {/* Tidigare / sålt innehav (utan pengabelopp) */}
          {!holding && closedHolding && (
            <section className="lg:col-span-6 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-bold text-[#0F172A] dark:text-[#F4F7FA]">
                  Tidigare innehav
                </h2>
                <span className="text-xs text-[#526071] dark:text-[#7D8A9C]">
                  {closedHolding.account}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 py-3 border-y border-[#E2E8F0] dark:border-[#1B222D]">
                <div>
                  <p className="text-xs text-[#526071] dark:text-[#7D8A9C]">Status</p>
                  <p className="mt-0.5 text-base font-bold text-[#0F172A] dark:text-[#F4F7FA]">
                    Sålt innehav
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[#526071] dark:text-[#7D8A9C]">Utveckling</p>
                  {closedHolding.totalBoughtSek > 0 ? (
                    <p
                      className={`mt-0.5 text-lg font-bold font-num ${
                        closedHolding.realizedPnLPercent >= 0
                          ? 'text-[#009DA2] dark:text-[#00C2C7]'
                          : 'text-[#D92D4B] dark:text-[#FF4D6A]'
                      }`}
                    >
                      {formatPercent(closedHolding.realizedPnLPercent)}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-base font-semibold text-[#526071] dark:text-[#7D8A9C]">
                      –
                    </p>
                  )}
                </div>
              </div>

              <div>
                <MetricRow label="Sålt antal" value={`${formatQuantity(closedHolding.totalSoldQty)} st`} />
                {closedHolding.avgBuyPrice > 0 && (
                  <MetricRow label="Snittköpkurs" value={formatPrice(closedHolding.avgBuyPrice, closedHolding.currency)} />
                )}
                {closedHolding.avgSellPrice > 0 && (
                  <MetricRow label="Snittsäljkurs" value={formatPrice(closedHolding.avgSellPrice, closedHolding.currency)} />
                )}
                <MetricRow label="Första affär" value={formatDateShort(closedHolding.firstTradeDate)} />
                <MetricRow label="Senaste affär" value={formatDateShort(closedHolding.lastTradeDate)} />
              </div>
            </section>
          )}

          {/* Handelsdata */}
          <section className={`${holding || closedHolding ? 'lg:col-span-6' : 'lg:col-span-12'} space-y-5`}>
            <h2 className="text-base font-bold text-[#0F172A] dark:text-[#F4F7FA]">
              Handelsdata
            </h2>

            {quote && (
              <div className="space-y-4">
                <RangeBar
                  label="Dagens intervall"
                  low={quote.regularMarketDayLow}
                  high={quote.regularMarketDayHigh}
                  current={currentPrice}
                  currency={currency}
                />
                <RangeBar
                  label="52-veckorsintervall"
                  low={quote.fiftyTwoWeekLow}
                  high={quote.fiftyTwoWeekHigh}
                  current={currentPrice}
                  currency={currency}
                />
              </div>
            )}

            <div>
              <MetricRow label="Öppning" value={formatPrice(quote?.regularMarketOpen, currency)} />
              <MetricRow label="Föregående stängning" value={formatPrice(quote?.regularMarketPreviousClose, currency)} />
              {(quote?.bid || quote?.ask) && (
                <MetricRow
                  label="Köp / Sälj"
                  value={`${formatPrice(quote?.bid, currency)} / ${formatPrice(quote?.ask, currency)}`}
                />
              )}
              <MetricRow label="Volym idag" value={formatCompactNumber(quote?.regularMarketVolume)} />
              <MetricRow label="Snittvolym (3 mån)" value={formatCompactNumber(quote?.averageDailyVolume3Month)} />
              <MetricRow label="Börsvärde" value={formatCompactNumber(f?.marketCap ?? quote?.marketCap, currency)} />
              {f?.nextEarningsDate && <MetricRow label="Nästa rapport" value={formatDateShort(f.nextEarningsDate)} />}
              {f?.exDividendDate && <MetricRow label="X-dag utdelning" value={formatDateShort(f.exDividendDate)} />}
            </div>
          </section>

          {/* Dina affärer i bolaget */}
          {stockTransactions.length > 0 && (
            <section className="lg:col-span-12 pt-4 border-t border-[#E2E8F0] dark:border-[#1B222D]">
              <h2 className="text-base font-bold text-[#0F172A] dark:text-[#F4F7FA] mb-2">
                Dina affärer i {displayName}
              </h2>
              <div className="divide-y divide-[#E2E8F0] dark:divide-[#1B222D]">
                {stockTransactions.map((t) => {
                  const isBuy = t.type === 'BUY';
                  const isSell = t.type === 'SELL';
                  return (
                    <div key={t.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: isBuy ? '#0099E5' : isSell ? '#FF4D6A' : '#00C2C7',
                          }}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#0F172A] dark:text-[#F4F7FA]">
                            {t.rawType}
                          </p>
                          <p className="text-xs text-[#526071] dark:text-[#7D8A9C]">
                            {formatDateShort(t.tradeDate)} · {t.account}
                            {t.quantity > 0
                              ? ` · ${formatQuantity(t.quantity)} st @ ${formatPrice(t.price, t.priceCurrency || t.currency)}`
                              : ''}
                          </p>
                        </div>
                      </div>
                      <div className="text-right font-num shrink-0">
                        {isSell || (!holding && closedHolding) ? (
                          <p className="text-xs font-medium text-[#526071] dark:text-[#7D8A9C]">
                            {t.quantity > 0 ? `${formatQuantity(t.quantity)} st` : t.rawType}
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
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {/* TAB 2: NYCKELTAL */}
      {activeTab === 'fundamentals' && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-8">
          {loadingDetail && !f ? (
            <div className="md:col-span-2 py-10 text-center text-sm text-[#526071] dark:text-[#7D8A9C]">
              Hämtar nyckeltal...
            </div>
          ) : (
            <>
              <section>
                <h2 className="text-sm font-bold text-[#0F172A] dark:text-[#F4F7FA] mb-2">Värdering</h2>
                <MetricRow label="P/E (rullande 12 mån)" value={formatRatio(f?.trailingPE)} />
                <MetricRow label="Forward P/E" value={formatRatio(f?.forwardPE)} />
                <MetricRow label="P/B (Pris / Eget kapital)" value={formatRatio(f?.priceToBook)} />
                <MetricRow label="P/S (Pris / Omsättning)" value={formatRatio(f?.priceToSales)} />
                <MetricRow label="EV / EBITDA" value={formatRatio(f?.enterpriseToEbitda)} />
                <MetricRow label="Börsvärde" value={formatCompactNumber(f?.marketCap, currency)} />
                <MetricRow label="Bolagsvärde (EV)" value={formatCompactNumber(f?.enterpriseValue, currency)} />
                <MetricRow label="Vinst per aktie (EPS)" value={formatPrice(f?.epsTrailing, currency)} />
              </section>

              <section>
                <h2 className="text-sm font-bold text-[#0F172A] dark:text-[#F4F7FA] mb-2">Utdelning & Analytiker</h2>
                <MetricRow
                  label="Direktavkastning"
                  value={f?.dividendYield !== null && f?.dividendYield !== undefined ? formatPercent(f.dividendYield * 100, false) : '–'}
                  accent={f?.dividendYield && f.dividendYield > 0 ? 'pos' : 'none'}
                />
                <MetricRow label="Utdelning / aktie" value={formatPrice(f?.dividendRate, currency)} />
                <MetricRow
                  label="Utdelningsandel"
                  value={f?.payoutRatio !== null && f?.payoutRatio !== undefined ? formatPercent(f.payoutRatio * 100, false) : '–'}
                />
                <MetricRow
                  label="Rekommendation"
                  value={
                    f?.recommendationKey
                      ? `${translateRecommendation(f.recommendationKey)}${f.numberOfAnalystOpinions ? ` (${f.numberOfAnalystOpinions})` : ''}`
                      : '–'
                  }
                />
                <MetricRow
                  label="Riktkurs (snitt)"
                  value={
                    f?.targetMeanPrice
                      ? `${formatPrice(f.targetMeanPrice, currency)}${targetUpside !== null ? ` (${formatPercent(targetUpside)})` : ''}`
                      : '–'
                  }
                  accent={targetUpside !== null ? (targetUpside >= 0 ? 'pos' : 'neg') : 'none'}
                />
                <MetricRow
                  label="Riktkurs intervall"
                  value={
                    f?.targetLowPrice && f?.targetHighPrice
                      ? `${formatPrice(f.targetLowPrice, currency)} – ${formatPrice(f.targetHighPrice, currency)}`
                      : '–'
                  }
                />
              </section>

              <section>
                <h2 className="text-sm font-bold text-[#0F172A] dark:text-[#F4F7FA] mb-2">Lönsamhet & Tillväxt</h2>
                <MetricRow
                  label="Bruttomarginal"
                  value={f?.grossMargins !== null && f?.grossMargins !== undefined ? formatPercent(f.grossMargins * 100, false) : '–'}
                />
                <MetricRow
                  label="Rörelsemarginal"
                  value={f?.operatingMargins !== null && f?.operatingMargins !== undefined ? formatPercent(f.operatingMargins * 100, false) : '–'}
                />
                <MetricRow
                  label="Vinstmarginal"
                  value={f?.profitMargins !== null && f?.profitMargins !== undefined ? formatPercent(f.profitMargins * 100, false) : '–'}
                />
                <MetricRow
                  label="ROE (Eget kapital)"
                  value={f?.returnOnEquity !== null && f?.returnOnEquity !== undefined ? formatPercent(f.returnOnEquity * 100, false) : '–'}
                />
                <MetricRow
                  label="Omsättningstillväxt"
                  value={f?.revenueGrowth !== null && f?.revenueGrowth !== undefined ? formatPercent(f.revenueGrowth * 100, true) : '–'}
                  accent={f?.revenueGrowth ? (f.revenueGrowth >= 0 ? 'pos' : 'neg') : 'none'}
                />
                <MetricRow
                  label="Vinsttillväxt"
                  value={f?.earningsGrowth !== null && f?.earningsGrowth !== undefined ? formatPercent(f.earningsGrowth * 100, true) : '–'}
                  accent={f?.earningsGrowth ? (f.earningsGrowth >= 0 ? 'pos' : 'neg') : 'none'}
                />
              </section>

              <section>
                <h2 className="text-sm font-bold text-[#0F172A] dark:text-[#F4F7FA] mb-2">Balansräkning & Tekniskt</h2>
                <MetricRow label="Omsättning (12 mån)" value={formatCompactNumber(f?.totalRevenue, currency)} />
                <MetricRow label="Fritt kassaflöde" value={formatCompactNumber(f?.freeCashflow, currency)} />
                <MetricRow label="Kassa & likvider" value={formatCompactNumber(f?.totalCash, currency)} />
                <MetricRow label="Totala skulder" value={formatCompactNumber(f?.totalDebt, currency)} />
                <MetricRow label="Skuldsättningsgrad (D/E)" value={formatRatio(f?.debtToEquity)} />
                <MetricRow label="Beta" value={formatRatio(f?.beta)} />
                <MetricRow label="MA 50 dagar" value={formatPrice(f?.fiftyDayAverage, currency)} />
                <MetricRow label="MA 200 dagar" value={formatPrice(f?.twoHundredDayAverage, currency)} />
              </section>
            </>
          )}
        </div>
      )}

      {/* TAB 3: OM BOLAGET */}
      {activeTab === 'about' && (
        <section className="mt-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0099E5]/12 text-[#0077CC] dark:text-[#0099E5] flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0F172A] dark:text-[#F4F7FA]">{displayName}</h2>
              <p className="text-xs text-[#526071] dark:text-[#7D8A9C]">
                {[p?.sector, p?.industry].filter(Boolean).join(' · ') || 'Bolagsinformation'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10">
            <MetricRow label="Sektor" value={p?.sector ?? positionRef?.sector ?? '–'} />
            <MetricRow label="Bransch" value={p?.industry ?? '–'} />
            <MetricRow label="Land / Säte" value={[p?.city, p?.country].filter(Boolean).join(', ') || '–'} />
            <MetricRow label="VD" value={p?.ceo ?? '–'} />
            <MetricRow label="Anställda" value={p?.employees ? formatQuantity(p.employees) : '–'} />
            <MetricRow label="ISIN" value={positionRef?.isin || '–'} />
          </div>

          {p?.description && (
            <div className="pt-4 border-t border-[#E2E8F0] dark:border-[#1B222D]">
              <h3 className="text-sm font-semibold text-[#0F172A] dark:text-[#F4F7FA] mb-2">
                Beskrivning
              </h3>
              <p className="text-sm leading-relaxed text-[#526071] dark:text-[#7D8A9C]">
                {p.description}
              </p>
            </div>
          )}

          {p?.website && (
            <a
              href={p.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0077CC] dark:text-[#0099E5] hover:underline"
            >
              <span>Besök bolagets hemsida</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </section>
      )}

      {/* TAB 4: NYHETER */}
      {activeTab === 'news' && (
        <section className="mt-4 divide-y divide-[#E2E8F0] dark:divide-[#1B222D]">
          {!detail?.news || detail.news.length === 0 ? (
            <div className="py-10 text-center text-sm text-[#526071] dark:text-[#7D8A9C]">
              Inga färska nyheter hittades för {symbol} just nu.
            </div>
          ) : (
            detail.news.map((item) => (
              <div key={item.uuid} className="py-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  {item.link ? (
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm sm:text-base font-semibold text-[#0F172A] dark:text-[#F4F7FA] hover:text-[#0077CC] dark:hover:text-[#00C2C7] transition leading-snug block"
                    >
                      {item.title}
                    </a>
                  ) : (
                    <p className="text-sm sm:text-base font-semibold text-[#0F172A] dark:text-[#F4F7FA] leading-snug">
                      {item.title}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-[#526071] dark:text-[#7D8A9C]">
                    {item.publisher} · {formatRelativeTime(item.publishedAt)}
                  </p>
                </div>
                {item.link && (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Läs artikel"
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#526071] dark:text-[#7D8A9C] hover:text-[#0099E5] shrink-0"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            ))
          )}
        </section>
      )}

      {/* Manual Ticker Remap Modal */}
      {editingTicker && positionRef && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setEditingTicker(false)}
        >
          <div
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-[#E2E8F0] dark:border-[#1E2632] bg-white dark:bg-[#11161F] p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-base font-bold text-[#0F172A] dark:text-[#F4F7FA]">
                Justera börsticker för {positionRef.securityName}
              </h3>
              <p className="text-xs text-[#526071] dark:text-[#7D8A9C] mt-0.5">
                Nuvarande symbol: {symbol}. Sök upp rätt Yahoo Finance-ticker nedan.
              </p>
            </div>
            <input
              type="text"
              value={tickerQuery}
              onChange={(e) => setTickerQuery(e.target.value)}
              placeholder="Sök t.ex. INVE-B.ST eller bolagsnamn..."
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#E2E8F0] dark:border-[#1E2632] bg-slate-50 dark:bg-[#090C10] text-sm text-[#0F172A] dark:text-[#F4F7FA] focus:outline-none focus:border-[#0099E5]"
            />
            <div className="max-h-60 overflow-y-auto divide-y divide-[#E2E8F0] dark:divide-[#1B222D]">
              {searchingTicker && (
                <p className="py-4 text-center text-xs text-[#526071] dark:text-[#7D8A9C]">Söker...</p>
              )}
              {!searchingTicker &&
                tickerResults.map((r) => (
                  <button
                    key={r.symbol}
                    type="button"
                    onClick={() => {
                      const secKey = normalizeSecurityKey(positionRef.securityName, positionRef.isin);
                      onUpdateCustomTicker(secKey, r.symbol);
                      onChangeSymbol(r.symbol, positionRef.securityName);
                      setEditingTicker(false);
                    }}
                    className="w-full text-left py-2.5 px-2 flex items-center justify-between gap-3 hover:bg-slate-100 dark:hover:bg-[#171E29] rounded-lg"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F4F7FA] truncate">
                        {r.shortName}
                      </p>
                      <p className="text-xs text-[#526071] dark:text-[#7D8A9C]">
                        {r.symbol} · {r.exchange}
                      </p>
                    </div>
                    <Check className="w-4 h-4 text-[#00C2C7] shrink-0" />
                  </button>
                ))}
            </div>
            <button
              type="button"
              onClick={() => setEditingTicker(false)}
              className="w-full min-h-[44px] rounded-xl bg-slate-100 dark:bg-[#171E29] text-sm font-semibold text-[#0F172A] dark:text-[#F4F7FA]"
            >
              Stäng
            </button>
          </div>
        </div>
      )}

      {/* Delete Stock Confirmation Dialog */}
      {confirmDelete && positionRef && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setConfirmDelete(false)}
        >
          <div
            className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl border border-[#E2E8F0] dark:border-[#1E2632] bg-white dark:bg-[#11161F] p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-base font-bold text-[#0F172A] dark:text-[#F4F7FA]">
                Ta bort {positionRef.securityName}?
              </h3>
              <p className="text-xs text-[#526071] dark:text-[#7D8A9C] mt-1 leading-relaxed">
                Aktien och dess transaktioner tas bort från din lokala portfölj. Du kan alltid importera din CSV-fil igen.
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false);
                  onRemoveStock({
                    securityName: positionRef.securityName,
                    isin: positionRef.isin,
                    symbol: positionRef.symbol,
                  });
                }}
                className="flex-1 min-h-[44px] rounded-xl bg-[#D92D4B] dark:bg-[#FF4D6A] text-white font-semibold text-sm hover:opacity-90 transition"
              >
                Ta bort
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
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

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, RefreshCw, Search, Star, X } from 'lucide-react';
import { fetchMarketOverview, searchSecurities } from '../services/marketApi';
import type { MarketQuote, SearchQuote } from '../types/portfolio';
import { formatPercent, formatPrice } from '../utils/format';

interface MarketViewProps {
  onOpenStock: (symbol: string, fallbackName?: string) => void;
  isInWatchlist: (symbol: string) => boolean;
  onToggleWatchlist: (symbol: string, name: string) => void;
}

type MarketFilter = 'all' | 'gainers' | 'losers' | 'sweden';

export const MarketView: React.FC<MarketViewProps> = ({
  onOpenStock,
  isInWatchlist,
  onToggleWatchlist,
}) => {
  const [indices, setIndices] = useState<MarketQuote[]>([]);
  const [popular, setPopular] = useState<MarketQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<MarketFilter>('all');

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchQuote[]>([]);
  const [searching, setSearching] = useState(false);

  const loadMarket = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMarketOverview();
      setIndices(data.indices);
      setPopular(data.popular);
    } catch {
      setError('Kunde inte ladda marknadsdata just nu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMarket();
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    const timer = setTimeout(() => {
      setSearching(true);
      searchSecurities(trimmed)
        .then(setSearchResults)
        .finally(() => setSearching(false));
    }, 280);
    return () => clearTimeout(timer);
  }, [query]);

  const filteredPopular = useMemo(() => {
    let list = [...popular];
    if (filter === 'sweden') {
      list = list.filter((q) => q.symbol.endsWith('.ST'));
    } else if (filter === 'gainers') {
      list = list.filter((q) => q.regularMarketChangePercent > 0).sort((a, b) => b.regularMarketChangePercent - a.regularMarketChangePercent);
    } else if (filter === 'losers') {
      list = list.filter((q) => q.regularMarketChangePercent < 0).sort((a, b) => a.regularMarketChangePercent - b.regularMarketChangePercent);
    }
    return list;
  }, [popular, filter]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-6">
      {/* Header + Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0F172A] dark:text-[#F4F7FA]">
            Marknad
          </h1>
          <p className="text-xs text-[#526071] dark:text-[#8B98AB] mt-0.5">
            Sök bland svenska, nordiska och globala aktier via Yahoo Finance
          </p>
        </div>

        <div className="relative w-full sm:max-w-md">
          <Search className="w-4 h-4 text-[#526071] dark:text-[#8B98AB] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Sök aktie, ticker eller ISIN (t.ex. Investor, AAPL)..."
            className="w-full min-h-[44px] pl-10 pr-10 rounded-xl border border-[#E2E8F0] dark:border-[#222B38] bg-white dark:bg-[#131922] text-sm text-[#0F172A] dark:text-[#F4F7FA] placeholder:text-[#526071] dark:placeholder:text-[#8B98AB] focus:outline-none focus:border-[#0099E5]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Rensa sökning"
              className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center text-[#526071] dark:text-[#8B98AB]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Live Search Results */}
      {query.trim().length >= 2 && (
        <section className="rounded-2xl border border-[#E2E8F0] dark:border-[#222B38] bg-white dark:bg-[#131922] overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-[#E2E8F0] dark:border-[#222B38] text-xs font-semibold text-[#526071] dark:text-[#8B98AB]">
            {searching ? 'Söker på börserna...' : `Sökresultat för "${query.trim()}"`}
          </div>
          {!searching && searchResults.length === 0 ? (
            <div className="p-6 text-center text-sm text-[#526071] dark:text-[#8B98AB]">
              Inga aktier matchade din sökning. Prova bolagsnamn eller ticker (t.ex. VOLV-B.ST).
            </div>
          ) : (
            <div className="divide-y divide-[#E2E8F0] dark:divide-[#222B38]">
              {searchResults.map((r) => {
                const starred = isInWatchlist(r.symbol);
                return (
                  <div
                    key={r.symbol}
                    className="px-4 sm:px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-[#18202C] transition"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenStock(r.symbol, r.shortName)}
                      className="flex-1 min-w-0 text-left py-1"
                    >
                      <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F4F7FA] truncate">
                        {r.shortName}
                      </p>
                      <p className="text-xs text-[#526071] dark:text-[#8B98AB] truncate">
                        {r.symbol} · {r.exchange}
                        {r.sector ? ` · ${r.sector}` : ''}
                      </p>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onToggleWatchlist(r.symbol, r.shortName)}
                        aria-label={starred ? 'Ta bort bevakning' : 'Lägg till bevakning'}
                        className={`min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl transition ${
                          starred ? 'text-amber-500' : 'text-[#526071] dark:text-[#8B98AB] hover:text-amber-500'
                        }`}
                      >
                        <Star className={`w-4 h-4 ${starred ? 'fill-amber-500' : ''}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenStock(r.symbol, r.shortName)}
                        aria-label="Öppna aktie"
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center text-[#526071] dark:text-[#8B98AB]"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Indices & FX Strip */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#0F172A] dark:text-[#F4F7FA]">
            Index & Valutor
          </h2>
          <button
            type="button"
            onClick={() => void loadMarket()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#526071] dark:text-[#8B98AB] hover:text-[#0F172A] dark:hover:text-white py-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#00C2C7]' : ''}`} />
            <span>Uppdatera</span>
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {loading && indices.length === 0
            ? Array.from({ length: 7 }).map((_, i) => (
                <div
                  key={i}
                  className="h-20 rounded-xl border border-[#E2E8F0] dark:border-[#222B38] bg-white dark:bg-[#131922] animate-pulse"
                />
              ))
            : indices.map((idx) => {
                const pos = idx.regularMarketChangePercent >= 0;
                return (
                  <button
                    key={idx.symbol}
                    type="button"
                    onClick={() => onOpenStock(idx.symbol, idx.displayName || idx.shortName)}
                    className="text-left rounded-xl border border-[#E2E8F0] dark:border-[#222B38] bg-white dark:bg-[#131922] p-3.5 hover:border-[#0099E5] transition"
                  >
                    <p className="text-xs font-semibold text-[#526071] dark:text-[#8B98AB] truncate">
                      {idx.displayName || idx.shortName}
                    </p>
                    <p className="mt-1 text-sm font-bold text-[#0F172A] dark:text-[#F4F7FA] font-num">
                      {new Intl.NumberFormat('sv-SE', {
                        minimumFractionDigits: idx.regularMarketPrice < 50 ? 2 : 0,
                        maximumFractionDigits: idx.regularMarketPrice < 50 ? 3 : 1,
                      }).format(idx.regularMarketPrice)}
                    </p>
                    <p
                      className={`mt-0.5 text-xs font-semibold font-num ${
                        pos
                          ? 'text-[#009DA2] dark:text-[#00C2C7]'
                          : 'text-[#D92D4B] dark:text-[#FF4D6A]'
                      }`}
                    >
                      {formatPercent(idx.regularMarketChangePercent)}
                    </p>
                  </button>
                );
              })}
        </div>
      </section>

      {/* Popular Nordic & Global Stocks */}
      <section className="rounded-2xl border border-[#E2E8F0] dark:border-[#222B38] bg-white dark:bg-[#131922] overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-[#E2E8F0] dark:border-[#222B38] flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold text-[#0F172A] dark:text-[#F4F7FA]">
            Populära aktier
          </h2>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#0B0F14]">
            {(
              [
                ['all', 'Alla'],
                ['sweden', 'Sverige'],
                ['gainers', 'Vinnare'],
                ['losers', 'Förlorare'],
              ] as Array<[MarketFilter, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                  filter === key
                    ? 'bg-white dark:bg-[#1B2330] text-[#0F172A] dark:text-white shadow-sm'
                    : 'text-[#526071] dark:text-[#8B98AB]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-[#E2E8F0] dark:divide-[#222B38]">
          {loading && popular.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#526071] dark:text-[#8B98AB]">
              Hämtar aktiekurser...
            </div>
          ) : filteredPopular.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#526071] dark:text-[#8B98AB]">
              Inga aktier matchar filtret just nu.
            </div>
          ) : (
            filteredPopular.map((q) => {
              const pos = q.regularMarketChangePercent >= 0;
              const starred = isInWatchlist(q.symbol);
              return (
                <div
                  key={q.symbol}
                  className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-[#18202C] transition"
                >
                  <button
                    type="button"
                    onClick={() => onOpenStock(q.symbol, q.shortName)}
                    className="flex-1 min-w-0 text-left flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F4F7FA] truncate">
                        {q.shortName}
                      </p>
                      <p className="text-xs text-[#526071] dark:text-[#8B98AB] truncate">
                        {q.symbol} · {q.exchange}
                      </p>
                    </div>
                    <div className="text-right font-num shrink-0">
                      <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F4F7FA]">
                        {formatPrice(q.regularMarketPrice, q.currency)}
                      </p>
                      <p
                        className={`text-xs font-semibold ${
                          pos
                            ? 'text-[#009DA2] dark:text-[#00C2C7]'
                            : 'text-[#D92D4B] dark:text-[#FF4D6A]'
                        }`}
                      >
                        {formatPercent(q.regularMarketChangePercent)}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleWatchlist(q.symbol, q.shortName)}
                    aria-label={starred ? 'Ta bort från bevakning' : 'Lägg till i bevakning'}
                    className={`min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl shrink-0 transition ${
                      starred ? 'text-amber-500' : 'text-[#526071] dark:text-[#8B98AB] hover:text-amber-500'
                    }`}
                  >
                    <Star className={`w-4 h-4 ${starred ? 'fill-amber-500' : ''}`} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { ChevronRight, Plus, RefreshCw, Search, Star, Trash2 } from 'lucide-react';
import { searchSecurities } from '../services/marketApi';
import type { MarketQuote, SearchQuote, WatchlistItem } from '../types/portfolio';
import { formatPercent, formatPrice, formatRatio } from '../utils/format';

interface WatchlistViewProps {
  watchlist: WatchlistItem[];
  cachedQuotes: Record<string, MarketQuote>;
  isSyncing: boolean;
  onRefresh: () => void;
  onOpenStock: (symbol: string, fallbackName?: string) => void;
  onToggleWatchlist: (symbol: string, name: string) => void;
}

export const WatchlistView: React.FC<WatchlistViewProps> = ({
  watchlist,
  cachedQuotes,
  isSyncing,
  onRefresh,
  onOpenStock,
  onToggleWatchlist,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchQuote[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setSearching(true);
      searchSecurities(query)
        .then(setResults)
        .finally(() => setSearching(false));
    }, 280);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0F172A] dark:text-[#F4F7FA]">
            Bevakning
          </h1>
          <p className="text-xs text-[#526071] dark:text-[#8B98AB] mt-0.5">
            Följ intressanta bolag i realtid — sparas lokalt på enheten
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isSyncing}
          className="min-h-[40px] px-3.5 rounded-xl border border-[#E2E8F0] dark:border-[#222B38] bg-white dark:bg-[#131922] text-xs font-medium text-[#526071] dark:text-[#8B98AB] hover:text-[#0F172A] dark:hover:text-white inline-flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-[#00C2C7]' : ''}`} />
          <span>Uppdatera kurser</span>
        </button>
      </div>

      {/* Add to watchlist quick search */}
      <div className="relative">
        <Search className="w-4 h-4 text-[#526071] dark:text-[#8B98AB] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Lägg till aktie i bevakningslistan..."
          className="w-full min-h-[46px] pl-10 pr-4 rounded-xl border border-[#E2E8F0] dark:border-[#222B38] bg-white dark:bg-[#131922] text-sm text-[#0F172A] dark:text-[#F4F7FA] placeholder:text-[#526071] dark:placeholder:text-[#8B98AB] focus:outline-none focus:border-[#0099E5]"
        />
      </div>

      {query.trim().length >= 2 && (
        <div className="rounded-2xl border border-[#E2E8F0] dark:border-[#222B38] bg-white dark:bg-[#131922] divide-y divide-[#E2E8F0] dark:divide-[#222B38]">
          {searching ? (
            <p className="p-4 text-xs text-center text-[#526071] dark:text-[#8B98AB]">Söker...</p>
          ) : results.length === 0 ? (
            <p className="p-4 text-xs text-center text-[#526071] dark:text-[#8B98AB]">Inga träffar.</p>
          ) : (
            results.slice(0, 6).map((r) => {
              const exists = watchlist.some((w) => w.symbol.toUpperCase() === r.symbol.toUpperCase());
              return (
                <div key={r.symbol} className="px-4 py-3 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onOpenStock(r.symbol, r.shortName)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F4F7FA] truncate">
                      {r.shortName}
                    </p>
                    <p className="text-xs text-[#526071] dark:text-[#8B98AB]">
                      {r.symbol} · {r.exchange}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onToggleWatchlist(r.symbol, r.shortName);
                      setQuery('');
                    }}
                    className="min-h-[38px] px-3 rounded-lg bg-[#0099E5]/12 text-[#0077CC] dark:text-[#0099E5] text-xs font-semibold inline-flex items-center gap-1 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{exists ? 'Bevakad' : 'Bevaka'}</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Watchlist items */}
      <section className="rounded-2xl border border-[#E2E8F0] dark:border-[#222B38] bg-white dark:bg-[#131922] overflow-hidden">
        {watchlist.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Star className="w-8 h-8 text-[#526071] dark:text-[#8B98AB] mx-auto" />
            <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F4F7FA]">
              Din bevakningslista är tom
            </p>
            <p className="text-xs text-[#526071] dark:text-[#8B98AB]">
              Sök efter ett bolag ovan eller tryck på stjärnan inne på en aktiesida.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#E2E8F0] dark:divide-[#222B38]">
            {watchlist.map((item) => {
              const q = cachedQuotes[item.symbol.toUpperCase()];
              const pos = (q?.regularMarketChangePercent ?? 0) >= 0;
              return (
                <div
                  key={item.symbol}
                  className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-[#18202C] transition"
                >
                  <button
                    type="button"
                    onClick={() => onOpenStock(item.symbol, item.name)}
                    className="flex-1 min-w-0 text-left flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F4F7FA] truncate">
                        {q?.shortName || item.name}
                      </p>
                      <p className="text-xs text-[#526071] dark:text-[#8B98AB] truncate">
                        {item.symbol}
                        {q?.trailingPE ? ` · P/E ${formatRatio(q.trailingPE, 1)}` : ''}
                        {q?.dividendYield ? ` · Utd. ${formatPercent(q.dividendYield * 100, false, 1)}` : ''}
                      </p>
                    </div>
                    <div className="text-right font-num shrink-0">
                      <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F4F7FA]">
                        {q ? formatPrice(q.regularMarketPrice, q.currency) : '–'}
                      </p>
                      <p
                        className={`text-xs font-semibold ${
                          pos
                            ? 'text-[#009DA2] dark:text-[#00C2C7]'
                            : 'text-[#D92D4B] dark:text-[#FF4D6A]'
                        }`}
                      >
                        {q ? formatPercent(q.regularMarketChangePercent) : 'Laddar...'}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggleWatchlist(item.symbol, item.name)}
                      aria-label={`Ta bort ${item.name}`}
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#526071] dark:text-[#8B98AB] hover:text-[#D92D4B] dark:hover:text-[#FF4D6A] transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenStock(item.symbol, item.name)}
                      aria-label={`Öppna ${item.name}`}
                      className="min-h-[40px] min-w-[32px] flex items-center justify-center text-[#526071] dark:text-[#8B98AB]"
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
    </div>
  );
};

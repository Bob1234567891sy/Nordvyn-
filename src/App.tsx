/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Menu,
  Moon,
  PieChart,
  Star,
  Sun,
  TrendingUp,
  Upload,
} from 'lucide-react';
import { CsvImportPanel } from './components/CsvImportModal';
import { MarketView } from './components/MarketView';
import { MenuSettingsView } from './components/MenuSettingsView';
import { PortfolioOverview } from './components/PortfolioOverview';
import { OfflineBanner, PWAInstallButton } from './components/PWAInstallModal';
import { StockDetailView } from './components/StockDetailView';
import { WatchlistView } from './components/WatchlistView';
import { usePortfolioStore } from './hooks/usePortfolioStore';
import type { AppTab } from './types/portfolio';
import type { ParsedCsvResult } from './utils/nordnetParser';

const NAV_ITEMS: Array<{ id: AppTab; label: string; icon: typeof PieChart }> = [
  { id: 'overview', label: 'Översikt', icon: PieChart },
  { id: 'market', label: 'Marknad', icon: TrendingUp },
  { id: 'watchlist', label: 'Bevakning', icon: Star },
  { id: 'menu', label: 'Meny', icon: Menu },
];

export default function App() {
  const store = usePortfolioStore();
  const [activeTab, setActiveTab] = useState<AppTab>('overview');
  const [selectedStock, setSelectedStock] = useState<{ symbol: string; name?: string } | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 3400);
  };

  const handleOpenStock = (symbol: string, fallbackName?: string) => {
    setSelectedStock({ symbol: symbol.toUpperCase(), name: fallbackName });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectTab = (tab: AppTab) => {
    setSelectedStock(null);
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleImportCsv = async (
    parsed: ParsedCsvResult,
    fileName: string,
    mode: 'replace' | 'merge'
  ) => {
    await store.importCsvResult(parsed, fileName, mode);
    setActiveTab('overview');
    setSelectedStock(null);
    triggerToast(
      `Importerade ${parsed.rowCount} rader från ${fileName}`
    );
  };

  const handleLoadDemo = () => {
    store.loadDemoPortfolio();
    setActiveTab('overview');
    setSelectedStock(null);
    triggerToast('Laddade exempelportfölj med 10 bolag (ISK + KF)');
  };

  const handleClearPortfolio = () => {
    store.clearPortfolio();
    setSelectedStock(null);
    triggerToast('All lokal portföljdata har rensats');
  };

  const activeHolding = useMemo(() => {
    if (!selectedStock) return undefined;
    return store.holdings.find(
      (h) => h.symbol.toUpperCase() === selectedStock.symbol.toUpperCase()
    );
  }, [selectedStock, store.holdings]);

  const activeClosedHolding = useMemo(() => {
    if (!selectedStock) return undefined;
    return store.closedHoldings.find(
      (h) => h.symbol.toUpperCase() === selectedStock.symbol.toUpperCase()
    );
  }, [selectedStock, store.closedHoldings]);

  return (
    <div className="min-h-screen bg-white dark:bg-[#090C10] text-[#0F172A] dark:text-[#F4F7FA] flex flex-col lg:flex-row">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:fixed lg:inset-y-0 lg:left-0 border-r border-[#E2E8F0] dark:border-[#1B222D] bg-[#F8FAFC] dark:bg-[#0C1016] z-30">
        <div className="px-5 h-16 flex items-center gap-2.5 border-b border-[#E2E8F0] dark:border-[#1B222D]">
          <img
            src="/icon.svg"
            alt="NordVyn"
            className="w-7 h-7 rounded-lg shrink-0"
          />
          <span className="font-display text-lg font-extrabold tracking-tight text-[#0F172A] dark:text-[#F4F7FA] whitespace-nowrap">
            NordVyn
          </span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1" aria-label="Huvudmeny">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = !selectedStock && activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectTab(item.id)}
                className={`w-full min-h-[44px] px-3.5 rounded-xl flex items-center gap-3 text-sm font-semibold transition whitespace-nowrap ${
                  isActive
                    ? 'bg-[#00C2C7]/14 text-[#009DA2] dark:text-[#00C2C7]'
                    : 'text-[#526071] dark:text-[#7D8A9C] hover:bg-slate-200/60 dark:hover:bg-[#141A23] hover:text-[#0F172A] dark:hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#E2E8F0] dark:border-[#1B222D] space-y-2.5">
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#009DA2] dark:bg-[#00C2C7] text-[#061214] text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition whitespace-nowrap"
          >
            <Upload className="w-4 h-4 shrink-0" />
            <span>Importera Nordnet CSV</span>
          </button>

          <div className="flex items-center justify-between gap-2 pt-1">
            <PWAInstallButton variant="compact" />
            <button
              type="button"
              onClick={store.toggleTheme}
              aria-label={store.theme === 'dark' ? 'Byt till ljust läge' : 'Byt till mörkt läge'}
              className="min-h-[40px] min-w-[40px] ml-auto rounded-xl border border-[#E2E8F0] dark:border-[#1B222D] flex items-center justify-center text-[#526071] dark:text-[#7D8A9C] hover:text-[#0F172A] dark:hover:text-white transition"
            >
              {store.theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 lg:pl-60 flex flex-col min-h-screen">
        <OfflineBanner />

        {/* Mobile Top App Bar */}
        {!selectedStock && (
          <header className="lg:hidden sticky top-0 z-30 pt-safe bg-white/94 dark:bg-[#090C10]/94 backdrop-blur-md border-b border-[#E2E8F0] dark:border-[#1B222D]">
            <div className="h-13 px-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => handleSelectTab('overview')}
                className="flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                <img src="/icon.svg" alt="NordVyn" className="w-6.5 h-6.5 rounded-lg" />
                <span className="font-display text-base font-extrabold tracking-tight text-[#0F172A] dark:text-[#F4F7FA]">
                  NordVyn
                </span>
              </button>

              <div className="flex items-center gap-1.5 shrink-0">
                <PWAInstallButton variant="compact" />
                <button
                  type="button"
                  onClick={store.toggleTheme}
                  aria-label={store.theme === 'dark' ? 'Byt till ljust läge' : 'Byt till mörkt läge'}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#526071] dark:text-[#7D8A9C] hover:text-[#0F172A] dark:hover:text-white transition"
                >
                  {store.theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </header>
        )}

        {/* Active Screen Viewport */}
        <main className="flex-1 pb-22 lg:pb-10">
          {selectedStock ? (
            <StockDetailView
              symbol={selectedStock.symbol}
              fallbackName={selectedStock.name}
              cachedQuote={store.state.cachedQuotes[selectedStock.symbol.toUpperCase()]}
              holding={activeHolding}
              closedHolding={activeClosedHolding}
              transactions={store.state.transactions}
              isWatchlisted={store.isInWatchlist(selectedStock.symbol)}
              onToggleWatchlist={(sym, name) => {
                const already = store.isInWatchlist(sym);
                store.toggleWatchlist(sym, name);
                triggerToast(already ? `Tog bort ${name} från bevakning` : `Bevakar nu ${name}`);
              }}
              onUpdateCustomTicker={(secKey, newSym) => {
                store.updateCustomTicker(secKey, newSym);
                triggerToast(`Uppdaterade ticker till ${newSym}`);
              }}
              onRemoveStock={(target) => {
                store.removeStock(target);
                setSelectedStock(null);
                triggerToast(`Tog bort ${target.securityName} från portföljen`);
              }}
              onBack={() => setSelectedStock(null)}
              onChangeSymbol={(newSym, name) =>
                setSelectedStock({ symbol: newSym.toUpperCase(), name })
              }
            />
          ) : activeTab === 'overview' ? (
            <PortfolioOverview
              hasPortfolioData={store.hasPortfolioData}
              accounts={store.accounts}
              selectedAccount={store.selectedAccount}
              onSelectAccount={store.setSelectedAccount}
              holdings={store.holdings}
              closedHoldings={store.closedHoldings}
              transactions={store.state.transactions}
              summary={store.summary}
              customTickerMap={store.state.customTickerMap}
              fxRates={store.state.fxRates}
              lastSyncedAt={store.state.lastSyncedAt}
              isSyncing={store.isSyncing}
              onRefresh={() => void store.refreshMarketData()}
              onOpenStock={handleOpenStock}
              onOpenImportModal={() => setShowImportModal(true)}
              onImportCsv={handleImportCsv}
              onLoadDemo={handleLoadDemo}
              onRemoveStock={(target) => {
                store.removeStock(target);
                triggerToast(`Tog bort ${target.securityName} från portföljen`);
              }}
            />
          ) : activeTab === 'market' ? (
            <MarketView
              onOpenStock={handleOpenStock}
              isInWatchlist={store.isInWatchlist}
              onToggleWatchlist={(sym, name) => {
                const already = store.isInWatchlist(sym);
                store.toggleWatchlist(sym, name);
                triggerToast(already ? `Tog bort ${name} från bevakning` : `Bevakar nu ${name}`);
              }}
            />
          ) : activeTab === 'watchlist' ? (
            <WatchlistView
              watchlist={store.state.watchlist}
              cachedQuotes={store.state.cachedQuotes}
              isSyncing={store.isSyncing}
              onRefresh={() => void store.refreshMarketData()}
              onOpenStock={handleOpenStock}
              onToggleWatchlist={(sym, name) => {
                const already = store.isInWatchlist(sym);
                store.toggleWatchlist(sym, name);
                triggerToast(already ? `Tog bort ${name} från bevakning` : `Bevakar nu ${name}`);
              }}
            />
          ) : (
            <MenuSettingsView
              theme={store.theme}
              onSetTheme={store.setTheme}
              imports={store.state.imports}
              hasPortfolioData={store.hasPortfolioData}
              onOpenImportModal={() => setShowImportModal(true)}
              onLoadDemo={handleLoadDemo}
              onClearPortfolio={handleClearPortfolio}
            />
          )}
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar (Nordnet 4-Tab Thumb Zone) */}
      <nav
        aria-label="Mobilmeny"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/94 dark:bg-[#10151E]/94 backdrop-blur-md border-t border-[#E2E8F0] dark:border-[#222B38] pb-safe"
      >
        <div className="grid grid-cols-4 h-15">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = !selectedStock && activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectTab(item.id)}
                className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition ${
                  isActive
                    ? 'text-[#009DA2] dark:text-[#00C2C7]'
                    : 'text-[#526071] dark:text-[#8B98AB]'
                }`}
              >
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.4 : 1.9} />
                <span className="text-[10px] font-semibold tracking-tight whitespace-nowrap">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* CSV Import Modal */}
      {showImportModal && (
        <CsvImportPanel
          isModal
          hasExistingData={store.hasPortfolioData}
          customTickerMap={store.state.customTickerMap}
          onConfirmImport={handleImportCsv}
          onLoadDemo={handleLoadDemo}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {/* Subtle Toast Confirmation */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-[#0F172A] dark:bg-[#F4F7FA] text-white dark:text-[#0B0F14] text-xs font-semibold shadow-xl flex items-center gap-2 whitespace-nowrap max-w-[92vw]"
        >
          <CheckCircle2 className="w-4 h-4 text-[#00C2C7] dark:text-[#009DA2] shrink-0" />
          <span className="truncate">{toast}</span>
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react';
import type { ImportedFileMeta, ThemeMode } from '../types/portfolio';
import { formatDateShort } from '../utils/format';
import { PWAInstallButton } from './PWAInstallModal';

interface MenuSettingsViewProps {
  theme: ThemeMode;
  onSetTheme: (mode: ThemeMode) => void;
  imports: ImportedFileMeta[];
  hasPortfolioData: boolean;
  onOpenImportModal: () => void;
  onLoadDemo: () => void;
  onClearPortfolio: () => void;
}

export const MenuSettingsView: React.FC<MenuSettingsViewProps> = ({
  theme,
  onSetTheme,
  imports,
  hasPortfolioData,
  onOpenImportModal,
  onLoadDemo,
  onClearPortfolio,
}) => {
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0F172A] dark:text-[#F4F7FA]">
          Meny & Inställningar
        </h1>
        <p className="text-xs text-[#526071] dark:text-[#8B98AB] mt-0.5">
          Hantera Nordnet-import, utseende och hemskärmsinstallation
        </p>
      </div>

      {/* PWA Install Card (auto-hides if already installed standalone) */}
      <PWAInstallButton variant="card" />

      {/* Appearance / Theme Switcher */}
      <section className="rounded-2xl border border-[#E2E8F0] dark:border-[#222B38] bg-white dark:bg-[#131922] p-5 space-y-3">
        <div>
          <h2 className="text-base font-bold text-[#0F172A] dark:text-[#F4F7FA]">Utseende</h2>
          <p className="text-xs text-[#526071] dark:text-[#8B98AB] mt-0.5">
            Välj mellan Nordnet Mörkt läge och Ljust läge.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 p-1 rounded-xl bg-slate-100 dark:bg-[#0B0F14]">
          <button
            type="button"
            onClick={() => onSetTheme('dark')}
            className={`min-h-[44px] rounded-lg flex items-center justify-center gap-2 text-sm font-semibold transition ${
              theme === 'dark'
                ? 'bg-[#1B2330] text-white shadow-sm'
                : 'text-[#526071] hover:text-[#0F172A]'
            }`}
          >
            <Moon className="w-4 h-4 text-[#00C2C7]" />
            <span>Mörkt läge</span>
          </button>
          <button
            type="button"
            onClick={() => onSetTheme('light')}
            className={`min-h-[44px] rounded-lg flex items-center justify-center gap-2 text-sm font-semibold transition ${
              theme === 'light'
                ? 'bg-white text-[#0F172A] shadow-sm'
                : 'text-[#8B98AB] hover:text-white'
            }`}
          >
            <Sun className="w-4 h-4 text-amber-500" />
            <span>Ljust läge</span>
          </button>
        </div>
      </section>

      {/* Nordnet CSV Management */}
      <section className="rounded-2xl border border-[#E2E8F0] dark:border-[#222B38] bg-white dark:bg-[#131922] p-5 space-y-4">
        <div>
          <h2 className="text-base font-bold text-[#0F172A] dark:text-[#F4F7FA]">
            Nordnet CSV & Portföljdata
          </h2>
          <p className="text-xs text-[#526071] dark:text-[#8B98AB] mt-0.5">
            Ladda upp nya transaktioner eller en aktuell innehavsfil när som helst.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onOpenImportModal}
            className="min-h-[46px] px-4 rounded-xl bg-[#009DA2] dark:bg-[#00C2C7] text-[#061214] text-sm font-semibold inline-flex items-center justify-center gap-2 hover:opacity-90 transition"
          >
            <Upload className="w-4 h-4" />
            <span>Importera Nordnet CSV</span>
          </button>
          <button
            type="button"
            onClick={onLoadDemo}
            className="min-h-[46px] px-4 rounded-xl border border-[#E2E8F0] dark:border-[#222B38] bg-slate-50 dark:bg-[#1B2330] text-sm font-semibold text-[#0F172A] dark:text-[#F4F7FA] inline-flex items-center justify-center gap-2 hover:border-[#0099E5] transition"
          >
            <Sparkles className="w-4 h-4 text-[#00C2C7]" />
            <span>Ladda exempelportfölj</span>
          </button>
        </div>

        {imports.length > 0 && (
          <div className="pt-3 border-t border-[#E2E8F0] dark:border-[#222B38] space-y-2">
            <p className="text-xs font-semibold text-[#526071] dark:text-[#8B98AB]">
              Importerade filer
            </p>
            <div className="divide-y divide-[#E2E8F0] dark:divide-[#222B38]">
              {imports.map((imp) => (
                <div key={imp.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileSpreadsheet className="w-4 h-4 text-[#0099E5] shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#0F172A] dark:text-[#F4F7FA] truncate">
                        {imp.fileName}
                      </p>
                      <p className="text-xs text-[#526071] dark:text-[#8B98AB]">
                        {imp.format === 'transactions'
                          ? 'Transaktioner'
                          : imp.format === 'holdings'
                            ? 'Innehav'
                            : 'Exempeldata'}
                        {' · '}
                        {imp.rowCount} rader · {formatDateShort(imp.importedAt)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasPortfolioData && (
          <div className="pt-3 border-t border-[#E2E8F0] dark:border-[#222B38]">
            {!confirmClear ? (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="min-h-[42px] px-3.5 rounded-xl text-xs font-semibold text-[#D92D4B] dark:text-[#FF4D6A] hover:bg-[#D92D4B]/10 inline-flex items-center gap-2 transition"
              >
                <Trash2 className="w-4 h-4" />
                <span>Rensa sparad portföljdata på enheten</span>
              </button>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#D92D4B]/30 bg-[#D92D4B]/10 p-3.5">
                <span className="text-xs font-medium text-[#D92D4B] dark:text-[#FF6B81]">
                  Är du säker? Alla lokalt importerade transaktioner och innehav raderas.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClearPortfolio();
                      setConfirmClear(false);
                    }}
                    className="min-h-[38px] px-3.5 rounded-lg bg-[#D92D4B] text-white text-xs font-semibold"
                  >
                    Ja, rensa
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="min-h-[38px] px-3.5 rounded-lg bg-white dark:bg-[#1B2330] text-xs font-semibold text-[#0F172A] dark:text-[#F4F7FA]"
                  >
                    Avbryt
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Privacy & Local Storage Info */}
      <section className="rounded-2xl border border-[#E2E8F0] dark:border-[#222B38] bg-white dark:bg-[#131922] p-5 flex items-start gap-3.5">
        <ShieldCheck className="w-5 h-5 text-[#009DA2] dark:text-[#00C2C7] mt-0.5 shrink-0" />
        <div>
          <h3 className="text-sm font-bold text-[#0F172A] dark:text-[#F4F7FA]">
            100 % lokal lagring av din Nordnet-data
          </h3>
          <p className="mt-1 text-xs text-[#526071] dark:text-[#8B98AB] leading-relaxed">
            Dina CSV-filer, transaktioner, saldon och GAV-beräkningar läses och sparas enbart i din egen enhets webbläsarlagring. Endast publika börssymboler (t.ex. INVE-B.ST) skickas för att hämta aktuella kurser, grafer och nyckeltal.
          </p>
        </div>
      </section>
    </div>
  );
};

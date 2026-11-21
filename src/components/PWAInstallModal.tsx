import React, { useState } from 'react';
import { Download, PlusSquare, Share, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'card';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'compact' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  // Suppress completely when already running as an installed standalone PWA
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      {variant === 'compact' ? (
        <button
          type="button"
          onClick={handleClick}
          className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-xl bg-[#0077CC] dark:bg-[#0099E5] text-white text-xs font-semibold hover:opacity-90 active:scale-[0.98] transition whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>Lägg till app</span>
        </button>
      ) : (
        <div className="rounded-2xl border border-[#E2E8F0] dark:border-[#222B38] bg-white dark:bg-[#131922] p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-[#0099E5]/12 text-[#0077CC] dark:text-[#0099E5] flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[#0F172A] dark:text-[#F4F7FA]">
                  Lägg till på hemskärmen
                </h3>
                <p className="mt-1 text-sm text-[#526071] dark:text-[#8B98AB]">
                  Installera NordVyn på din telefon eller dator för helskärmsläge utan webbläsarfält och snabb offline-åtkomst.
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClick}
            className="mt-4 w-full min-h-[46px] flex items-center justify-center gap-2 rounded-xl bg-[#0077CC] dark:bg-[#0099E5] text-white text-sm font-semibold hover:opacity-90 active:scale-[0.99] transition"
          >
            <Download className="w-4 h-4" />
            <span>{isInstallable ? 'Installera NordVyn nu' : isIOS ? 'Visa guide för iPhone / iPad' : 'Visa installationsguide'}</span>
          </button>
        </div>
      )}

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-[#E2E8F0] dark:border-[#222B38] bg-white dark:bg-[#131922] p-6 pb-8 sm:pb-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 mx-auto mb-4 sm:hidden" />
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-[#0F172A] dark:text-[#F4F7FA]">
                {isIOS ? 'Installera på iPhone / iPad' : 'Lägg till på hemskärmen'}
              </h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Stäng"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#526071] dark:text-[#8B98AB] hover:bg-slate-100 dark:hover:bg-[#1B2330]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isIOS ? (
              <ol className="mt-4 space-y-4 text-sm text-[#0F172A] dark:text-[#F4F7FA]">
                <li className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-lg bg-[#0099E5]/15 text-[#0077CC] dark:text-[#0099E5] font-semibold flex items-center justify-center shrink-0">
                    1
                  </span>
                  <div className="pt-0.5">
                    Öppna sidan i <strong>Safari</strong> och tryck på{' '}
                    <span className="inline-flex items-center gap-1 font-semibold">
                      <Share className="w-4 h-4 text-[#0099E5]" /> Dela-knappen
                    </span>{' '}
                    längst ned i skärmen.
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-lg bg-[#0099E5]/15 text-[#0077CC] dark:text-[#0099E5] font-semibold flex items-center justify-center shrink-0">
                    2
                  </span>
                  <div className="pt-0.5">
                    Skrolla ned i menyn och tryck på{' '}
                    <span className="inline-flex items-center gap-1 font-semibold">
                      <PlusSquare className="w-4 h-4 text-[#0099E5]" /> Lägg till på hemskärmen
                    </span>
                    .
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-lg bg-[#0099E5]/15 text-[#0077CC] dark:text-[#0099E5] font-semibold flex items-center justify-center shrink-0">
                    3
                  </span>
                  <div className="pt-0.5">
                    Tryck på <strong>Lägg till</strong> uppe till höger. NordVyn startar nu i helskärmsläge precis som en vanlig app.
                  </div>
                </li>
              </ol>
            ) : (
              <ol className="mt-4 space-y-4 text-sm text-[#0F172A] dark:text-[#F4F7FA]">
                <li className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-lg bg-[#0099E5]/15 text-[#0077CC] dark:text-[#0099E5] font-semibold flex items-center justify-center shrink-0">
                    1
                  </span>
                  <div className="pt-0.5">
                    Öppna appen i <strong>Chrome</strong>, <strong>Edge</strong> eller <strong>Samsung Internet</strong> (i egen flik utanför förhandsvisningsramen).
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-lg bg-[#0099E5]/15 text-[#0077CC] dark:text-[#0099E5] font-semibold flex items-center justify-center shrink-0">
                    2
                  </span>
                  <div className="pt-0.5">
                    Tryck på webbläsarens meny (tre punkter) eller installationsikonen i adressfältet och välj <strong>Installera app</strong> / <strong>Lägg till på startskärmen</strong>.
                  </div>
                </li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-6 w-full min-h-[46px] rounded-xl bg-slate-100 dark:bg-[#1B2330] text-sm font-semibold text-[#0F172A] dark:text-[#F4F7FA] hover:opacity-90 transition"
            >
              Jag förstår
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineBanner: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="w-full bg-amber-500/15 border-b border-amber-500/30 text-amber-800 dark:text-amber-300 px-4 py-2 text-xs font-medium flex items-center justify-center gap-2">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>Offline-läge — visar lokalt sparad portfölj och senast hämtade kurser.</span>
    </div>
  );
};

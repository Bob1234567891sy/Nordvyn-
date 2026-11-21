import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import {
  decodeFileBuffer,
  generateSampleHoldingsCsv,
  generateSampleTransactionsCsv,
  parseNordnetCsv,
  type ParsedCsvResult,
} from '../utils/nordnetParser';

interface CsvImportPanelProps {
  hasExistingData: boolean;
  customTickerMap: Record<string, string>;
  onConfirmImport: (parsed: ParsedCsvResult, fileName: string, mode: 'replace' | 'merge') => Promise<void>;
  onLoadDemo: () => void;
  onClose?: () => void;
  isModal?: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  BUY: 'Köp',
  SELL: 'Sälj',
  DIVIDEND: 'Utdelning',
  DEPOSIT: 'Insättning',
  WITHDRAWAL: 'Uttag',
  TAX: 'Skatt',
  FEE: 'Avgift/Courtage',
  INTEREST: 'Ränta',
  SPLIT_IN: 'Split in',
  SPLIT_OUT: 'Split ut',
  FX: 'Växling',
  OTHER: 'Övrigt',
  HOLDINGS: 'Innehav',
};

export const CsvImportPanel: React.FC<CsvImportPanelProps> = ({
  hasExistingData,
  customTickerMap,
  onConfirmImport,
  onLoadDemo,
  onClose,
  isModal = false,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ parsed: ParsedCsvResult; fileName: string } | null>(null);
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace');
  const [isSaving, setIsSaving] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    if (file.size > 20 * 1024 * 1024) {
      setError('Filen är för stor (max 20 MB).');
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const decoded = decodeFileBuffer(buffer);
      const parsed = parseNordnetCsv(decoded, customTickerMap);
      setPreview({ parsed, fileName: file.name });
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : 'Kunde inte läsa CSV-filen.');
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const handleCommit = async () => {
    if (!preview) return;
    setIsSaving(true);
    try {
      await onConfirmImport(preview.parsed, preview.fileName, hasExistingData ? importMode : 'replace');
      setPreview(null);
      onClose?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Importen misslyckades.');
    } finally {
      setIsSaving(false);
    }
  };

  const downloadSample = (type: 'transactions' | 'holdings') => {
    const content = type === 'transactions' ? generateSampleTransactionsCsv() : generateSampleHoldingsCsv();
    const filename = type === 'transactions' ? 'nordnet-transaktioner-exempel.csv' : 'nordnet-innehav-exempel.csv';
    const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const innerContent = (
    <div className="space-y-5">
      {isModal && (
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#0F172A] dark:text-[#F4F7FA]">
              Importera från Nordnet
            </h2>
            <p className="text-xs text-[#526071] dark:text-[#7D8A9C] mt-0.5">
              Tolkar köp, sälj, utdelningar, skatt, växling och saldo helt lokalt.
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Stäng"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#526071] dark:text-[#7D8A9C] hover:bg-slate-100 dark:hover:bg-[#161D27]"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      )}

      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={`cursor-pointer rounded-2xl border border-dashed p-7 text-center transition ${
          isDragging
            ? 'border-[#00C2C7] bg-[#00C2C7]/10'
            : 'border-slate-300 dark:border-[#242D3B] hover:border-[#0099E5] bg-slate-50/70 dark:bg-[#0D1117]'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt,.tsv,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = '';
          }}
        />
        <div className="mx-auto w-11 h-11 rounded-xl bg-[#0099E5]/12 text-[#0077CC] dark:text-[#0099E5] flex items-center justify-center">
          <Upload className="w-5 h-5" />
        </div>
        <p className="mt-3 text-sm font-semibold text-[#0F172A] dark:text-[#F4F7FA]">
          Släpp din Nordnet CSV-fil här eller tryck för att välja
        </p>
        <p className="mt-1 text-xs text-[#526071] dark:text-[#7D8A9C]">
          Fullt stöd för Nordnets Transaktioner (UTF-16/tabb) och Innehav (UTF-8/semikolon)
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-[#D92D4B]/30 bg-[#D92D4B]/10 p-3.5 text-sm text-[#D92D4B] dark:text-[#FF6B81]">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Detailed CSV Audit Preview */}
      {preview && (
        <div className="rounded-2xl border border-[#00C2C7]/35 bg-[#00C2C7]/[0.04] p-4 space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-[#009DA2] dark:text-[#00C2C7] mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F4F7FA] truncate">
                {preview.fileName}
              </p>
              <p className="text-xs text-[#526071] dark:text-[#7D8A9C] mt-0.5">
                {preview.parsed.format === 'transactions' ? 'Transaktionshistorik' : 'Innehavsöversikt'}
                {' · '}
                {preview.parsed.rowCount} rader
                {' · '}
                {preview.parsed.holdings.length} aktiva innehav
                {preview.parsed.closedHoldings.length > 0
                  ? ` · ${preview.parsed.closedHoldings.length} sålda innehav`
                  : ''}
              </p>
            </div>
          </div>

          {/* Transparent CSV breakdown */}
          <div className="pt-3 border-t border-[#E2E8F0] dark:border-[#1E2632] space-y-2 text-xs">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[#526071] dark:text-[#8B98AB] font-num">
              {Object.entries(preview.parsed.diagnostics.typeCounts).map(([typeKey, count]) => (
                <span key={typeKey}>
                  <strong className="text-[#0F172A] dark:text-[#F4F7FA]">{count}</strong>{' '}
                  {TYPE_LABELS[typeKey] ?? typeKey}
                </span>
              ))}
            </div>

            <p className="text-[#526071] dark:text-[#7D8A9C]">
              Konton: <span className="text-[#0F172A] dark:text-[#F4F7FA]">{preview.parsed.accounts.join(', ')}</span>
              {' · '}Avgränsare: {preview.parsed.diagnostics.delimiter}
            </p>

            {preview.parsed.warnings.map((w, idx) => (
              <p key={idx} className="text-amber-700 dark:text-amber-300">
                {w}
              </p>
            ))}

            {preview.parsed.diagnostics.unclassifiedTypes.length > 0 && (
              <p className="text-amber-700 dark:text-amber-300">
                Övriga transaktionstyper: {preview.parsed.diagnostics.unclassifiedTypes.join(', ')}
              </p>
            )}
          </div>

          {hasExistingData && (
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-200/70 dark:bg-[#090C10]">
              <button
                type="button"
                onClick={() => setImportMode('replace')}
                className={`flex-1 min-h-[38px] rounded-lg text-xs font-semibold transition ${
                  importMode === 'replace'
                    ? 'bg-white dark:bg-[#171E29] text-[#0F172A] dark:text-white shadow-sm'
                    : 'text-[#526071] dark:text-[#7D8A9C]'
                }`}
              >
                Ersätt portfölj
              </button>
              <button
                type="button"
                onClick={() => setImportMode('merge')}
                className={`flex-1 min-h-[38px] rounded-lg text-xs font-semibold transition ${
                  importMode === 'merge'
                    ? 'bg-white dark:bg-[#171E29] text-[#0F172A] dark:text-white shadow-sm'
                    : 'text-[#526071] dark:text-[#7D8A9C]'
                }`}
              >
                Slå ihop med nuvarande
              </button>
            </div>
          )}

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleCommit}
              disabled={isSaving}
              className="flex-1 min-h-[46px] rounded-xl bg-[#009DA2] dark:bg-[#00C2C7] text-[#061214] font-semibold text-sm hover:opacity-90 active:scale-[0.99] transition disabled:opacity-60"
            >
              {isSaving ? 'Matchar kurser & importerar...' : 'Importera till NordVyn'}
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="min-h-[46px] px-4 rounded-xl border border-[#E2E8F0] dark:border-[#1E2632] text-sm font-medium text-[#526071] dark:text-[#7D8A9C]"
            >
              Avbryt
            </button>
          </div>
        </div>
      )}

      {/* Demo & Sample CSV actions */}
      <div className="pt-2 border-t border-[#E2E8F0] dark:border-[#1C232E] space-y-3">
        <button
          type="button"
          onClick={() => {
            onLoadDemo();
            onClose?.();
          }}
          className="w-full min-h-[46px] flex items-center justify-center gap-2 rounded-xl bg-[#0F172A] dark:bg-[#171E29] text-white text-sm font-semibold hover:opacity-90 active:scale-[0.99] transition"
        >
          <Sparkles className="w-4 h-4 text-[#00C2C7]" />
          <span>Ladda exempelportfölj från Nordnet</span>
        </button>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#526071] dark:text-[#7D8A9C]">
          <span className="inline-flex items-center gap-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Exempel-CSV:
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => downloadSample('transactions')}
              className="inline-flex items-center gap-1 text-[#0077CC] dark:text-[#0099E5] font-medium hover:underline py-1"
            >
              <Download className="w-3.5 h-3.5" />
              Transaktioner.csv
            </button>
            <button
              type="button"
              onClick={() => downloadSample('holdings')}
              className="inline-flex items-center gap-1 text-[#0077CC] dark:text-[#0099E5] font-medium hover:underline py-1"
            >
              <Download className="w-3.5 h-3.5" />
              Innehav.csv
            </button>
          </div>
        </div>
      </div>

      {/* Minimalist export instructions */}
      <div className="text-xs text-[#526071] dark:text-[#7D8A9C] space-y-1 pt-1">
        <p className="font-semibold text-[#0F172A] dark:text-[#F4F7FA]">
          Så exporterar du hela historiken från Nordnet:
        </p>
        <p>1. Gå till <strong>Mina sidor → Transaktioner och notor</strong> på Nordnet.se.</p>
        <p>2. Välj tidsintervall <strong>från startdatum</strong> så alla köp, sälj och utdelningar kommer med.</p>
        <p>3. Klicka <strong>Exportera CSV</strong> och ladda upp filen här.</p>
      </div>
    </div>
  );

  if (!isModal) return innerContent;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-[#E2E8F0] dark:border-[#1E2632] bg-white dark:bg-[#11161F] p-5 sm:p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 mx-auto mb-4 sm:hidden" />
        {innerContent}
      </div>
    </div>
  );
};

import type {
  ClosedHolding,
  CsvImportDiagnostics,
  Holding,
  Transaction,
  TransactionType,
} from '../types/portfolio';
import { normalizeSecurityKey, resolveTickerLocal } from './tickerResolver';

export interface ParsedCsvResult {
  format: 'transactions' | 'holdings';
  transactions: Transaction[];
  holdings: Holding[];
  closedHoldings: ClosedHolding[];
  cashByAccount: Record<string, number>;
  accounts: string[];
  rowCount: number;
  warnings: string[];
  diagnostics: CsvImportDiagnostics;
  unresolvedTickers: Array<{ key: string; name: string; isin: string; guessedSymbol: string }>;
}

const FALLBACK_FX: Record<string, number> = {
  SEK: 1,
  USD: 10.65,
  EUR: 11.45,
  DKK: 1.535,
  NOK: 0.975,
  GBP: 13.55,
  CAD: 7.65,
  CHF: 12.15,
};

/**
 * Decodes an uploaded Nordnet file buffer supporting UTF-16LE/BE (Nordnet standard),
 * UTF-8 (with or without BOM), and Windows-1252/Latin-1.
 */
export function decodeFileBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    }
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      return new TextDecoder('utf-8').decode(bytes.subarray(3));
    }
  }

  let zeroCount = 0;
  const sampleLen = Math.min(bytes.length, 200);
  for (let i = 1; i < sampleLen; i += 2) {
    if (bytes[i] === 0) zeroCount++;
  }
  if (sampleLen > 20 && zeroCount > sampleLen * 0.3) {
    return new TextDecoder('utf-16le').decode(bytes);
  }

  const utf8Text = new TextDecoder('utf-8').decode(bytes);
  if (utf8Text.includes('\uFFFD')) {
    return new TextDecoder('windows-1252').decode(bytes);
  }
  return utf8Text;
}

function detectDelimiter(headerLine: string): string {
  const tabCount = (headerLine.match(/\t/g) || []).length;
  const semiCount = (headerLine.match(/;/g) || []).length;
  const commaCount = (headerLine.match(/,/g) || []).length;
  if (tabCount >= semiCount && tabCount >= commaCount && tabCount > 0) return '\t';
  if (semiCount >= commaCount && semiCount > 0) return ';';
  return ',';
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseSwedishNumber(raw: string | undefined | null): number {
  if (!raw) return 0;
  let cleaned = raw
    .replace(/[\u00A0\s]/g, '')
    .replace(/−/g, '-')
    .replace(/(SEK|USD|EUR|DKK|NOK|GBP|CAD|CHF|kr|%)$/i, '')
    .trim();
  if (!cleaned || cleaned === '-' || cleaned === '–') return 0;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  if (lastComma > lastDot) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma && lastComma !== -1) {
    cleaned = cleaned.replace(/,/g, '');
  } else if (lastComma !== -1) {
    cleaned = cleaned.replace(',', '.');
  }

  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasValue(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const trimmed = raw.trim();
  return trimmed.length > 0 && trimmed !== '-' && trimmed !== '–';
}

function normalizeDate(raw: string | undefined): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  return s.slice(0, 10);
}

/**
 * Classifies ALL Swedish, Nordic, and English Nordnet transaction types accurately,
 * including SÅLT / SÅLD / SÄLJ, KÖPT / KÖP, SPLIT INLÄGG/UTTAG, BYTE INLÄGG/UTTAG,
 * INLÖSEN, UTDELNING, SKATT, VÄXLING, etc.
 */
export function classifyTransactionType(raw: string, hasSecurity: boolean): TransactionType {
  const t = raw.trim().toLowerCase();

  // Splits first (Nordnet often logs SPLIT UTTAG VP + SPLIT INLÄGG VP)
  if (t.includes('split')) {
    if (t.includes('uttag') || t.includes('ut ')) return 'SPLIT_OUT';
    return 'SPLIT_IN';
  }

  // FX conversions (VÄXLING IN / VÄXLING UT / VALUTAVÄXLING)
  if (t.includes('växling') || t.includes('valutaväxling') || t.includes('fx')) {
    return 'FX';
  }

  // Taxes (check before DIVIDEND so kupongskatt/utdelningsskatt/utländsk källskatt never become DIVIDEND)
  if (
    t.includes('skatt') ||
    t.includes('tax') ||
    t.includes('källskatt') ||
    t.includes('avkastningsskatt') ||
    t.includes('schablon')
  ) {
    return 'TAX';
  }

  // Dividends & coupons
  if (
    t.includes('utdelning') ||
    t.includes('dividend') ||
    t.includes('kupong') ||
    t.includes('utskiftning') ||
    t.includes('återbetalning kapital')
  ) {
    // Reinvested dividend shares
    if (t.includes('återinvesterad') || t.includes('inlägg vp')) return 'BUY';
    return 'DIVIDEND';
  }

  // Sells & security outflows (MUST match Swedish "SÅLT", "SÅLD", "SÄLJ", "FÖRSÄLJNING", "INLÖSEN", "BYTE UTTAG VP", "AVYTTRING")
  if (
    t.includes('sålt') ||
    t.includes('såld') ||
    t.includes('sälj') ||
    t.includes('försäljning') ||
    t.includes('sell') ||
    t.includes('sold') ||
    t.includes('inlösen') ||
    t.includes('utlösen') ||
    t.includes('byte uttag') ||
    t.includes('utbyte uttag') ||
    t.includes('omvandling uttag') ||
    t.includes('avyttring') ||
    t.includes('avslut') ||
    t.includes('uppköp') ||
    t.includes('utköp') ||
    t.includes('återköp') ||
    t.includes('tillbakaköp') ||
    t.includes('tvångsinlösen') ||
    t.includes('förfall') ||
    t.includes('konkurs') ||
    t.includes('avnotering') ||
    t.includes('borttag') ||
    t.includes('uttag vp') ||
    t.includes('överföring ut vp') ||
    (hasSecurity && t.includes('uttag') && !t.includes('kontant'))
  ) {
    return 'SELL';
  }

  // Buys & security inflows (KÖPT, KÖP, TILLDELNING, BYTE INLÄGG VP, TECKNING, INLÄGG VP)
  if (
    t.includes('köpt') ||
    t.includes('köp') ||
    t.includes('buy') ||
    t.includes('bought') ||
    t.includes('tilldelning') ||
    t.includes('byte inlägg') ||
    t.includes('teckning') ||
    t.includes('nyemission') ||
    t.includes('inlägg vp') ||
    t.includes('överföring in vp') ||
    (hasSecurity && t.includes('inlägg'))
  ) {
    return 'BUY';
  }

  // Cash deposits
  if (
    t.includes('insättning') ||
    t.includes('deposit') ||
    t.includes('swish') ||
    t.includes('bankgiro') ||
    t.includes('trustly') ||
    t.includes('autogiro') ||
    t.includes('överföring in') ||
    t.includes('kreditering')
  ) {
    return 'DEPOSIT';
  }

  // Cash withdrawals
  if (
    t.includes('uttag') ||
    t.includes('withdrawal') ||
    t.includes('utbetalning') ||
    t.includes('överföring ut')
  ) {
    return 'WITHDRAWAL';
  }

  // Fees & brokerage
  if (
    t.includes('courtage') ||
    t.includes('kurtage') ||
    t.includes('avgift') ||
    t.includes('fee') ||
    t.includes('kostnad')
  ) {
    return 'FEE';
  }

  // Interest
  if (t.includes('ränta') || t.includes('interest')) {
    return 'INTEREST';
  }

  return 'OTHER';
}

function findColumnIndex(headers: string[], candidates: string[], startFrom = 0): number {
  const normHeaders = headers.map((h) => h.toLowerCase().replace(/["'\ufeff]/g, '').trim());
  for (const cand of candidates) {
    for (let i = startFrom; i < normHeaders.length; i++) {
      if (normHeaders[i] === cand) return i;
    }
  }
  for (const cand of candidates) {
    for (let i = startFrom; i < normHeaders.length; i++) {
      if (normHeaders[i].includes(cand)) return i;
    }
  }
  return -1;
}

function findAdjacentCurrencyColumn(headers: string[], targetCol: number): number {
  if (targetCol === -1) return -1;
  const next = headers[targetCol + 1]?.toLowerCase().replace(/["'\ufeff]/g, '').trim();
  if (next === 'valuta' || next === 'currency') return targetCol + 1;
  return -1;
}

function extractNumericId(rawId: string, fallback: number): number {
  const digits = rawId.replace(/\D/g, '');
  if (!digits) return fallback;
  const n = Number.parseInt(digits.slice(-12), 10);
  return Number.isFinite(n) ? n : fallback;
}

export function parseNordnetCsv(
  text: string,
  customTickerMap: Record<string, string> = {}
): ParsedCsvResult {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    throw new Error('Filen verkar vara tom eller saknar datarader.');
  }

  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const lower = lines[i].toLowerCase();
    if (
      lower.includes('värdepapper') ||
      lower.includes('transaktionstyp') ||
      lower.includes('isin') ||
      lower.includes('marknadsvärde') ||
      lower.includes('gav') ||
      lower.includes('instrument')
    ) {
      headerRowIdx = i;
      break;
    }
  }

  const delimiter = detectDelimiter(lines[headerRowIdx]);
  const headers = parseDelimitedLine(lines[headerRowIdx], delimiter);
  const lowerHeaders = headers.map((h) => h.toLowerCase().replace(/["'\ufeff]/g, '').trim());

  const isTransactionsFile = lowerHeaders.some(
    (h) =>
      h.includes('transaktionstyp') ||
      h.includes('bokföringsdag') ||
      h.includes('affärsdag') ||
      h.includes('likviddag')
  );

  const isHoldingsFile =
    !isTransactionsFile &&
    lowerHeaders.some(
      (h) =>
        h.includes('gav') ||
        h.includes('marknadsvärde') ||
        h.includes('anskaffningsvärde') ||
        h.includes('senaste')
    );

  if (!isTransactionsFile && !isHoldingsFile) {
    throw new Error(
      'Kunde inte känna igen Nordnet-kolumnerna. Kontrollera att du exporterat Transaktioner eller Innehav som CSV från Nordnet.'
    );
  }

  const warnings: string[] = [];
  const unresolvedMap = new Map<string, { key: string; name: string; isin: string; guessedSymbol: string }>();

  if (isTransactionsFile) {
    const colId = findColumnIndex(headers, ['id', 'transaktions-id', 'verifikationsnummer', 'notanummer']);
    const colBooking = findColumnIndex(headers, ['bokföringsdag', 'bokf.dag']);
    const colTrade = findColumnIndex(headers, ['affärsdag', 'handelsdag', 'likviddag']);
    const colAccount = findColumnIndex(headers, ['depå', 'konto', 'portfölj']);
    const colType = findColumnIndex(headers, ['transaktionstyp', 'typ']);
    const colSecurity = findColumnIndex(headers, ['värdepapper', 'namn', 'instrument']);
    const colInstrumentType = findColumnIndex(headers, ['instrumenttyp', 'värdepapperstyp']);
    const colIsin = findColumnIndex(headers, ['isin']);
    const colQty = findColumnIndex(headers, ['antal']);
    const colPrice = findColumnIndex(headers, ['kurs', 'pris']);
    const colAmount = findColumnIndex(headers, ['belopp', 'totalbelopp']);
    const colFx = findColumnIndex(headers, ['växlingskurs', 'valutakurs']);
    const colTotalFees = findColumnIndex(headers, ['totala avgifter', 'avgifter']);
    const colCourtage = findColumnIndex(headers, ['courtage', 'kurtage']);
    const colResult = findColumnIndex(headers, ['resultat']);
    const colTotalQty = findColumnIndex(headers, ['totalt antal']);
    const colBalance = findColumnIndex(headers, ['saldo']);
    const colCancelled = findColumnIndex(headers, ['makuleringsdatum']);
    const colText = findColumnIndex(headers, ['transaktionstext', 'text']);

    // Nordnet SE CSV has MULTIPLE columns named "Valuta" — match each adjacent to its numeric field!
    const colAmountCurrency = findAdjacentCurrencyColumn(headers, colAmount);
    const colPriceCurrency = findAdjacentCurrencyColumn(headers, colPrice);
    const colPurchaseVal = findColumnIndex(headers, ['inköpsvärde']);
    const colPurchaseCurrency = findAdjacentCurrencyColumn(headers, colPurchaseVal);
    const colFallbackCurrency = findColumnIndex(headers, ['valuta', 'currency']);

    const transactions: Transaction[] = [];
    const accountSet = new Set<string>();
    const typeCounts: Record<string, number> = {};
    const unclassifiedSet = new Set<string>();
    let skippedCancelledRows = 0;

    for (let i = headerRowIdx + 1; i < lines.length; i++) {
      const cols = parseDelimitedLine(lines[i], delimiter);
      if (cols.length < 3) continue;

      // Skip cancelled / voided Nordnet transactions
      if (colCancelled !== -1 && hasValue(cols[colCancelled])) {
        skippedCancelledRows++;
        continue;
      }

      const rawType = colType !== -1 ? (cols[colType] ?? '').trim() : '';
      if (rawType.toLowerCase().includes('makuler')) {
        skippedCancelledRows++;
        continue;
      }

      const securityName = colSecurity !== -1 ? (cols[colSecurity] ?? '').trim() : '';
      const isin = colIsin !== -1 ? (cols[colIsin] ?? '').trim().toUpperCase() : '';
      const instrumentType = colInstrumentType !== -1 ? (cols[colInstrumentType] ?? '').trim() : undefined;
      const account = colAccount !== -1 && hasValue(cols[colAccount]) ? cols[colAccount].trim() : 'ISK Nordnet';
      const bookingDate = normalizeDate(
        colBooking !== -1 && hasValue(cols[colBooking])
          ? cols[colBooking]
          : colTrade !== -1
            ? cols[colTrade]
            : ''
      );
      const tradeDate = normalizeDate(
        colTrade !== -1 && hasValue(cols[colTrade]) ? cols[colTrade] : bookingDate
      );

      const rawQty = colQty !== -1 ? parseSwedishNumber(cols[colQty]) : 0;
      const quantity = Math.abs(rawQty);
      const price = colPrice !== -1 ? Math.abs(parseSwedishNumber(cols[colPrice])) : 0;
      const amount = colAmount !== -1 ? parseSwedishNumber(cols[colAmount]) : 0;

      if (!rawType && !securityName && amount === 0 && quantity === 0) continue;

      const fxRaw = colFx !== -1 ? parseSwedishNumber(cols[colFx]) : 0;
      const exchangeRate = fxRaw > 0 ? fxRaw : 1;

      const amountCurrencyRaw =
        (colAmountCurrency !== -1 && cols[colAmountCurrency]) ||
        (colFallbackCurrency !== -1 && cols[colFallbackCurrency]) ||
        'SEK';
      const amountCurrency = amountCurrencyRaw.trim().toUpperCase() || 'SEK';

      // Determine true instrument price currency
      let priceCurrency =
        (colPriceCurrency !== -1 && cols[colPriceCurrency]?.trim().toUpperCase()) ||
        (colPurchaseCurrency !== -1 && cols[colPurchaseCurrency]?.trim().toUpperCase()) ||
        amountCurrency;

      // Detect Nordnet ISK/KF case where Belopp is in SEK while Kurs is in foreign currency (USD/EUR/DKK)
      if (amountCurrency === 'SEK' && exchangeRate > 1.01 && quantity > 0 && price > 0) {
        const impliedNoFx = quantity * price;
        const impliedWithFx = impliedNoFx * exchangeRate;
        const absAmt = Math.abs(amount);
        if (absAmt > 0 && Math.abs(absAmt - impliedWithFx) < Math.abs(absAmt - impliedNoFx)) {
          // Kurs is definitely foreign, Belopp is already in SEK!
          if (isin.startsWith('US')) priceCurrency = 'USD';
          else if (isin.startsWith('DK')) priceCurrency = 'DKK';
          else if (isin.startsWith('NO')) priceCurrency = 'NOK';
          else if (isin.startsWith('GB')) priceCurrency = 'GBP';
          else if (isin.startsWith('FI') || isin.startsWith('DE') || isin.startsWith('IE')) priceCurrency = 'EUR';
          else if (isin.startsWith('CA')) priceCurrency = 'CAD';
          else if (isin.startsWith('CH')) priceCurrency = 'CHF';
        }
      }

      // Compute exact SEK cash impact without double-multiplying!
      const amountSek =
        amountCurrency === 'SEK'
          ? amount
          : amount * (exchangeRate !== 1 ? exchangeRate : FALLBACK_FX[amountCurrency] ?? 1);

      const brokerageRaw =
        colTotalFees !== -1 && hasValue(cols[colTotalFees])
          ? Math.abs(parseSwedishNumber(cols[colTotalFees]))
          : colCourtage !== -1
            ? Math.abs(parseSwedishNumber(cols[colCourtage]))
            : 0;

      const realizedResultSek =
        colResult !== -1 && hasValue(cols[colResult])
          ? parseSwedishNumber(cols[colResult])
          : undefined;

      const totalQuantityAfter =
        colTotalQty !== -1 && hasValue(cols[colTotalQty])
          ? parseSwedishNumber(cols[colTotalQty])
          : undefined;

      const balanceAfter =
        colBalance !== -1 && hasValue(cols[colBalance])
          ? parseSwedishNumber(cols[colBalance])
          : undefined;

      const transactionText = colText !== -1 ? (cols[colText] ?? '').trim() : undefined;

      const hasSecurity = Boolean(securityName || isin);
      let type = classifyTransactionType(rawType, hasSecurity);

      // Smart fallback: if unclassified OTHER row has security + quantity, infer BUY/SELL from sign of amount or qty
      if (type === 'OTHER' && hasSecurity && quantity > 0) {
        if (amount < 0) type = 'BUY';
        else if (amount > 0) type = 'SELL';
        else if (rawQty < 0) type = 'SELL';
      }

      if (type === 'OTHER' && rawType) {
        unclassifiedSet.add(rawType);
      }

      typeCounts[type] = (typeCounts[type] ?? 0) + 1;
      accountSet.add(account);

      const rawId = colId !== -1 && hasValue(cols[colId]) ? cols[colId].trim() : '';
      const id = rawId || `${bookingDate}-${account}-${securityName}-${type}-${i}`;
      const numericId = extractNumericId(rawId, lines.length - i);

      transactions.push({
        id,
        numericId,
        rowIndex: i,
        bookingDate,
        tradeDate,
        account,
        rawType: rawType || type,
        type,
        instrumentType,
        securityName,
        isin,
        quantity,
        price,
        priceCurrency,
        amount,
        amountCurrency,
        amountSek,
        currency: priceCurrency,
        exchangeRate,
        brokerage: brokerageRaw,
        realizedResultSek,
        totalQuantityAfter,
        balanceAfter,
        transactionText,
      });
    }

    if (transactions.length === 0) {
      throw new Error('Inga giltiga transaktionsrader hittades i CSV-filen.');
    }

    if (skippedCancelledRows > 0) {
      warnings.push(`${skippedCancelledRows} makulerade transaktioner hoppades över automatiskt.`);
    }

    const built = buildHoldingsFromTransactions(transactions, customTickerMap);

    for (const h of [...built.holdings, ...built.closedHoldings]) {
      const resolved = resolveTickerLocal(h.securityName, h.isin, h.currency, customTickerMap);
      if (resolved.confidence === 'guessed') {
        const key = normalizeSecurityKey(h.securityName, h.isin);
        unresolvedMap.set(key, {
          key,
          name: h.securityName,
          isin: h.isin,
          guessedSymbol: resolved.symbol,
        });
      }
    }

    return {
      format: 'transactions',
      transactions,
      holdings: built.holdings,
      closedHoldings: built.closedHoldings,
      cashByAccount: built.cashByAccount,
      accounts: Array.from(accountSet),
      rowCount: transactions.length,
      warnings,
      diagnostics: {
        delimiter: delimiter === '\t' ? 'Tabb' : delimiter === ';' ? 'Semikolon' : 'Komma',
        detectedColumns: headers.filter(Boolean),
        skippedCancelledRows,
        typeCounts,
        unclassifiedTypes: Array.from(unclassifiedSet),
        activeHoldingsCount: built.holdings.length,
        closedHoldingsCount: built.closedHoldings.length,
      },
      unresolvedTickers: Array.from(unresolvedMap.values()),
    };
  }

  // Holdings-only CSV format
  const colName = findColumnIndex(headers, ['värdepapper', 'namn', 'instrument', 'aktie']);
  const colIsin = findColumnIndex(headers, ['isin']);
  const colAccount = findColumnIndex(headers, ['depå', 'konto', 'portfölj']);
  const colQty = findColumnIndex(headers, ['antal']);
  const colGav = findColumnIndex(headers, ['gav', 'anskaffningskurs', 'inköpskurs', 'genomsnittlig anskaffningskurs']);
  const colLast = findColumnIndex(headers, ['senaste', 'senast', 'kurs', 'aktuell kurs']);
  const colMarketVal = findColumnIndex(headers, ['marknadsvärde', 'värde']);
  const colCurrency = findColumnIndex(headers, ['valuta', 'currency']);

  const holdings: Holding[] = [];
  const accountSet = new Set<string>();

  for (let i = headerRowIdx + 1; i < lines.length; i++) {
    const cols = parseDelimitedLine(lines[i], delimiter);
    if (cols.length < 2) continue;

    const securityName = colName !== -1 ? (cols[colName] ?? '').trim() : '';
    if (!securityName || securityName.toLowerCase() === 'totalt' || securityName.toLowerCase() === 'summa') continue;

    const isin = colIsin !== -1 ? (cols[colIsin] ?? '').trim().toUpperCase() : '';
    const account = colAccount !== -1 && hasValue(cols[colAccount]) ? cols[colAccount].trim() : 'ISK Nordnet';
    const quantity = colQty !== -1 ? parseSwedishNumber(cols[colQty]) : 0;
    if (quantity <= 0) continue;

    const currency = (colCurrency !== -1 && cols[colCurrency] ? cols[colCurrency].trim().toUpperCase() : 'SEK') || 'SEK';
    const avgPrice = colGav !== -1 ? parseSwedishNumber(cols[colGav]) : 0;
    const lastPrice = colLast !== -1 ? parseSwedishNumber(cols[colLast]) : 0;
    const marketValue = colMarketVal !== -1 ? parseSwedishNumber(cols[colMarketVal]) : 0;

    accountSet.add(account);
    const resolved = resolveTickerLocal(securityName, isin, currency, customTickerMap);
    const secKey = normalizeSecurityKey(securityName, isin);

    if (resolved.confidence === 'guessed') {
      unresolvedMap.set(secKey, {
        key: secKey,
        name: securityName,
        isin,
        guessedSymbol: resolved.symbol,
      });
    }

    const fx = FALLBACK_FX[currency] ?? 1;
    const fallbackPrice = lastPrice > 0 ? lastPrice : marketValue > 0 && quantity > 0 ? marketValue / quantity : avgPrice;
    const avgPriceVal = avgPrice > 0 ? avgPrice : fallbackPrice;

    holdings.push({
      key: `${account}::${secKey}`,
      securityName,
      isin,
      symbol: resolved.symbol,
      account,
      quantity,
      avgPrice: avgPriceVal,
      avgPriceSek: currency === 'SEK' ? avgPriceVal : avgPriceVal * fx,
      currency,
      csvLastPrice: fallbackPrice > 0 ? fallbackPrice : undefined,
      csvMarketValueSek: marketValue > 0 ? marketValue : undefined,
      totalDividendsSek: 0,
      realizedPnLSek: 0,
      totalBrokerageSek: 0,
      totalBoughtQty: quantity,
      totalSoldQty: 0,
      totalBoughtSek: quantity * (currency === 'SEK' ? avgPriceVal : avgPriceVal * fx),
      totalSoldSek: 0,
      sector: resolved.sector,
    });
  }

  if (holdings.length === 0) {
    throw new Error('Inga giltiga innehav med antal > 0 hittades i CSV-filen.');
  }

  return {
    format: 'holdings',
    transactions: [],
    holdings,
    closedHoldings: [],
    cashByAccount: {},
    accounts: Array.from(accountSet),
    rowCount: holdings.length,
    warnings,
    diagnostics: {
      delimiter: delimiter === '\t' ? 'Tabb' : delimiter === ';' ? 'Semikolon' : 'Komma',
      detectedColumns: headers.filter(Boolean),
      skippedCancelledRows: 0,
      typeCounts: { HOLDINGS: holdings.length },
      unclassifiedTypes: [],
      activeHoldingsCount: holdings.length,
      closedHoldingsCount: 0,
    },
    unresolvedTickers: Array.from(unresolvedMap.values()),
  };
}

/**
 * Sorts transactions in true chronological execution order:
 * 1. Trade date ascending
 * 2. Booking date ascending
 * 3. Same day: BUYs / SPLIT_IN before SELLs so intraday day-trades never go negative
 * 4. Numeric Nordnet ID ascending (or reverse rowIndex if exported newest-first)
 */
function sortTransactionsChronologically(transactions: Transaction[]): Transaction[] {
  const typePriority: Record<TransactionType, number> = {
    DEPOSIT: 1,
    FX: 2,
    SPLIT_OUT: 3,
    SPLIT_IN: 4,
    BUY: 5,
    DIVIDEND: 6,
    INTEREST: 7,
    SELL: 8,
    FEE: 9,
    TAX: 10,
    WITHDRAWAL: 11,
    OTHER: 12,
  };

  return [...transactions].sort((a, b) => {
    const tradeCmp = a.tradeDate.localeCompare(b.tradeDate);
    if (tradeCmp !== 0) return tradeCmp;
    const bookCmp = a.bookingDate.localeCompare(b.bookingDate);
    if (bookCmp !== 0) return bookCmp;
    const prioCmp = typePriority[a.type] - typePriority[b.type];
    if (prioCmp !== 0) return prioCmp;
    if (a.numericId !== b.numericId) return a.numericId - b.numericId;
    return b.rowIndex - a.rowIndex;
  });
}

/**
 * Replays Nordnet transactions chronologically using Swedish average cost method (GAV),
 * returning BOTH active holdings AND sold/closed holdings plus exact cash balance per account.
 */
export function buildHoldingsFromTransactions(
  transactions: Transaction[],
  customTickerMap: Record<string, string> = {},
  fxRates: Record<string, number> = FALLBACK_FX
): {
  holdings: Holding[];
  closedHoldings: ClosedHolding[];
  cashByAccount: Record<string, number>;
} {
  const sorted = sortTransactionsChronologically(transactions);

  interface PositionAcc {
    securityName: string;
    isin: string;
    account: string;
    currency: string;
    quantity: number;
    totalCostLocal: number;
    totalCostSek: number;
    lastTradePrice: number;
    totalDividendsSek: number;
    realizedPnLSek: number;
    totalBrokerageSek: number;
    totalBoughtQty: number;
    totalSoldQty: number;
    totalBoughtLocal: number;
    totalSoldLocal: number;
    totalBoughtSek: number;
    totalSoldSek: number;
    firstTradeDate: string;
    lastTradeDate: string;
    lastExplicitTotalQty?: number;
  }

  const positions = new Map<string, PositionAcc>();
  const computedCashByAccount: Record<string, number> = {};
  const hasCashFlowRowsByAccount: Record<string, boolean> = {};
  const explicitBalanceByAccount: Record<string, { bookingDate: string; numericId: number; rowIndex: number; balance: number }> = {};

  for (const tx of sorted) {
    const txFx =
      tx.exchangeRate > 0 && tx.exchangeRate !== 1
        ? tx.exchangeRate
        : fxRates[tx.currency] ?? FALLBACK_FX[tx.currency] ?? 1;

    const txAmountSek =
      typeof tx.amountSek === 'number' && Number.isFinite(tx.amountSek)
        ? tx.amountSek
        : tx.amountCurrency === 'SEK'
          ? tx.amount
          : tx.amount * txFx;

    if (tx.type === 'DEPOSIT' || tx.type === 'WITHDRAWAL') {
      hasCashFlowRowsByAccount[tx.account] = true;
    }

    // Accumulate cash flow per account
    if (txAmountSek !== 0) {
      computedCashByAccount[tx.account] = (computedCashByAccount[tx.account] ?? 0) + txAmountSek;
    }

    // Track Nordnet's official "Saldo" column for the latest SEK row per account
    if (
      typeof tx.balanceAfter === 'number' &&
      Number.isFinite(tx.balanceAfter) &&
      (tx.amountCurrency === 'SEK' || !tx.amountCurrency)
    ) {
      const prev = explicitBalanceByAccount[tx.account];
      const isNewer =
        !prev ||
        tx.bookingDate > prev.bookingDate ||
        (tx.bookingDate === prev.bookingDate && tx.numericId > prev.numericId) ||
        (tx.bookingDate === prev.bookingDate && tx.numericId === prev.numericId && tx.rowIndex < prev.rowIndex);
      if (isNewer) {
        explicitBalanceByAccount[tx.account] = {
          bookingDate: tx.bookingDate,
          numericId: tx.numericId,
          rowIndex: tx.rowIndex,
          balance: tx.balanceAfter,
        };
      }
    }

    if (!tx.securityName && !tx.isin) continue;

    const secKey = normalizeSecurityKey(tx.securityName, tx.isin);
    const mapKey = `${tx.account}::${secKey}`;
    let pos = positions.get(mapKey);
    if (!pos) {
      pos = {
        securityName: tx.securityName || tx.isin,
        isin: tx.isin,
        account: tx.account,
        currency: tx.priceCurrency || tx.currency || 'SEK',
        quantity: 0,
        totalCostLocal: 0,
        totalCostSek: 0,
        lastTradePrice: 0,
        totalDividendsSek: 0,
        realizedPnLSek: 0,
        totalBrokerageSek: 0,
        totalBoughtQty: 0,
        totalSoldQty: 0,
        totalBoughtLocal: 0,
        totalSoldLocal: 0,
        totalBoughtSek: 0,
        totalSoldSek: 0,
        firstTradeDate: tx.tradeDate,
        lastTradeDate: tx.tradeDate,
      };
      positions.set(mapKey, pos);
    }

    if (tx.isin && !pos.isin) pos.isin = tx.isin;
    if (tx.securityName && pos.securityName === pos.isin) pos.securityName = tx.securityName;
    if (tx.price > 0) pos.lastTradePrice = tx.price;
    if (tx.tradeDate < pos.firstTradeDate) pos.firstTradeDate = tx.tradeDate;
    if (tx.tradeDate > pos.lastTradeDate) pos.lastTradeDate = tx.tradeDate;

    const brokerageSek =
      tx.amountCurrency === 'SEK'
        ? tx.brokerage
        : tx.brokerage * txFx;

    if (tx.type === 'BUY' && tx.quantity > 0) {
      const localCost =
        tx.price > 0
          ? tx.quantity * tx.price + (tx.priceCurrency === tx.amountCurrency ? tx.brokerage : 0)
          : Math.abs(tx.amount);
      const sekCost =
        Math.abs(txAmountSek) > 0
          ? Math.abs(txAmountSek)
          : tx.currency === 'SEK'
            ? localCost
            : localCost * txFx;

      pos.quantity += tx.quantity;
      pos.totalCostLocal += localCost;
      pos.totalCostSek += sekCost;
      pos.totalBoughtQty += tx.quantity;
      pos.totalBoughtLocal += localCost;
      pos.totalBoughtSek += sekCost;
      pos.totalBrokerageSek += brokerageSek;
      if (typeof tx.totalQuantityAfter === 'number') {
        pos.lastExplicitTotalQty = tx.totalQuantityAfter;
      }
    } else if (tx.type === 'SELL' && tx.quantity > 0) {
      const qtyBefore = pos.quantity;
      const qtyToClose = qtyBefore > 0 ? Math.min(tx.quantity, qtyBefore) : 0;
      const avgLocal = qtyBefore > 0 ? pos.totalCostLocal / qtyBefore : tx.price;
      const avgSek = qtyBefore > 0 ? pos.totalCostSek / qtyBefore : tx.price * txFx;

      const proceedsLocal =
        tx.price > 0
          ? tx.quantity * tx.price
          : Math.abs(tx.amount);
      const proceedsSek =
        Math.abs(txAmountSek) > 0
          ? Math.abs(txAmountSek)
          : tx.currency === 'SEK'
            ? proceedsLocal
            : proceedsLocal * txFx;

      // Use Nordnet's official Resultat column if available and valid, else GAV calculation
      const realizedThisTrade =
        typeof tx.realizedResultSek === 'number' && Number.isFinite(tx.realizedResultSek)
          ? tx.realizedResultSek
          : qtyToClose > 0
            ? proceedsSek - avgSek * qtyToClose
            : 0;

      pos.realizedPnLSek += realizedThisTrade;
      pos.totalSoldQty += tx.quantity;
      pos.totalSoldLocal += proceedsLocal;
      pos.totalSoldSek += proceedsSek;
      pos.totalBrokerageSek += brokerageSek;

      pos.quantity = Math.max(0, pos.quantity - tx.quantity);
      pos.totalCostLocal = Math.max(0, pos.totalCostLocal - avgLocal * qtyToClose);
      pos.totalCostSek = Math.max(0, pos.totalCostSek - avgSek * qtyToClose);

      if (pos.quantity < 1e-5) {
        pos.quantity = 0;
        pos.totalCostLocal = 0;
        pos.totalCostSek = 0;
      }
      if (typeof tx.totalQuantityAfter === 'number') {
        pos.lastExplicitTotalQty = tx.totalQuantityAfter;
      }
    } else if (tx.type === 'SPLIT_IN' && tx.quantity > 0) {
      // Split inlägg increases shares while preserving total cost basis
      pos.quantity += tx.quantity;
      if (typeof tx.totalQuantityAfter === 'number') {
        pos.lastExplicitTotalQty = tx.totalQuantityAfter;
      }
    } else if (tx.type === 'SPLIT_OUT' && tx.quantity > 0) {
      // Split uttag removes pre-split shares while preserving cost basis for the incoming SPLIT_IN row
      pos.quantity = Math.max(0, pos.quantity - tx.quantity);
      if (typeof tx.totalQuantityAfter === 'number') {
        pos.lastExplicitTotalQty = tx.totalQuantityAfter;
      }
    } else if (tx.type === 'DIVIDEND') {
      pos.totalDividendsSek += Math.abs(txAmountSek);
    }
    // Note: Do NOT read totalQuantityAfter from TAX, DIVIDEND, FEE, or OTHER rows —
    // Nordnet sets "Totalt antal = 0" on UTDELNING & UTLÄNDSK KÄLLSKATT rows even when shares are still held!
  }

  const holdings: Holding[] = [];
  const closedHoldings: ClosedHolding[] = [];

  for (const [mapKey, pos] of positions.entries()) {
    // Only reconcile against Nordnet's explicit "Totalt antal = 0" if the position actually had sells
    if (pos.lastExplicitTotalQty === 0 && pos.totalSoldQty > 0) {
      pos.quantity = 0;
    }

    const resolved = resolveTickerLocal(pos.securityName, pos.isin, pos.currency, customTickerMap);

    if (pos.quantity > 1e-5) {
      holdings.push({
        key: mapKey,
        securityName: pos.securityName,
        isin: pos.isin,
        symbol: resolved.symbol,
        account: pos.account,
        quantity: pos.quantity,
        avgPrice: pos.quantity > 0 ? pos.totalCostLocal / pos.quantity : 0,
        avgPriceSek: pos.quantity > 0 ? pos.totalCostSek / pos.quantity : 0,
        currency: pos.currency,
        csvLastPrice: pos.lastTradePrice > 0 ? pos.lastTradePrice : undefined,
        totalDividendsSek: pos.totalDividendsSek,
        realizedPnLSek: pos.realizedPnLSek,
        totalBrokerageSek: pos.totalBrokerageSek,
        totalBoughtQty: pos.totalBoughtQty,
        totalSoldQty: pos.totalSoldQty,
        totalBoughtSek: pos.totalBoughtSek,
        totalSoldSek: pos.totalSoldSek,
        firstTradeDate: pos.firstTradeDate,
        lastTradeDate: pos.lastTradeDate,
        sector: resolved.sector,
      });
    } else if (pos.totalSoldQty > 0) {
      const realizedPct =
        pos.totalBoughtSek > 0 ? (pos.realizedPnLSek / pos.totalBoughtSek) * 100 : 0;
      closedHoldings.push({
        key: mapKey,
        securityName: pos.securityName,
        isin: pos.isin,
        symbol: resolved.symbol,
        account: pos.account,
        currency: pos.currency,
        totalBoughtQty: pos.totalBoughtQty,
        totalSoldQty: pos.totalSoldQty,
        avgBuyPrice: pos.totalBoughtQty > 0 ? pos.totalBoughtLocal / pos.totalBoughtQty : 0,
        avgSellPrice: pos.totalSoldQty > 0 ? pos.totalSoldLocal / pos.totalSoldQty : 0,
        totalBoughtSek: pos.totalBoughtSek,
        totalSoldSek: pos.totalSoldSek,
        realizedPnLSek: pos.realizedPnLSek,
        realizedPnLPercent: realizedPct,
        totalDividendsSek: pos.totalDividendsSek,
        totalBrokerageSek: pos.totalBrokerageSek,
        firstTradeDate: pos.firstTradeDate,
        lastTradeDate: pos.lastTradeDate,
        sector: resolved.sector,
      });
    }
  }

  // Prefer Nordnet's official Saldo column per account; only fall back to computed cash
  // when actual DEPOSIT/WITHDRAWAL rows exist so trades-only CSVs never turn sold proceeds into phantom cash.
  const cashByAccount: Record<string, number> = {};
  const allAccountKeys = new Set([
    ...Object.keys(computedCashByAccount),
    ...Object.keys(explicitBalanceByAccount),
  ]);
  for (const acc of allAccountKeys) {
    if (explicitBalanceByAccount[acc]) {
      cashByAccount[acc] = explicitBalanceByAccount[acc].balance;
    } else if (hasCashFlowRowsByAccount[acc]) {
      cashByAccount[acc] = Math.max(0, computedCashByAccount[acc] ?? 0);
    } else {
      cashByAccount[acc] = 0;
    }
  }

  return { holdings, closedHoldings, cashByAccount };
}

/**
 * Generates a realistic Swedish Nordnet demo transaction history (ISK + KF),
 * including both active holdings, partial sells, AND a fully sold stock (H&M B)
 */
export function createDemoTransactions(): Transaction[] {
  const mk = (
    idx: number,
    id: string,
    date: string,
    account: string,
    rawType: string,
    securityName: string,
    isin: string,
    quantity: number,
    price: number,
    amount: number,
    currency: string,
    exchangeRate = 1,
    brokerage = 0
  ): Transaction => {
    const type = classifyTransactionType(rawType, Boolean(securityName || isin));
    const amountCurrency = currency === 'SEK' ? 'SEK' : 'SEK';
    const amountSek = currency === 'SEK' ? amount : amount * exchangeRate;
    return {
      id,
      numericId: 10000 + idx,
      rowIndex: idx,
      bookingDate: date,
      tradeDate: date,
      account,
      rawType,
      type,
      securityName,
      isin,
      quantity,
      price,
      priceCurrency: currency,
      amount: currency === 'SEK' ? amount : Math.round(amountSek * 100) / 100,
      amountCurrency,
      amountSek,
      currency,
      exchangeRate,
      brokerage,
    };
  };

  return [
    mk(1, 'NN-1001', '2024-01-12', 'ISK Nordnet', 'INSÄTTNING', '', '', 0, 0, 185000, 'SEK'),
    mk(2, 'NN-1002', '2024-01-15', 'KF Utland', 'INSÄTTNING', '', '', 0, 0, 95000, 'SEK'),
    mk(3, 'NN-1003', '2024-01-16', 'ISK Nordnet', 'KÖPT', 'Investor B', 'SE0015811963', 140, 238.5, -33429, 'SEK', 1, 39),
    mk(4, 'NN-1004', '2024-02-05', 'ISK Nordnet', 'KÖPT', 'Volvo B', 'SE0000115446', 110, 256.2, -28221, 'SEK', 1, 39),
    mk(5, 'NN-1005', '2024-03-11', 'ISK Nordnet', 'KÖPT', 'Atlas Copco A', 'SE0017486889', 160, 171.4, -27463, 'SEK', 1, 39),
    mk(6, 'NN-1006', '2024-04-08', 'ISK Nordnet', 'KÖPT', 'Saab B', 'SE0021921269', 120, 215.0, -25839, 'SEK', 1, 39),
    mk(7, 'NN-1007', '2024-05-14', 'ISK Nordnet', 'KÖPT', 'Handelsbanken A', 'SE0007100599', 220, 101.8, -22435, 'SEK', 1, 39),
    mk(8, 'NN-1008', '2024-06-18', 'ISK Nordnet', 'KÖPT', 'Evolution', 'SE0012673267', 22, 1085.0, -23909, 'SEK', 1, 39),
    mk(9, 'NN-1009', '2024-07-10', 'ISK Nordnet', 'KÖPT', 'H&M B', 'SE0000106270', 100, 158.0, -15839, 'SEK', 1, 39),
    mk(10, 'NN-1010', '2024-02-20', 'KF Utland', 'KÖPT', 'Microsoft', 'US5949181045', 8, 404.5, -3245, 'USD', 10.42, 95),
    mk(11, 'NN-1011', '2024-04-22', 'KF Utland', 'KÖPT', 'NVIDIA', 'US67066G1040', 25, 88.4, -2219, 'USD', 10.75, 95),
    mk(12, 'NN-1012', '2024-06-03', 'KF Utland', 'KÖPT', 'Novo Nordisk B', 'DK0062498333', 24, 890.0, -21395, 'DKK', 1.53, 55),
    mk(13, 'NN-1013', '2025-01-20', 'ISK Nordnet', 'INSÄTTNING', '', '', 0, 0, 45000, 'SEK'),
    mk(14, 'NN-1014', '2025-02-10', 'ISK Nordnet', 'KÖPT', 'Investor B', 'SE0015811963', 80, 294.0, -23559, 'SEK', 1, 39),
    mk(15, 'NN-1015', '2025-05-05', 'ISK Nordnet', 'KÖPT', 'Volvo B', 'SE0000115446', 45, 279.0, -12594, 'SEK', 1, 39),
    mk(16, 'NN-1016', '2025-08-18', 'ISK Nordnet', 'SÅLT', 'H&M B', 'SE0000106270', 100, 174.5, 17411, 'SEK', 1, 39),
    mk(17, 'NN-1017', '2025-09-12', 'KF Utland', 'KÖPT', 'Apple', 'US0378331005', 12, 224.0, -2697, 'USD', 10.35, 95),
    mk(18, 'NN-1018', '2026-01-19', 'ISK Nordnet', 'SÅLT', 'Saab B', 'SE0021921269', 20, 265.0, 5261, 'SEK', 1, 39),
    mk(19, 'NN-2001', '2024-04-04', 'ISK Nordnet', 'UTDELNING', 'Volvo B', 'SE0000115446', 110, 18.0, 1980, 'SEK'),
    mk(20, 'NN-2002', '2024-05-15', 'ISK Nordnet', 'UTDELNING', 'Investor B', 'SE0015811963', 140, 3.6, 504, 'SEK'),
    mk(21, 'NN-2003', '2024-11-14', 'ISK Nordnet', 'UTDELNING', 'Investor B', 'SE0015811963', 140, 1.2, 168, 'SEK'),
    mk(22, 'NN-2004', '2025-03-28', 'ISK Nordnet', 'UTDELNING', 'Handelsbanken A', 'SE0007100599', 220, 13.0, 2860, 'SEK'),
    mk(23, 'NN-2005', '2025-04-08', 'ISK Nordnet', 'UTDELNING', 'Volvo B', 'SE0000115446', 110, 18.5, 2035, 'SEK'),
    mk(24, 'NN-2006', '2025-05-14', 'ISK Nordnet', 'UTDELNING', 'Investor B', 'SE0015811963', 220, 3.9, 858, 'SEK'),
    mk(25, 'NN-2007', '2025-05-19', 'ISK Nordnet', 'UTDELNING', 'Evolution', 'SE0012673267', 22, 30.5, 671, 'SEK'),
    mk(26, 'NN-2008', '2026-03-30', 'ISK Nordnet', 'UTDELNING', 'Handelsbanken A', 'SE0007100599', 220, 15.0, 3300, 'SEK'),
    mk(27, 'NN-2009', '2026-04-09', 'ISK Nordnet', 'UTDELNING', 'Volvo B', 'SE0000115446', 155, 18.5, 2867.5, 'SEK'),
    mk(28, 'NN-2010', '2026-05-15', 'ISK Nordnet', 'UTDELNING', 'Investor B', 'SE0015811963', 220, 4.1, 902, 'SEK'),
    mk(29, 'NN-2011', '2026-06-12', 'KF Utland', 'UTDELNING', 'Microsoft', 'US5949181045', 8, 0.83, 6.64, 'USD', 10.6),
    mk(30, 'NN-2012', '2026-10-20', 'ISK Nordnet', 'UTDELNING', 'Atlas Copco A', 'SE0017486889', 160, 1.5, 240, 'SEK'),
  ];
}

export function generateSampleTransactionsCsv(): string {
  const header =
    'Id\tBokföringsdag\tAffärsdag\tDepå\tTransaktionstyp\tVärdepapper\tISIN\tAntal\tKurs\tBelopp\tValuta\tVäxlingskurs\tTotala avgifter';
  const txs = createDemoTransactions();
  const rows = txs.map((t) =>
    [
      t.id,
      t.bookingDate,
      t.tradeDate,
      t.account,
      t.rawType,
      t.securityName,
      t.isin,
      t.quantity ? String(t.quantity).replace('.', ',') : '',
      t.price ? String(t.price).replace('.', ',') : '',
      String(t.amount).replace('.', ','),
      t.amountCurrency,
      String(t.exchangeRate).replace('.', ','),
      t.brokerage ? String(t.brokerage).replace('.', ',') : '',
    ].join('\t')
  );
  return [header, ...rows].join('\n');
}

export function generateSampleHoldingsCsv(): string {
  const header = 'Depå;Värdepapper;ISIN;Antal;GAV;Senaste;Marknadsvärde;Valuta';
  const rows = [
    'ISK Nordnet;Investor B;SE0015811963;220;258,68;305,40;67188;SEK',
    'ISK Nordnet;Volvo B;SE0000115446;155;262,82;288,10;44655,50;SEK',
    'ISK Nordnet;Atlas Copco A;SE0017486889;160;171,64;182,50;29200;SEK',
    'ISK Nordnet;Saab B;SE0021921269;100;215,33;258,40;25840;SEK',
    'ISK Nordnet;Handelsbanken A;SE0007100599;220;101,98;114,20;25124;SEK',
    'KF Utland;Microsoft;US5949181045;8;405,63;430,00;36636;USD',
    'KF Utland;NVIDIA;US67066G1040;25;88,76;138,50;36875;USD',
    'KF Utland;Novo Nordisk B;DK0062498333;24;891,46;765,00;28182;DKK',
  ];
  return [header, ...rows].join('\n');
}

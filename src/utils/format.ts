const MINUS = '−';

export function formatSek(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '–';
  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(abs);
  return `${value < 0 ? MINUS : ''}${formatted} kr`;
}

export function formatSignedSek(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '–';
  if (Math.abs(value) < 0.005) return `0 kr`;
  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(abs);
  return `${value > 0 ? '+' : MINUS}${formatted} kr`;
}

export function formatPrice(value: number | null | undefined, currency = 'SEK'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  const decimals = Math.abs(value) >= 1000 ? 1 : Math.abs(value) >= 1 ? 2 : 4;
  const formatted = new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
  if (currency === 'SEK') return `${formatted} kr`;
  return `${formatted} ${currency}`;
}

export function formatSignedChange(value: number | null | undefined, currency = 'SEK'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 1 : 2;
  const formatted = new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(abs);
  const sign = value > 0 ? '+' : value < 0 ? MINUS : '';
  return currency === 'SEK' ? `${sign}${formatted} kr` : `${sign}${formatted} ${currency}`;
}

export function formatPercent(value: number | null | undefined, signed = true, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(abs);
  if (!signed) return `${value < 0 ? MINUS : ''}${formatted} %`;
  if (Math.abs(value) < 0.005) return `0,00 %`;
  return `${value > 0 ? '+' : MINUS}${formatted} %`;
}

export function formatRatio(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  return new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatCompactNumber(value: number | null | undefined, suffix = ''): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  const abs = Math.abs(value);
  const sign = value < 0 ? MINUS : '';
  const fmt = (n: number, d = 2) =>
    new Intl.NumberFormat('sv-SE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

  if (abs >= 1e12) return `${sign}${fmt(abs / 1e12, 2)} bn${suffix ? ' ' + suffix : ''}`;
  if (abs >= 1e9) return `${sign}${fmt(abs / 1e9, 2)} md${suffix ? ' ' + suffix : ''}`;
  if (abs >= 1e6) return `${sign}${fmt(abs / 1e6, 1)} mn${suffix ? ' ' + suffix : ''}`;
  if (abs >= 1e3) return `${sign}${fmt(abs / 1e3, 1)} k${suffix ? ' ' + suffix : ''}`;
  return `${sign}${fmt(abs, 0)}${suffix ? ' ' + suffix : ''}`;
}

export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const isInt = Math.abs(value - Math.round(value)) < 1e-6;
  return new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: isInt ? 0 : 2,
    maximumFractionDigits: isInt ? 0 : 4,
  }).format(value);
}

export function formatDateShort(dateStr: string | number | Date): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function formatChartDate(timestamp: number, range: string): string {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '';
  if (range === '1d') {
    return new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' }).format(d);
  }
  if (range === '5d') {
    return new Intl.DateTimeFormat('sv-SE', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  }
  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const diffMin = Math.round((Date.now() - d.getTime()) / 60_000);
  if (diffMin < 1) return 'Just nu';
  if (diffMin < 60) return `${diffMin} min sedan`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} tim sedan`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `${diffD} d sedan`;
  return formatDateShort(iso);
}

export function translateRecommendation(key: string | null): string {
  if (!key) return '–';
  const map: Record<string, string> = {
    strong_buy: 'Starkt köp',
    buy: 'Köp',
    hold: 'Behåll',
    underperform: 'Underprestera',
    sell: 'Sälj',
  };
  return map[key.toLowerCase()] ?? key;
}

export function translateMarketState(state: string): string {
  switch (state.toUpperCase()) {
    case 'REGULAR':
      return 'Börsen öppen';
    case 'PRE':
    case 'PREPRE':
      return 'Förhandel';
    case 'POST':
    case 'POSTPOST':
      return 'Efterhandel';
    default:
      return 'Stängd';
  }
}

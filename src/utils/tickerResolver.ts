// Curated mapping of popular Nordnet Swedish, Nordic, and International securities (ISIN & Name -> Yahoo Finance Ticker)

export interface KnownSecurity {
  symbol: string;
  sector: string;
  currency: string;
}

export const ISIN_TO_TICKER: Record<string, KnownSecurity> = {
  // OMXS30 & Popular Swedish Equities
  SE0015811963: { symbol: 'INVE-B.ST', sector: 'Investmentbolag', currency: 'SEK' },
  SE0015811955: { symbol: 'INVE-A.ST', sector: 'Investmentbolag', currency: 'SEK' },
  SE0000115446: { symbol: 'VOLV-B.ST', sector: 'Industri', currency: 'SEK' },
  SE0000115420: { symbol: 'VOLV-A.ST', sector: 'Industri', currency: 'SEK' },
  SE0017486889: { symbol: 'ATCO-A.ST', sector: 'Industri', currency: 'SEK' },
  SE0017486897: { symbol: 'ATCO-B.ST', sector: 'Industri', currency: 'SEK' },
  SE0021921269: { symbol: 'SAAB-B.ST', sector: 'Industri & Försvar', currency: 'SEK' },
  SE0000112385: { symbol: 'SAAB-B.ST', sector: 'Industri & Försvar', currency: 'SEK' },
  SE0012673267: { symbol: 'EVO.ST', sector: 'Sällanköpsvaror', currency: 'SEK' },
  SE0007100599: { symbol: 'SHB-A.ST', sector: 'Finans & Bank', currency: 'SEK' },
  SE0000148884: { symbol: 'SEB-A.ST', sector: 'Finans & Bank', currency: 'SEK' },
  SE0000242455: { symbol: 'SWED-A.ST', sector: 'Finans & Bank', currency: 'SEK' },
  FI4000297767: { symbol: 'NDA-SE.ST', sector: 'Finans & Bank', currency: 'SEK' },
  SE0000108656: { symbol: 'ERIC-B.ST', sector: 'Teknik', currency: 'SEK' },
  CH0012221716: { symbol: 'ABB.ST', sector: 'Industri', currency: 'SEK' },
  GB0009895292: { symbol: 'AZN.ST', sector: 'Hälsovård', currency: 'SEK' },
  SE0000667891: { symbol: 'SAND.ST', sector: 'Industri', currency: 'SEK' },
  SE0007100581: { symbol: 'ASSA-B.ST', sector: 'Industri', currency: 'SEK' },
  SE0015961909: { symbol: 'HEXA-B.ST', sector: 'Teknik', currency: 'SEK' },
  SE0015988019: { symbol: 'NIBE-B.ST', sector: 'Industri', currency: 'SEK' },
  SE0000106270: { symbol: 'HM-B.ST', sector: 'Sällanköpsvaror', currency: 'SEK' },
  SE0000667925: { symbol: 'TELIA.ST', sector: 'Telekom', currency: 'SEK' },
  SE0005190238: { symbol: 'TEL2-B.ST', sector: 'Telekom', currency: 'SEK' },
  SE0009922164: { symbol: 'ESSITY-B.ST', sector: 'Dagligvaror', currency: 'SEK' },
  SE0000108227: { symbol: 'SKF-B.ST', sector: 'Industri', currency: 'SEK' },
  SE0020050417: { symbol: 'BOL.ST', sector: 'Material', currency: 'SEK' },
  SE0000171100: { symbol: 'SSAB-A.ST', sector: 'Material', currency: 'SEK' },
  SE0000120669: { symbol: 'SSAB-B.ST', sector: 'Material', currency: 'SEK' },
  SE0000695876: { symbol: 'ALFA.ST', sector: 'Industri', currency: 'SEK' },
  SE0015658109: { symbol: 'EPI-A.ST', sector: 'Industri', currency: 'SEK' },
  SE0012853455: { symbol: 'EQT.ST', sector: 'Finans & Bank', currency: 'SEK' },
  SE0015949201: { symbol: 'LIFCO-B.ST', sector: 'Industri', currency: 'SEK' },
  SE0001515552: { symbol: 'INDT.ST', sector: 'Industri', currency: 'SEK' },
  SE0022060521: { symbol: 'KINV-B.ST', sector: 'Investmentbolag', currency: 'SEK' },
  SE0010100958: { symbol: 'LATO-B.ST', sector: 'Investmentbolag', currency: 'SEK' },
  SE0000108847: { symbol: 'LUND-B.ST', sector: 'Investmentbolag', currency: 'SEK' },
  SE0000107203: { symbol: 'INDU-C.ST', sector: 'Investmentbolag', currency: 'SEK' },
  SE0012454072: { symbol: 'AZA.ST', sector: 'Finans & Bank', currency: 'SEK' },
  SE0015192067: { symbol: 'SAVE.ST', sector: 'Finans & Bank', currency: 'SEK' },
  SE0000379190: { symbol: 'CAST.ST', sector: 'Fastigheter', currency: 'SEK' },
  SE0017832488: { symbol: 'BALD-B.ST', sector: 'Fastigheter', currency: 'SEK' },
  SE0005127818: { symbol: 'SAGA-B.ST', sector: 'Fastigheter', currency: 'SEK' },
  SE0009554454: { symbol: 'SBB-B.ST', sector: 'Fastigheter', currency: 'SEK' },
  SE0016101844: { symbol: 'SINCH.ST', sector: 'Teknik', currency: 'SEK' },
  SE0017161243: { symbol: 'FNOX.ST', sector: 'Teknik', currency: 'SEK' },
  SE0000112724: { symbol: 'SCA-B.ST', sector: 'Material', currency: 'SEK' },
  SE0017768716: { symbol: 'VOLCAR-B.ST', sector: 'Sällanköpsvaror', currency: 'SEK' },
  SE0015810247: { symbol: 'AXFO.ST', sector: 'Dagligvaror', currency: 'SEK' },
  SE0000113250: { symbol: 'SKA-B.ST', sector: 'Industri', currency: 'SEK' },
  SE0000114837: { symbol: 'TREL-B.ST', sector: 'Industri', currency: 'SEK' },
  SE0000202624: { symbol: 'GETI-B.ST', sector: 'Hälsovård', currency: 'SEK' },
  SE0016589188: { symbol: 'ELUX-B.ST', sector: 'Sällanköpsvaror', currency: 'SEK' },
  SE0011166610: { symbol: 'SECT-B.ST', sector: 'Hälsovård', currency: 'SEK' },

  // Nordic Equities
  DK0062498333: { symbol: 'NOVO-B.CO', sector: 'Hälsovård', currency: 'DKK' },
  DK0060534915: { symbol: 'NOVO-B.CO', sector: 'Hälsovård', currency: 'DKK' },
  DK0010244508: { symbol: 'MAERSK-B.CO', sector: 'Industri', currency: 'DKK' },
  NO0010096985: { symbol: 'EQNR.OL', sector: 'Energi', currency: 'NOK' },
  NO0010161896: { symbol: 'DNB.OL', sector: 'Finans & Bank', currency: 'NOK' },
  FI0009013403: { symbol: 'KNEBV.HE', sector: 'Industri', currency: 'EUR' },
  FI4000552500: { symbol: 'SAMPO.HE', sector: 'Finans & Bank', currency: 'EUR' },
  FI0009000681: { symbol: 'NOKIA.HE', sector: 'Teknik', currency: 'EUR' },

  // US & Global Tech / Dividend Giants
  US0378331005: { symbol: 'AAPL', sector: 'Teknik', currency: 'USD' },
  US5949181045: { symbol: 'MSFT', sector: 'Teknik', currency: 'USD' },
  US67066G1040: { symbol: 'NVDA', sector: 'Teknik', currency: 'USD' },
  US0231351067: { symbol: 'AMZN', sector: 'Sällanköpsvaror', currency: 'USD' },
  US02079K3059: { symbol: 'GOOGL', sector: 'Kommunikation', currency: 'USD' },
  US02079K1079: { symbol: 'GOOG', sector: 'Kommunikation', currency: 'USD' },
  US30303M1027: { symbol: 'META', sector: 'Kommunikation', currency: 'USD' },
  US88160R1014: { symbol: 'TSLA', sector: 'Sällanköpsvaror', currency: 'USD' },
  US0846707026: { symbol: 'BRK-B', sector: 'Investmentbolag', currency: 'USD' },
  US7561091049: { symbol: 'O', sector: 'Fastigheter', currency: 'USD' },
  US1912161007: { symbol: 'KO', sector: 'Dagligvaror', currency: 'USD' },
  US92826C8394: { symbol: 'V', sector: 'Finans & Bank', currency: 'USD' },
  US0079031078: { symbol: 'AMD', sector: 'Teknik', currency: 'USD' },
  LU1778762911: { symbol: 'SPOT', sector: 'Kommunikation', currency: 'USD' },
  US4781601046: { symbol: 'JNJ', sector: 'Hälsovård', currency: 'USD' },
  US58933Y1055: { symbol: 'MRK', sector: 'Hälsovård', currency: 'USD' },
  US22160K1051: { symbol: 'COST', sector: 'Dagligvaror', currency: 'USD' },
  US64110L1061: { symbol: 'NFLX', sector: 'Kommunikation', currency: 'USD' },
  US0050981085: { symbol: 'GOLF', sector: 'Sällanköpsvaror', currency: 'USD' },
  US7475251036: { symbol: 'QCOM', sector: 'Teknik', currency: 'USD' },

  // Popular ETFs on Nordnet
  IE00B4L5Y983: { symbol: 'EUNL.DE', sector: 'ETF / Index', currency: 'EUR' },
  IE00B5BMR087: { symbol: 'SXR8.DE', sector: 'ETF / Index', currency: 'EUR' },
  SE0000693293: { symbol: 'XACT-OMXS30.ST', sector: 'ETF / Index', currency: 'SEK' },
  SE0009778954: { symbol: 'XACT-NORDEN.ST', sector: 'ETF / Index', currency: 'SEK' },
};

const NAME_TO_TICKER: Record<string, KnownSecurity> = {
  'investor b': ISIN_TO_TICKER.SE0015811963,
  'investor a': ISIN_TO_TICKER.SE0015811955,
  'inve b': ISIN_TO_TICKER.SE0015811963,
  'volvo b': ISIN_TO_TICKER.SE0000115446,
  'volvo a': ISIN_TO_TICKER.SE0000115420,
  'atlas copco a': ISIN_TO_TICKER.SE0017486889,
  'atlas copco b': ISIN_TO_TICKER.SE0017486897,
  'saab b': ISIN_TO_TICKER.SE0021921269,
  'evolution': ISIN_TO_TICKER.SE0012673267,
  'evolution gaming': ISIN_TO_TICKER.SE0012673267,
  'handelsbanken a': ISIN_TO_TICKER.SE0007100599,
  'svenska handelsbanken a': ISIN_TO_TICKER.SE0007100599,
  'seb a': ISIN_TO_TICKER.SE0000148884,
  'swedbank a': ISIN_TO_TICKER.SE0000242455,
  'nordea bank': ISIN_TO_TICKER.FI4000297767,
  'nordea bank abp': ISIN_TO_TICKER.FI4000297767,
  'ericsson b': ISIN_TO_TICKER.SE0000108656,
  'abb': ISIN_TO_TICKER.CH0012221716,
  'abb ltd': ISIN_TO_TICKER.CH0012221716,
  'astrazeneca': ISIN_TO_TICKER.GB0009895292,
  'sandvik': ISIN_TO_TICKER.SE0000667891,
  'assa abloy b': ISIN_TO_TICKER.SE0007100581,
  'hexagon b': ISIN_TO_TICKER.SE0015961909,
  'nibe industrier b': ISIN_TO_TICKER.SE0015988019,
  'nibe b': ISIN_TO_TICKER.SE0015988019,
  'h&m b': ISIN_TO_TICKER.SE0000106270,
  'hennes & mauritz b': ISIN_TO_TICKER.SE0000106270,
  'telia company': ISIN_TO_TICKER.SE0000667925,
  'tele2 b': ISIN_TO_TICKER.SE0005190238,
  'essity b': ISIN_TO_TICKER.SE0009922164,
  'skf b': ISIN_TO_TICKER.SE0000108227,
  'boliden': ISIN_TO_TICKER.SE0020050417,
  'ssab b': ISIN_TO_TICKER.SE0000120669,
  'alfa laval': ISIN_TO_TICKER.SE0000695876,
  'epiroc a': ISIN_TO_TICKER.SE0015658109,
  'eqt': ISIN_TO_TICKER.SE0012853455,
  'lifco b': ISIN_TO_TICKER.SE0015949201,
  'indutrade': ISIN_TO_TICKER.SE0001515552,
  'kinnevik b': ISIN_TO_TICKER.SE0022060521,
  'latour b': ISIN_TO_TICKER.SE0010100958,
  'lundbergföretagen b': ISIN_TO_TICKER.SE0000108847,
  'industrivärden c': ISIN_TO_TICKER.SE0000107203,
  'avanza bank holding': ISIN_TO_TICKER.SE0012454072,
  'nordnet': ISIN_TO_TICKER.SE0015192067,
  'castellum': ISIN_TO_TICKER.SE0000379190,
  'balder b': ISIN_TO_TICKER.SE0017832488,
  'sagax b': ISIN_TO_TICKER.SE0005127818,
  'axfood': ISIN_TO_TICKER.SE0015810247,
  'skanska b': ISIN_TO_TICKER.SE0000113250,
  'novo nordisk b': ISIN_TO_TICKER.DK0062498333,
  'novo nordisk': ISIN_TO_TICKER.DK0062498333,
  'equinor': ISIN_TO_TICKER.NO0010096985,
  'apple': ISIN_TO_TICKER.US0378331005,
  'apple inc': ISIN_TO_TICKER.US0378331005,
  'microsoft': ISIN_TO_TICKER.US5949181045,
  'microsoft corp': ISIN_TO_TICKER.US5949181045,
  'nvidia': ISIN_TO_TICKER.US67066G1040,
  'nvidia corp': ISIN_TO_TICKER.US67066G1040,
  'amazon': ISIN_TO_TICKER.US0231351067,
  'alphabet a': ISIN_TO_TICKER.US02079K3059,
  'alphabet inc': ISIN_TO_TICKER.US02079K3059,
  'meta platforms': ISIN_TO_TICKER.US30303M1027,
  'tesla': ISIN_TO_TICKER.US88160R1014,
  'berkshire hathaway b': ISIN_TO_TICKER.US0846707026,
  'realty income': ISIN_TO_TICKER.US7561091049,
  'coca-cola': ISIN_TO_TICKER.US1912161007,
  'visa': ISIN_TO_TICKER.US92826C8394,
  'amd': ISIN_TO_TICKER.US0079031078,
  'spotify': ISIN_TO_TICKER.LU1778762911,
  'acushnet': ISIN_TO_TICKER.US0050981085,
  'acushnet holdings': ISIN_TO_TICKER.US0050981085,
  'acushnet holdings corp': ISIN_TO_TICKER.US0050981085,
  'qualcomm': ISIN_TO_TICKER.US7475251036,
  'qualcomm inc': ISIN_TO_TICKER.US7475251036,
};

export function normalizeSecurityKey(name: string, isin?: string): string {
  if (isin && isin.trim().length >= 10) {
    return isin.trim().toUpperCase();
  }
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function resolveTickerLocal(
  name: string,
  isin: string,
  currency: string,
  customMap: Record<string, string> = {}
): { symbol: string; sector: string; confidence: 'exact' | 'guessed' } {
  const cleanIsin = isin.trim().toUpperCase();
  const cleanName = name.trim();
  const normName = cleanName.toLowerCase().replace(/\s+/g, ' ');

  // 1. User's manual ticker override takes top precedence
  if (cleanIsin && customMap[cleanIsin]) {
    return { symbol: customMap[cleanIsin], sector: ISIN_TO_TICKER[cleanIsin]?.sector ?? 'Övrigt', confidence: 'exact' };
  }
  if (customMap[normName]) {
    return { symbol: customMap[normName], sector: NAME_TO_TICKER[normName]?.sector ?? 'Övrigt', confidence: 'exact' };
  }

  // 2. Direct ISIN match
  if (cleanIsin && ISIN_TO_TICKER[cleanIsin]) {
    return {
      symbol: ISIN_TO_TICKER[cleanIsin].symbol,
      sector: ISIN_TO_TICKER[cleanIsin].sector,
      confidence: 'exact',
    };
  }

  // 3. Exact or partial normalized name match
  if (NAME_TO_TICKER[normName]) {
    return {
      symbol: NAME_TO_TICKER[normName].symbol,
      sector: NAME_TO_TICKER[normName].sector,
      confidence: 'exact',
    };
  }

  for (const [key, info] of Object.entries(NAME_TO_TICKER)) {
    if (normName.startsWith(key + ' ') || normName === key) {
      return { symbol: info.symbol, sector: info.sector, confidence: 'exact' };
    }
  }

  // 4. Heuristic ticker guess for Swedish / Nordic / US formats (refined async via Yahoo Search)
  const stripped = cleanName
    .replace(/\b(ab|abp|asa|a\/s|inc\.?|corp\.?|ltd\.?|plc|holding|group)\b/gi, '')
    .trim();

  // If the name already looks like a ticker (e.g. "INVE B" or "AAPL" or "VOLV-B.ST")
  if (/^[A-Z0-9]{1,6}(-[A-Z])?\.(ST|HE|CO|OL|DE)$/i.test(cleanName)) {
    return { symbol: cleanName.toUpperCase(), sector: 'Övrigt', confidence: 'exact' };
  }

  const shareClassMatch = stripped.match(/^([A-ZÅÄÖ0-9& -]+?)\s+([ABC])$/i);
  const suffix =
    cleanIsin.startsWith('SE') || currency === 'SEK'
      ? '.ST'
      : cleanIsin.startsWith('DK') || currency === 'DKK'
        ? '.CO'
        : cleanIsin.startsWith('NO') || currency === 'NOK'
          ? '.OL'
          : cleanIsin.startsWith('FI')
            ? '.HE'
            : '';

  if (shareClassMatch && suffix) {
    const base = shareClassMatch[1].replace(/[^A-Z0-9]/gi, '').slice(0, 5).toUpperCase();
    const cls = shareClassMatch[2].toUpperCase();
    return { symbol: `${base}-${cls}${suffix}`, sector: 'Övrigt', confidence: 'guessed' };
  }

  const singleWord = stripped.replace(/[^A-Z0-9]/gi, '').slice(0, 6).toUpperCase();
  return {
    symbol: singleWord ? `${singleWord}${suffix}` : cleanName.slice(0, 8).toUpperCase(),
    sector: 'Övrigt',
    confidence: 'guessed',
  };
}

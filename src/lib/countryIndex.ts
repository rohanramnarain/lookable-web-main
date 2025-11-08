// src/lib/countryIndex.ts
// Build regex → ISO3 pairs from OWID's country index, with caching + common synonyms.
// Server-only (do not import in client components).

import "server-only";

type CountryIndex = Array<[RegExp, string]>;

let CACHE: Promise<CountryIndex> | null = null;

const OWID_COUNTRIES_URL = "https://ourworldindata.org/owid-countries-data.json";

// --- utils ---

// Escape for regex
function esc(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Strip accents safely (no \p{Diacritic} — works on older Node too)
function stripAccents(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]/g, "");
}

// Build a tolerant regex for a country name.
// - case-insensitive
// - allow flexible whitespace / hyphens / punctuation
function nameToRegex(name: string): RegExp {
  const make = (x: string) =>
    esc(x)
      .replace(/['’]/g, "['’]?")
      .replace(/[-_/.,]+/g, "[\\s-]*")
      .replace(/\s+/g, "\\s+");

  const orig = make(name);
  const folded = make(stripAccents(name));

  // Match either the original or the folded spelling
  return new RegExp(`\\b(?:${orig}|${folded})\\b`, "i");
}

// Some widely-used alternative names OWID doesn't always surface as aliases
const EXTRA_SYNONYMS: Record<string, string[]> = {
  USA: ["United States", "United States of America", "US", "U.S.", "U.S.A.", "America"],
  GBR: ["United Kingdom", "UK", "U.K.", "Great Britain", "Britain", "England"],
  RUS: ["Russia", "Russian Federation"],
  KOR: ["South Korea", "Republic of Korea", "Korea, Rep."],
  PRK: ["North Korea", "Democratic People's Republic of Korea", "DPRK"],
  IRN: ["Iran", "Islamic Republic of Iran"],
  VNM: ["Vietnam", "Viet Nam"],
  CZE: ["Czech Republic", "Czechia"],
  SWZ: ["Eswatini", "Swaziland"],
  CIV: ["Côte d’Ivoire", "Cote d'Ivoire", "Ivory Coast"],
  CPV: ["Cabo Verde", "Cape Verde"],
  MMR: ["Myanmar", "Burma"],
  SYR: ["Syria", "Syrian Arab Republic"],
  MDA: ["Moldova", "Republic of Moldova"],
  LAO: ["Laos", "Lao PDR", "Lao People's Democratic Republic"],
  TZA: ["Tanzania", "United Republic of Tanzania"],
  COD: ["DR Congo", "Congo-Kinshasa", "Congo, Dem. Rep.", "Democratic Republic of the Congo"],
  COG: ["Republic of the Congo", "Congo-Brazzaville", "Congo, Rep."],
  TLS: ["Timor-Leste", "East Timor"],
  PSE: ["Palestine", "State of Palestine", "Palestinian Territories", "West Bank and Gaza"],
  FSM: ["Micronesia", "Federated States of Micronesia"],
  ARE: ["UAE", "United Arab Emirates"],
  HKG: ["Hong Kong"],
  MAC: ["Macau", "Macao"],
  TWN: ["Taiwan", "Taiwan*"],
  BHS: ["Bahamas", "The Bahamas"],
  GMB: ["The Gambia", "Gambia"],
};

// Minimal fallback if OWID fetch fails (so queries don't break)
const FALLBACK_PAIRS: CountryIndex = [
  [/\b(?:japan|jpn)\b/i, "JPN"],
  [/\b(?:china|chn|prc)\b/i, "CHN"],
  [/\b(?:india|ind)\b/i, "IND"],
  [/\b(united\s+states|u\.?s\.?a?|america|usa)\b/i, "USA"],
  [/\b(?:united\s+kingdom|u\.?k\.?|gbr|great\s+britain|britain|england)\b/i, "GBR"],
  [/\b(?:germany|deu)\b/i, "DEU"],
  [/\b(?:france|fra)\b/i, "FRA"],
  [/\b(?:canada|can)\b/i, "CAN"],
  [/\b(?:italy|ita)\b/i, "ITA"],
  [/\b(?:spain|esp)\b/i, "ESP"],
  [/\b(?:brazil|bra)\b/i, "BRA"],
  [/\b(?:mexico|mex)\b/i, "MEX"],
  [/\b(?:australia|aus)\b/i, "AUS"],
  [/\b(?:south\s+korea|republic\s+of\s+korea|korea,\s*rep\.?|kor)\b/i, "KOR"],
  [/\b(?:russia|russian\s+federation|rus)\b/i, "RUS"],
  [/\b(?:south\s+africa|zaf)\b/i, "ZAF"],
  [/\b(?:nigeria|nga)\b/i, "NGA"],
  [/\b(?:egypt|egy)\b/i, "EGY"],
  [/\b(?:turkey|turkiye|tur)\b/i, "TUR"],
  [/\b(?:indonesia|idn)\b/i, "IDN"],
  [/\b(?:pakistan|pak)\b/i, "PAK"],
  [/\b(?:iran|irn)\b/i, "IRN"],
];

// --- data access ---

async function fetchOwidCountriesJson(): Promise<Record<string, { name: string }>> {
  const res = await fetch(OWID_COUNTRIES_URL, { cache: "force-cache", next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`OWID countries fetch failed: ${res.status}`);
  return res.json();
}

export async function getOwidCountryPairs(): Promise<CountryIndex> {
  if (CACHE) return CACHE;
  CACHE = (async () => {
    try {
      const json = await fetchOwidCountriesJson();
      const pairs: CountryIndex = [];

      // json keys are ISO3 codes: { "JPN": { name: "Japan", ... }, ... }
      for (const [iso3, meta] of Object.entries(json)) {
        const name = meta?.name?.trim();
        if (!name) continue;

        // Official name
        pairs.push([nameToRegex(name), iso3]);

        // ISO3 token
        pairs.push([new RegExp(`\\b${esc(iso3)}\\b`, "i"), iso3]);

        // Extras
        const extras = EXTRA_SYNONYMS[iso3];
        if (extras) {
          for (const alt of extras) {
            pairs.push([nameToRegex(alt), iso3]);
          }
        }
      }

      // De-dup
      const seen = new Set<string>();
      const dedup: CountryIndex = [];
      for (const [re, code] of pairs) {
        const k = `${re.source}|${code}`;
        if (!seen.has(k)) {
          seen.add(k);
          dedup.push([re, code]);
        }
      }
      return dedup;
    } catch (err) {
      console.error("countryIndex: falling back; reason:", err);
      // Fallback so we don't 500 if OWID is unreachable
      return FALLBACK_PAIRS;
    }
  })();
  return CACHE;
}

/** Try to find an ISO3 code anywhere in free-text query using the OWID index. */
export async function iso3FromQuery(query: string): Promise<string | undefined> {
  const pairs = await getOwidCountryPairs();
  const s = String(query || "");
  for (const [re, code] of pairs) {
    if (re.test(s)) return code;
  }
  const m = s.match(/\b[A-Z]{3}\b/i);
  return m ? m[0].toUpperCase() : undefined;
}

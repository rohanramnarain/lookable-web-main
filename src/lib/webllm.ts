"use client";

/**
 * Lightweight client-side model loader and chooser.
 *
 * For local development this provides a safe mocked engine so you can test the
 * client-side flow without downloading large model weights. If `@mlc-ai/web-llm`
 * and real weights are present at NEXT_PUBLIC_MODEL_BASE_URL the loader will
 * attempt to use them instead.
 */

const CONSENT_KEY = "lookable:model:consent";
const VISION_CONSENT_KEY = "lookable:vision:consent";

export function hasUserConsented(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setUserConsent(v: boolean) {
  try {
    localStorage.setItem(CONSENT_KEY, v ? "1" : "0");
  } catch {}
}

export function hasVisionConsented(): boolean {
  try {
    return localStorage.getItem(VISION_CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setVisionConsent(v: boolean) {
  try {
    localStorage.setItem(VISION_CONSENT_KEY, v ? "1" : "0");
  } catch {}
}

type Suggestion = {
  source: string;
  metricId: string | null;
  params: any | null;
  confidence: number;
  explain?: string | null;
};

let clientEngine: any = null;

/** Try to initialize a real web-llm engine if available. Returns null on failure. */
export async function ensureClientEngine(): Promise<any | null> {
  if (clientEngine) return clientEngine;
  if (typeof window === "undefined") return null;

  // Try to dynamically import the runtime (if installed). If not installed or
  // the model files are not present, we gracefully fall back to a small mock.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
    const webllm = await import("@mlc-ai/web-llm");
    // If the import succeeds we still need to load the model files. For
    // simplicity this code assumes a manifest at NEXT_PUBLIC_MODEL_BASE_URL.
    const base = (process.env.NEXT_PUBLIC_MODEL_BASE_URL as string) || "/models/test";
    const b = String(base || "/models/test");
    const manifestUrl = (b.endsWith("/") ? b : b + "/") + "manifest.json";
    try {
      const r = await fetch(manifestUrl, { method: "GET", cache: "no-store" });
      if (!r.ok) throw new Error("manifest missing");
      const manifest = await r.json();
      // Here you would call webllm.createEngine(...) or similar using manifest.
      // Implementation depends on the runtime and manifest format. We leave a
      // placeholder to avoid introducing heavy implementation detail.
      clientEngine = { runtime: webllm, manifest };
      return clientEngine;
    } catch (err) {
      // If manifest missing, fall back to mocked engine below.
    }
  } catch (err) {
    // import failed -> not installed, use mock below
  }

  // Enhanced mock: try to extract a country (2-3 letter), years, or lat/lon
  function parseYears(s: string) {
    const now = new Date().getFullYear();
    const range = s.match(/(\d{4})\s*[-–—]\s*(\d{4}|present|now)/);
    if (range) {
      let a = Number(range[1]);
      let b = /present|now/.test(range[2]) ? now : Number(range[2]);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        if (a > b) [a, b] = [b, a];
        return { start: a, end: Math.min(b, now) };
      }
    }
    const since = s.match(/since\s+(\d{4})/);
    if (since) return { start: Number(since[1]), end: now };
    const last = s.match(/last\s+(\d+)\s+years?/);
    if (last) {
      const n = Number(last[1]);
      return { start: now - (n - 1), end: now };
    }
    return {};
  }

  function parseCountry(s: string) {
    const m = s.match(/\b(usa|united states|united states of america|us)\b/i);
    if (m) return "USA";
    const jp = s.match(/\bjapan\b/i); if (jp) return "JPN";
    const cn = s.match(/\bchina\b/i); if (cn) return "CHN";
    const inMatch = s.match(/\bindia\b/i); if (inMatch) return "IND";
    const de = s.match(/\bgermany\b/i); if (de) return "DEU";
    const fr = s.match(/\bfrance\b/i); if (fr) return "FRA";
    return null;
  }

  clientEngine = {
    generate: async (prompt: string) => {
      const p = String(prompt).toLowerCase();
      const years = parseYears(p);
      const country = parseCountry(p);

      // Lat/lon explicit
      const coords = p.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
      if (/(temp|temperature|°c|°f)/.test(p)) {
        if (coords) return JSON.stringify({ source: "openmeteo", metricId: "temp_hourly", params: { lat: Number(coords[1]), lon: Number(coords[2]) }, confidence: 0.95, explain: "explicit coords" });
        return JSON.stringify({ source: "openmeteo", metricId: "temp_hourly", params: { lat: 40.7128, lon: -74.0060 }, confidence: 0.85, explain: "temperature query" });
      }

      if (/(population|pop)\b/.test(p)) {
        return JSON.stringify({ source: "worldbank", metricId: "population_total", params: { country: country ?? "USA", ...(years.start ? { start: years.start, end: years.end } : {}) }, confidence: 0.9, explain: "population heuristic" });
      }

      if (/(gdp per capita|gdp pc|income per capita)/.test(p)) {
        return JSON.stringify({ source: "worldbank", metricId: "gdp_per_capita", params: { country: country ?? "USA", ...(years.start ? { start: years.start, end: years.end } : {}) }, confidence: 0.9, explain: "gdp heuristic" });
      }

      if (/(inflation|cpi)\b/.test(p)) {
        return JSON.stringify({ source: "worldbank", metricId: "inflation_cpi_pct", params: { country: country ?? "USA", ...(years.start ? { start: years.start, end: years.end } : {}) }, confidence: 0.9, explain: "inflation heuristic" });
      }

      if (/(unemployment|jobless|unemploy)/.test(p) && /by\s*race|black|white|asian|hispanic/.test(p)) {
        return JSON.stringify({ source: "bls", metricId: "unemployment_rate_by_race_us", params: { ...(years.start ? { start: years.start, end: years.end } : {}) }, confidence: 0.92, explain: "unemployment by race heuristic" });
      }

      if (/(aqi|air\s*quality)/.test(p)) {
        return JSON.stringify({ source: "epa_aqi", metricId: "aqi_daily_cbsa", params: null, confidence: 0.9, explain: "aqi heuristic" });
      }

      if (/(life\s*expectancy)/.test(p)) {
        return JSON.stringify({ source: "owid", metricId: "life_expectancy", params: { country: country ?? "USA", ...(years.start ? { start: years.start, end: years.end } : {}) }, confidence: 0.9, explain: "life expectancy heuristic" });
      }

      if (/(co2|carbon\s+emissions?)/.test(p)) {
        return JSON.stringify({ source: "owid", metricId: "co2_emissions", params: { country: country ?? "USA", ...(years.start ? { start: years.start, end: years.end } : {}) }, confidence: 0.9, explain: "co2 heuristic" });
      }

      return JSON.stringify({ source: "unknown", metricId: null, params: null, confidence: 0.0, explain: "no confident suggestion" });
    }
  };

  return clientEngine;
}

/** Run the client-side chooser. Returns a Suggestion-like object. */
export async function chooseSourceClient(query: string): Promise<Suggestion> {
  if (typeof window === "undefined") return { source: "unknown", metricId: null, params: null, confidence: 0, explain: null };
  if (!hasUserConsented()) return { source: "unknown", metricId: null, params: null, confidence: 0, explain: "consent required" };

  const eng = await ensureClientEngine();
  if (!eng) return { source: "unknown", metricId: null, params: null, confidence: 0, explain: "engine unavailable" };

  try {
    const prompt = `Suggest a single JSON with {source,metricId,params,confidence,explain} for the user query: "${String(query).replace(/\"/g, '\\"')}"`;
    const out = await eng.generate(prompt);
    // eng.generate may return a string or an object; coerce to string
    const txt = typeof out === "string" ? out : String(out);
    try {
      const js = JSON.parse(txt);
      return {
        source: js.source ?? "client",
        metricId: js.metricId ?? null,
        params: js.params ?? null,
        confidence: typeof js.confidence === "number" ? js.confidence : 0,
        explain: js.explain ?? null,
      };
    } catch (err) {
      return { source: "client", metricId: null, params: null, confidence: 0, explain: "parse-error" };
    }
  } catch (err) {
    return { source: "client", metricId: null, params: null, confidence: 0, explain: String(err ?? "") };
  }
}

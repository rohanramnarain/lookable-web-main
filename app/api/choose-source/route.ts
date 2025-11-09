import { NextResponse } from 'next/server';
import { z } from 'zod';

const AllowedSources = z.enum(["worldbank","openmeteo","owid","bls","epa_aqi","unknown"]);

const SuggestionSchema = z.object({
  source: AllowedSources,
  metricId: z.string().nullable(),
  params: z.record(z.string(), z.any()).nullable(),
  confidence: z.number().min(0).max(1),
  explain: z.string().nullable(),
});

type Suggestion = z.infer<typeof SuggestionSchema>;

async function callExternalModel(query: string): Promise<any> {
  // If you set EXTERNAL_MODEL_API, we forward the query to it and expect
  // a JSON object that matches SuggestionSchema. The external API must
  // accept POST { query } and return the JSON suggestion.
  const url = process.env.EXTERNAL_MODEL_API;
  if (!url) return null;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, model: 'Qwen2.5-Coder-1.5B-Instruct' }),
    });
    if (!res.ok) return null;
    const js = await res.json();
    return js;
  } catch (err) {
    return null;
  }
}

function heuristicSuggest(query: string): Suggestion {
  const q = String(query || '').toLowerCase();
  const now = new Date().getFullYear();

  // Helpers to extract years/ranges and races from the query
  function parseYears(s: string) {
    const range = s.match(/(\d{4})\s*[-–—]\s*(\d{4}|present|now)/);
    if (range) {
      let a = Number(range[1]);
      let b = /present|now/.test(range[2]) ? now : Number(range[2]);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        if (a > b) [a, b] = [b, a];
        b = Math.min(b, now);
        return { start: a, end: b };
      }
    }
    const since = s.match(/since\s+(\d{4})/);
    if (since) return { start: Number(since[1]), end: now };
    const last = s.match(/last\s+(\d+)\s+years?/);
    if (last) {
      const n = Number(last[1]);
      if (Number.isFinite(n) && n > 0) return { start: now - (n - 1), end: now };
    }
    // Single year like "1990"
    const single = s.match(/\b(19|20)\d{2}\b/);
    if (single) {
      const y = Number(single[0]);
      if (Number.isFinite(y)) return { start: y, end: y };
    }
    return {};
  }

  function parseRaces(s: string) {
    const found: string[] = [];
    if (/\bwhite(s)?\b/.test(s)) found.push('white');
    if (/\bblack(s)?\b|\bafrican[-\s]?american(s)?\b/.test(s)) found.push('black');
    if (/\basian(s)?\b|\baapi\b/.test(s)) found.push('asian');
    if (/\bhispanic|latino|latina|latinx\b/.test(s)) found.push('hispanic');
    return found;
  }

  // Simple heuristics (mirrors parts of the client planner) --- conservative
  if (/(temp|temperature|°c|°f)/.test(q)) {
    const m = q.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (m) {
      return { source: 'openmeteo', metricId: null, params: { lat: Number(m[1]), lon: Number(m[2]) }, confidence: 0.98, explain: 'Explicit lat,lon -> Open-Meteo' };
    }
    const years = parseYears(q);
    return { source: 'openmeteo', metricId: null, params: Object.keys(years).length ? years : null, confidence: 0.8, explain: 'Temperature query -> Open-Meteo' };
  }

  if (/(population|pop)\b/.test(q)) {
    const years = parseYears(q);
    return { source: 'worldbank', metricId: 'population_total', params: Object.keys(years).length ? years : null, confidence: 0.95, explain: 'Population is a World Bank indicator' };
  }

  if (/(gdp per capita|gdp pc|income per capita)/.test(q)) {
    const years = parseYears(q);
    return { source: 'worldbank', metricId: 'gdp_per_capita', params: Object.keys(years).length ? years : null, confidence: 0.95, explain: 'GDP per capita -> World Bank' };
  }

  if (/(inflation|cpi)\b/.test(q)) {
    const years = parseYears(q);
    return { source: 'worldbank', metricId: 'inflation_cpi_pct', params: Object.keys(years).length ? years : null, confidence: 0.95, explain: 'Inflation/CPI -> World Bank' };
  }

  if (/(unemployment|jobless|unemploy)/.test(q) && /by\s*race|black|white|asian|hispanic/.test(q)) {
    const years = parseYears(q);
    const races = parseRaces(q);
    const params: Record<string, any> = {};
    if (Object.keys(years).length) Object.assign(params, years);
    if (races.length) params.races = races.join(',');
    return { source: 'bls', metricId: 'unemployment_rate_by_race_us', params: Object.keys(params).length ? params : null, confidence: 0.95, explain: 'BLS covers unemployment by race (US)' };
  }

  if (/(aqi|air\s*quality)/.test(q)) {
    return { source: 'epa_aqi', metricId: 'aqi_daily_cbsa', params: null, confidence: 0.92, explain: 'AQI -> EPA AirData' };
  }

  if (/(life\s*expectancy)/.test(q)) {
    const years = parseYears(q);
    return { source: 'owid', metricId: 'life_expectancy', params: Object.keys(years).length ? years : null, confidence: 0.95, explain: 'Life expectancy -> OWID' };
  }

  if (/(co2|carbon\s+emissions?)/.test(q)) {
    const years = parseYears(q);
    return { source: 'owid', metricId: 'co2_emissions', params: Object.keys(years).length ? years : null, confidence: 0.95, explain: 'CO2 emissions -> OWID' };
  }

  // Default unknown
  return { source: 'unknown', metricId: null, params: null, confidence: 0.0, explain: 'No confident suggestion' };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const query = String(body?.query ?? '').trim();
    if (!query) return NextResponse.json({ source: 'unknown', metricId: null, params: null, confidence: 0.0, explain: 'Empty query' });

    // Try external model first (if configured)
    const external = await callExternalModel(query);
    if (external) {
      // Try validate
      const parsed = SuggestionSchema.safeParse(external);
      if (parsed.success) return NextResponse.json(parsed.data);
      // External returned something invalid; fall through to heuristic
    }

    // Fallback heuristic
    const sug = heuristicSuggest(query);
    return NextResponse.json(sug);
  } catch (err: any) {
    return NextResponse.json({ source: 'unknown', metricId: null, params: null, confidence: 0.0, explain: String(err?.message ?? 'error') });
  }
}

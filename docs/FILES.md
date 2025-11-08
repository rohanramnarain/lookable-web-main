# Lookable — File map & architecture

This document maps the key files and folders in the repository and explains responsibilities, interactions, and what to change when you want to add functionality. It is written for maintainers who want a quick but thorough orientation.

## High-level overview

- Framework: Next.js (app router) + React + TypeScript.
- Purpose: Instant, no-code charts from trusted open-data sources. The UI accepts natural-language queries, the planner creates a normalized "Plan" (metricId + params + chart meta), and the app fetches data from a mix of server-side fetchers (World Bank, OWID, BLS, EPA, Open-Meteo, Urban API) and renders a Vega-Lite visualization.
- Important runtime notes:
  - `next.config.ts` sets `output: 'export'` and `images.unoptimized: true`, indicating a static-export friendly build. ESLint is ignored during builds.
  - Server-only vs client: some modules are server-only (e.g., `src/lib/countryIndex.ts` — import `server-only`), while the main UI lives in `app/page.tsx` (client component).


## Top-level files

- `package.json` — project dependencies and scripts (dev, build, start, export, deploy). Useful if you need to install or change libs. Key dependencies: `next`, `react`, `vega`, `vega-embed`, `zod`.
- `README.md` — project bootstrap instructions and links.
- `next.config.ts` — Next.js configuration. Controls build output and image handling.
- `tsconfig.json` — TypeScript config and `@/*` path alias mapping to `src/*`.


## App router (UI & top-level pages)

- `app/layout.tsx` — root layout and metadata (fonts, light theme). Global CSS import (`./globals.css`) lives here.
- `app/page.tsx` — main UI page (client component). Responsibilities:
  - Presents input and suggestions to the user.
  - Calls `plan()` from `src/lib/llm.ts` to convert free text into a Plan.
  - Ensures ML engine readiness via `ensureEngine()` (currently a no-op placeholder in `llm.ts`).
  - For data retrieval, it either:
    - Calls `fetchWDI` / `fetchOpenMeteo` directly (client-side fetch for these public APIs), or
    - Calls the server action `getDataForPlan` (from `app/actions.ts`) for other sources to avoid CORS and expose server-only fetchers.
  - Compiles a minimal Vega-Lite spec (`compileSpec`) based on fetched rows and chart metadata and passes it to `src/components/Chart.tsx`.
  - Shows provenance (source, URL, license) returned by fetchers.

- `app/actions.ts` — server action (annotated `"use server"`) exposing `getDataForPlan(plan)`.
  - It validates `metricId` via `isMetricId` from `src/lib/catalog.ts`.
  - Calls `runSource(metricId, params)` from `src/lib/runSource.ts` to perform server-side data access.
  - Purpose: central server-side entrypoint for data lookup that the client can call to avoid CORS and protect API keys.


## API routes

- `app/api/geo/iso3/route.ts` — small server route that maps free-text country names to ISO3 codes.
  - Uses a local fallback regex table but attempts to lazy-import `src/lib/countryIndex.ts` (server-only) which has a comprehensive OWID-based matching index. Always returns 200 (never 500) and intentionally swallows failures in favor of a fallback. This is used by the planner (client-side) to normalize country inputs.


## Core libraries (`src/lib`)

These files define the planner, catalog of metrics, fetchers, and the single-run orchestration.

- `src/lib/llm.ts` (client-heavy planner + helpers)
  - Primary task: deterministic planner that maps free-text queries into a structured `Plan` (validated by `PlanSchema` in `schema.ts`).
  - Exports:
    - `plan(query: string): Promise<Plan>` — interprets queries and returns a `Plan` containing `metricId`, `params`, and `chart` metadata.
    - `ensureEngine()` — placeholder/no-op engine hook (kept to allow replacing with a web-LLM later).
  - Important helpers:
    - `toISO3FromQuery(q)` — calls `/api/geo/iso3?q=...` and falls back to a quick client-side mapping if the route or server index is unreachable.
    - `extractYearsInclusive`, `extractLatLon`, `extractRaces`, and other small NLP helpers used by the planner.
  - Behavior:
    - Detects keywords (e.g., temperature → Open-Meteo; population → World Bank; unemployment by race → BLS; life expectancy → OWID).
    - Falls back to a default metric (`unemployment_rate`) for unknown queries.
  - Notes: This module runs on client components (it contains `fetch('/api/...')` calls) but relies on a server-side API for some lookups.

- `src/lib/schema.ts` — Zod schemas and TypeScript types
  - `ChartMetaSchema`, `PlanSchema` and `Plan` type. Use this to validate `plan()` outputs and ensure downstream fetchers can expect a consistent shape.

- `src/lib/catalog.ts` — Metric catalog
  - Exports `METRIC_IDS`, `CATALOG`, and `isMetricId()`.
  - `CATALOG` maps `metricId` → `{ source, dataset?, defaultParams? }`.
  - Adding a new metric requires updating this file and adding a matching fetcher in `runSource.ts`.

- `src/lib/allowlist.ts` — Allowed sources
  - `AllowedSource` union and `isAllowedSource()` helper.
  - Used by UI to render supported source bubbles and to guard `runSource` switch cases.

- `src/lib/runSource.ts` — Central dispatcher for server-side source fetching
  - `runSource(metricId, params)` reads `CATALOG[metricId]` and routes to the appropriate fetcher using a `switch (meta.source)`.
  - For each case it normalizes params (start/end dates, coordinates, countries), calls the relevant fetcher, and returns `{ rows, yLabel?, title?, provenance }`.
  - To add a new source: implement a fetcher, add it to `allowlist.ts` (if needed), add a `CATALOG` entry, and add a `case` in `runSource`.

- `src/lib/countryIndex.ts` — OWID-based country name → ISO3 index (server-only)
  - Fetches `https://ourworldindata.org/owid-countries-data.json` and builds tolerant regexes to match many country name variants.
  - Exports `getOwidCountryPairs()` and `iso3FromQuery(query)`. It caches results and has a compact fallback mapping.
  - Important: `import "server-only"` at top — do not import this file into client bundles.


## Fetchers (server-side data adapters)

All fetchers return a normalized shape: { rows: Array<{date|time|year, value, series?}>, unit?/yLabel?, title?, provenance: { source, url, license? } }.

- `src/lib/fetchers/worldbank.ts` — `fetchWDI(indicator, country, start, end)`
  - Calls World Bank WDI JSON API, parses the series, returns rows (year/value) and `yLabel` from the API.
  - Has a fallback full-series fetch if the per-window query returns empty.

- `src/lib/fetchers/openmeteo.ts` — `fetchOpenMeteo(lat, lon)`
  - Calls Open-Meteo hourly forecast API and maps hourly times → temperature rows.
  - Returns `yLabel` (e.g., `Temperature (°C)`) and provenance.
  - This fetcher is safe to call client-side (CORS-permitting public API). The app uses it directly from `app/page.tsx` for speed.

- `src/lib/fetchers/owid.ts` — `fetchOwid({indicator, countries, startYear, endYear})`
  - Fetches OWID CSVs (co2 or life-expectancy), detects the numeric value column, filters by requested countries or names, and returns rows with `series` set to the country name.
  - Designed to run server-side (avoids browser CORS and provides provenance linking to OWID CSVs).

- `src/lib/fetchers/bls.ts` — `fetchBlsUnempByRace(params)`
  - Pulls CPS series from BLS Public API (optionally using `process.env.BLS_API_KEY` if present), parses monthly series, and returns monthly rows and titles.
  - Important: Add `BLS_API_KEY` to environment if you need to raise the BLS rate limits or increase reliability.

- `src/lib/fetchers/epa_aqi.ts` — `fetchDailyAqiByCbsa({ cbsaName, startYear, endYear })`
  - Downloads yearly zip archives from EPA AirData, unzips server-side (uses `jszip`), filters to a given CBSA name, and returns daily AQI rows.
  - Time-consuming for large year ranges; consider caching results externally.

- `src/lib/fetchers/urban.ts` — `fetchUrban({ path | pathTemplate, years[], valueField, seriesField })`
  - Fetches from the Urban Institute Education API (or absolute https URL) and supports templated year loops.
  - Returns year-based rows and provenance.


## Components

- `src/components/Chart.tsx` — Vega embedding component (client-only)
  - Dynamically imports `vega-embed`, patches the spec (ensures y-axis titles and color legends when `series` exists), and embeds the visualization.
  - Uses `structuredClone` when available, and finalizes the Vega view on unmount.
  - Patch helpers:
    - `patchYAxisTitle` — infers friendly y-axis titles from spec meta or field names.
    - `patchColorLegend` — auto-adds color/legend for `series` field and improves tooltips.


## Where logic flows and what affects what

- Query text (UI) → `plan(query)` (`src/lib/llm.ts`) which:
  - Extracts keyword signals (temperature, population, unemployment, CO₂...)
  - Normalizes countries via `/api/geo/iso3` or local fallback
  - Produces a validated `Plan` (zod `PlanSchema`) that includes `metricId`, `params`, and `chart` metadata

- Plan execution options:
  - `World Bank` & `Open-Meteo` (public): `app/page.tsx` may call fetchers directly (client-side) for responsiveness.
  - `OWID`, `BLS`, `EPA AirData`, `Urban`: these are executed via the server action `getDataForPlan` (in `app/actions.ts`) which calls `runSource()` server-side to avoid CORS and to allow use of server-only utilities and keys.

- `runSource(metricId, params)` (server) uses `CATALOG` + `allowlist` to decide which fetcher to call and how to normalize params.

- Fetchers return `rows` + `provenance` + optional labels; page compiles these into a Vega-Lite spec using `compileSpec` and displays via `Chart`.


## Important implementation notes & conventions

- Types & validation: `zod` schemas reside in `schema.ts`. Planner outputs are validated via `PlanSchema.parse(...)` — keep this up-to-date when changing the Plan shape.
- Server-only constraints: `src/lib/countryIndex.ts` has `import "server-only"` and must not be imported into client bundles.
- CORS & security: `app/actions.ts` and `runSource.ts` centralize server fetching to avoid exposing API keys and to prevent browser CORS issues. BLS API key support uses `process.env.BLS_API_KEY`.
- Provenance: every fetcher returns a `provenance` object `{ source, url, license? }` that gets shown in the UI — keep it accurate.


## How to add a new data source or metric (practical checklist)

1. Implement the server-side fetcher in `src/lib/fetchers/` with the standard output shape: `{ rows, provenance, yLabel?, title? }`.
2. Add the source type to `src/lib/allowlist.ts` if it's a new source kind.
3. Add a new `metricId` and an entry to `src/lib/catalog.ts` mapping the metric to `source`, `dataset` (if applicable) and `defaultParams`.
4. Add a `case` to `src/lib/runSource.ts` to route to your fetcher and normalize params.
5. If this source needs a server action or special API key, document usage and environment vars (e.g., `BLS_API_KEY`) in `README.md`.
6. Optionally add a suggestion to `app/page.tsx`'s `SUGGESTION_GROUPS` to make it easy to try.


## Developer pain points & performance notes

- EPA AirData fetcher downloads ZIP per year and unzips server-side. Heavy ranges can be slow—consider caching yearly CSVs or using a worker.
- OWID CSV fetches are large for some indicators (co2). The fetchers use `next: { revalidate: 86400 }` on fetch to leverage Next caching where possible.
- BLS API rate limits exist — provide `BLS_API_KEY` in environment to improve reliability.
- `next.config.ts` sets `output: 'export'` which constrains server-rendered options; some route behaviors may need adjustments if switching to SSR-only features.


## Quick pointer list (file → responsibility)

- `package.json` — deps & scripts
- `next.config.ts` — build/output config
- `app/layout.tsx` — fonts & page shell
- `app/page.tsx` — main UI (planner invocation, chart compilation, direct fetches for some sources)
- `app/actions.ts` — server action wrapper `getDataForPlan`
- `app/api/geo/iso3/route.ts` — country name → ISO3 lookup (fast fallback + OWID-backed index)
- `src/components/Chart.tsx` — Vega embedding and spec patches
- `src/lib/llm.ts` — deterministic planner + helpers + `ensureEngine()`
- `src/lib/schema.ts` — zod schemas for Plan and chart meta
- `src/lib/catalog.ts` — metric catalog (metricId → source, dataset, defaults)
- `src/lib/allowlist.ts` — Allowed source list and helper
- `src/lib/runSource.ts` — orchestrates server-side fetches by source
- `src/lib/countryIndex.ts` — server-only OWID country index (regex-based)
- `src/lib/fetchers/*` — per-source adapters (World Bank, OWID, BLS, EPA, Open-Meteo, Urban)


## Next steps & recommendations

- Add a short `CONTRIBUTING.md` that documents the "add new metric" checklist above.
- Add CI checks that exercise a few fetchers with small sample requests (mocked responses) so plumbing stays correct.
- Consider adding caching (Redis or Vercel edge cache) for heavy fetchers (EPA, OWID co2) and for `countryIndex` if you run in serverless environments.


---

File created automatically by an analysis tool. If anything is incorrect, tell me which file you'd like expanded and I'll update this doc.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

License: Licensed under the Apache License 2.0 — see `LICENSE`.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
What it understands right now

This app uses a deterministic planner plus an optional LLM-based chooser to map natural-language queries to data fetches. The planner extracts structured facts (years, countries, lat/lon, races) and the chooser (Qwen) suggests which metric/source to use when available. Model outputs are validated and only used when confidence is high; otherwise the planner is authoritative.

Supported query types (by data source)

World Bank (single country)

Triggers: population, gdp per capita, inflation / cpi, unemployment rate

Examples that work:

US GDP per capita since 2000

Population Nigeria 1990–2015

Inflation CPI % Germany 2010–2024

Unemployment rate France 2008–2013

Notes: one country at a time (the planner currently extracts a single ISO-3). The app will attempt to infer a country from the raw query if the planner doesn't provide one.

BLS (US unemployment by race, monthly)

Triggers: the word unemployment + either "by race" or a race word (black, white, asian, hispanic)

Understands: since YYYY, YYYY–YYYY, last N years

Examples that work:

Unemployment rate by race in the US since 2000

Unemployment rate black since 2015

Unemployment rate asian 2003–2010

Notes: multiple races at once are fine (it colors by series), single race works too. The planner no longer silently falls back to a default metric — if intent can't be determined you'll see a helpful error asking to rephrase.

OWID (single country, Life expectancy / CO₂)

Triggers: life expectancy, co2 / carbon emissions

Examples that work:

Life expectancy Japan since 1950

CO2 emissions China since 1990

Notes: currently one country per query. Multi-country comparisons are an easy upgrade.

Open-Meteo (weather)

Triggers: temp / temperature (hourly)

Examples that work:

40.71,-74.01 temperature next 48 hours

Temperature 34.05,-118.25

Notes: It reads lat,lon if you include numbers; otherwise defaults to NYC. Open-Meteo can be called client-side for responsiveness.

EPA AirData (AQI by CBSA)

Trigger: aqi / air quality

Example that works:

Daily AQI for Los Angeles-Long-Beach-Anaheim, CA in 2024

Notes: Needs the CBSA name as you pass it (exact-ish string).

Urban (NCES/IPEDS)

It’s wired for a specific example and a generic fetcher; you can use your existing example:

Grade 3 enrollment in DC, 2013 (NCES CCD)

Natural-language knobs it already parses

Time windows: since 2000, 2010–2024, last 5 years

Countries: by name or ISO-3 (via `/api/geo/iso3` + fallback)

Races (BLS): black, white, asian, hispanic or phrase by race

Coordinates: lat,lon like 37.78,-122.42

Output you can count on

Rows contain date (ISO YYYY-MM-DD) or year + value and, when applicable, a series label (e.g., race).

CSV export: the chart component exposes a "Download CSV" button that saves the data behind the chart. The CSV includes friendly column headers and top-line metadata (query, title, source, URL).

For BLS, you already have a toAnnual() helper if you want annual averages.

Things you can ask (that will work today)

World Bank

Unemployment rate Italy 2008–2014

Population IND since 1960

Inflation CPI % Brazil last 10 years

BLS

Unemployment rate asian since 2003

US unemployment by race 2007–2012

Unemployment rate hispanic last 20 years

OWID

Life expectancy Mexico since 1930

CO2 emissions RUS since 1992

Open-Meteo

51.5072,-0.1276 temperature

EPA AQI

Daily AQI for Phoenix-Mesa-Chandler, AZ in 2023

(Stick to one country for World Bank/OWID queries with the current planner.)

Low-lift upgrades that unlock a ton

If you want this to feel much more “ask me anything”, here are surgical improvements (each is small, high-impact):

Multi-country comparisons for OWID (e.g., “Japan vs United States”)

Add extractAllISO3FromQuery() that returns an array and, when ≥2 found, pass params.country = "JPN,USA" to the OWID branch (your runSource already splits CSV to array).

Seasonal adjustment switch for BLS

Parse SA / seasonally adjusted and NSA / not seasonally adjusted and forward a seasonallyAdjusted flag through runSource → fetchBlsUnempByRace (you already support it in the fetcher).

City → lat/lon for weather

Add a tiny server route that hits a free geocoder (e.g., Nominatim) and returns lat/lon. Then accept “NYC”, “San Francisco”, etc., no coordinates needed.

CBSA lookup by city for AQI

Keep a small map (or a server route) from city → CBSA name so users can type “LA AQI 2024”.

World Bank multi-country

If you want comparisons there too, adjust your WDI fetcher & runSource to accept multiple countries and union the rows with series = country.

Aliases like ‘UK’, ‘South Korea’, ‘Ivory Coast’, ‘World’

Your server ISO index already handles many of these; just make sure your route returns codes for both “name” and common nicknames. (You already have fallbacks; adding a few more would be trivial.)

## Style from image (client-only, no training)

- New tab at `/style` lets you upload a chart image and save a style preset.
- Choose from more chart types: Line, Area, Bar, Bar (Horizontal), Scatter, Circle (points), Pie, Donut.
- Pie/Donut require a categorical breakdown (e.g., multiple series like “by race”). If unavailable, the app safely falls back to Bar.
- The app extracts a color palette on-device.
- Chart-type classification is vision-only when enabled; no heuristic fallback is used.
- No data/facts are taken from the image; only styling is applied. Your existing query → fetch → compile flow stays the same.
- Saved style presets are applied when you generate a chart on the home tab.

Badges (top of the home page):
- Vision: Used/Fallback — whether a vision classifier was used (if/when enabled) to pick chart type.
- Inference: Client-only/Mixed — whether the end-to-end run stayed on-device (e.g., Open-Meteo) or used server actions for fetching (e.g., World Bank/OWID/BLS/EPA/Urban).

Env flags (optional):
- `NEXT_PUBLIC_ENABLE_VISION_STYLE` — gate future client vision model usage for chart-type classification.
- `NEXT_PUBLIC_ENABLE_CLIENT_BADGE` — gate the badges UI (on by default in dev).

### Vision chart-type classification

The style-from-image feature can classify chart types using either:

1. A client-only WebLLM engine (Qwen-VL build you provide) — zero network traffic after load.
2. A local Python FastAPI endpoint running Transformers weights — easiest path before converting to WebLLM.

Classification returns one of: `line | area | bar | bar-horizontal | scatter | circle | pie | donut` plus a confidence. The UI only updates the chart type when a vision model was actually used.

#### Option A: Client-only WebLLM

1. Add to `.env.local`:
```bash
NEXT_PUBLIC_ENABLE_VISION_STYLE=1
NEXT_PUBLIC_VISION_MODEL_BASE_URL=/models/vision
NEXT_PUBLIC_VISION_MODEL_ID=Qwen2.5-VL-7B-Instruct
```
2. Supply a `manifest.json` and weights in `public/models/vision/` (MLC WebLLM format).
3. Restart `npm run dev` so Next.js inlines env vars.
4. Visit `/style`, upload an image. If the engine loads you’ll see “Classifier: Vision model (confidence …%)”. Otherwise it abstains.

#### Option B: Local Python endpoint (fast start)

1. In `server/` use provided `vision_server.py` + `requirements.txt`.
2. Install & run:
```bash
cd server
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn vision_server:app --host 127.0.0.1 --port 8079
```
3. Add to `.env.local`:
```bash
NEXT_PUBLIC_ENABLE_VISION_STYLE=1
NEXT_PUBLIC_VISION_ENDPOINT=http://127.0.0.1:8079/classify
```
4. Restart `npm run dev`, upload image on `/style`.

If both endpoint and WebLLM are configured the endpoint is preferred. Remove `NEXT_PUBLIC_VISION_ENDPOINT` to force WebLLM.

#### Debugging

- Open DevTools Console: look for `[vision] POST http://127.0.0.1:8079/classify`.
- Network tab should show OPTIONS (preflight) + POST with 200 and JSON body `{chartType, confidence}`.
- If CORS errors appear, confirm server restarted after edits; dev server now injects explicit `Access-Control-Allow-Origin: *` headers.
- Quick manual test:
```bash
curl -i -F file=@/path/to/chart.png http://127.0.0.1:8079/classify
```

#### Extending

- Add synonyms to `map_text_to_label()` in `vision_server.py` for better fallback (e.g., “ring” → donut, “bubble” → scatter).
- Restrict CORS in production (e.g., only your deployed domain) and remove debug console logs.
- Introduce additional chart types by updating `ALLOWED_CHART_TYPES` in `src/lib/state/style.ts` and the server’s `ALLOWED` set.

#### Safety & scope

Classification doesn’t extract or infer data values — it only guesses presentation style (chart family). Deterministic data fetching remains unchanged and authoritative.
import { z } from "zod";

export const UrbanParams = z.object({
  /** A path that starts with /api/v1/... (will be validated & prefixed) */
  path: z.string().regex(/^\/?api\/v1\//),
  /** Optional querystring filters, e.g. { fips: "11", grade: "3" } */
  filters: z.record(z.string(), z.string().or(z.number()).or(z.boolean())).default({}),
  /** Field to plot as numeric value (e.g., "enrollment", "count", "value") */
  valueField: z.string(),
  /** Field that represents year; defaults to "year" */
  yearField: z.string().default("year"),
  /** Optional dimension to split series (e.g., "race", "sex", "level") */
  seriesField: z.string().optional(),
  /** Optional: only include these series values */
  seriesAllow: z.array(z.string()).optional(),
});

export type UrbanParams = z.infer<typeof UrbanParams>;
type Row = { date: string; value: number; series?: string };

function qs(filters: Record<string, any>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export async function fetchUrban(p: UrbanParams): Promise<{ title: string; unit?: string; rows: Row[] }> {
  // strict host allow (we'll also add regex in allowlist)
  const base = "https://educationdata.urban.org";
  const url = `${base}/${p.path.replace(/^\//, "")}${qs(p.filters)}`;
  const resp = await fetch(url, { next: { revalidate: 86400 } });
  if (!resp.ok) throw new Error(`Urban API ${resp.status}`);
  const json: any = await resp.json();

  const data = Array.isArray(json?.results) ? json.results : (Array.isArray(json) ? json : []);
  const rows: Row[] = [];

  for (const r of data) {
    const y = Number(r?.[p.yearField]);
    const v = Number(r?.[p.valueField]);
    if (!Number.isFinite(y) || !Number.isFinite(v)) continue;
    const series = p.seriesField ? String(r?.[p.seriesField] ?? "") : undefined;
    if (p.seriesAllow && series && !p.seriesAllow.includes(series)) continue;
    rows.push({ date: `${y}-01-01`, value: v, series });
  }

  rows.sort((a,b) => a.date.localeCompare(b.date));
  return { title: "Urban Education Data", unit: undefined, rows };
}

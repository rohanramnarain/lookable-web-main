import { z } from "zod";
import { csvParse } from "d3-dsv";

export const OwidParams = z.object({
  indicator: z.enum(["co2", "life-expectancy"]), // extend later if needed
  countries: z.array(z.string()).default(["World"]), // ISO3 codes or names as shown by OWID
  startYear: z.number().int().optional(),
  endYear: z.number().int().optional(),
});

export type OwidParams = z.infer<typeof OwidParams>;

type Row = { date: string; value: number; series?: string; unit?: string };

async function fetchOwidCsv(chartId: string) {
  const url = `https://ourworldindata.org/grapher/${chartId}.csv?csvType=full&useColumnShortNames=true`;
  const resp = await fetch(url, { next: { revalidate: 86400 } });
  if (!resp.ok) throw new Error(`OWID ${chartId} ${resp.status}`);
  const text = await resp.text();
  return csvParse(text); // rows with columns: Entity, Code, Year, <valueCol>
}

async function fetchOwidMeta(chartId: string) {
  const url = `https://ourworldindata.org/grapher/${chartId}.metadata.json`;
  const resp = await fetch(url, { next: { revalidate: 86400 } });
  if (!resp.ok) return { title: chartId, unit: undefined as string | undefined };
  const meta = await resp.json();
  const chartTitle: string | undefined = meta?.chart?.title;
  // find the first data column and read its unit
  const cols = meta?.columns ? Object.values(meta.columns as Record<string, any>) : [];
  const firstData = cols.find((c: any) => c?.unit);
  return { title: chartTitle ?? chartId, unit: firstData?.unit as string | undefined };
}

/** indicator -> grapher chart id */
const CHARTS: Record<"co2" | "life-expectancy", string> = {
  co2: "co2",
  "life-expectancy": "life-expectancy",
};

export async function fetchOwid(p: OwidParams): Promise<{ title: string; unit?: string; rows: Row[] }> {
  const chartId = CHARTS[p.indicator];
  const [table, meta] = await Promise.all([fetchOwidCsv(chartId), fetchOwidMeta(chartId)]);
  // locate the data column (the last column after Entity,Code,Year)
  const columns = table.columns;
  const valueCol = columns[columns.length - 1];

  const want = new Set(p.countries.map(s => s.toLowerCase()));
  const rows: Row[] = [];

  for (const r of table) {
    const entity = String((r as any).Entity ?? "");
    const code = String((r as any).Code ?? "");
    const year = Number((r as any).Year);
    const val = Number((r as any)[valueCol]);

    if (!Number.isFinite(year) || !Number.isFinite(val)) continue;

    const inCountries =
      want.size === 0 ||
      want.has(entity.toLowerCase()) ||
      want.has(code.toLowerCase());

    const inRange =
      (p.startYear == null || year >= p.startYear) &&
      (p.endYear == null || year <= p.endYear);

    if (inCountries && inRange) {
      rows.push({
        date: `${year}-01-01`,
        value: val,
        series: entity,
        unit: meta.unit,
      });
    }
  }

  return { title: meta.title, unit: meta.unit, rows };
}

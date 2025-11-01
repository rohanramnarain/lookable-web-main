import { z } from "zod";
import JSZip from "jszip";
import { csvParse } from "d3-dsv";

export const EpaAqiParams = z.object({
  cbsaName: z.string(),                      // e.g., "New York-Newark-Jersey City, NY-NJ-PA"
  startYear: z.number().int(),
  endYear: z.number().int(),
});

export type EpaAqiParams = z.infer<typeof EpaAqiParams>;
type Row = { date: string; value: number; series?: string };

async function fetchZipAsText(url: string, innerCsvName: string): Promise<string> {
  const resp = await fetch(url, { next: { revalidate: 86400 } });
  if (!resp.ok) throw new Error(`EPA AirData ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  // inner file is typically same name but .csv
  const file = zip.file(innerCsvName);
  if (!file) throw new Error(`EPA zip missing ${innerCsvName}`);
  return await file.async("string");
}

/** Reads pre-generated files like daily_aqi_by_cbsa_2024.zip and filters to a CBSA name. */
export async function fetchDailyAqiByCbsa(p: EpaAqiParams): Promise<{ title: string; unit: string; rows: Row[] }> {
  const rows: Row[] = [];
  for (let y = p.startYear; y <= p.endYear; y++) {
    const base = `daily_aqi_by_cbsa_${y}`;
    const url = `https://aqs.epa.gov/aqsweb/airdata/${base}.zip`;
    const csv = await fetchZipAsText(url, `${base}.csv`);
    const table = csvParse(csv); // columns include: 'CBSA', 'CBSA Code', 'Date', 'AQI', 'Category', ...
    for (const r of table) {
      const cbsa = String((r as any)["CBSA"] ?? "");
      if (cbsa.toLowerCase() !== p.cbsaName.toLowerCase()) continue;
      const date = String((r as any)["Date"]);
      const aqi = Number((r as any)["AQI"]);
      if (!Number.isFinite(aqi) || !date) continue;
      rows.push({ date, value: aqi, series: p.cbsaName });
    }
  }
  rows.sort((a,b) => a.date.localeCompare(b.date));
  return { title: `Daily AQI — ${p.cbsaName}`, unit: "AQI", rows };
}

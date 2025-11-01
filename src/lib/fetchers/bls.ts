import { z } from "zod";

export const BlsRaceParams = z.object({
  races: z.array(z.enum(["white","black","asian","hispanic"])).default(["white","black","asian","hispanic"]),
  startYear: z.number().int().default(1972),
  endYear: z.number().int().default(new Date().getFullYear()),
  seasonallyAdjusted: z.boolean().default(true),
});

export type BlsRaceParams = z.infer<typeof BlsRaceParams>;
type Row = { date: string; value: number; series?: string; unit?: string };

const SERIES: Record<"white"|"black"|"asian"|"hispanic", string> = {
  white: "LNS14000003",
  black: "LNS14000006",
  asian: "LNS14000012",
  hispanic: "LNS14000009",
};

export async function fetchBlsUnempByRace(p: BlsRaceParams): Promise<{ title: string; unit: string; rows: Row[] }> {
  const seriesIds = p.races.map(r => SERIES[r]).join(",");
  const url = `https://api.bls.gov/publicAPI/v2/timeseries/data/${seriesIds}?start_year=${p.startYear}&end_year=${p.endYear}`;
  const resp = await fetch(url, { method: "GET", next: { revalidate: 86400 } });
  if (!resp.ok) throw new Error(`BLS ${resp.status}`);
  const json: any = await resp.json();

  const rows: Row[] = [];
  for (const s of json?.Results?.series ?? []) {
    const id = s?.seriesID as string;
    const race = (Object.entries(SERIES).find(([,v]) => v === id)?.[0] ?? id).toString();
    for (const d of s?.data ?? []) {
      const y = String(d?.year);
      const m = String(d?.period).replace("M", "").padStart(2, "0");
      const v = Number(d?.value);
      if (!Number.isFinite(v)) continue;
      rows.push({ date: `${y}-${m}-01`, value: v, series: race, unit: "%" });
    }
  }
  rows.sort((a,b) => a.date.localeCompare(b.date));
  return { title: "Unemployment rate by race (CPS)", unit: "%", rows };
}

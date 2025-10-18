// /mnt/data/openmeteo.ts
export async function fetchOpenMeteo(lat: number, lon: number) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Open-Meteo fetch failed");
  const json = await res.json();

  const rows = json?.hourly?.time?.map((t: string, i: number) => ({
    time: t,
    temperature: json.hourly.temperature_2m[i],
  })) ?? [];

  const unit = json?.hourly_units?.temperature_2m;      // "°C"
  const yLabel = unit ? `Temperature (${unit})` : "Temperature";

  return {
    rows,
    provenance: { source: "Open-Meteo", url },
    yLabel,                                             // <-- key!
  };
}


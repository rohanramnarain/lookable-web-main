export async function fetchWDI(
  indicator: string,
  country = "USA",
  start = 2000,
  end = new Date().getFullYear()
) {
  const iso3 = country.toUpperCase();
  const base = `https://api.worldbank.org/v2/country/${iso3}/indicator/${indicator}`;
  const url = `${base}?date=${start}:${end}&format=json&per_page=20000`;

  let res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`World Bank fetch failed: ${res.status}`);
  let json = await res.json();

  // Pull the official indicator display name from the payload
  const indicatorLabel =
    (Array.isArray(json?.[1]) &&
      json[1].find((r: any) => r?.indicator?.value)?.indicator?.value) ||
    indicator; // fallback to the code

  let rows =
    (json?.[1] ?? [])
      .map((r: any) => ({ year: Number(r.date), value: r.value == null ? null : Number(r.value) }))
      .filter((r: any) => Number.isFinite(r.value))
      .sort((a: any, b: any) => a.year - b.year);

  // Fallback: if window is empty (lagged data, wrong code), fetch full series and slice recent years.
  if (!rows.length) {
    const urlAll = `${base}?format=json&per_page=20000`;
    res = await fetch(urlAll, { headers: { Accept: "application/json" } });
    if (res.ok) {
      json = await res.json();
      const all =
        (json?.[1] ?? [])
          .map((r: any) => ({ year: Number(r.date), value: r.value == null ? null : Number(r.value) }))
          .filter((r: any) => Number.isFinite(r.value))
          .sort((a: any, b: any) => a.year - b.year);
      rows = all.slice(-6);
    }
  }

  // Return the official y-axis label from the API
  return { rows, provenance: { source: "World Bank WDI", url }, yLabel: indicatorLabel };
}

// app/api/geo/iso3/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Tiny local fallback so we never 500 for common countries */
function fallbackIso3(q: string): string | undefined {
  const s = String(q).toLowerCase();
  const pairs: Array<[RegExp, string]> = [
    [/\bjapan\b|\bjpn\b/, "JPN"],
    [/\bchina\b|\bchn\b|\bprc\b/, "CHN"],
    [/\bindia\b|\bind\b/, "IND"],
    [/\bunited\s+states\b|\busa\b|\bu\.?s\.?a?\.?\b|\bamerica\b/, "USA"],
    [/\bunited\s+kingdom\b|\buk\b|\bu\.?k\.?|\bgreat\s+britain\b|\bengland\b|\bgbr\b/, "GBR"],
    [/\bgermany\b|\bdeu\b/, "DEU"],
    [/\bfrance\b|\bfra\b/, "FRA"],
    [/\bcanada\b|\bcan\b/, "CAN"],
    [/\bitaly\b|\bita\b/, "ITA"],
    [/\bspain\b|\besp\b/, "ESP"],
    [/\bbrazil\b|\bbra\b/, "BRA"],
    [/\bmexico\b|\bmex\b/, "MEX"],
    [/\brussia\b|\brussian\s+federation\b|\brus\b/, "RUS"],
    [/\bsouth\s+korea\b|\brepublic\s+of\s+korea\b|\bkor\b/, "KOR"],
    [/\bsouth\s+africa\b|\bzaf\b/, "ZAF"],
    [/\bnigeria\b|\bnga\b/, "NGA"],
    [/\begypt\b|\begy\b/, "EGY"],
    [/\bturkey\b|\bturkiye\b|\btur\b/, "TUR"],
    [/\bindonesia\b|\bidn\b/, "IDN"],
    [/\bpakistan\b|\bpak\b/, "PAK"],
    [/\biran\b|\birn\b/, "IRN"],
    [/\btaiwan\b|\btwn\b/, "TWN"],
    [/\bhong\s*kong\b|\bhkg\b/, "HKG"],
    [/\bnetherlands\b|\bnld\b|\bholland\b/, "NLD"],
    [/\bswitzerland\b|\bche\b/, "CHE"],
    [/\bsweden\b|\bswe\b/, "SWE"],
    [/\bnorway\b|\bnor\b/, "NOR"],
    [/\baustralia\b|\baus\b/, "AUS"],
  ];
  for (const [re, iso] of pairs) if (re.test(s)) return iso;
  const m = s.match(/\b[a-z]{3}\b/i);
  return m ? m[0].toUpperCase() : undefined;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  try {
    // Lazy-import so import-time failures don't 500 the route.
    const mod = await import("@/lib/countryIndex").catch(() => null);

    if (mod?.iso3FromQuery) {
      try {
        const iso3 = await mod.iso3FromQuery(q);
        return NextResponse.json({ iso3: iso3 ?? fallbackIso3(q) });
      } catch (e) {
        // If iso3FromQuery throws, still succeed with fallback
        return NextResponse.json({ iso3: fallbackIso3(q), error: String(e) }, { status: 200 });
      }
    }

    // If module couldn't be imported, still return 200 with fallback
    return NextResponse.json({ iso3: fallbackIso3(q) }, { status: 200 });
  } catch (err: any) {
    // Absolute last resort — never send 500 to the client for this endpoint
    return NextResponse.json(
      { iso3: fallbackIso3(q), error: String(err?.message ?? err) },
      { status: 200 }
    );
  }
}

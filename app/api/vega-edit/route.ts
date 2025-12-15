import { NextResponse } from "next/server";

const EDIT_API = process.env.QWEN_EDIT_API || "http://127.0.0.1:3002/api/edit-vega";

export async function POST(req: Request) {
  try {
    const { spec, instruction } = await req.json();
    if (!spec || !instruction) {
      return NextResponse.json({ error: "spec and instruction are required" }, { status: 400 });
    }

    const res = await fetch(EDIT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spec, instruction }),
    });

    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || "edit service error");
    }

    const data = await res.json();
    if (!data?.spec) {
      throw new Error("edit service returned no spec");
    }

    return NextResponse.json({ spec: data.spec });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to edit spec" }, { status: 500 });
  }
}

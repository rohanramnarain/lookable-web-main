"use server";

import { runSource } from "@/lib/runSource";
import { isMetricId } from "@/lib/catalog";

export type ServerOut = {
  rows: Array<{ date?: string; time?: string; year?: string | number; value: number; series?: string }>;
  yLabel?: string;
  title?: string;
  provenance: { source: string; url: string; license?: string };
};

/** Execute a data plan on the server to avoid browser CORS. */
export async function getDataForPlan(plan: { metricId: string; params?: Record<string, any> }): Promise<ServerOut> {
  try {
    const { metricId, params } = plan || ({} as any);
    if (!isMetricId(metricId)) {
      throw new Error(`Unknown metricId: ${metricId}`);
    }
    return await runSource(metricId as any, params || {});
  } catch (err: any) {
    console.error("getDataForPlan error:", err?.stack || err);
    // Normalize error shape so the client shows a helpful message
    throw new Error(err?.message || "Server failed to fetch data");
  }
}

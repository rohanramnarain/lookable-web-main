import { z } from "zod";

const VLType = z.enum(["ordinal", "quantitative", "temporal", "nominal"]);

// x/y can be "year" OR { field:"year", type:"temporal", title?:string }
const VLField = z.union([
  z.string(),
  z.object({
    field: z.string().optional(),
    type: VLType.optional(),
    title: z.string().optional()
  }).partial()
]);

export const ChartMetaSchema = z.object({
  mark: z.enum(["line", "bar", "area", "point"]).default("line"),
  title: z.string().optional(),
  x: VLField.optional(),
  y: VLField.optional()
});

export const PlanSchema = z.object({
  metricId: z.string(), // LLM picks from our catalog
  params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  chart: ChartMetaSchema.optional().default({ mark: "line" }), // <-- valid default
  note: z.string().optional()
});

export type Plan = z.infer<typeof PlanSchema>;

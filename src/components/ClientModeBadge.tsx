"use client";

import { useEffect, useState } from "react";
import { getFlags, subscribe, getStyleConfig } from "@/lib/state/style";

export default function ClientModeBadge() {
  const [flags, setFlags] = useState(getFlags());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const unsub = subscribe(() => setFlags(getFlags()));
    setMounted(true);
    return () => { try { unsub(); } catch {} };
  }, []);

  // Avoid hydration mismatches: render stable placeholders until after mount
  const visionText = mounted ? (flags.visionUsed ? "Vision: Used" : "Vision: Fallback") : "Vision: …";
  const modeText = mounted ? (flags.clientOnly ? "Inference: Client-only" : "Inference: Mixed") : "Inference: …";
  const styleLoaded = mounted && !!getStyleConfig();

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <span className="badge" title="Whether a vision classifier was used for chart type" suppressHydrationWarning>
        {visionText}
      </span>
      <span className="badge" title="Whether the end-to-end run avoided server calls" suppressHydrationWarning>
        {modeText}
      </span>
      {styleLoaded && (
        <span className="badge" title="A style preset is loaded and will be applied" suppressHydrationWarning>
          Style: Loaded
        </span>
      )}
    </div>
  );
}

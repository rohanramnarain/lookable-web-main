"use client";

import React from "react";
import { hasUserConsented, setUserConsent } from "../lib/webllm";

export default function ModelConsent({ onChange }: { onChange?: (v: boolean) => void }) {
  const [consented, setConsented] = React.useState<boolean>(() => {
    try {
      return hasUserConsented();
    } catch {
      return false;
    }
  });

  React.useEffect(() => onChange?.(consented), [consented, onChange]);

  return (
    <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8, maxWidth: 680 }}>
      <h3 style={{ margin: "0 0 8px" }}>Enable in-browser model (local-dev)</h3>
      <p style={{ margin: "0 0 8px" }}>
        If you enable this, the app will attempt to load a model from <code>/models/test</code>.
        This is intended for local testing only. Real model weights are large — do not
        enable this in production unless you understand the license and hosting.
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={consented}
            onChange={(e) => {
              const v = e.target.checked;
              setUserConsent(v);
              setConsented(v);
            }}
          />
          <span>I accept the model license and consent to download model files.</span>
        </label>
        <a href="/docs/licenses/Tongyi_Qianwen_LICENSE.txt" target="_blank" rel="noreferrer" style={{ marginLeft: "auto" }}>
          View license
        </a>
      </div>
    </div>
  );
}

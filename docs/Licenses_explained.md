## Licenses and Usage: lookable-web (summary)

This document explains the licenses and practical obligations for the software dependencies, the public datasets the app fetches, and the machine learning models that the repository references or could load via `@mlc-ai/web-llm`.

Purpose: help engineers and maintainers understand what they must do to remain compliant when shipping, redistributing, or using the app and its outputs.

---

## Project context (short)

- Repo: a Next.js + TypeScript web app that fetches public datasets (World Bank, OWID, EPA AQS, BLS, Urban Institute, Open-Meteo, etc.) and contains a declared dependency on `@mlc-ai/web-llm` (see package.json) for in-browser LLM inference. The planner code currently uses deterministic rules and `ensureEngine()` is a no-op placeholder (no model loaded by default).
- Important: the repository declares `@mlc-ai/web-llm` but does not ship any LLM model weights. Any usage of a model (e.g., Qwen) requires fetching model weights from third-party sources and accepting that model's license.

---

## Key JavaScript/TypeScript dependencies (from package.json)

Listed below are the direct runtime dependencies and short license notes. See `package.json` for exact versions.

- @mlc-ai/web-llm (^0.2.79) — Apache-2.0
  - What it is: an in-browser (WebAssembly / WebGPU) runtime for running supported model weights in the browser.
  - Implication: Apache-2.0 is permissive but requires preserving the license and NOTICE text in redistributed binaries and grants a patent license. You must include the Apache license text when redistributing the web-llm code.

- next (15.5.5) — MIT
- react (19.1.0) and react-dom (19.1.0) — MIT
- zod (^4.1.12) — MIT
  - MIT is permissive; include copyright notice in redistributed code if you ship compiled bundles.

- vega, vega-lite, vega-embed (vega ^6.2.0, vega-lite ^6.4.1, vega-embed ^7.1.0) — BSD-3-Clause
  - BSD-3 is permissive; keep the copyright/attribution and license text.

- d3-dsv (^3.0.1) — ISC (permissive)

- jszip (^3.10.1) — historically available under MIT or dual MIT/GPL; check bundled package's license file before redistribution
  - If your final redistributed product uses the GPL option (or a GPL-licensed version of jszip), GPL's requirements (copyleft) may apply to the combined work. In practice, npm-distributed jszip is MIT-licensed; verify `node_modules/jszip/LICENSE` before shipping.

Notes: transitive dependencies may have other licenses (some permissive, some copyleft). When redistributing a bundled app (for example a packaged Electron app or server-side container), run an automated license scanner (e.g., `license-checker`, `npm ls --prod --json` + tool) to produce the full inventory.

---

## Machine learning models and `@mlc-ai/web-llm`

- `@mlc-ai/web-llm` (Apache-2.0) is only an inference engine. It does not include model weights.
- The engine advertises built-in support for many families (Qwen, Llama, Mistral, Phi, Gemma, etc.). Each model family and distribution has its own license and obligations.

Most important example discovered during research: Qwen (Tongyi Qianwen) models.

### Qwen (Tongyi Qianwen) — license highlights (plain English)

- License name: "Tongyi Qianwen LICENSE AGREEMENT" (a custom license / agreement distributed by Alibaba/Tongyi Qianwen for certain model weights).
- Key practical clauses (summary):
  - Limited, non-exclusive license: Alibaba grants a limited license to use the model weights/materials per the Agreement; you must follow the Agreement's terms.
  - Redistribution/NOTICE: copies and redistributions of the model weights must include the Agreement and preserve any notices. If you redistribute model files you must include the license text and any NOTICE files required by the provider.
  - Commercial threshold: the Agreement specifically calls out a commercial-use threshold (for example, if your service reaches or expects >100 million monthly active users) you must contact Alibaba/obtain a commercial license or authorization. (Exact threshold and trigger conditions are defined in the Agreement — verify the raw text for precise terms.)
  - No-improvement restriction: the Agreement includes a restriction that you may not use the Materials or outputs to improve, train, or develop other LLMs (i.e., you cannot use outputs to further train a competing LLM). This is an important practical limit: do NOT use Qwen outputs as training data for another LLM unless the Agreement explicitly allows it.
  - Warranty/disclaimer and indemnity: model weights are usually provided "AS IS"; the Agreement contains limitations of liability and indemnification language.
  - Governing law / jurisdiction: the Agreement designates mainland China / Hangzhou courts as the exclusive jurisdiction in many clauses. This matters for legal risk assessment.

Implications for this repo:
  - If you (or the project) fetch any Qwen weights and use them with `@mlc-ai/web-llm`, you must accept and comply with the Tongyi Qianwen Agreement. Keep a copy of the Agreement in your repo's `docs/licenses/` when you use the model.
  - Do not use outputs to train or improve other LLMs unless you have explicit permission.
  - If you plan to commercially offer the service at scale (especially near the threshold described in the Agreement), consult Alibaba and legal counsel to obtain the correct license.

### Practical: model provenance and distribution

- The repository currently does not include model files. Model weights are heavy and typically downloaded separately from model hubs (Hugging Face, Alibaba model hub, etc.). Each download page has the authoritative license. Always record and commit which model release (version + URL) you used and copy its license text to a `docs/licenses/` subfolder.

---

## Public data sources used by the app (and typical licenses / notes)

The app includes fetchers for these sources (see `src/lib/fetchers/*`). Each dataset has its own license or terms — treat them individually.

- Our World in Data (OWID)
  - Summary: OWID states that charts, articles, and data are licensed under CC BY 4.0 unless stated otherwise.
  - Practical: CC BY 4.0 requires attribution. When publishing derived data/visualizations, include a citation (e.g., "source: Our World in Data") and keep any required notices.

- World Bank (World Development Indicators / WDI)
  - Typical license: World Bank Open Data is published under the Creative Commons Attribution 4.0 International (CC BY 4.0) license or an open-data policy. Verify the specific dataset page; if you redistribute exported CSVs, include the World Bank attribution.
  - Action: confirm the license on the World Bank site for the specific API endpoint you use and include citation text.

- BLS (U.S. Bureau of Labor Statistics)
  - Most BLS data and publications are public domain (U.S. federal government works) unless otherwise noted.
  - Practical: you can reuse the data but still follow BLS guidelines for proper citation and note any dataset disclaimers.

- EPA AQS / AirData
  - The EPA provides API documentation and requires sign-up for keys. Data is generally publicly available; the AQS API documentation includes usage limits and asks users to limit large automated queries. Confirm any reuse policy on EPA pages or contact them if you plan large-scale redistribution.
  - Practical: follow API usage and rate-limit guidance and attribute the EPA as the data source.

- Urban Institute — Education Data Portal
  - The Education Data Portal pages explicitly state that data is licensed under the Open Data Commons Attribution License (ODC-By) v1.0.
  - ODC-By requires attribution. Follow the example citation they provide when publishing derived results.

- Open-Meteo
  - Open-Meteo publishes API docs and a licence page; it offers free access and a pricing model for commercial/reserved resources. Confirm the exact terms on their licence/terms page for your intended use (especially if you hit high-volume or commercial usage).

General guidance for data sources:
  - Always record the exact API URL and date you pulled data from, and include a brief provenance entry in any exported dataset or published visualization.
  - Respect rate limits and API keys; do not automate large downloads that could violate usage terms.
  - For derived data/visualizations, include attribution and link back to the original source.

---

## Export controls & other legal notes

- Some machine learning models and model weights may be subject to export controls depending on your jurisdiction, the model architecture, and how you deploy them. This repo itself is just source code, but if you plan to ship models or a hosted inference service, consult export-control guidance and legal counsel.
- Model licenses sometimes add geographical or field-of-use restrictions; always read the full license/agreement of any model you download.

---

## Practical compliance checklist (recommended immediate steps)

1. Add a `docs/licenses/` folder and copy into it the raw license files for any model weights you plan to use (e.g., Tongyi Qianwen LICENSE AGREEMENT). Also copy the `@mlc-ai/web-llm` Apache-2.0 LICENSE and any NOTICE files.
2. Add a short `NOTICE.md` at repo root with a list: dependencies that require attribution (Apache, BSD, CC BY, ODC-By), and the file paths where those licenses are stored.
3. If you will use Qwen (or any model with a custom agreement): keep a copy of the supplier's Agreement and a short README explaining the obligations (commercial thresholds, no-improvement clause, jurisdiction), and require that any deployer read and confirm compliance before deploying.
4. If you redistribute a compiled/bundled app (server container, Electron binary), run a license inventory tool and attach a `THIRD_PARTY_LICENSES.txt` file to the release.
5. Confirm the exact license of `jszip` in `node_modules/jszip/LICENSE` — if your packaging pulls a GPL variant, review implications. Prefer a clear MIT-licensed build when you want to avoid GPL copyleft.
6. For datasets:
   - Save a short provenance record with each dataset pull (timestamp, endpoint URL, dataset version if provided) and include required citations.
   - Respect API rate limits and keys for EPA/BLS/other provider APIs.
7. If you intend to use outputs from any model for training/finetuning other models, explicitly check that model's license — Qwen's agreement prohibits using outputs to improve other LLMs unless permitted.
8. If you plan to offer the application as a commercial hosted service at scale, consult counsel re: the Qwen (Tongyi) commercial threshold and contact the model owner if necessary.

---

## Recommended repo housekeeping (low-effort, high-value)

- Add `docs/licenses/` and `docs/Licenses_explained.md` (this file) to source control.
- Add an automated `npm run license-check` script (or GitHub Action) that uses `license-checker` or `oss-license-report` to produce a bill-of-materials for third-party licenses.
- If you don't plan to use `@mlc-ai/web-llm`, consider removing it from package.json to avoid confusion about which models are being used.
- When you enable `web-llm` to load models, add a small docs page that records the model name, version, source URL, and license text.

---

## Where I pulled model & license info (authoritative links)

- @mlc-ai/web-llm (project + Apache-2.0): https://github.com/mlc-ai/web-llm (and its LICENSE file)
- Qwen model pages & Tongyi Qianwen LICENSE AGREEMENT: (model host pages such as Hugging Face / Alibaba model hub contain the raw Agreement; keep a copy when you download weights)
- OWID: Our World in Data pages (data licensed CC BY 4.0) — see OWID site and data pages
- Urban Institute Education Data Portal: documentation shows ODC-By v1.0
- EPA AQS API docs: https://aqs.epa.gov/aqsweb/documents/data_api.html (API usage terms & technical notes)
- Open-Meteo: https://open-meteo.com/en/docs (license & pricing links on their site)

- Local copies included in this repository:
  - `docs/licenses/APACHE-2.0.txt` — copy of the Apache License, Version 2.0 (for `@mlc-ai/web-llm`).
  - `docs/licenses/Tongyi_Qianwen_LICENSE.txt` — repository copy / maintainer instructions for the Tongyi Qianwen Agreement (replace with the full authoritative copy if you keep model weights locally).

Always rely on the original license text hosted by the dataset/model owner as the authoritative source.

---

If you'd like, I can: 
- add a `docs/licenses/` folder and copy into it the raw license text I already fetched (web-llm Apache-2.0 and the Tongyi Qianwen Agreement excerpt),
- add an automated license report (script + GitHub Action), and
- optionally remove `@mlc-ai/web-llm` from package.json if you aren't using it.

If you want me to proceed with any of those actions, tell me which and I'll implement them now.

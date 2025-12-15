#!/usr/bin/env node
// Lightweight local bridge to edit Vega/Vega-Lite specs using a local Qwen model via Ollama.
// Run with: node tools/qwen-edit.cjs (requires Ollama running on localhost:11434)

const express = require('express');

const PORT = process.env.QWEN_EDIT_PORT || 3002;
const MODEL = process.env.QWEN_EDIT_MODEL || 'qwen2.5-coder:latest';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434/api/generate';

const app = express();
app.use(express.json({ limit: '1mb' }));

app.post('/api/edit-vega', async (req, res) => {
  const { spec, instruction } = req.body || {};
  if (!spec || !instruction) {
    return res.status(400).json({ error: 'spec and instruction are required' });
  }

  const prompt = `You are an expert Vega/Vega-Lite engineer. The user will give you a JSON spec and an instruction. Return ONLY the modified JSON spec, no prose, no markdown.
Instruction:\n${instruction}\n\nCurrent spec JSON:\n${JSON.stringify(spec, null, 2)}\n`;

  try {
    const ollamaResp = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        prompt,
        stream: false,
      }),
    });

    if (!ollamaResp.ok) {
      const text = await ollamaResp.text();
      throw new Error(`Ollama error: ${text}`);
    }

    const data = await ollamaResp.json();
    const raw = data?.response || '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Model did not return JSON');

    let updated;
    try {
      updated = JSON.parse(match[0]);
    } catch (err) {
      throw new Error('Failed to parse model JSON');
    }

    return res.json({ spec: updated });
  } catch (err) {
    console.error('[qwen-edit] error:', err.message || err);
    return res.status(500).json({ error: 'Failed to edit spec' });
  }
});

app.listen(PORT, () => {
  console.log(`[qwen-edit] listening on http://127.0.0.1:${PORT}/api/edit-vega using model ${MODEL}`);
});

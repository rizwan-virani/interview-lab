/* ============================================================================
   engine.js — unified local-inference layer for the OpenSource AI Learning Lab
   ----------------------------------------------------------------------------
   Three interchangeable backends behind ONE async API so every lab can call
   the same functions regardless of what the student picked:

     1. "ollama"     — real models on the student's machine (localhost:11434)
     2. "webllm"     — a real small model in the browser via WebGPU (no install)
     3. "simulation" — rule-based mock generator, always available, zero setup

   Public surface used by the UI:
     detectOllama()               -> { ok, models: string[] }
     webgpuSupported()            -> boolean
     loadWebLLM(model, onProgress)-> Promise (resolves when ready)
     generate(engineState, opts)  -> { text, promptTokens, evalTokens, tps, engine }
     chat(engineState, opts)      -> same shape, message-array input
     tokenCount(engineState, text)-> Promise<number | null>   (real when possible)

   `engineState` is the object the app keeps in React state:
     { backend: "ollama"|"webllm"|"simulation", model, ready, webllmEngine }
   ============================================================================ */

export const OLLAMA_URL = "http://localhost:11434";

/* Curated WebLLM model list — small enough to download and run on a laptop. */
export const WEBLLM_MODELS = [
  { id: "Llama-3.2-1B-Instruct-q4f32_1-MLC", label: "Llama 3.2 1B", size: "~0.9 GB" },
  { id: "Llama-3.2-3B-Instruct-q4f32_1-MLC", label: "Llama 3.2 3B", size: "~2.2 GB" },
  { id: "Qwen2.5-1.5B-Instruct-q4f32_1-MLC", label: "Qwen 2.5 1.5B", size: "~1.1 GB" },
  { id: "Phi-3.5-mini-instruct-q4f16_1-MLC", label: "Phi 3.5 mini", size: "~2.4 GB" },
];

export const DEFAULT_WEBLLM_MODEL = WEBLLM_MODELS[0].id;

/* ----------------------------- Ollama backend ---------------------------- */

export async function detectOllama() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return { ok: false, models: [] };
    const data = await res.json();
    const models = (data.models || []).map((m) => m.name);
    return { ok: true, models };
  } catch {
    return { ok: false, models: [] };
  }
}

async function ollamaGenerate({ model, system, prompt, options }) {
  const started = performance.now();
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      system: system || undefined,
      stream: false,
      options: options || {},
    }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = await res.json();
  const elapsed = (performance.now() - started) / 1000;
  const evalTokens = data.eval_count || 0;
  return {
    text: data.response ?? "",
    promptTokens: data.prompt_eval_count || 0,
    evalTokens,
    tps: elapsed > 0 ? Math.round(evalTokens / elapsed) : 0,
    engine: "ollama",
  };
}

async function ollamaChat({ model, messages, options }) {
  const started = performance.now();
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: false, options: options || {} }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = await res.json();
  const elapsed = (performance.now() - started) / 1000;
  const evalTokens = data.eval_count || 0;
  return {
    text: data.message?.content ?? "",
    promptTokens: data.prompt_eval_count || 0,
    evalTokens,
    tps: elapsed > 0 ? Math.round(evalTokens / elapsed) : 0,
    engine: "ollama",
  };
}

/* Real prompt-token count: ask Ollama to evaluate the text with 0 new tokens. */
async function ollamaTokenCount(model, text) {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: text,
        stream: false,
        options: { num_predict: 0 },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.prompt_eval_count ?? null;
  } catch {
    return null;
  }
}

/* ----------------------------- WebLLM backend ---------------------------- */

export function webgpuSupported() {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

/* Lazy-loaded so the heavy WebGPU runtime only downloads when actually chosen. */
export async function loadWebLLM(model, onProgress) {
  const webllm = await import("@mlc-ai/web-llm");
  const engine = await webllm.CreateMLCEngine(model, {
    initProgressCallback: (report) => {
      if (onProgress) onProgress(report);
    },
  });
  return engine;
}

async function webllmChat(engine, { messages, options }) {
  const started = performance.now();
  const reply = await engine.chat.completions.create({
    messages,
    temperature: options?.temperature ?? 0.7,
    top_p: options?.top_p ?? 0.95,
    max_tokens: options?.num_predict ?? 512,
  });
  const elapsed = (performance.now() - started) / 1000;
  const text = reply.choices?.[0]?.message?.content ?? "";
  const evalTokens = reply.usage?.completion_tokens || 0;
  return {
    text,
    promptTokens: reply.usage?.prompt_tokens || 0,
    evalTokens,
    tps: elapsed > 0 ? Math.round(evalTokens / elapsed) : 0,
    engine: "webllm",
  };
}

/* ---------------------------- Simulation backend -------------------------- */
/* Rule-based, parameter-aware mock generator. Not canned: it reacts to
   temperature, seed, and prompt content so the labs still "move" with no
   backend. Deterministic given (prompt, options) — no Date/Math.random. */

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const SIM_WORDBANK = {
  calm: ["clear", "steady", "measured", "precise", "grounded", "consistent"],
  wild: ["kaleidoscopic", "thunderous", "electric", "fractal", "unhinged", "molten"],
};

function simGenerate({ system, prompt, options }) {
  const temp = options?.temperature ?? 0.7;
  const seed = (options?.seed ?? 0) + hashString(prompt + (system || ""));
  const words = temp > 1.0 ? SIM_WORDBANK.wild : SIM_WORDBANK.calm;
  const pick = (i) => words[(seed + i) % words.length];

  let text;
  if (temp <= 0.2) {
    text = `[simulation] A deterministic response to: "${prompt.slice(0, 60)}". The same input yields the same ${pick(0)} output every time.`;
  } else if (temp <= 1.0) {
    text = `[simulation] A ${pick(0)}, ${pick(1)} response drawing on the prompt. Sampling at temperature ${temp.toFixed(2)} introduces some variety while staying coherent.`;
  } else {
    text = `[simulation] ${pick(0)} ${pick(2)}!! the ${pick(1)} — words scatter at temp ${temp.toFixed(2)}, coherence ${pick(3)} dissolving into ${pick(4)} noise…`;
  }
  const evalTokens = Math.max(8, Math.round(text.length / 4));
  return {
    text,
    promptTokens: Math.round((prompt.length + (system?.length || 0)) / 4),
    evalTokens,
    tps: temp > 1.0 ? 30 : 42,
    engine: "simulation",
  };
}

/* ------------------------------ Streaming -------------------------------- */
/* Same result shape as chat(), but invokes onDelta(textChunk) as tokens arrive
   so the UI can render generation live. Honors an optional AbortSignal so a
   "Stop" button can interrupt a long response. */

async function webllmChatStream(engine, { messages, options }, onDelta, signal) {
  const started = performance.now();
  const stream = await engine.chat.completions.create({
    messages,
    temperature: options?.temperature ?? 0.7,
    top_p: options?.top_p ?? 0.95,
    max_tokens: options?.num_predict ?? 512,
    stream: true,
    stream_options: { include_usage: true },
  });
  if (signal) signal.addEventListener("abort", () => { try { engine.interruptGenerate(); } catch { /* noop */ } });
  let text = "";
  let usage = null;
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content || "";
    if (delta) { text += delta; onDelta?.(delta); }
    if (chunk.usage) usage = chunk.usage;
  }
  const elapsed = (performance.now() - started) / 1000;
  const evalTokens = usage?.completion_tokens || 0;
  return { text, promptTokens: usage?.prompt_tokens || 0, evalTokens, tps: elapsed > 0 && evalTokens ? Math.round(evalTokens / elapsed) : 0, engine: "webllm" };
}

async function ollamaChatStream({ model, messages, options }, onDelta, signal) {
  const started = performance.now();
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true, options: options || {} }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Ollama HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "", buf = "", promptTokens = 0, evalTokens = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      const delta = obj.message?.content || "";
      if (delta) { text += delta; onDelta?.(delta); }
      if (obj.prompt_eval_count) promptTokens = obj.prompt_eval_count;
      if (obj.eval_count) evalTokens = obj.eval_count;
    }
  }
  const elapsed = (performance.now() - started) / 1000;
  return { text, promptTokens, evalTokens, tps: elapsed > 0 && evalTokens ? Math.round(evalTokens / elapsed) : 0, engine: "ollama" };
}

async function simChatStream({ messages, options }, onDelta, signal) {
  const last = [...(messages || [])].reverse().find((m) => m.role === "user");
  const sys = (messages || []).find((m) => m.role === "system");
  const full = simGenerate({ system: sys?.content, prompt: last?.content || "", options });
  const parts = full.text.split(/(\s+)/); // keep the whitespace so spacing survives
  for (const p of parts) {
    if (signal?.aborted) break;
    onDelta?.(p);
    await new Promise((r) => setTimeout(r, 16));
  }
  return full;
}

/* ------------------------------ Unified API ------------------------------ */

export async function chatStream(engineState, opts, onDelta, signal) {
  const { backend, model, webllmEngine } = engineState;
  if (backend === "ollama") return ollamaChatStream({ model, ...opts }, onDelta, signal);
  if (backend === "webllm" && webllmEngine) return webllmChatStream(webllmEngine, opts, onDelta, signal);
  return simChatStream(opts, onDelta, signal);
}

export async function generate(engineState, opts) {
  const { backend, model, webllmEngine } = engineState;
  if (backend === "ollama") {
    return ollamaGenerate({ model, ...opts });
  }
  if (backend === "webllm" && webllmEngine) {
    const messages = [];
    if (opts.system) messages.push({ role: "system", content: opts.system });
    messages.push({ role: "user", content: opts.prompt });
    return webllmChat(webllmEngine, { messages, options: opts.options });
  }
  return simGenerate(opts);
}

export async function chat(engineState, opts) {
  const { backend, model, webllmEngine } = engineState;
  if (backend === "ollama") {
    return ollamaChat({ model, ...opts });
  }
  if (backend === "webllm" && webllmEngine) {
    return webllmChat(webllmEngine, opts);
  }
  // simulation: fold the last user message into a generate call
  const last = [...(opts.messages || [])].reverse().find((m) => m.role === "user");
  const sys = (opts.messages || []).find((m) => m.role === "system");
  return simGenerate({
    system: sys?.content,
    prompt: last?.content || "",
    options: opts.options,
  });
}

export async function tokenCount(engineState, text) {
  if (engineState.backend === "ollama") {
    return ollamaTokenCount(engineState.model, text);
  }
  // no cheap exact tokenizer for webllm/simulation → signal "estimate"
  return null;
}

/* Rough subword estimate used when no real tokenizer is available. */
export function estimateTokens(text) {
  if (!text) return 0;
  // ~4 chars/token heuristic, with a small bump for whitespace-heavy text
  return Math.max(1, Math.round(text.trim().length / 4));
}

export const ENGINE_INFO = {
  ollama: {
    label: "Ollama (local machine)",
    tagline: "Real models running on your own computer",
    benefits: [
      "Runs full-size real models (Llama 3, Mistral, Gemma, Phi…) at native speed.",
      "Genuinely 100% local — prompts never leave your machine, zero cloud.",
      "Any model you have pulled with `ollama pull` shows up automatically.",
    ],
    limits: [
      "Requires installing Ollama and pulling at least one model.",
      "You must start it so the browser may connect (one env var — see setup).",
      "Uses your CPU/GPU and RAM while generating.",
    ],
    privacy: "verified-local",
  },
  webllm: {
    label: "WebLLM (in-browser GPU)",
    tagline: "A real small model running inside this browser tab",
    benefits: [
      "Zero install — a real model runs on your GPU via WebGPU.",
      "After the one-time download, inference is fully offline and private.",
      "Great for sampling, tokenization, and prompting labs.",
    ],
    limits: [
      "One-time model download (~1–2 GB) from a public CDN the first time.",
      "Needs a recent browser with WebGPU (Chrome/Edge) and a capable GPU.",
      "Models are small, so complex reasoning demos are weaker than Ollama.",
    ],
    privacy: "download-then-local",
  },
  simulation: {
    label: "Simulation (no setup)",
    tagline: "Rule-based mock engine — works anywhere, instantly",
    benefits: [
      "Nothing to install; works on any device and browser.",
      "Deterministic and reproducible — ideal for guided walk-throughs.",
      "Zero network of any kind.",
    ],
    limits: [
      "Not a real model — outputs are illustrative, not genuine inference.",
      "Cannot surprise you the way a real model can.",
    ],
    privacy: "verified-local",
  },
};

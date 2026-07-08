import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ShieldAlert, Headphones, Network, Server, Cloud, Crosshair, ClipboardCheck, BarChart3,
  Mic, MicOff, Volume2, VolumeX, Send, Square, RotateCcw, Sparkles, ShieldCheck, ArrowRight,
  ArrowLeft, Cpu, Loader2, CheckCircle2, AlertTriangle, MessageSquare, Clock, Radio, Trophy, Info,
} from "lucide-react";

import { ROLES, getRole } from "./roles.js";
import { MODES, DIFFICULTIES, ask, gradeInterview } from "./interviewer.js";
import {
  webgpuSupported, loadWebLLM, WEBLLM_MODELS, DEFAULT_WEBLLM_MODEL, detectOllama,
} from "./engine.js";
import {
  ttsSupported, loadVoices, rankVoices, SAMPLE_TEXT, speak, stopSpeaking as stopBrowserTTS,
  sttSupported, createDictation, STT_IS_LOCAL,
  loadKokoro, speakKokoro, stopKokoro, unlockAudio, KOKORO_VOICES, DEFAULT_KOKORO_VOICE,
} from "./voice.js";

/* ------------------------------- design tokens --------------------------- */
const CARD = "rounded-xl border border-slate-800 bg-slate-900/50";
const TILE = "flex shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30";
const ROLE_ICONS = { ShieldAlert, Headphones, Network, Server, Cloud, Crosshair, ClipboardCheck, BarChart3 };
const STORE_KEY = "interviewlab.sessions.v1";
const VOICE_KEY = "interviewlab.voice.v1";

function Btn({ variant = "primary", size = "md", className = "", children, ...props }) {
  const styles = {
    primary: "bg-indigo-500 hover:bg-indigo-400 text-white",
    ghost: "bg-slate-800 hover:bg-slate-700 text-slate-200 ring-1 ring-slate-700",
    outline: "border border-slate-700 bg-slate-900 text-slate-200 hover:border-indigo-500 hover:text-white",
    danger: "bg-rose-500 hover:bg-rose-400 text-white",
    success: "bg-emerald-500 hover:bg-emerald-400 text-white",
  };
  const sizes = { lg: "px-5 py-2.5 text-sm", md: "px-4 py-2 text-sm", sm: "px-2.5 py-1.5 text-xs" };
  return (
    <button className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  );
}

const scoreTone = (n) => (n >= 75 ? "emerald" : n >= 55 ? "amber" : "rose");
const SCORE_TEXT = { emerald: "text-emerald-300", amber: "text-amber-300", rose: "text-rose-300" };
const SCORE_BAR = { emerald: "bg-emerald-500", amber: "bg-amber-500", rose: "bg-rose-500" };

function fmtTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/* ========================================================================== */

export default function App() {
  const [screen, setScreen] = useState("setup"); // setup | interview | debrief

  // interview config
  const [roleId, setRoleId] = useState(ROLES[0].id);
  const [mode, setMode] = useState("mixed");
  const [difficulty, setDifficulty] = useState("standard");
  const role = useMemo(() => getRole(roleId), [roleId]);

  // engine
  const [engine, setEngine] = useState({ backend: "simulation", model: null, ready: true, webllmEngine: null });
  const [webgpu] = useState(() => webgpuSupported());
  const [modelChoice, setModelChoice] = useState(DEFAULT_WEBLLM_MODEL);
  const [load, setLoad] = useState({ active: false, pct: 0, text: "", error: "" });
  const [ollama, setOllama] = useState({ checked: false, ok: false, models: [] });
  const engineRef = useRef(engine);
  useEffect(() => { engineRef.current = engine; }, [engine]);

  // conversation
  const [history, setHistory] = useState([]);
  const [current, setCurrent] = useState(""); // interviewer's streaming turn
  const [streaming, setStreaming] = useState(false);
  const [input, setInput] = useState("");
  const abortRef = useRef(null);

  // voice
  const [speakOn, setSpeakOn] = useState(ttsSupported());
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [micError, setMicError] = useState("");
  const [voiceBusy, setVoiceBusy] = useState(false);
  const voiceRef = useRef(null);
  const speakOnRef = useRef(speakOn);
  useEffect(() => { speakOnRef.current = speakOn; }, [speakOn]);
  const dictationRef = useRef(null);
  const [voices, setVoices] = useState([]);
  const [voiceURI, setVoiceURI] = useState("");
  const [rate, setRate] = useState(0.95);
  const rateRef = useRef(0.95);
  useEffect(() => { rateRef.current = rate; }, [rate]);
  useEffect(() => { voiceRef.current = voices.find((v) => v.voiceURI === voiceURI) || voices[0] || null; }, [voiceURI, voices]);
  useEffect(() => { if (voiceURI) { try { localStorage.setItem(VOICE_KEY, JSON.stringify({ voiceURI, rate })); } catch { /* ignore */ } } }, [voiceURI, rate]);
  const [neural, setNeural] = useState({ status: "off", pct: 0, text: "", error: "" }); // off | loading | ready
  const [neuralVoice, setNeuralVoice] = useState(DEFAULT_KOKORO_VOICE);
  const [preferNeural, setPreferNeural] = useState(true);
  const neuralReadyRef = useRef(false);
  const neuralStatusRef = useRef("off");
  const neuralVoiceRef = useRef(DEFAULT_KOKORO_VOICE);
  const preferNeuralRef = useRef(true);
  const pendingSpeechRef = useRef(null);
  useEffect(() => { neuralReadyRef.current = neural.status === "ready"; neuralStatusRef.current = neural.status; }, [neural.status]);
  useEffect(() => { neuralVoiceRef.current = neuralVoice; }, [neuralVoice]);
  useEffect(() => { preferNeuralRef.current = preferNeural; }, [preferNeural]);

  // timing + results
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [grading, setGrading] = useState(false);
  const [debrief, setDebrief] = useState(null);
  const [sessions, setSessions] = useState([]);

  const scrollRef = useRef(null);

  /* ------------------------------ mount ---------------------------------- */
  useEffect(() => {
    loadVoices().then((vs) => {
      const ranked = rankVoices(vs);
      setVoices(ranked);
      let savedURI = "";
      let savedRate = 0.95;
      try { const p = JSON.parse(localStorage.getItem(VOICE_KEY) || "{}"); savedURI = p.voiceURI || ""; if (p.rate) savedRate = p.rate; } catch { /* ignore */ }
      const chosen = ranked.find((v) => v.voiceURI === savedURI) || ranked[0];
      setVoiceURI(chosen?.voiceURI || "");
      setRate(savedRate);
      voiceRef.current = chosen || null;
    });
    detectOllama().then((r) => {
      setOllama({ checked: true, ok: r.ok, models: r.models });
      // If a real local model is reachable, use it by default instead of the
      // scripted simulation — so the first interview is an actual AI.
      if (r.ok && r.models.length) {
        setEngine((e) => (e.backend === "simulation" ? { backend: "ollama", model: r.models[0], ready: true, webllmEngine: null } : e));
      }
    });
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) setSessions(JSON.parse(raw));
    } catch { /* ignore */ }
    const onFirstGesture = () => {
      unlockAudio();
      if (speakOnRef.current && preferNeuralRef.current && neuralStatusRef.current === "off") loadNeural();
    };
    window.addEventListener("pointerdown", onFirstGesture, { once: true });
    return () => { stopAllSpeech(); dictationRef.current?.stop(); window.removeEventListener("pointerdown", onFirstGesture); };
  }, []);

  // interview timer
  useEffect(() => {
    if (screen !== "interview") return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [screen]);

  // keep transcript pinned to the newest turn
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history, current, grading]);

  /* ---------------------------- engine control --------------------------- */
  function useSimulation() {
    setEngine({ backend: "simulation", model: null, ready: true, webllmEngine: null });
  }
  function useOllama(model) {
    setEngine({ backend: "ollama", model, ready: true, webllmEngine: null });
  }
  async function loadModel(id) {
    setLoad({ active: true, pct: 0, text: "Starting…", error: "" });
    try {
      const eng = await loadWebLLM(id, (r) => {
        setLoad({ active: true, pct: Math.round((r.progress || 0) * 100), text: r.text || "Downloading…", error: "" });
      });
      setEngine({ backend: "webllm", model: id, ready: true, webllmEngine: eng });
      setLoad({ active: false, pct: 100, text: "", error: "" });
    } catch (e) {
      setLoad({ active: false, pct: 0, text: "", error: e?.message || "Failed to load model." });
    }
  }

  /* ----------------------------- interview ------------------------------- */
  async function askNext(cfg, nextHistory) {
    setStreaming(true);
    setCurrent("");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      let full = "";
      const text = await ask(
        engineRef.current,
        { role: cfg.role, mode: cfg.mode, difficulty: cfg.difficulty, history: nextHistory },
        (d) => { full += d; setCurrent(full); },
        ctrl.signal,
      );
      if (ctrl.signal.aborted) return;
      const finalText = (text || full || "").trim() || "Let's continue — tell me a bit about your experience.";
      setHistory((h) => [...h, { role: "assistant", content: finalText }]);
      setCurrent("");
      if (speakOnRef.current) speakQuestion(finalText);
    } catch {
      setHistory((h) => [...h, { role: "assistant", content: "Sorry — let's keep going. Tell me about a recent problem you solved." }]);
    } finally {
      setStreaming(false);
    }
  }

  function startInterview() {
    unlockAudio();
    if (speakOn && preferNeural && neural.status === "off") loadNeural();
    stopAllSpeech();
    setDebrief(null);
    setInput("");
    setInterim("");
    setHistory([]);
    setCurrent("");
    const started = Date.now();
    setStartedAt(started);
    setNow(started);
    setScreen("interview");
    askNext({ role, mode, difficulty }, []);
  }

  function stopAllSpeech() {
    stopBrowserTTS();
    stopKokoro();
  }

  function speakQuestion(text) {
    if (!speakOnRef.current) return;
    if (preferNeuralRef.current && neuralReadyRef.current) {
      pendingSpeechRef.current = null;
      speakKokoro(text, { voice: neuralVoiceRef.current, onStart: () => setSpeaking(true), onEnd: () => setSpeaking(false) })
        .catch(() => setSpeaking(false));
      return;
    }
    if (preferNeuralRef.current && neuralStatusRef.current === "loading") {
      // the realistic voice is still downloading — speak this once it's ready
      pendingSpeechRef.current = text;
      return;
    }
    speak(text, { voice: voiceRef.current, rate: rateRef.current, onStart: () => setSpeaking(true), onEnd: () => setSpeaking(false) });
  }

  function previewVoice(kind = "auto") {
    unlockAudio();
    stopAllSpeech();
    if (kind === "neural") setPreferNeural(true);
    if (kind === "browser") setPreferNeural(false);
    setVoiceBusy(true);
    const guard = setTimeout(() => setVoiceBusy(false), 20000); // never stay stuck
    const finish = () => { clearTimeout(guard); setSpeaking(false); setVoiceBusy(false); };
    const useNeural = kind === "neural" || (kind === "auto" && neuralReadyRef.current);
    if (useNeural) {
      speakKokoro(SAMPLE_TEXT, { voice: neuralVoiceRef.current, onStart: () => setSpeaking(true), onEnd: finish }).catch(finish);
    } else {
      const v = voices.find((x) => x.voiceURI === voiceURI) || voiceRef.current;
      speak(SAMPLE_TEXT, { voice: v, rate: rateRef.current, onStart: () => setSpeaking(true), onEnd: finish });
    }
  }

  async function loadNeural() {
    unlockAudio();
    setPreferNeural(true);
    setNeural({ status: "loading", pct: 0, text: "Starting…", error: "" });
    try {
      await loadKokoro((p) => {
        const pct = typeof p?.progress === "number" ? Math.round(p.progress) : 0;
        setNeural({ status: "loading", pct, text: p?.file || p?.status || "Downloading voice…", error: "" });
      });
      setNeural({ status: "ready", pct: 100, text: "", error: "" });
      const pending = pendingSpeechRef.current;
      pendingSpeechRef.current = null;
      if (pending && speakOnRef.current) {
        speakKokoro(pending, { voice: neuralVoiceRef.current, onStart: () => setSpeaking(true), onEnd: () => setSpeaking(false) }).catch(() => setSpeaking(false));
      }
    } catch (e) {
      setNeural({ status: "off", pct: 0, text: "", error: e?.message || "Couldn't load the neural voice." });
      const pending = pendingSpeechRef.current;
      pendingSpeechRef.current = null;
      if (pending && speakOnRef.current) speak(pending, { voice: voiceRef.current, rate: rateRef.current, onStart: () => setSpeaking(true), onEnd: () => setSpeaking(false) });
    }
  }

  function submitAnswer() {
    const answer = (input + (interim ? " " + interim : "")).trim();
    if (!answer || streaming) return;
    if (listening) { dictationRef.current?.stop(); setListening(false); }
    setInterim("");
    setInput("");
    const nextHistory = [...history, { role: "user", content: answer }];
    setHistory(nextHistory);
    askNext({ role, mode, difficulty }, nextHistory);
  }

  function toggleMic() {
    if (!sttSupported()) { setMicError("unsupported"); return; }
    if (listening) { dictationRef.current?.stop(); return; }
    setMicError("");
    stopAllSpeech();
    setSpeaking(false);
    const d = createDictation({
      onInterim: (t) => setInterim(t),
      onFinal: (t) => { setInput((prev) => (prev ? prev + " " : "") + t); setInterim(""); },
      onError: (e) => { setMicError(String(e)); },
      onEnd: () => { setListening(false); setInterim(""); },
    });
    dictationRef.current = d;
    d.start();
    setListening(true);
  }

  function toggleSpeak() {
    setSpeakOn((v) => {
      const nv = !v;
      if (!nv) { stopAllSpeech(); setSpeaking(false); }
      return nv;
    });
  }

  async function endInterview() {
    abortRef.current?.abort();
    dictationRef.current?.stop();
    stopAllSpeech();
    setListening(false);
    setSpeaking(false);
    setGrading(true);
    setScreen("debrief");
    const result = await gradeInterview(engineRef.current, { role, mode, history });
    setDebrief(result);
    setGrading(false);
    saveSession(result);
  }

  function saveSession(result) {
    const entry = {
      id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()),
      date: Date.now(),
      roleId, roleName: role.name, mode, difficulty,
      backend: engineRef.current.backend,
      overall: result.overall,
      history,
      debrief: result,
    };
    const next = [entry, ...sessions].slice(0, 20);
    setSessions(next);
    try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  function openSession(s) {
    setDebrief(s.debrief);
    setHistory(s.history || []);
    setGrading(false);
    setScreen("debrief");
  }

  function newInterview() {
    stopAllSpeech();
    setScreen("setup");
    setDebrief(null);
    setHistory([]);
    setCurrent("");
  }

  const answeredCount = history.filter((m) => m.role === "user").length;

  /* ============================== render ================================= */
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-200">
      <Header engine={engine} />

      <main className="mx-auto w-full max-w-[1500px] flex-1 px-5 py-6">
        {screen === "setup" && (
          <Setup
            {...{ role, roleId, setRoleId, mode, setMode, difficulty, setDifficulty,
              engine, webgpu, modelChoice, setModelChoice, load, loadModel, useSimulation,
              ollama, useOllama, startInterview, sessions, openSession,
              voices, voiceURI, setVoiceURI, rate, setRate, previewVoice, ttsOk: ttsSupported(), voiceBusy,
              neural, neuralVoice, setNeuralVoice, loadNeural, preferNeural, setPreferNeural }}
          />
        )}

        {screen === "interview" && (
          <Interview
            {...{ role, mode, difficulty, history, current, streaming, input, setInput,
              interim, listening, speakOn, speaking, micError, toggleMic, toggleSpeak,
              submitAnswer, endInterview, elapsed: now - startedAt, answeredCount,
              scrollRef, backToSetup: newInterview, simMode: engine.backend === "simulation",
              voicePrep: speakOn && preferNeural && neural.status === "loading" }}
          />
        )}

        {screen === "debrief" && (
          <Debrief
            {...{ role, mode, difficulty, debrief, grading, history, startInterview, newInterview }}
          />
        )}
      </main>

      <Footer />
    </div>
  );
}

/* ------------------------------- Header ---------------------------------- */
function Header({ engine }) {
  const label =
    engine.backend === "webllm" ? `WebLLM · ${WEBLLM_MODELS.find((m) => m.id === engine.model)?.label || "model"}`
      : engine.backend === "ollama" ? `Ollama · ${engine.model}`
        : "Simulation";
  const tone = engine.backend === "simulation" ? "text-slate-300" : "text-indigo-300";
  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="flex items-center gap-3">
          <div className={`${TILE} h-11 w-11`}><MessageSquare size={24} /></div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-100">Interview Lab</h1>
            <p className="text-xs text-slate-400">Practice the interview — out loud, on your own machine.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200">
            <Cpu size={14} className={tone} /> <span className={tone}>{label}</span>
          </span>
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2" title="The model, questions, and scoring run on your device. Browser speech-to-text may send audio to your browser's speech service to transcribe.">
            <ShieldCheck size={14} className="text-emerald-400" />
            <span className="text-xs font-semibold text-emerald-300">Local-first</span>
          </div>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------- Setup ----------------------------------- */
function Setup({ role, roleId, setRoleId, mode, setMode, difficulty, setDifficulty, engine, webgpu,
  modelChoice, setModelChoice, load, loadModel, useSimulation, ollama, useOllama, startInterview,
  sessions, openSession, voices, voiceURI, setVoiceURI, rate, setRate, previewVoice, ttsOk, voiceBusy,
  neural, neuralVoice, setNeuralVoice, loadNeural, preferNeural, setPreferNeural }) {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* hero */}
      <section className={`${CARD} bg-gradient-to-b from-indigo-500/[0.08] to-slate-900/40 p-6 sm:p-8`}>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-300">Mock interview simulator</p>
        <h2 className="text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">Rehearse the interview before it counts.</h2>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-300">
          Pick a role, choose behavioral or technical, and talk to an AI interviewer that asks real questions,
          probes your answers, and coaches you afterward. Speak out loud or type — either way, it runs privately in your browser.
        </p>
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-400" />
          <div className="text-sm leading-relaxed text-emerald-100/90">
            <b className="font-semibold text-emerald-200">100% private — a local LLM on your own device.</b> The AI interviewer and the coaching run entirely inside your browser (or on your own machine via Ollama), so nothing you type is ever sent to a server — no account, no cloud, no data leaving your browser. The model and voice download once, then it all works fully offline.
            <span className="mt-1.5 block text-xs text-emerald-200/60">The one exception: answering by microphone may use your browser’s built-in speech service to transcribe the audio — typing stays 100% on your device.</span>
          </div>
        </div>
      </section>

      {/* role picker */}
      <section>
        <SectionLabel n="1" title="Choose your role" />
        <div className="grid gap-3 sm:grid-cols-2">
          {ROLES.map((r) => {
            const Icon = ROLE_ICONS[r.icon] || Sparkles;
            const active = r.id === roleId;
            return (
              <button key={r.id} onClick={() => setRoleId(r.id)}
                className={`group flex items-start gap-3 rounded-xl border p-4 text-left transition ${active ? "border-indigo-500 bg-indigo-500/10" : "border-slate-800 bg-slate-900/50 hover:border-indigo-500/60 hover:bg-slate-900"}`}>
                <span className={`${TILE} h-10 w-10`}><Icon size={18} /></span>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-base font-bold text-slate-100">
                    {r.name}
                    {active && <CheckCircle2 size={15} className="text-indigo-300" />}
                  </p>
                  <p className="text-xs font-medium text-indigo-300/80">{r.cert}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-400">{r.blurb}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* mode + difficulty */}
      <section className="grid gap-5 md:grid-cols-2">
        <div>
          <SectionLabel n="2" title="Interview type" />
          <div className="space-y-2">
            {MODES.map((m) => (
              <button key={m.id} onClick={() => setMode(m.id)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition ${mode === m.id ? "border-indigo-500 bg-indigo-500/10" : "border-slate-800 bg-slate-900/50 hover:border-slate-600"}`}>
                <div>
                  <p className="text-sm font-semibold text-slate-100">{m.label}</p>
                  <p className="text-xs text-slate-400">{m.blurb}</p>
                </div>
                {mode === m.id && <CheckCircle2 size={16} className="shrink-0 text-indigo-300" />}
              </button>
            ))}
          </div>
        </div>
        <div>
          <SectionLabel n="3" title="Difficulty" />
          <div className="space-y-2">
            {DIFFICULTIES.map((d) => (
              <button key={d.id} onClick={() => setDifficulty(d.id)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition ${difficulty === d.id ? "border-indigo-500 bg-indigo-500/10" : "border-slate-800 bg-slate-900/50 hover:border-slate-600"}`}>
                <div>
                  <p className="text-sm font-semibold text-slate-100">{d.label}</p>
                  <p className="text-xs capitalize text-slate-400">{d.desc}</p>
                </div>
                {difficulty === d.id && <CheckCircle2 size={16} className="shrink-0 text-indigo-300" />}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* engine */}
      <section>
        <SectionLabel n="4" title="Interview engine" hint="How the interviewer thinks. Every option keeps your answers on this device." />
        <div className="grid gap-3 sm:grid-cols-3">
          <EngineCard active={engine.backend === "simulation"} onClick={useSimulation}
            icon={Radio} title="Simulation" tag="Scripted demo · not AI"
            desc="A fixed script — it does NOT read or react to your answers. Fine to try the flow; load a real model for a true interview." />
          <div className={`rounded-xl border p-4 ${engine.backend === "webllm" ? "border-indigo-500 bg-indigo-500/10" : "border-slate-800 bg-slate-900/50"}`}>
            <div className="flex items-center gap-2">
              <span className={`${TILE} h-9 w-9`}><Cpu size={16} /></span>
              <div>
                <p className="flex items-center gap-1 text-sm font-bold text-slate-100">WebLLM <span className="rounded bg-indigo-500/15 px-1 py-0.5 text-[9px] font-semibold text-indigo-300 ring-1 ring-indigo-500/30">REAL AI</span></p>
                <p className="text-[11px] text-slate-400">Reads &amp; reacts to your answers</p>
              </div>
            </div>
            {!webgpu ? (
              <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-300"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> Needs Chrome/Edge with WebGPU.</p>
            ) : engine.backend === "webllm" ? (
              <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-emerald-300"><CheckCircle2 size={14} /> Loaded — adaptive interviewer ready.</p>
            ) : load.active ? (
              <div className="mt-3">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full bg-indigo-500 transition-all" style={{ width: `${load.pct}%` }} />
                </div>
                <p className="mt-1.5 truncate text-[11px] text-slate-400">{load.pct}% · {load.text}</p>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <select value={modelChoice} onChange={(e) => setModelChoice(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none">
                  {WEBLLM_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label} · {m.size}</option>)}
                </select>
                <Btn size="sm" variant="outline" className="w-full" onClick={() => loadModel(modelChoice)}>Load model</Btn>
              </div>
            )}
            {load.error && <p className="mt-2 text-[11px] text-rose-300">{load.error}</p>}
          </div>
          <EngineCard active={engine.backend === "ollama"} onClick={() => ollama.ok && useOllama(ollama.models[0])}
            icon={Server} title="Ollama" tag={ollama.ok ? "Detected" : "Not detected"} disabled={!ollama.ok}
            desc={ollama.ok ? `Local models on your machine (${ollama.models.length} available).` : "Install Ollama and start it to run full-size local models."} />
        </div>
      </section>

      {/* start */}
      <div className="flex flex-wrap items-center gap-3">
        <Btn size="lg" onClick={startInterview}>
          Start interview <ArrowRight size={16} />
        </Btn>
        <p className="text-sm text-slate-400">
          {role.name} · {MODES.find((m) => m.id === mode)?.label} · {DIFFICULTIES.find((d) => d.id === difficulty)?.label}
        </p>
      </div>

      {/* interviewer voice */}
      <section>
        <SectionLabel n="5" title="Interviewer voice" hint="Load the neural voice for a human-sounding interviewer that runs entirely on your device." />
        <div className={`${CARD} space-y-4 p-4`}>
          {/* neural (recommended) */}
          <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/[0.06] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-bold text-slate-100">
                <Sparkles size={15} className="text-indigo-300" /> Realistic voice
                <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300 ring-1 ring-indigo-500/30">neural · on-device</span>
              </p>
              {neural.status === "ready" && <span className="flex items-center gap-1 text-xs font-semibold text-emerald-300"><CheckCircle2 size={14} /> Ready</span>}
            </div>
            {neural.status === "off" && (
              <div className="mt-2">
                <p className="text-xs leading-relaxed text-slate-400">A small voice model runs on your GPU for a genuinely human interviewer. One-time ~90 MB download, then fully offline and private.</p>
                <Btn size="sm" className="mt-2" onClick={loadNeural}><Sparkles size={14} /> Load realistic voice</Btn>
                {neural.error && <p className="mt-2 text-[11px] text-rose-300">{neural.error}</p>}
              </div>
            )}
            {neural.status === "loading" && (
              <div className="mt-2">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-indigo-500 transition-all" style={{ width: `${neural.pct}%` }} /></div>
                <p className="mt-1.5 truncate text-[11px] text-slate-400">{neural.pct}% · {neural.text}</p>
              </div>
            )}
            {neural.status === "ready" && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select value={neuralVoice} onChange={(e) => { setNeuralVoice(e.target.value); setPreferNeural(true); }}
                  className="min-w-[200px] flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none">
                  {KOKORO_VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
                <Btn size="sm" variant="outline" onClick={() => previewVoice("neural")} disabled={voiceBusy}>{voiceBusy ? <><Loader2 size={14} className="animate-spin" /> Generating…</> : <><Volume2 size={14} /> Preview</>}</Btn>
              </div>
            )}
          </div>

          {/* built-in (instant / fallback) */}
          {ttsOk ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{neural.status === "ready" ? "Fallback · built-in voice" : "Or a built-in voice (instant, no download)"}</p>
              <div className="flex flex-wrap items-center gap-3">
                <select value={voiceURI} onChange={(e) => { setVoiceURI(e.target.value); setPreferNeural(false); }}
                  className="min-w-[240px] flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none">
                  {voices.length === 0 && <option value="">Default voice</option>}
                  {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}{v.localService === false ? " · online" : ""}</option>)}
                </select>
                <Btn size="sm" variant="outline" onClick={() => previewVoice("browser")} disabled={voiceBusy}>{voiceBusy ? <><Loader2 size={14} className="animate-spin" /> …</> : <><Volume2 size={14} /> Preview</>}</Btn>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <span className="text-xs text-slate-400">Pace</span>
                <input type="range" min="0.7" max="1.15" step="0.05" value={rate} onChange={(e) => setRate(parseFloat(e.target.value))} className="flex-1 accent-indigo-500" />
                <span className="font-mono text-xs text-slate-500">{rate.toFixed(2)}×</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Your browser’s built-in speech isn’t available — load the neural voice above, or the interview runs as text only.</p>
          )}
        </div>
      </section>

      {/* recent */}
      {sessions.length > 0 && (
        <section>
          <SectionLabel n="6" title="Recent sessions" />
          <div className="space-y-2">
            {sessions.slice(0, 5).map((s) => {
              const t = scoreTone(s.overall);
              return (
                <button key={s.id} onClick={() => openSession(s)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3 text-left transition hover:border-indigo-500/60">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-100">{s.roleName}</p>
                    <p className="text-xs text-slate-500">{new Date(s.date).toLocaleString()} · {s.mode}</p>
                  </div>
                  <span className={`font-mono text-lg font-bold ${SCORE_TEXT[t]}`}>{s.overall}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function SectionLabel({ n, title, hint }) {
  return (
    <div className="mb-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-300">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500/15 font-mono text-[11px] text-indigo-300 ring-1 ring-indigo-500/30">{n}</span>
        {title}
      </h3>
      {hint && <p className="mt-1 pl-7 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function EngineCard({ active, onClick, icon: Icon, title, tag, desc, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${active ? "border-indigo-500 bg-indigo-500/10" : "border-slate-800 bg-slate-900/50 hover:border-slate-600"}`}>
      <div className="flex items-center gap-2">
        <span className={`${TILE} h-9 w-9`}><Icon size={16} /></span>
        <div>
          <p className="text-sm font-bold text-slate-100">{title}</p>
          <p className="text-[11px] text-slate-400">{tag}</p>
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-400">{desc}</p>
    </button>
  );
}

/* ------------------------------ Interview -------------------------------- */
function Interview({ role, mode, difficulty, history, current, streaming, input, setInput, interim,
  listening, speakOn, speaking, micError, toggleMic, toggleSpeak, submitAnswer, endInterview,
  elapsed, answeredCount, scrollRef, backToSetup, simMode, voicePrep }) {
  const RoleIcon = ROLE_ICONS[role.icon] || Sparkles;
  return (
    <div className="mx-auto flex max-w-3xl flex-col" style={{ height: "calc(100vh - 180px)", minHeight: 420 }}>
      {/* status bar */}
      <div className={`${CARD} mb-3 flex items-center justify-between gap-3 px-4 py-2.5`}>
        <div className="flex items-center gap-2.5">
          <span className={`${TILE} h-9 w-9`}><RoleIcon size={16} /></span>
          <div>
            <p className="text-sm font-bold text-slate-100">{role.name}</p>
            <p className="text-[11px] text-slate-400">{MODES.find((m) => m.id === mode)?.label} · {DIFFICULTIES.find((d) => d.id === difficulty)?.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-400"><Clock size={13} /> {fmtTime(elapsed)}</span>
          <span className="hidden text-xs text-slate-500 sm:inline">{answeredCount} answered</span>
          <Btn size="sm" variant="danger" onClick={endInterview} disabled={answeredCount === 0 && !streaming}>
            <Square size={13} /> End &amp; score
          </Btn>
        </div>
      </div>

      {simMode && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span><b>Scripted demo — not a real AI.</b> This interviewer follows a fixed list and can&apos;t read or react to what you say. For a real interview that responds to your answers, tap <b>Cancel</b>, then under <b>Interview engine</b> pick <b>WebLLM → Load model</b>.</span>
        </div>
      )}

      {/* transcript */}
      <div ref={scrollRef} className={`${CARD} flex-1 space-y-4 overflow-y-auto p-4`}>
        {history.map((m, i) => <Bubble key={i} role={m.role} text={m.content} RoleIcon={RoleIcon} />)}
        {streaming && current && <Bubble role="assistant" text={current} RoleIcon={RoleIcon} live />}
        {streaming && !current && (
          <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={15} className="animate-spin" /> Interviewer is thinking…</div>
        )}
        {speaking && (
          <div className="flex items-center gap-2 text-xs text-indigo-300"><Volume2 size={13} /> speaking…</div>
        )}
        {voicePrep && !speaking && (
          <div className="flex items-center gap-2 text-xs text-indigo-300"><Loader2 size={13} className="animate-spin" /> preparing a natural voice… (one-time download)</div>
        )}
      </div>

      {/* composer */}
      <div className={`${CARD} mt-3 p-3`}>
        {interim && <p className="mb-2 px-1 text-sm italic text-slate-500">{interim}</p>}
        <div className="flex items-end gap-2">
          <button onClick={toggleMic} title={listening ? "Stop microphone" : "Answer by voice"}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ring-1 transition ${listening ? "animate-pulse bg-rose-500/20 text-rose-300 ring-rose-500/40" : "bg-slate-800 text-slate-200 ring-slate-700 hover:text-white"}`}>
            {listening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <textarea
            value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitAnswer(); } }}
            rows={2} placeholder={listening ? "Listening… speak your answer" : "Type your answer, or tap the mic to speak…"}
            className="min-h-[44px] flex-1 resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none" />
          <Btn size="md" className="h-11" onClick={submitAnswer} disabled={streaming || !(input + interim).trim()}>
            <Send size={16} /> <span className="hidden sm:inline">Send</span>
          </Btn>
        </div>
        <div className="mt-2 flex items-center justify-between px-1">
          <button onClick={toggleSpeak} className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200">
            {speakOn ? <Volume2 size={13} className="text-indigo-300" /> : <VolumeX size={13} />} Interviewer voice {speakOn ? "on" : "off"}
          </button>
          {micError === "unsupported"
            ? <span className="text-[11px] text-amber-300">Voice input needs Chrome/Edge — typing works everywhere.</span>
            : micError
              ? <span className="text-[11px] text-amber-300">Mic: {micError} — you can type instead.</span>
              : <span className="text-[11px] text-slate-500">{STT_IS_LOCAL ? "Voice stays on-device" : "Enter to send · Shift+Enter for a new line"}</span>}
        </div>
      </div>
      <button onClick={backToSetup} className="mt-2 inline-flex items-center gap-1 self-start text-xs text-slate-500 hover:text-slate-300"><ArrowLeft size={12} /> Cancel</button>
    </div>
  );
}

function Bubble({ role, text, RoleIcon, live }) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-500/15 px-4 py-2.5 text-sm leading-relaxed text-indigo-50 ring-1 ring-indigo-500/30">{text}</div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2.5">
      <span className={`${TILE} h-8 w-8`}><RoleIcon size={15} /></span>
      <div className={`max-w-[85%] rounded-2xl rounded-tl-sm border border-slate-800 bg-slate-900/70 px-4 py-2.5 text-sm leading-relaxed text-slate-200 ${live ? "after:ml-0.5 after:inline-block after:animate-pulse after:content-['▋']" : ""}`}>{text}</div>
    </div>
  );
}

/* ------------------------------- Debrief --------------------------------- */
function Debrief({ role, mode, difficulty, debrief, grading, history, startInterview, newInterview }) {
  if (grading || !debrief) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center justify-center gap-3 py-24 text-center">
        <Loader2 size={28} className="animate-spin text-indigo-400" />
        <p className="text-sm text-slate-400">Scoring your interview…</p>
      </div>
    );
  }
  const t = scoreTone(debrief.overall);
  const dims = [
    { key: "structure", label: mode === "technical" ? "Structure" : "STAR structure" },
    { key: "technical", label: "Technical depth" },
    { key: "communication", label: "Communication" },
  ];
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">Debrief</p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">{role.name}</h2>
          <p className="text-sm text-slate-400">{MODES.find((m) => m.id === mode)?.label} · {DIFFICULTIES.find((d) => d.id === difficulty)?.label}</p>
        </div>
        <div className="text-right">
          <p className={`font-mono text-5xl font-bold ${SCORE_TEXT[t]}`}>{debrief.overall}</p>
          <p className="text-xs text-slate-500">overall / 100</p>
        </div>
      </div>

      {/* dimensions */}
      <div className={`${CARD} space-y-4 p-5`}>
        {dims.map((d) => {
          const v = debrief.dimensions[d.key] ?? 0;
          const dt = scoreTone(v);
          return (
            <div key={d.key}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-slate-300">{d.label}</span>
                <span className={`font-mono font-semibold ${SCORE_TEXT[dt]}`}>{v}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div className={`h-full ${SCORE_BAR[dt]} transition-all`} style={{ width: `${v}%` }} />
              </div>
            </div>
          );
        })}
        <p className="flex items-center gap-1.5 pt-1 text-[11px] text-slate-500">
          <Info size={12} />
          {debrief.source === "model" ? "AI-graded against a rubric." : "Heuristic scoring — load WebLLM or Ollama for AI-graded feedback and true technical judgement."}
        </p>
      </div>

      {/* strengths + improvements */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className={`${CARD} p-5`}>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-emerald-300"><CheckCircle2 size={15} /> Strengths</h3>
          <ul className="space-y-2 text-sm leading-relaxed text-slate-300">
            {debrief.strengths.map((s, i) => <li key={i} className="flex gap-2"><span className="text-emerald-400">•</span> {s}</li>)}
          </ul>
        </div>
        <div className={`${CARD} p-5`}>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-amber-300"><AlertTriangle size={15} /> Work on this</h3>
          <ul className="space-y-2 text-sm leading-relaxed text-slate-300">
            {debrief.improvements.map((s, i) => <li key={i} className="flex gap-2"><span className="text-amber-400">•</span> {s}</li>)}
          </ul>
        </div>
      </div>

      {/* model answer */}
      {debrief.modelAnswer && (
        <div className={`${CARD} bg-gradient-to-br from-indigo-500/[0.08] to-slate-900/40 p-5`}>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-indigo-300"><Trophy size={15} /> What a strong answer looks like</h3>
          <p className="text-sm leading-relaxed text-slate-300">{debrief.modelAnswer}</p>
        </div>
      )}

      {/* transcript */}
      {history.length > 0 && (
        <details className={`${CARD} p-5`}>
          <summary className="cursor-pointer text-sm font-semibold text-slate-200">Full transcript</summary>
          <div className="mt-4 space-y-3">
            {history.map((m, i) => (
              <div key={i} className="text-sm leading-relaxed">
                <span className={m.role === "assistant" ? "font-semibold text-indigo-300" : "font-semibold text-slate-400"}>{m.role === "assistant" ? "Interviewer" : "You"}: </span>
                <span className="text-slate-300">{m.content}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="flex flex-wrap gap-3">
        <Btn size="lg" onClick={startInterview}><RotateCcw size={16} /> Retry this interview</Btn>
        <Btn size="lg" variant="outline" onClick={newInterview}>New interview</Btn>
      </div>
    </div>
  );
}

/* ------------------------------- Footer ---------------------------------- */
function Footer() {
  return (
    <footer className="border-t border-slate-800 bg-slate-950">
      <div className="mx-auto max-w-[1500px] px-5 py-8 text-xs leading-relaxed text-slate-500">
        <p>
          <b className="text-slate-400">Interview Lab</b> · A free, private, on-device mock-interview simulator for
          tech and cybersecurity students. Practice behavioral and technical interviews out loud, get instant
          coaching, and keep every answer on your own machine. Designed and authored by Rizwan Virani.
        </p>
        <p className="mt-4">
          This is my personal website and an independent educational resource. All views, content, and materials here
          are entirely my own. They do not represent the views, positions, endorsements, or policies of my employer or
          of any other person, organization, or institution.
        </p>
        <p className="mt-4">
          When you load a model, Interview Lab runs a <b>real open-source model locally</b> — in your browser via
          WebGPU (WebLLM) or on your own machine (Ollama) — with no cloud inference; the default simulation engine is a
          rule-based teaching mock. The interviewer's voice is synthesized on your device. Browser speech-to-text may
          send your spoken audio to your browser's own speech service to transcribe it; typed answers stay entirely
          local. Coaching output is for practice only and is not a hiring decision or professional advice.
        </p>
        <p className="mt-4">
          This site was designed and engineered with development assistance from Anthropic's large language model.
        </p>
        <div className="mt-5 border-t border-slate-800 pt-4">
          This work is licensed under a{" "}
          <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300">
            Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License
          </a>.<br />© 2026 Rizwan Virani. Some rights reserved.
        </div>
      </div>
    </footer>
  );
}

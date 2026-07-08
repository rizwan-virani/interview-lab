/* ============================================================================
   voice.js — the browser voice layer for Interview Lab.
   ----------------------------------------------------------------------------
   Two halves, both native to the browser (no dependencies, no build step):

     TEXT-TO-SPEECH  — speechSynthesis. Fully local & offline. The interviewer
                       literally speaks each question.

     SPEECH-TO-TEXT  — the Web Speech API (SpeechRecognition). Turns the
                       candidate's spoken answer into text.

   PRIVACY NOTE / KNOWN TRADEOFF:
   speechSynthesis runs on-device. SpeechRecognition, however, is implemented by
   most browsers (Chrome/Edge) by streaming audio to a cloud service to
   transcribe — so with this provider the *audio* of an answer leaves the
   machine, even though the model, the questions, and the scoring never do.
   That's the one asterisk on "nothing leaves the device." The dictation API
   below is deliberately provider-shaped so a fully-local Whisper-on-WebGPU
   provider can be dropped in later without touching the UI. Until then, typed
   answers are always offered as a 100%-local path.
   ============================================================================ */

/* ------------------------------ Text to speech --------------------------- */

export function ttsSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/* Voices populate asynchronously in some browsers; resolve once they're ready. */
export function loadVoices() {
  return new Promise((resolve) => {
    if (!ttsSupported()) return resolve([]);
    const existing = window.speechSynthesis.getVoices();
    if (existing.length) return resolve(existing);
    const handler = () => resolve(window.speechSynthesis.getVoices());
    window.speechSynthesis.onvoiceschanged = handler;
    // Fallback in case the event never fires.
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 800);
  });
}

/* Quality ranking for speechSynthesis voices. The built-in OS voices vary
   wildly: "Natural" / "Online" / "Google" voices sound human; the legacy SAPI
   ones (David, Zira, eSpeak) sound robotic. Score so the best lands first. */
const V_GREAT = /natural|neural|online|premium|enhanced|google|siri/i;
const V_GOOD = /samantha|aria|jenny|guy|libby|sonia|ryan|emma|ava|nova|zoe|eric|michelle|christopher/i;
const V_POOR = /espeak|david|zira|mark|hazel|desktop|compact|pico|robo/i;

export function voiceScore(v) {
  let s = 0;
  if (/^en/i.test(v.lang)) s += 60;
  if (/en[-_]us/i.test(v.lang)) s += 8;
  if (V_GREAT.test(v.name)) s += 45;
  else if (V_GOOD.test(v.name)) s += 22;
  if (V_POOR.test(v.name)) s -= 30;
  if (v.localService === false) s += 12; // online voices tend to be the natural ones
  return s;
}

/* English voices, best-sounding first. */
export function rankVoices(voices) {
  if (!voices || !voices.length) return [];
  const en = voices.filter((v) => /^en/i.test(v.lang));
  const pool = en.length ? en : voices;
  return [...pool].sort((a, b) => voiceScore(b) - voiceScore(a));
}

export function pickVoice(voices) {
  return rankVoices(voices)[0] || null;
}

export const SAMPLE_TEXT =
  "Hi, thanks for coming in today. Let's start with a little about your background and what got you into this field.";

/* Speak text. Cancels anything already speaking so questions don't overlap. */
export function speak(text, { voice, rate = 1, pitch = 1, onStart, onEnd } = {}) {
  if (!ttsSupported() || !text) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.rate = rate;
  u.pitch = pitch;
  u.onstart = () => onStart?.();
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  // Chrome quirk: calling speak() immediately after cancel() can stall it —
  // defer a tick so the queue clears first.
  setTimeout(() => window.speechSynthesis.speak(u), 60);
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel();
}

/* ------------------------------ Speech to text --------------------------- */

function SpeechRecognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function sttSupported() {
  return !!SpeechRecognitionCtor();
}

/* Whether the fully-local speech path is available. Today the browser provider
   is cloud-backed, so this is false; wiring a local Whisper provider flips it. */
export const STT_IS_LOCAL = false;

/* Create a dictation session.
     handlers: { onInterim(text), onFinal(text), onError(err), onEnd() }
   Returns { start, stop, supported }. The recognizer runs continuously and
   accumulates finalized phrases; onFinal fires per finalized chunk, onInterim
   streams the in-progress guess so the UI can show live captions. */
export function createDictation({ onInterim, onFinal, onError, onEnd } = {}) {
  const Ctor = SpeechRecognitionCtor();
  if (!Ctor) {
    return { supported: false, start() {}, stop() {} };
  }

  let rec = null;
  let stopping = false;

  function start() {
    stopping = false;
    rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;

    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const chunk = res[0]?.transcript || "";
        if (res.isFinal) onFinal?.(chunk.trim());
        else interim += chunk;
      }
      if (interim) onInterim?.(interim.trim());
    };

    rec.onerror = (e) => onError?.(e?.error || "speech-error");
    rec.onend = () => {
      // Chrome ends the session on its own after a pause; if the user hasn't
      // asked to stop, resume so push-to-talk feels continuous.
      if (!stopping) {
        try {
          rec.start();
          return;
        } catch {
          /* fallthrough to onEnd */
        }
      }
      onEnd?.();
    };

    try {
      rec.start();
    } catch (e) {
      onError?.("start-failed");
    }
  }

  function stop() {
    stopping = true;
    try {
      rec?.stop();
    } catch {
      /* noop */
    }
  }

  return { supported: true, start, stop };
}

/* ----------------------- Neural TTS (Kokoro, on-device) ------------------ */
/* A small neural voice model that runs locally via WebGPU (WASM fallback).
   Human-sounding AND private: weights download once from a public CDN, then
   inference is entirely on-device. Lazy-loaded so nothing downloads until the
   student opts in — the same story as the WebLLM engine. */

export const KOKORO_VOICES = [
  { id: "af_heart", label: "Heart — US female, warm" },
  { id: "af_bella", label: "Bella — US female" },
  { id: "af_nicole", label: "Nicole — US female, soft" },
  { id: "af_sarah", label: "Sarah — US female" },
  { id: "am_michael", label: "Michael — US male" },
  { id: "am_fenrir", label: "Fenrir — US male, deep" },
  { id: "am_puck", label: "Puck — US male, bright" },
  { id: "bf_emma", label: "Emma — UK female" },
  { id: "bm_george", label: "George — UK male" },
];
export const DEFAULT_KOKORO_VOICE = "af_heart";
const KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";

let _kokoro = null;
let _audioCtx = null;
let _currentSource = null;

export function neuralVoiceLoaded() {
  return !!_kokoro;
}

/* Unlock/resume a shared AudioContext from a user gesture (a click). Speech is
   generated asynchronously, so by the time it's ready the gesture has expired —
   a naive `new Audio().play()` then gets blocked by autoplay policy and the app
   silently falls back to a worse voice. An AudioContext unlocked on a gesture
   keeps playing generated buffers afterward, which is what we want. */
export function unlockAudio() {
  if (!_audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    _audioCtx = new Ctx();
  }
  if (_audioCtx.state === "suspended") _audioCtx.resume().catch(() => {});
  return _audioCtx;
}

export async function loadKokoro(onProgress) {
  if (_kokoro) return _kokoro;
  const { KokoroTTS } = await import("kokoro-js");
  const device = typeof navigator !== "undefined" && "gpu" in navigator ? "webgpu" : "wasm";
  _kokoro = await KokoroTTS.from_pretrained(KOKORO_MODEL, {
    dtype: "q8",
    device,
    progress_callback: (p) => { if (onProgress && p) onProgress(p); },
  });
  return _kokoro;
}

/* Generate speech for `text` with Kokoro and play it through the unlocked
   AudioContext. Robust against autoplay policy. Resolves once playback starts. */
export async function speakKokoro(text, { voice = DEFAULT_KOKORO_VOICE, onStart, onEnd } = {}) {
  const tts = _kokoro || (await loadKokoro());
  const result = await tts.generate(text, { voice });
  const samples = result.audio || result.data;
  const sr = result.sampling_rate || result.sampleRate || 24000;
  if (!samples || !samples.length) { onEnd?.(); return; }
  const ctx = unlockAudio();
  if (!ctx) { onEnd?.(); return; }
  stopKokoro();
  const buffer = ctx.createBuffer(1, samples.length, sr);
  buffer.getChannelData(0).set(samples);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  src.onended = () => { if (_currentSource === src) _currentSource = null; onEnd?.(); };
  _currentSource = src;
  onStart?.();
  src.start();
}

export function stopKokoro() {
  if (_currentSource) {
    try { _currentSource.onended = null; _currentSource.stop(); } catch { /* noop */ }
    _currentSource = null;
  }
}

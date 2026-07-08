/* ============================================================================
   interviewer.js — the interview "brain" on top of the engine layer.
   ----------------------------------------------------------------------------
   Two responsibilities:

     1. ask()          — produce the interviewer's next spoken turn.
                         • real model (webllm/ollama): improvises from a system
                           prompt + full history; probes, adapts difficulty.
                         • simulation: walks a coherent role question bank with
                           the occasional templated follow-up. No model needed.

     2. gradeInterview() — produce the end-of-interview debrief.
                         • real model: asks for JSON against a rubric, parsed
                           tolerantly.
                         • simulation OR parse failure: a deterministic
                           heuristic debrief so there is ALWAYS a scorecard.

   History is the running transcript as chat messages:
     [{ role: "assistant", content }, { role: "user", content }, ...]
   where "assistant" = interviewer questions and "user" = candidate answers.
   ============================================================================ */

import { chat, chatStream } from "./engine.js";
import { BEHAVIORAL_SEEDS } from "./roles.js";

export const MODES = [
  { id: "behavioral", label: "Behavioral", blurb: "Stories about how you work — the STAR stuff." },
  { id: "technical", label: "Technical", blurb: "Role knowledge and how you'd approach real problems." },
  { id: "mixed", label: "Mixed", blurb: "A realistic blend of both, like the real thing." },
];

export const DIFFICULTIES = [
  { id: "intro", label: "Warm-up", desc: "entry-level and supportive" },
  { id: "standard", label: "Standard", desc: "a typical screening interview" },
  { id: "senior", label: "Challenging", desc: "tougher, senior-level follow-ups" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------- Prompts --------------------------------- */

function difficultyText(id) {
  return DIFFICULTIES.find((d) => d.id === id)?.desc || "a typical screening interview";
}

export function buildSystemPrompt({ role, mode, difficulty }) {
  const modeLine =
    mode === "behavioral"
      ? "This is a BEHAVIORAL interview: ask about past experiences, teamwork, and how they handle situations. Look for the STAR shape (Situation, Task, Action, Result)."
      : mode === "technical"
        ? "This is a TECHNICAL interview: ask role-relevant knowledge and how they'd approach real problems."
        : "This is a MIXED interview: alternate naturally between behavioral questions and technical ones.";

  return [
    `You are a professional but warm hiring interviewer for a ${role.name} position (around ${role.cert} level).`,
    modeLine,
    `Difficulty: ${difficultyText(difficulty)}.`,
    `Over the interview, try to cover these areas: ${role.focus.join(", ")}.`,
    "",
    "Rules you must follow:",
    "- Ask ONE question at a time. Keep each of your turns short — 1 to 3 sentences.",
    "- On your very first turn, give a brief, friendly greeting and then your first question.",
    "- Listen to the candidate's answer and ask a natural follow-up when an answer is vague, generic, or missing specifics (e.g. \"Can you give me a concrete example?\" or \"How exactly would you do that?\"). Otherwise move to a new question.",
    "- Adapt: go deeper when they answer well, ease off and encourage when they struggle.",
    "- Stay in character as the interviewer. Do NOT give feedback, scores, or the model answer during the interview — that comes only at the end.",
    "- Speak naturally, like a real person in a conversation. No markdown, no bullet points, no headings.",
  ].join("\n");
}

function gradingSystemPrompt({ role, mode }) {
  return [
    `You are an expert interview coach reviewing a ${mode} interview for a ${role.name} role.`,
    "Evaluate the CANDIDATE's answers only (ignore the interviewer's wording).",
    "Return ONLY a JSON object — no prose before or after — with exactly this shape:",
    "{",
    '  "overall": <integer 0-100>,',
    '  "dimensions": { "structure": <0-100>, "technical": <0-100>, "communication": <0-100> },',
    '  "strengths": [<2-3 short specific strings>],',
    '  "improvements": [<2-3 short specific strings>],',
    '  "modelAnswer": "<2-3 sentences: a strong example answer to one question they handled weakly>"',
    "}",
    'For behavioral answers, "structure" = STAR completeness. For technical answers, "technical" = accuracy and depth. "communication" = clarity and conciseness. Be fair but honest; do not give everything above 80 unless earned.',
  ].join("\n");
}

function transcriptText(history) {
  return history
    .map((m) => `${m.role === "assistant" ? "Interviewer" : "Candidate"}: ${m.content}`)
    .join("\n\n");
}

/* --------------------------- Simulation interviewer ---------------------- */

/* Deterministic pick helper (no Math.random — reproducible in walk-throughs). */
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function simBank(role, mode) {
  if (mode === "behavioral") return BEHAVIORAL_SEEDS;
  if (mode === "technical") return role.technicalSeeds;
  // mixed: interleave behavioral and technical
  const out = [];
  const max = Math.max(BEHAVIORAL_SEEDS.length, role.technicalSeeds.length);
  for (let i = 0; i < max; i++) {
    if (role.technicalSeeds[i]) out.push(role.technicalSeeds[i]);
    if (BEHAVIORAL_SEEDS[i]) out.push(BEHAVIORAL_SEEDS[i]);
  }
  return out;
}

const PROBES = [
  "Can you give me a specific example of that?",
  "How exactly would you go about that, step by step?",
  "What made you take that approach rather than another?",
  "And what was the outcome?",
  "Can you go a little deeper on that?",
];

function simInterviewer({ role, mode, history }) {
  const asked = history.filter((m) => m.role === "assistant").length;
  const bank = simBank(role, mode);
  const greet = "Thanks for coming in today — I appreciate you taking the time. Let's get started. ";

  if (asked === 0) return greet + bank[0];

  const lastAnswer = [...history].reverse().find((m) => m.role === "user")?.content || "";
  const words = lastAnswer.trim().split(/\s+/).filter(Boolean).length;

  // Probe when the previous answer was short/vague and we haven't just probed.
  const justProbed = PROBES.some((p) => history[history.length - 1]?.content === p);
  if (words > 0 && words < 22 && !justProbed) {
    return PROBES[hash(lastAnswer) % PROBES.length];
  }
  return bank[asked % bank.length];
}

/* ------------------------------- ask() ----------------------------------- */

/* Produces the next interviewer turn. When a real model is connected, tokens
   stream through onDelta so the UI renders live. Returns the full text. */
export async function ask(engineState, { role, mode, difficulty, history }, onDelta, signal) {
  if (engineState.backend === "simulation") {
    const text = simInterviewer({ role, mode, history });
    for (const part of text.split(/(\s+)/)) {
      if (signal?.aborted) break;
      onDelta?.(part);
      await sleep(14);
    }
    return text;
  }

  const messages = [{ role: "system", content: buildSystemPrompt({ role, mode, difficulty }) }, ...history];
  if (history.length === 0) {
    messages.push({ role: "user", content: "Please begin the interview now with a short greeting and your first question." });
  }
  const res = await chatStream(
    engineState,
    { messages, options: { temperature: 0.7, top_p: 0.95, num_predict: 130 } },
    onDelta,
    signal,
  );
  return (res.text || "").trim();
}

/* ---------------------------- Heuristic scoring -------------------------- */

const FILLERS = /\b(um+|uh+|er+|like|you know|basically|honestly|literally|kind of|sort of|i guess)\b/gi;
const STAR_ACTION = /\b(i|we)\s+(did|built|led|fixed|created|handled|resolved|implemented|designed|decided|investigated|configured|analy[sz]ed|reduced|improved|coordinated)/gi;
const STAR_RESULT = /\b(result|resulted|so that|which (?:let|allowed|meant)|reduced|improved|increased|saved|prevented|in the end|ultimately|outcome|because of (?:this|that))\b/gi;
const SPECIFIC = /(\d|%|\$|version|tool|command|framework|protocol|policy)/i;

function clamp(n, lo = 5, hi = 99) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function heuristicDebrief({ role, mode, history }) {
  const answers = history.filter((m) => m.role === "user").map((m) => (m.content || "").trim()).filter(Boolean);
  const joined = answers.join("\n").toLowerCase();
  const totalWords = answers.reduce((n, a) => n + a.split(/\s+/).filter(Boolean).length, 0);
  const avgWords = answers.length ? totalWords / answers.length : 0;
  const fillerCount = (joined.match(FILLERS) || []).length;
  const actionHits = (joined.match(STAR_ACTION) || []).length;
  const resultHits = (joined.match(STAR_RESULT) || []).length;
  const specifics = answers.filter((a) => SPECIFIC.test(a)).length;
  const coverage = role.focus.filter((f) =>
    f.toLowerCase().split(/[\s/&]+/).some((w) => w.length > 3 && joined.includes(w)),
  ).length;
  const coverageRatio = role.focus.length ? coverage / role.focus.length : 0;

  // Communication: reward the right length, punish fillers & one-liners.
  let communication = 74;
  communication -= Math.min(30, fillerCount * 4);
  if (avgWords < 12) communication -= 22;
  else if (avgWords > 150) communication -= 10;
  if (specifics >= Math.ceil(answers.length / 2)) communication += 8;

  // Structure (STAR): action + result signals + reasonable length.
  let structure = 50 + actionHits * 6 + resultHits * 7;
  if (avgWords >= 30 && avgWords <= 130) structure += 10;
  if (avgWords < 12) structure -= 18;

  // Technical: honestly a *coverage* proxy, not correctness.
  let technical = 48 + coverageRatio * 42 + (specifics >= 2 ? 8 : 0);
  if (avgWords < 12) technical -= 16;

  communication = clamp(communication);
  structure = clamp(structure);
  technical = clamp(technical);

  const weights =
    mode === "behavioral"
      ? { structure: 0.5, communication: 0.35, technical: 0.15 }
      : mode === "technical"
        ? { technical: 0.55, communication: 0.3, structure: 0.15 }
        : { technical: 0.38, structure: 0.34, communication: 0.28 };
  const overall = clamp(
    structure * weights.structure + technical * weights.technical + communication * weights.communication,
  );

  const strengths = [];
  const improvements = [];
  if (specifics >= Math.ceil(answers.length / 2)) strengths.push("You backed answers with concrete specifics rather than staying abstract.");
  if (resultHits >= 2) strengths.push("Several answers landed on a clear outcome or result.");
  if (avgWords >= 25 && avgWords <= 130) strengths.push("Good answer length — enough detail without rambling.");
  if (coverageRatio >= 0.6) strengths.push(`You touched most of the key areas for a ${role.name}.`);
  if (!strengths.length) strengths.push("You engaged with every question and kept the conversation going.");

  if (fillerCount >= 3) improvements.push(`Trim filler words (“um”, “like”, “basically”) — heard about ${fillerCount}. A short pause reads as more confident.`);
  if (mode !== "technical" && resultHits < 2) improvements.push("Close behavioral answers with the Result: what actually changed because of what you did.");
  if (mode !== "behavioral" && coverageRatio < 0.6) improvements.push(`Work in more of the core ${role.name} areas — e.g. ${role.focus.slice(0, 3).join(", ")}.`);
  if (avgWords < 15) improvements.push("Answers ran short. Aim for 4–6 sentences: set the scene, what you did, and the outcome.");
  if (!improvements.length) improvements.push("Tighten each answer to a crisp headline first, then the detail.");

  const modelAnswer =
    mode === "technical"
      ? `A strong answer names a specific approach and walks the steps: what you'd check first, the tool or command you'd use, and how you'd confirm the fix — tied back to ${role.focus[0]}.`
      : "A strong answer uses STAR: one line of Situation, the Task, the specific Actions you took, and the measurable Result — kept to about a minute.";

  return {
    source: "heuristic",
    overall,
    dimensions: { structure, technical, communication },
    strengths: strengths.slice(0, 3),
    improvements: improvements.slice(0, 3),
    modelAnswer,
  };
}

/* ------------------------------ JSON rescue ------------------------------ */

function extractJson(text) {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeDebrief(raw, mode) {
  const d = raw.dimensions || {};
  return {
    source: "model",
    overall: clamp(Number(raw.overall) || 0),
    dimensions: {
      structure: clamp(Number(d.structure) || 0),
      technical: clamp(Number(d.technical) || 0),
      communication: clamp(Number(d.communication) || 0),
    },
    strengths: Array.isArray(raw.strengths) && raw.strengths.length ? raw.strengths.slice(0, 3).map(String) : ["Engaged with every question."],
    improvements: Array.isArray(raw.improvements) && raw.improvements.length ? raw.improvements.slice(0, 3).map(String) : ["Add more specific detail."],
    modelAnswer: typeof raw.modelAnswer === "string" ? raw.modelAnswer : "",
    mode,
  };
}

/* ---------------------------- gradeInterview() --------------------------- */

export async function gradeInterview(engineState, { role, mode, history }) {
  const answered = history.some((m) => m.role === "user" && (m.content || "").trim());
  if (!answered) return heuristicDebrief({ role, mode, history });

  if (engineState.backend !== "simulation") {
    try {
      const messages = [
        { role: "system", content: gradingSystemPrompt({ role, mode }) },
        { role: "user", content: `Here is the interview transcript:\n\n${transcriptText(history)}\n\nReturn the JSON evaluation now.` },
      ];
      const res = await chat(engineState, { messages, options: { temperature: 0.2, num_predict: 500 } });
      const parsed = extractJson(res.text);
      if (parsed) return normalizeDebrief(parsed, mode);
    } catch {
      /* fall back to heuristic below */
    }
  }
  return heuristicDebrief({ role, mode, history });
}

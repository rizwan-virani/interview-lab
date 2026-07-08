# Interview Lab

**A free, private, on-device AI mock-interview simulator — rehearse tech and cybersecurity interviews out loud, get coached, and keep every answer on your own machine.**
Pick a role, choose a behavioral or technical interview, and talk to an AI interviewer that asks real questions, probes your answers, and hands you a scored debrief — all running locally in your browser with no account and no cloud.

> Designed and authored by **Rizwan Virani.**

---

## What this is

A browser-based mock-interview simulator for people breaking into tech and cybersecurity. You choose a role (SOC analyst, help desk, network technician, systems administrator, cloud administrator, junior penetration tester, GRC/IT auditor, or data analyst), pick a behavioral, technical, or mixed interview and a difficulty, and then hold a real back-and-forth interview. The interviewer asks one question at a time, follows up when an answer is thin, and at the end grades your performance — STAR structure, technical depth, and communication — with concrete strengths, fixes, and an example of a strong answer. You can answer by speaking or by typing, and the interviewer can speak its questions in a natural, on-device neural voice. It is completely free, needs no account, and runs entirely on your own computer.

## What this is not

- **Not** a connection to a hosted AI service or a proprietary model. It runs open-source models locally — via an in-browser WebGPU engine (WebLLM) or your own Ollama install — or a built-in rule-based simulation. **No cloud inference, no API keys, no accounts.**
- **Not** affiliated with, endorsed by, or sponsored by Meta, Mistral AI, Google, Hugging Face, Ollama, or any other vendor. Their names identify only the open technologies this tool uses.
- **Not** a hiring decision, a guarantee of interview results, or professional career advice. The coaching is for practice — it builds your delivery, not a verdict to rely on.

---

## At a glance

| | |
| --- | --- |
| **Type** | An interactive mock-interview simulator |
| **Audience** | Students and career-changers heading into tech and cybersecurity roles |
| **Roles** | 8 tracks (SOC, help desk, network, sysadmin, cloud, pentest, GRC, data) |
| **Modes** | Behavioral, technical, or mixed — three difficulty levels |
| **Cost** | Free and open-source |
| **Accounts** | None — sessions are saved locally in your browser |
| **AI engines** | In-browser WebLLM or Ollama (real local models), or a built-in simulation |
| **Voice** | On-device neural text-to-speech, plus speech-to-text answers — or type |
| **Privacy** | Local-first — the model, questions, and scoring stay on your machine |

## Features

- **Role tracks that mirror real jobs.** Eight entry-level roles, each with the focus areas and question banks a real interviewer would draw from, tied to the certifications that lead to them.
- **A real conversation, not a quiz.** With a local model loaded, the interviewer improvises, probes vague answers, and adapts its difficulty to how you're doing. With zero setup, a rule-based simulation runs a coherent, role-appropriate interview instead.
- **Speak or type.** The interviewer talks; you answer out loud (speech-to-text) or by typing. A one-click **on-device neural voice** makes it sound human — no cloud, no key.
- **A coaching debrief.** Every interview ends with a score across STAR structure, technical depth, and communication, plus two strengths, two things to work on, and an example of a strong answer. AI-graded with a model loaded, heuristic otherwise.
- **Local-first and private.** The default simulation and Ollama transmit nothing; WebLLM and the neural voice download once from a public CDN and then run offline. Your answers never leave the machine.
- **Progress saved locally.** Past sessions and scores live in your browser — no account, no server.

## How to use it

1. **Pick your role** — the job you're interviewing for.
2. **Choose the interview type and difficulty** — behavioral, technical, or mixed.
3. **Choose an engine** — the built-in simulation (nothing to install), an in-browser WebLLM model, or your own Ollama.
4. **(Optional) Load the realistic voice** — a one-time download for a human-sounding interviewer, then pick the voice you like.
5. **Start the interview** — answer by voice or text, let the interviewer probe, and hit **End & score** for your debrief. Retry to watch your score climb.

## Run it locally

This is a Vite + React application. Install dependencies and start the dev server:

```bash
# from the repository root:
npm install
npm run dev
# then open the printed local URL (default http://localhost:5173)
```

Build a static production bundle with `npm run build`, and preview it with `npm run preview`. Best experienced on a desktop or laptop in Google Chrome or Edge — voice input and the in-browser model/voice use the Web Speech API and WebGPU.

## Project structure

```
.
├── index.html                  # Vite entry point
├── package.json                # dependencies and dev/build scripts
├── vite.config.js              # build config (React + Tailwind plugins, Pages base path)
├── LICENSE                     # dual license (MIT code + CC BY-NC-SA content)
├── README.md
└── src/
    ├── main.jsx                # React entry
    ├── index.css               # Tailwind + global styles
    ├── App.jsx                 # the UI: setup, live interview, and scored debrief
    ├── engine.js               # the local-inference layer (WebLLM, Ollama, simulation)
    ├── roles.js                # the role tracks: focus areas and seed question banks
    ├── interviewer.js          # system prompt, adaptive questioning, and scoring
    └── voice.js                # text-to-speech (browser + neural) and speech-to-text
```

## License

This project is **dual-licensed**:

- The **software framework and interface code** are licensed under the **MIT License**.
- The **content** (role definitions, interview question banks, and coaching text) is licensed under the **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License** (CC BY-NC-SA 4.0).

See the [LICENSE](LICENSE) file for full terms.

---

*This is my personal website and an independent educational resource. All views and content are entirely my own and do not represent the views, positions, endorsements, or policies of my employer or of any other person, organization, or institution. It runs open-source models locally with no cloud inference. Not affiliated with, endorsed by, or sponsored by Meta, Mistral AI, Google, Hugging Face, Ollama, or any other vendor; "Llama," "Qwen," "Kokoro," "Ollama," and "WebLLM" are trademarks of their respective owners, used only to identify the technologies this tool uses. Released for free public use.*

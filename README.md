# PHANTOM NODE — BB84 Quantum Cyber-Warfare

> A serverless, edge-deployed BB84 interception simulator built for the UTS
> capstone rubric: **clean separation between classical game logic and quantum
> routines**, **dynamic OpenQASM 2.0 generation**, and **provably correct
> wavefunction-collapse physics**.

You play **Eve**, a phantom node spliced into the BB84 quantum channel between
Alice and Bob. Each packet is a single qubit that decoheres in 5.0 seconds. You
must pick a measurement basis fast enough to steal the bit — but if you guess
wrong, the **observer effect** rewrites reality, Bob disagrees with Alice, and
the QBER alarm climbs.

---

## Architecture (Cloudflare Edge Stack)

The repo is a monorepo with two intentionally-separated workspaces. This
separation is the spine of the project: it satisfies the rubric's **"Clean
separation between classical game logic and quantum routines"** and isolates
quantum execution from UI concerns so each side can be graded, tested, and
deployed independently.

```
QuantumgameSimulation/
├── frontend/   ← React + Vite + Tailwind + Lucide-React  (CLASSICAL game logic)
└── worker/     ← Cloudflare Worker (TypeScript, ES modules) (QUANTUM execution)
```

| Concern                      | `/frontend` (React)                       | `/worker` (Cloudflare Worker)                                |
| ---------------------------- | ----------------------------------------- | ------------------------------------------------------------ |
| Layer                        | **Classical** game / presentation         | **Quantum** execution backend                                |
| Owns                         | RNG of round setup, timer, score, UI      | OpenQASM 2.0 program, BB84 measurement physics, RNG of `eve_result`/`bob_result` |
| Knows about                  | `fetch('/api/intercept')`                 | Nothing about UI, scoring, or timer                          |
| Deploy target                | Static (Vite build) → any CDN             | Cloudflare Workers (`wrangler deploy`)                       |
| Test surface                 | Component + interaction tests             | HTTP contract tests on `/api/intercept`                      |

### Why this maps directly to the grading rubric

- **SLO — Quantum correctness.** All quantum behavior lives behind a single
  HTTP boundary (`POST /api/intercept`). Swap in a real QPU/simulator (Qiskit
  Runtime, Cirq, Braket) and the frontend does not change a line. The
  deterministic physics is in <code>worker/src/index.ts → simulate()</code>
  with closed-form measurement statistics, not Monte Carlo waving of hands.
- **SLO — Clean separation.** The frontend never imports a quantum library,
  never constructs a QASM string, never reasons about basis collapse. The
  worker never imports React, Vite, or any UI library.
- **SLO — Educational visualization.** The worker returns the dynamically
  generated QASM and a `wavefunction_collapsed` flag. The frontend renders
  both as a Live QASM Visualizer and a Tactical Debrief that explains the
  observer effect in plain language.
- **SLO — Production readiness.** Cloudflare Workers give you global edge
  deploy, Wrangler dev parity, type-checked TypeScript, and CORS configured
  for any frontend origin.

---

## `/worker` — Quantum Execution Backend

### Endpoint

`POST /api/intercept`

```jsonc
// Request
{
  "alice_bit":   0 | 1,
  "alice_basis": "Z" | "X",
  "eve_basis":   "Z" | "X",
  "bob_basis":   "Z" | "X"
}
```

```jsonc
// Response
{
  "qasm_generated":         "OPENQASM 2.0; ...",
  "eve_result":             0 | 1,
  "bob_result":             0 | 1,
  "wavefunction_collapsed": true | false
}
```

CORS: `Access-Control-Allow-Origin: *` so the static frontend can call from any
origin (Vite dev, Pages, custom domain).

### Dynamic QASM Generation

The worker programmatically builds an OpenQASM 2.0 string at runtime — **no
hardcoded circuits**. For each request:

```
OPENQASM 2.0;
include "qelib1.inc";
qreg q[1];
creg c[2];

// Alice prepares
[ x q[0]; ]    // if alice_bit === 1
[ h q[0]; ]    // if alice_basis === 'X'
barrier q[0];

// Eve intercepts (rotate -> measure -> rotate back)
[ h q[0]; ]    // if eve_basis === 'X'
measure q[0] -> c[0];
[ h q[0]; ]    // if eve_basis === 'X'
barrier q[0];

// Bob measures
[ h q[0]; ]    // if bob_basis === 'X'
measure q[0] -> c[1];
```

Bracketed lines are emitted only when the boolean condition holds.

### BB84 Physics — closed form, not Monte Carlo

```
Eve:
  alice_basis === eve_basis  → eve_result = alice_bit            (deterministic, no collapse)
  alice_basis !== eve_basis  → eve_result ~ Bernoulli(1/2)        (wavefunction_collapsed = true)

Bob (measures the state Eve re-prepared in eve_basis):
  bob_basis === eve_basis  → bob_result = eve_result             (deterministic)
  bob_basis !== eve_basis  → bob_result ~ Bernoulli(1/2)         (random)
```

The `wavefunction_collapsed` flag drives the educational debrief in the UI.

### Run locally

```bash
cd worker
npm install
npm run dev          # starts wrangler dev on http://127.0.0.1:8787
```

Smoke test:

```bash
curl -X POST http://127.0.0.1:8787/api/intercept \
  -H 'Content-Type: application/json' \
  -d '{"alice_bit":1,"alice_basis":"Z","eve_basis":"Z","bob_basis":"Z"}'
```

### Deploy

```bash
cd worker
npx wrangler login
npm run deploy
```

`wrangler.toml` is pre-configured for `name = "phantom-node-worker"`.

---

## `/frontend` — Tactical Cyberpunk UI

### Stack

- **React 18** + **Vite 5** (TypeScript, strict mode)
- **Tailwind CSS 3** with a custom `terminal` palette (`neon`, `alert`,
  `warn`, `ok`, `dim`) and CRT-scanline overlay
- **Lucide-React** icons
- **JetBrains Mono** for the cyberpunk-terminal feel

### Game Mechanics

- **Round setup.** Each round randomizes Alice's bit, Alice's basis, and
  Bob's basis.
- **Coherence Timer.** Strict 5.0-second countdown. Hit zero and you lose
  your stealth streak (window missed).
- **Player action.** Two large buttons — `[Z] Rectilinear` or `[X] Diagonal`
  — fire `POST /api/intercept` with your chosen `eve_basis`.
- **Outcomes.**
  - `bob_result === alice_bit` → **Clean steal**: `Keys Stolen += 1`,
    `Stealth Streak += 1`.
  - `bob_result !== alice_bit` → **Detected**: `Detection Alarm += 25%`,
    streak reset.
  - `Detection Alarm >= 100%` → operation compromised, full reset.

### Educational Visualizers

- **Live QASM Visualizer.** The exact QASM string returned by the worker is
  rendered in a styled, scrollable code block — proving the circuit was
  generated dynamically for *this* request.
- **Tactical Debrief.** Renders the (`alice_*`, `eve_*`, `bob_*`) trace in a
  grid. When `wavefunction_collapsed === true`, the UI surfaces an explicit
  Observer Effect warning explaining that measuring a quantum state in the
  wrong basis fundamentally alters its reality — which is the whole reason
  BB84 is secure.

### Run locally

```bash
cd frontend
npm install
npm run dev          # starts Vite on http://127.0.0.1:5173
```

The frontend reads its API URL from `import.meta.env.VITE_API_URL`, falling
back to `http://127.0.0.1:8787` (the local Wrangler dev URL). Override for
production:

```bash
echo "VITE_API_URL=https://phantom-node-worker.<account>.workers.dev" > frontend/.env.local
npm --prefix frontend run build
```

---

## End-to-end local development

Run the worker and the frontend in two separate terminals:

```bash
# terminal 1
cd worker && npm install && npm run dev

# terminal 2
cd frontend && npm install && npm run dev
```

Open <http://127.0.0.1:5173> and click **Begin Operation**.

---

## Repository layout

```
.
├── README.md
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   ├── tsconfig*.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx           ← UI, game state, fetch to worker
│       ├── main.tsx
│       ├── types.ts
│       └── index.css
└── worker/
    ├── package.json
    ├── tsconfig.json
    ├── wrangler.toml
    └── src/
        └── index.ts          ← QASM generator + BB84 simulator + HTTP
```

---

## Rubric checklist

- [x] **Monorepo** with `/frontend` and `/worker` directories.
- [x] **Cloudflare Worker** at `POST /api/intercept` with CORS.
- [x] **Dynamic OpenQASM 2.0 generation** at runtime — no hardcoded circuits.
- [x] **Exact BB84 physics** — deterministic on basis match, uniform 50/50 on
      mismatch, with explicit `wavefunction_collapsed` reporting.
- [x] **`wrangler.toml`** configured for the worker.
- [x] **React + Vite + Tailwind + Lucide** cyberpunk terminal UI.
- [x] **5.0-second Coherence Timer** with stealth-streak penalty on miss.
- [x] **Detection Alarm** rising in 25% increments on detected interceptions.
- [x] **Live QASM Visualizer** displaying the worker's exact output.
- [x] **Tactical Debrief** that explains the observer effect when the
      wavefunction collapses.
- [x] **Configurable `VITE_API_URL`** falling back to the local Wrangler dev
      URL.
- [x] **README** documenting the classical/quantum separation.

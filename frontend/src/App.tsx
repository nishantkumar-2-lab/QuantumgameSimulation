import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Atom,
  Eye,
  KeyRound,
  Radio,
  RefreshCw,
  Shield,
  ShieldAlert,
  Skull,
  Terminal,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import type {
  Basis,
  Bit,
  InterceptPayload,
  InterceptResponse,
  RoundSetup,
} from "./types";

const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "http://127.0.0.1:8787";
const ROUND_DURATION_MS = 5_000;
const TICK_MS = 50;

type Phase = "idle" | "awaiting" | "fetching" | "result" | "missed";

interface RoundResult {
  setup: RoundSetup;
  eve_basis: Basis;
  payload: InterceptPayload;
  response: InterceptResponse;
  detected: boolean;
}

function randomBit(): Bit {
  return Math.random() > 0.5 ? 1 : 0;
}

function randomBasis(): Basis {
  return Math.random() > 0.5 ? "X" : "Z";
}

function newRoundSetup(): RoundSetup {
  return {
    alice_bit: randomBit(),
    alice_basis: randomBasis(),
    bob_basis: randomBasis(),
  };
}

function basisGlyph(b: Basis): string {
  return b === "Z" ? "⊕" : "⊗";
}

function basisName(b: Basis): string {
  return b === "Z" ? "Rectilinear" : "Diagonal";
}

export default function App(): JSX.Element {
  const [phase, setPhase] = useState<Phase>("idle");
  const [setup, setSetup] = useState<RoundSetup>(() => newRoundSetup());
  const [timeLeftMs, setTimeLeftMs] = useState<number>(ROUND_DURATION_MS);
  const [keysStolen, setKeysStolen] = useState<number>(0);
  const [streak, setStreak] = useState<number>(0);
  const [bestStreak, setBestStreak] = useState<number>(0);
  const [alarm, setAlarm] = useState<number>(0);
  const [lastResult, setLastResult] = useState<RoundResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startedAtRef = useRef<number | null>(null);

  // ---- Round lifecycle ----
  const startRound = useCallback(() => {
    setSetup(newRoundSetup());
    setLastResult(null);
    setError(null);
    setTimeLeftMs(ROUND_DURATION_MS);
    startedAtRef.current = performance.now();
    setPhase("awaiting");
  }, []);

  const fullReset = useCallback(() => {
    setKeysStolen(0);
    setStreak(0);
    setBestStreak(0);
    setAlarm(0);
    setLastResult(null);
    setError(null);
    setPhase("idle");
  }, []);

  // ---- Timer ----
  useEffect(() => {
    if (phase !== "awaiting") return;
    const id = window.setInterval(() => {
      if (startedAtRef.current === null) return;
      const elapsed = performance.now() - startedAtRef.current;
      const remaining = Math.max(0, ROUND_DURATION_MS - elapsed);
      setTimeLeftMs(remaining);
      if (remaining <= 0) {
        window.clearInterval(id);
        setPhase("missed");
        setStreak(0);
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [phase]);

  // ---- Game over (alarm full) ----
  const gameOver = alarm >= 100;
  useEffect(() => {
    if (gameOver && phase === "awaiting") {
      setPhase("missed");
    }
  }, [gameOver, phase]);

  // ---- Intercept action ----
  const intercept = useCallback(
    async (eve_basis: Basis) => {
      if (phase !== "awaiting" || gameOver) return;
      setPhase("fetching");
      const payload: InterceptPayload = {
        alice_bit: setup.alice_bit,
        alice_basis: setup.alice_basis,
        eve_basis,
        bob_basis: setup.bob_basis,
      };
      try {
        const res = await fetch(`/api/intercept`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          throw new Error(`Worker returned ${res.status}`);
        }
        const data = (await res.json()) as InterceptResponse;
        const detected = data.bob_result !== setup.alice_bit;
        const round: RoundResult = {
          setup,
          eve_basis,
          payload,
          response: data,
          detected,
        };
        setLastResult(round);
        if (detected) {
          setAlarm((prev) => Math.min(100, prev + 25));
          setStreak(0);
        } else {
          setKeysStolen((prev) => prev + 1);
          setStreak((prev) => {
            const next = prev + 1;
            setBestStreak((best) => Math.max(best, next));
            return next;
          });
        }
        setPhase("result");
      } catch (err) {
        setError(
          err instanceof Error
            ? `${err.message}. Is the worker running on ${API_URL}?`
            : "Unknown error contacting quantum worker.",
        );
        setPhase("awaiting");
      }
    },
    [phase, gameOver, setup],
  );

  const timerSeconds = (timeLeftMs / 1000).toFixed(1);
  const timerPct = Math.max(0, Math.min(100, (timeLeftMs / ROUND_DURATION_MS) * 100));

  return (
    <div className="min-h-screen w-full text-terminal-neon">
      <Header />

      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 lg:px-8">
        {error && (
          <div className="mb-4 flex items-center gap-3 rounded border border-terminal-alert/60 bg-terminal-alert/10 p-3 text-terminal-alert">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span className="font-mono text-sm">{error}</span>
          </div>
        )}

        <StatGrid
          timerSeconds={timerSeconds}
          timerPct={timerPct}
          phase={phase}
          alarm={alarm}
          keysStolen={keysStolen}
          streak={streak}
          bestStreak={bestStreak}
        />

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <RoundBriefing setup={setup} phase={phase} />
          <ActionPanel
            phase={phase}
            gameOver={gameOver}
            onIntercept={intercept}
            onStart={startRound}
            onReset={fullReset}
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <QasmVisualizer qasm={lastResult?.response.qasm_generated ?? null} />
          <TacticalDebrief result={lastResult} phase={phase} />
        </div>

        <Footer apiUrl={API_URL} />
      </main>
    </div>
  );
}

// =====================================================================
// Subcomponents
// =====================================================================

function Header(): JSX.Element {
  return (
    <header className="border-b border-terminal-border bg-terminal-panel/60 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded border border-terminal-neon/40 bg-terminal-neon/10 shadow-neon">
            <Atom className="h-5 w-5 text-terminal-neon animate-flicker" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-terminal-dim">
              Phantom Node // Cloudflare Edge
            </div>
            <h1 className="text-lg font-bold tracking-widest text-terminal-neon">
              BB84 INTERCEPTOR v1.0
            </h1>
          </div>
        </div>
        <div className="hidden items-center gap-2 text-xs text-terminal-dim md:flex">
          <Radio className="h-4 w-4 text-terminal-ok" />
          <span className="font-mono">CHANNEL ENCRYPTED</span>
          <span className="mx-2 text-terminal-border">|</span>
          <span className="font-mono">QUBITS: 1</span>
        </div>
      </div>
    </header>
  );
}

interface StatGridProps {
  timerSeconds: string;
  timerPct: number;
  phase: Phase;
  alarm: number;
  keysStolen: number;
  streak: number;
  bestStreak: number;
}

function StatGrid({
  timerSeconds,
  timerPct,
  phase,
  alarm,
  keysStolen,
  streak,
  bestStreak,
}: StatGridProps): JSX.Element {
  const timerActive = phase === "awaiting";
  const timerColor =
    timerPct > 50
      ? "text-terminal-ok"
      : timerPct > 20
        ? "text-terminal-warn"
        : "text-terminal-alert";

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardLabel icon={<Zap className="h-4 w-4" />}>Coherence Timer</CardLabel>
        <div
          className={`mt-1 font-mono text-4xl font-bold tabular-nums ${
            timerActive ? timerColor : "text-terminal-dim"
          }`}
        >
          {timerSeconds}s
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded bg-terminal-border/60">
          <div
            className={`h-full transition-[width] duration-100 ${
              timerPct > 50
                ? "bg-terminal-ok shadow-ok"
                : timerPct > 20
                  ? "bg-terminal-warn"
                  : "bg-terminal-alert shadow-alert"
            }`}
            style={{ width: `${timerPct}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] uppercase tracking-widest text-terminal-dim">
          decoherence in {timerSeconds}s
        </p>
      </Card>

      <Card alert={alarm >= 75}>
        <CardLabel icon={<ShieldAlert className="h-4 w-4" />}>
          Detection Alarm
        </CardLabel>
        <div
          className={`mt-1 font-mono text-4xl font-bold tabular-nums ${
            alarm >= 75
              ? "text-terminal-alert"
              : alarm >= 50
                ? "text-terminal-warn"
                : "text-terminal-ok"
          }`}
        >
          {alarm}%
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded bg-terminal-border/60">
          <div
            className={`h-full transition-[width] duration-300 ${
              alarm >= 75
                ? "bg-terminal-alert animate-pulseAlert"
                : alarm >= 50
                  ? "bg-terminal-warn"
                  : "bg-terminal-ok"
            }`}
            style={{ width: `${alarm}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] uppercase tracking-widest text-terminal-dim">
          {alarm >= 100
            ? "compromised — abort"
            : alarm >= 50
              ? "QBER rising — caution"
              : "channel nominal"}
        </p>
      </Card>

      <Card>
        <CardLabel icon={<KeyRound className="h-4 w-4" />}>
          Keys Stolen / Streak
        </CardLabel>
        <div className="mt-1 flex items-end gap-4">
          <span className="font-mono text-4xl font-bold text-terminal-neon">
            {keysStolen}
          </span>
          <span className="pb-1 font-mono text-sm text-terminal-dim">
            best <span className="text-terminal-ok">{bestStreak}</span>
          </span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-terminal-warn" />
          <span className="font-mono text-sm uppercase tracking-widest text-terminal-warn">
            Stealth Streak: {streak}
          </span>
        </div>
        <p className="mt-2 text-[11px] uppercase tracking-widest text-terminal-dim">
          undetected interceptions in a row
        </p>
      </Card>
    </div>
  );
}

interface RoundBriefingProps {
  setup: RoundSetup;
  phase: Phase;
}

function RoundBriefing({ setup, phase }: RoundBriefingProps): JSX.Element {
  const reveal = phase !== "idle";
  return (
    <Card>
      <CardLabel icon={<Eye className="h-4 w-4" />}>
        Round Briefing — Quantum Channel Trace
      </CardLabel>
      <div className="mt-3 grid grid-cols-3 gap-3 font-mono text-sm">
        <Field
          label="ALICE bit"
          value={reveal ? `|${setup.alice_bit}⟩` : "?"}
          tone="neon"
        />
        <Field
          label="ALICE basis"
          value={reveal ? `${basisGlyph(setup.alice_basis)} ${setup.alice_basis}` : "?"}
          tone="neon"
        />
        <Field
          label="BOB basis"
          value={reveal ? `${basisGlyph(setup.bob_basis)} ${setup.bob_basis}` : "?"}
          tone="warn"
        />
      </div>

      <div className="mt-4 rounded border border-terminal-border bg-terminal-bg/60 p-3 font-mono text-xs leading-relaxed text-terminal-dim">
        <span className="text-terminal-neon">$</span> alice prepare{" "}
        {reveal ? `bit=${setup.alice_bit} basis=${setup.alice_basis}` : "…"}
        <br />
        <span className="text-terminal-neon">$</span> bob await measurement in{" "}
        {reveal ? `basis=${setup.bob_basis}` : "…"}
        <br />
        <span className="text-terminal-alert">$</span> phantom_node intercept ⟶{" "}
        <span className="text-terminal-warn">basis=??</span>
      </div>

      <p className="mt-3 text-[11px] uppercase tracking-widest text-terminal-dim">
        Choose your projection basis. Match Alice and the wavefunction does not
        collapse — guess wrong and reality reshuffles.
      </p>
    </Card>
  );
}

interface ActionPanelProps {
  phase: Phase;
  gameOver: boolean;
  onIntercept: (basis: Basis) => void;
  onStart: () => void;
  onReset: () => void;
}

function ActionPanel({
  phase,
  gameOver,
  onIntercept,
  onStart,
  onReset,
}: ActionPanelProps): JSX.Element {
  if (phase === "idle") {
    return (
      <Card>
        <CardLabel icon={<Terminal className="h-4 w-4" />}>
          Operation Console
        </CardLabel>
        <p className="mt-2 font-mono text-sm text-terminal-dim">
          You are <span className="text-terminal-alert">EVE</span>, a phantom
          node spliced into the BB84 quantum link between Alice and Bob. Each
          packet is a single qubit. You have 5.0 seconds before decoherence to
          choose a basis and steal it without tripping the QBER alarm.
        </p>
        <button
          type="button"
          onClick={onStart}
          className="mt-5 w-full rounded border border-terminal-neon/60 bg-terminal-neon/10 py-4 text-lg font-bold uppercase tracking-[0.3em] text-terminal-neon shadow-neon transition hover:bg-terminal-neon/20 focus:outline-none focus:ring-2 focus:ring-terminal-neon"
        >
          ▶ Begin Operation
        </button>
      </Card>
    );
  }

  if (phase === "missed" && gameOver) {
    return (
      <Card alert>
        <CardLabel icon={<Skull className="h-4 w-4" />}>
          Operation Compromised
        </CardLabel>
        <p className="mt-2 font-mono text-sm text-terminal-alert">
          QBER threshold exceeded. Alice and Bob detected anomalous error rate
          and rotated keys. Phantom node burned.
        </p>
        <button
          type="button"
          onClick={onReset}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded border border-terminal-alert/60 bg-terminal-alert/10 py-4 text-lg font-bold uppercase tracking-[0.3em] text-terminal-alert shadow-alert transition hover:bg-terminal-alert/20"
        >
          <RefreshCw className="h-5 w-5" /> Reset Cell
        </button>
      </Card>
    );
  }

  if (phase === "missed") {
    return (
      <Card alert>
        <CardLabel icon={<AlertTriangle className="h-4 w-4" />}>
          Window Missed
        </CardLabel>
        <p className="mt-2 font-mono text-sm text-terminal-warn">
          Decoherence reached zero. Stealth streak reset. Standby for the next
          packet on the wire.
        </p>
        <button
          type="button"
          onClick={onStart}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded border border-terminal-warn/60 bg-terminal-warn/10 py-4 text-lg font-bold uppercase tracking-[0.3em] text-terminal-warn transition hover:bg-terminal-warn/20"
        >
          <RefreshCw className="h-5 w-5" /> Next Packet
        </button>
      </Card>
    );
  }

  if (phase === "result") {
    return (
      <Card>
        <CardLabel icon={<Shield className="h-4 w-4" />}>
          Round Complete
        </CardLabel>
        <p className="mt-2 font-mono text-sm text-terminal-dim">
          Review the QASM trace and tactical debrief below. When ready, splice
          the next qubit.
        </p>
        <button
          type="button"
          onClick={onStart}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded border border-terminal-neon/60 bg-terminal-neon/10 py-4 text-lg font-bold uppercase tracking-[0.3em] text-terminal-neon shadow-neon transition hover:bg-terminal-neon/20"
        >
          <Zap className="h-5 w-5" /> Next Packet ▸
        </button>
      </Card>
    );
  }

  // awaiting | fetching
  const disabled = phase === "fetching";
  return (
    <Card>
      <CardLabel icon={<Terminal className="h-4 w-4" />}>
        Choose Interception Basis
      </CardLabel>
      <p className="mt-2 font-mono text-xs uppercase tracking-widest text-terminal-dim">
        select projector before decoherence
      </p>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <BasisButton
          basis="Z"
          label="Rectilinear"
          glyph="⊕"
          disabled={disabled}
          onClick={() => onIntercept("Z")}
        />
        <BasisButton
          basis="X"
          label="Diagonal"
          glyph="⊗"
          disabled={disabled}
          onClick={() => onIntercept("X")}
        />
      </div>
      {phase === "fetching" && (
        <p className="mt-3 animate-pulse font-mono text-xs uppercase tracking-widest text-terminal-warn">
          ▮ executing qasm on edge runtime…
        </p>
      )}
    </Card>
  );
}

interface BasisButtonProps {
  basis: Basis;
  label: string;
  glyph: string;
  disabled: boolean;
  onClick: () => void;
}

function BasisButton({
  basis,
  label,
  glyph,
  disabled,
  onClick,
}: BasisButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group relative overflow-hidden rounded border border-terminal-neon/40 bg-terminal-bg/80 p-5 text-left transition hover:border-terminal-neon hover:bg-terminal-neon/10 hover:shadow-neon focus:outline-none focus:ring-2 focus:ring-terminal-neon disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-3xl font-bold text-terminal-neon">
          [{basis}]
        </span>
        <span className="text-3xl text-terminal-neon/80">{glyph}</span>
      </div>
      <div className="mt-2 font-mono text-xs uppercase tracking-[0.25em] text-terminal-dim">
        {label} basis
      </div>
      <div className="mt-1 font-mono text-[11px] text-terminal-dim/80">
        {basis === "Z" ? "{|0⟩, |1⟩}" : "{|+⟩, |−⟩}"}
      </div>
    </button>
  );
}

interface QasmVisualizerProps {
  qasm: string | null;
}

function QasmVisualizer({ qasm }: QasmVisualizerProps): JSX.Element {
  return (
    <Card>
      <CardLabel icon={<Terminal className="h-4 w-4" />}>
        Live QASM Visualizer (OpenQASM 2.0)
      </CardLabel>
      <p className="mt-1 text-[11px] uppercase tracking-widest text-terminal-dim">
        dynamically generated by the worker — no hardcoded circuits
      </p>
      <pre
        className="qasm-block mt-3 max-h-[280px] overflow-auto rounded border border-terminal-neon/30 bg-terminal-bg/80 p-3 font-mono text-[12px] leading-relaxed text-terminal-neon/90"
        aria-label="Generated QASM"
      >
        {qasm ?? "// Awaiting first interception. QASM will materialize here."}
      </pre>
    </Card>
  );
}

interface TacticalDebriefProps {
  result: RoundResult | null;
  phase: Phase;
}

function TacticalDebrief({ result, phase }: TacticalDebriefProps): JSX.Element {
  if (!result) {
    return (
      <Card>
        <CardLabel icon={<Shield className="h-4 w-4" />}>
          Tactical Debrief
        </CardLabel>
        <p className="mt-3 font-mono text-sm text-terminal-dim">
          {phase === "idle"
            ? "Begin operation to receive your first quantum packet."
            : "Awaiting interception outcome…"}
        </p>
      </Card>
    );
  }

  const { setup, eve_basis, response, detected } = result;
  const matchedAlice = setup.alice_basis === eve_basis;

  return (
    <Card alert={detected} ok={!detected && phase === "result"}>
      <CardLabel
        icon={
          detected ? (
            <ShieldAlert className="h-4 w-4 text-terminal-alert" />
          ) : (
            <Shield className="h-4 w-4 text-terminal-ok" />
          )
        }
      >
        {detected ? "Detected — QBER spike" : "Clean Steal — Key Captured"}
      </CardLabel>

      <div className="mt-3 grid grid-cols-2 gap-3 font-mono text-sm md:grid-cols-4">
        <Field label="alice bit" value={`|${setup.alice_bit}⟩`} tone="neon" />
        <Field
          label="alice basis"
          value={`${basisGlyph(setup.alice_basis)} ${setup.alice_basis}`}
          tone="neon"
        />
        <Field
          label="eve basis"
          value={`${basisGlyph(eve_basis)} ${eve_basis}`}
          tone={matchedAlice ? "ok" : "warn"}
        />
        <Field
          label="bob basis"
          value={`${basisGlyph(setup.bob_basis)} ${setup.bob_basis}`}
          tone="warn"
        />
        <Field
          label="eve_result"
          value={`|${response.eve_result}⟩`}
          tone={matchedAlice ? "ok" : "warn"}
        />
        <Field
          label="bob_result"
          value={`|${response.bob_result}⟩`}
          tone={detected ? "alert" : "ok"}
        />
        <Field
          label="bob = alice ?"
          value={detected ? "MISMATCH" : "MATCH"}
          tone={detected ? "alert" : "ok"}
        />
        <Field
          label="ψ collapse"
          value={response.wavefunction_collapsed ? "YES" : "NO"}
          tone={response.wavefunction_collapsed ? "alert" : "ok"}
        />
      </div>

      {response.wavefunction_collapsed && (
        <div className="mt-4 rounded border border-terminal-alert/60 bg-terminal-alert/10 p-3 font-mono text-[12px] leading-relaxed text-terminal-alert shadow-alert">
          <div className="mb-1 flex items-center gap-2 font-bold uppercase tracking-widest">
            <AlertTriangle className="h-4 w-4" /> Observer Effect Triggered
          </div>
          You measured Alice&apos;s qubit in basis{" "}
          <strong>{eve_basis}</strong>, but Alice prepared it in basis{" "}
          <strong>{setup.alice_basis}</strong>. Because{" "}
          {basisName(setup.alice_basis)} states are equal superpositions in the{" "}
          {basisName(eve_basis)} basis, your projector forced the qubit into a
          random eigenstate of{" "}
          <strong>{eve_basis}</strong>. The original quantum information is
          gone — measurement has fundamentally rewritten the qubit&apos;s
          reality. This is the heart of BB84 security: any eavesdropper using
          the wrong basis introduces ~25% bit-error on the sifted key, and
          Alice and Bob will see them.
        </div>
      )}

      {!response.wavefunction_collapsed && (
        <div className="mt-4 rounded border border-terminal-ok/40 bg-terminal-ok/10 p-3 font-mono text-[12px] leading-relaxed text-terminal-ok shadow-ok">
          Your projector aligned with Alice&apos;s preparation basis (
          <strong>{setup.alice_basis}</strong>). The qubit was an eigenstate of
          your measurement operator, so the outcome was deterministic and the
          wavefunction did <strong>not</strong> collapse into an altered state.
          This is the only way Eve can steal the bit without disturbing the
          channel — and she has no way to know Alice&apos;s basis in advance.
        </div>
      )}

      {detected && !response.wavefunction_collapsed && (
        <div className="mt-3 rounded border border-terminal-warn/40 bg-terminal-warn/10 p-3 font-mono text-[12px] text-terminal-warn">
          Note: even with a basis match, Bob measured in a different basis from
          the prepared state and got a random outcome. In real BB84, this round
          would simply be discarded during sifting and would not raise the
          alarm — but the game still flags it as a leaked packet.
        </div>
      )}
    </Card>
  );
}

function Footer({ apiUrl }: { apiUrl: string }): JSX.Element {
  return (
    <footer className="mt-8 border-t border-terminal-border pt-4 font-mono text-[11px] uppercase tracking-widest text-terminal-dim">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>quantum runtime ⇢ {apiUrl}/api/intercept</span>
        <span>monorepo · /frontend · /worker</span>
      </div>
    </footer>
  );
}

// =====================================================================
// Primitives
// =====================================================================

interface CardProps {
  children: ReactNode;
  alert?: boolean;
  ok?: boolean;
}

function Card({ children, alert, ok }: CardProps): JSX.Element {
  const border = alert
    ? "border-terminal-alert/60 shadow-alert"
    : ok
      ? "border-terminal-ok/40 shadow-ok"
      : "border-terminal-border";
  return (
    <section
      className={`relative overflow-hidden rounded border ${border} bg-terminal-panel/70 p-5 backdrop-blur`}
    >
      {/* corner accents */}
      <span className="pointer-events-none absolute left-0 top-0 h-2 w-2 border-l border-t border-terminal-neon/60" />
      <span className="pointer-events-none absolute right-0 top-0 h-2 w-2 border-r border-t border-terminal-neon/60" />
      <span className="pointer-events-none absolute bottom-0 left-0 h-2 w-2 border-b border-l border-terminal-neon/60" />
      <span className="pointer-events-none absolute bottom-0 right-0 h-2 w-2 border-b border-r border-terminal-neon/60" />
      {children}
    </section>
  );
}

function CardLabel({
  children,
  icon,
}: {
  children: ReactNode;
  icon?: ReactNode;
}): JSX.Element {
  return (
    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.25em] text-terminal-dim">
      {icon}
      <span>{children}</span>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  tone?: "neon" | "warn" | "alert" | "ok" | "dim";
}

function Field({ label, value, tone = "neon" }: FieldProps): JSX.Element {
  const colors: Record<NonNullable<FieldProps["tone"]>, string> = {
    neon: "text-terminal-neon",
    warn: "text-terminal-warn",
    alert: "text-terminal-alert",
    ok: "text-terminal-ok",
    dim: "text-terminal-dim",
  };
  return (
    <div className="rounded border border-terminal-border bg-terminal-bg/60 p-2">
      <div className="text-[10px] uppercase tracking-widest text-terminal-dim">
        {label}
      </div>
      <div className={`mt-0.5 text-base font-bold ${colors[tone]}`}>
        {value}
      </div>
    </div>
  );
}

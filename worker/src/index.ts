/**
 * Phantom Node — Quantum Execution Worker
 *
 * Serves POST /api/intercept. Dynamically generates an OpenQASM 2.0 program
 * for a single-qubit BB84 round (Alice -> Eve -> Bob), then simulates the
 * exact measurement statistics that QASM would produce on a real backend.
 *
 * The classical game (React frontend) talks only to this worker. Quantum
 * state preparation, basis rotations, and projective measurements live here.
 */

type Bit = 0 | 1;
type Basis = "Z" | "X";

interface InterceptPayload {
  alice_bit: Bit;
  alice_basis: Basis;
  eve_basis: Basis;
  bob_basis: Basis;
}

interface InterceptResponse {
  qasm_generated: string;
  eve_result: Bit;
  bob_result: Bit;
  wavefunction_collapsed: boolean;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
    },
  });
}

function isBit(value: unknown): value is Bit {
  return value === 0 || value === 1;
}

function isBasis(value: unknown): value is Basis {
  return value === "Z" || value === "X";
}

function validatePayload(raw: unknown): InterceptPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (
    isBit(r.alice_bit) &&
    isBasis(r.alice_basis) &&
    isBasis(r.eve_basis) &&
    isBasis(r.bob_basis)
  ) {
    return {
      alice_bit: r.alice_bit,
      alice_basis: r.alice_basis,
      eve_basis: r.eve_basis,
      bob_basis: r.bob_basis,
    };
  }
  return null;
}

/**
 * Programmatically construct an OpenQASM 2.0 string for a single BB84 round.
 *
 * Layout:
 *   [Alice prepares] -> barrier -> [Eve intercepts + re-prepares] ->
 *   barrier -> [Bob measures]
 */
function buildQasm(p: InterceptPayload): string {
  const lines: string[] = [];
  lines.push("OPENQASM 2.0;");
  lines.push('include "qelib1.inc";');
  lines.push("qreg q[1];");
  lines.push("creg c[2];");

  // --- Alice: encode classical bit in chosen basis ---
  if (p.alice_bit === 1) lines.push("x q[0];");
  if (p.alice_basis === "X") lines.push("h q[0];");
  lines.push("barrier q[0];");

  // --- Eve: rotate to her basis, measure, rotate back (re-prepare) ---
  if (p.eve_basis === "X") lines.push("h q[0];");
  lines.push("measure q[0] -> c[0];");
  if (p.eve_basis === "X") lines.push("h q[0];");
  lines.push("barrier q[0];");

  // --- Bob: measure in his basis ---
  if (p.bob_basis === "X") lines.push("h q[0];");
  lines.push("measure q[0] -> c[1];");

  return lines.join("\n");
}

/**
 * Exact BB84 measurement statistics.
 *
 * Eve:
 *   - alice_basis === eve_basis -> Eve's projector aligns with Alice's state,
 *     measurement is deterministic. eve_result = alice_bit. No collapse.
 *   - alice_basis !== eve_basis -> Alice's state is an equal superposition in
 *     Eve's basis, so the projector yields a uniform 50/50 outcome and the
 *     wavefunction collapses into Eve's basis.
 *
 * Eve then re-prepares (the QASM re-applies H if she used X), so the qubit
 * leaving Eve is encoded in `eve_basis` with bit value `eve_result`.
 *
 * Bob:
 *   - bob_basis === eve_basis -> deterministic, bob_result = eve_result.
 *   - bob_basis !== eve_basis -> uniform 50/50 outcome.
 */
function simulate(p: InterceptPayload): {
  eve_result: Bit;
  bob_result: Bit;
  wavefunction_collapsed: boolean;
} {
  let eve_result: Bit;
  let wavefunction_collapsed = false;

  if (p.alice_basis === p.eve_basis) {
    eve_result = p.alice_bit;
  } else {
    eve_result = Math.random() > 0.5 ? 1 : 0;
    wavefunction_collapsed = true;
  }

  let bob_result: Bit;
  if (p.bob_basis === p.eve_basis) {
    bob_result = eve_result;
  } else {
    bob_result = Math.random() > 0.5 ? 1 : 0;
  }

  return { eve_result, bob_result, wavefunction_collapsed };
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/health") {
      return jsonResponse({
        service: "phantom-node-worker",
        status: "online",
        endpoint: "POST /api/intercept",
      });
    }

    if (url.pathname !== "/api/intercept") {
      return jsonResponse({ error: "Not Found" }, 404);
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method Not Allowed" }, 405);
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const payload = validatePayload(raw);
    if (!payload) {
      return jsonResponse(
        {
          error:
            "Invalid payload. Expected { alice_bit: 0|1, alice_basis: 'Z'|'X', eve_basis: 'Z'|'X', bob_basis: 'Z'|'X' }.",
        },
        400,
      );
    }

    const qasm = buildQasm(payload);
    const sim = simulate(payload);

    const body: InterceptResponse = {
      qasm_generated: qasm,
      eve_result: sim.eve_result,
      bob_result: sim.bob_result,
      wavefunction_collapsed: sim.wavefunction_collapsed,
    };

    return jsonResponse(body);
  },
};

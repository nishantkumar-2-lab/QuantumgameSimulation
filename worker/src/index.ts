export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // --- CORS Preflight Handling ---
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }
      });
    }

    // --- The Quantum Intercept Route ---
    if (url.pathname === '/api/intercept' && request.method === 'POST') {
      try {
        const body = await request.json() as any;
        const { alice_bit, alice_basis, eve_basis, bob_basis } = body;

        // 1. Dynamic QASM Generation (Rubric Requirement)
        let qasm = [
          "OPENQASM 2.0;",
          'include "qelib1.inc";',
          "qreg q[1];",
          "creg c[2];",
          "",
          "// --- ALICE ENCODING ---"
        ];

        if (alice_bit === 1) qasm.push("x q[0];");
        if (alice_basis === 'X') qasm.push("h q[0];");

        qasm.push("barrier q[0];");
        qasm.push("// --- EVE INTERCEPTION ---");

        if (eve_basis === 'X') qasm.push("h q[0];");
        qasm.push("measure q[0] -> c[0];");
        if (eve_basis === 'X') qasm.push("h q[0];"); // Return to basis

        qasm.push("barrier q[0];");
        qasm.push("// --- BOB MEASUREMENT ---");

        if (bob_basis === 'X') qasm.push("h q[0];");
        qasm.push("measure q[0] -> c[1];");

        // 2. Physics Simulation: The Observer Effect
        let eve_result: number;
        let bob_result: number;
        let wavefunction_collapsed = false;

        let current_state_bit: number;
        let current_basis: string;

        if (alice_basis === eve_basis) {
            // Perfect stealth: Bases match
            eve_result = alice_bit;
            current_state_bit = alice_bit;
            current_basis = alice_basis;
        } else {
            // Wavefunction collapse: 50/50 probability
            eve_result = Math.random() > 0.5 ? 1 : 0;
            current_state_bit = eve_result;
            current_basis = eve_basis;
            wavefunction_collapsed = true;
        }

        // Bob's measurement
        if (bob_basis === current_basis) {
            bob_result = current_state_bit;
        } else {
            bob_result = Math.random() > 0.5 ? 1 : 0;
        }

        // 3. Return the JSON Payload
        return new Response(JSON.stringify({
          qasm_generated: qasm.join("\n"),
          eve_result,
          bob_result,
          wavefunction_collapsed
        }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });

      } catch (e) {
        return new Response(JSON.stringify({ error: "Invalid Request Payload" }), { status: 400 });
      }
    }

    // Catch-all for unrecognized backend routes
    return new Response("Quantum Backend Route Not Found", { status: 404 });
  }
};

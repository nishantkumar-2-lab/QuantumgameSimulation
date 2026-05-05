export type Bit = 0 | 1;
export type Basis = "Z" | "X";

export interface InterceptPayload {
  alice_bit: Bit;
  alice_basis: Basis;
  eve_basis: Basis;
  bob_basis: Basis;
}

export interface InterceptResponse {
  qasm_generated: string;
  eve_result: Bit;
  bob_result: Bit;
  wavefunction_collapsed: boolean;
}

export interface RoundSetup {
  alice_bit: Bit;
  alice_basis: Basis;
  bob_basis: Basis;
}

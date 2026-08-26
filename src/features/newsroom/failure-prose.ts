/**
 * The one sentence shape every operator-facing failure takes: what happened, then the durable
 * code in brackets.
 *
 * Model failures, delivery failures and tool failures are three unrelated closed unions owned by
 * three parts of the domain, so their explanations stay beside the thing they explain. What they
 * genuinely share is this last step, and writing it out a fourth time is how one panel quietly
 * stops naming the code an operator needs to search the record for.
 */
export function withFailureCode(explanation: string, code: string): string {
  return `${explanation} (${code})`;
}

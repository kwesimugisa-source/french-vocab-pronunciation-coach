/** Whole physical lines only: inline parenthetical dialogue remains dialogue. */
export function isStageDirection(line: string): boolean {
  const text = line.trim();
  return /^\(.+\)$/u.test(text) || /^\[.+\]$/u.test(text);
}

/**
 * Count + correctly pluralised noun.
 *
 * Exists because "1 bands selected" kept reappearing. It had been written
 * correctly in some branches and not in others of the same switch, which is the
 * signature of a rule that needs one home rather than seven ternaries. The app
 * asks people to trust what it tells them, and visibly broken grammar in a
 * status line is a small, constant argument against doing that.
 */
export function plural(n: number, singular: string, pluralForm?: string): string {
  return `${n} ${n === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

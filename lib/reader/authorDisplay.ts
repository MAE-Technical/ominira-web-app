/** Every pseudonym displays as "Comrade <name>" everywhere an author's
 * identity is shown (AuthorRow, the "replying to" chip) — the one shared
 * prefix rule for author identity across the app. Guards against
 * double-prefixing a name a caller already prefixed. */
export function comradeName(name: string): string {
  return /^comrade\s+/i.test(name) ? name : `Comrade ${name}`;
}

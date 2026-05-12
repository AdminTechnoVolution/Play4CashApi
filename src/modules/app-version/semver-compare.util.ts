/**
 * Same comparator the PWA uses (`pwa/versionContract.ts`). Kept as a tiny isolated util so it
 * can be imported by the stats service and unit-tested without mocking the whole module.
 */
export function compareSemver(a: string, b: string): number {
  const parse = (s: string): number[] =>
    String(s)
      .split('+')[0]
      .split('.')
      .map((p) => {
        const n = parseInt(p, 10);
        return Number.isFinite(n) ? n : 0;
      });
  const av = parse(a);
  const bv = parse(b);
  const len = Math.max(av.length, bv.length);
  for (let i = 0; i < len; i++) {
    const diff = (av[i] ?? 0) - (bv[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Bounded per-instance samples; scrape every instance for aggregate monitoring.
const durations: number[] = [];
let cursor = 0;
let accepted = 0;
let rejected = 0;
let conflicts = 0;
export function recordCommand(durationMs: number, result: { status?: string; reason?: string }) {
  durations[cursor++ % 4096] = durationMs;
  if (result.status === 'accepted') accepted++;
  else rejected++;
  if (result.reason === 'COMMAND_VERSION_CONFLICT') conflicts++;
}
export function commandMetrics() {
  const sorted = [...durations].sort((a, b) => a - b);
  return { accepted, rejected, conflicts, samples: sorted.length,
    internalP95Ms: sorted.length ? sorted[Math.ceil(sorted.length * .95) - 1] : null };
}

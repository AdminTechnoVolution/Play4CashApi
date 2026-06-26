import { Logger } from '@nestjs/common';
import { getCurrentRequestId } from './request-context';

export function elapsedMs(startedAt: bigint): number {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}

export function buildLogLine(
  event: string,
  startedAt: bigint,
  fields: Record<string, unknown> = {},
): string {
  const parts = [
    event,
    `reqId=${getCurrentRequestId() ?? 'n/a'}`,
    `duration_ms=${elapsedMs(startedAt).toFixed(1)}`,
    ...Object.entries(fields).map(([key, value]) => `${key}=${serializeField(value)}`),
  ];
  return parts.join(' ');
}

export function logSlowEvent(
  logger: Logger,
  event: string,
  startedAt: bigint,
  thresholdMs: number,
  fields: Record<string, unknown> = {},
): void {
  const duration = elapsedMs(startedAt);
  if (duration < thresholdMs) return;
  logger.warn(buildLogLine(event, startedAt, fields));
}

function serializeField(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

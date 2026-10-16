import { AsyncLocalStorage } from 'async_hooks';
import mongoose from 'mongoose';
import type { ClientSession } from 'mongoose';
export interface DurableEvent {
  namespace: string;
  rooms: string[];
  except: string[];
  event: string;
  args: unknown[];
}
export interface CommandContext {
  session: ClientSession;
  roomId: string;
  version: number;
  events: DurableEvent[];
  rejected: boolean;
  mode?: 'read' | 'command';
  beforeCommit?: Array<() => Promise<void>>;
  flushing?: boolean;
}
export const commandContext = new AsyncLocalStorage<CommandContext>();

/** Deferred callbacks must never inherit the session owned by a completed request. */
export function outsideTransaction<T>(work: () => T): T {
  const storage = (mongoose as unknown as { transactionAsyncLocalStorage?: AsyncLocalStorage<unknown> }).transactionAsyncLocalStorage;
  return commandContext.exit(() => storage ? storage.exit(work) : work());
}

export function deferTransactionWrite(work: () => Promise<void>): boolean {
  const context = commandContext.getStore();
  if (!context || context.flushing) return false;
  (context.beforeCommit ??= []).push(work);
  return true;
}
export async function flushTransactionWrites(context: CommandContext): Promise<void> {
  context.flushing = true;
  try { for (const work of context.beforeCommit ?? []) await work(); }
  finally { context.flushing = false; }
}

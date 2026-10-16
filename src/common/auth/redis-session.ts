/** Bounded authentication wait: a Redis outage never leaves packet authorization hanging forever. */
export async function redisSessionExists(redis: { exists: (key: string) => Promise<number>; isReady?: boolean }, key: string): Promise<boolean> {
  if (redis.isReady === false) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      redis.exists(key).then(value => value === 1),
      new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 2000); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

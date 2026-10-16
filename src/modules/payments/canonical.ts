import { createHash } from 'crypto';
export function canonical(value: unknown): string {
  const sort = (v: any): any => {
    if (Array.isArray(v)) return v.map(sort);
    if (v !== null && typeof v === 'object') {
      return Object.fromEntries(Object.keys(v).sort().map(k => [k, sort(v[k])]));
    }
    return v;
  };
  return JSON.stringify(sort(value));
}
export function fingerprint(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

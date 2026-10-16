/** Serialize native Decimal128 values as decimal strings, including nested audit journals. */
export function decimalWire(value: any): any {
  if (value == null || typeof value !== 'object') return value;
  if (value._bsontype === 'Decimal128') return value.toString();
  if (Array.isArray(value)) {
    const converted = value.map(decimalWire);
    return converted.every((item, index) => item === value[index]) ? value : converted;
  }
  if (value._bsontype || value instanceof Date || Buffer.isBuffer(value)) return value;
  if (typeof value.toJSON === 'function') return decimalWire(value.toJSON());
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  const entries = Object.entries(value).map(([key, item]) => [key, decimalWire(item)] as const);
  return entries.every(([key, item]) => item === value[key]) ? value : Object.fromEntries(entries);
}

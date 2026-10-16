import { Types } from 'mongoose';
import { decimalWire } from './decimal-wire';
describe('decimal wire format', () => {
  it('preserves nested money exactly without changing IDs or dates', () => {
    const id = new Types.ObjectId(); const createdAt = new Date();
    const data = { id, createdAt, postings: [{ amount: Types.Decimal128.fromString('999999999999999999.999999') }] };
    expect(decimalWire(data)).toEqual({ id, createdAt, postings: [{ amount: '999999999999999999.999999' }] });
  });
});

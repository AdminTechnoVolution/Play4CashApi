import Decimal from 'decimal.js';
import { Types } from 'mongoose';
import { BadRequestException } from '@nestjs/common';

Decimal.set({ precision: 40 });

// USDT accounting precision is explicit. Never silently round user input.
export function money(value: unknown, allowNegative = false): string {
  // 28 integer + 6 fractional digits fit Decimal128. Public DTOs cap requested amounts at 18 integer digits.
  if (typeof value !== 'string' || !/^-?\d{1,28}(\.\d{1,6})?$/.test(value)) {
    throw new BadRequestException('INVALID_USDT_AMOUNT');
  }
  const amount = new Decimal(value);
  if (!allowNegative && amount.isNegative()) throw new BadRequestException('INVALID_USDT_AMOUNT');
  return amount.toFixed(6);
}
export function positiveMoney(value: unknown): string {
  const normalized = money(value);
  if (new Decimal(normalized).lte(0)) throw new BadRequestException('AMOUNT_MUST_BE_POSITIVE');
  return normalized;
}
export function bsonMoney(value: string): Types.Decimal128 {
  return Types.Decimal128.fromString(money(value, true));
}
export function reviewRequired(amount: string, preceding24h: string, risk: boolean): boolean {
  return risk || new Decimal(amount).gt(500) || new Decimal(preceding24h).plus(amount).gt(1000);
}

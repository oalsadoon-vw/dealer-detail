/**
 * Money helpers. Tekion sends all amounts as INTEGER CENTS.
 * All inputs are nullable to tolerate sparse API responses.
 */

import type { Operation, Part } from "./types";

export function centsToDollars(cents: number): number {
  return cents / 100;
}

export function grossCents(
  saleAmount: number | null | undefined,
  costAmount: number | null | undefined,
): number {
  const sale = typeof saleAmount === "number" ? saleAmount : 0;
  const cost = typeof costAmount === "number" ? costAmount : 0;
  return sale - cost;
}

export function laborGrossCents(op: Operation): number {
  return grossCents(op.labor?.saleAmount ?? 0, op.labor?.costAmount ?? 0);
}

export function partsGrossCents(part: Part): number {
  return grossCents(part.saleAmount ?? 0, part.costAmount ?? 0);
}

/**
 * Part line saleAmount is ALREADY the extended line total (qty * unit).
 * Do not multiply by quantity.
 */
export function partLineSaleCents(part: Part): number {
  return typeof part.saleAmount === "number" ? part.saleAmount : 0;
}

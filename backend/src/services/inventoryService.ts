import { Inventory } from '../models/Inventory';
import { Calculation } from '../models/Calculation';
import { IInventory } from '../types';

/**
 * Shared helpers for the reporting-year inventory feature. The "reporting year"
 * of a calculation is the year of its period midpoint — the same rule the
 * intensity metrics use — so a fiscal year resolves to the year it mostly
 * covers.
 */

export function midpointYear(start: Date, end: Date): number {
  const mid = new Date((new Date(start).getTime() + new Date(end).getTime()) / 2);
  return mid.getUTCFullYear();
}

/** Default calendar-year period for a reporting year (UTC, inclusive). */
export function defaultPeriodForYear(year: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
  };
}

/**
 * Find (or create, as Draft) the inventory for an organization + reporting
 * year. Idempotent: the unique {organizationId, reportingYear} index guards
 * against duplicates if two requests race (the duplicate-key error is caught
 * and the existing document is returned).
 */
export async function ensureInventory(
  organizationId: string,
  year: number
): Promise<IInventory> {
  const existing = await Inventory.findOne({ organizationId, reportingYear: year });
  if (existing) return existing;
  try {
    return await Inventory.create({
      organizationId,
      reportingYear: year,
      period: defaultPeriodForYear(year),
      status: 'draft',
    });
  } catch (err: any) {
    if (err?.code === 11000) {
      const raced = await Inventory.findOne({ organizationId, reportingYear: year });
      if (raced) return raced;
    }
    throw err;
  }
}

export interface InventoryFigures {
  scope1: number;
  scope2: number;
  scope3: number;
  total: number;
  calculationCount: number;
  lockedCount: number;
}

/**
 * Live whole-year figures for an inventory, summed from the stored emissions of
 * its member calculations (membership is by inventoryId — the authoritative
 * link set on save / by the migration). Stored emissions are already frozen per
 * calculation at save time, so this is a deterministic recompute, not a
 * re-run of the engine.
 */
export async function computeInventoryFigures(
  organizationId: string,
  inventoryId: string
): Promise<InventoryFigures> {
  const calcs = await Calculation.find({ organizationId, inventoryId })
    .select('emissions status')
    .lean();

  const figures: InventoryFigures = {
    scope1: 0,
    scope2: 0,
    scope3: 0,
    total: 0,
    calculationCount: calcs.length,
    lockedCount: 0,
  };

  for (const c of calcs as any[]) {
    figures.scope1 += c.emissions?.scope1 || 0;
    figures.scope2 += c.emissions?.scope2 || 0;
    figures.scope3 += c.emissions?.scope3 || 0;
    if (c.status === 'locked') figures.lockedCount += 1;
  }

  figures.scope1 = Math.round(figures.scope1 * 100) / 100;
  figures.scope2 = Math.round(figures.scope2 * 100) / 100;
  figures.scope3 = Math.round(figures.scope3 * 100) / 100;
  figures.total = Math.round((figures.scope1 + figures.scope2 + figures.scope3) * 100) / 100;
  return figures;
}

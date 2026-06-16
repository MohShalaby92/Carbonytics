import { CalculationEngine } from '../src/services/calculationEngine';

/**
 * Unit tests for the calculation-engine logic shipped this session (no DB):
 *  - biogenic CO2 split + per-gas CO2e (computePerGasEmissions) — §1.3 / §1.4
 *  - fugitive material balance (computeMaterialBalance) — §2.2
 *
 * These exercise the pure deterministic methods directly (cast to any to reach
 * the private members) across many scenarios + every GWP set.
 */

const engine = new CalculationEngine();
const perGas = (value: number, factor: any, gwpSet: string) =>
  (engine as any).computePerGasEmissions(value, factor, { calculationMethod: 'activity_based' }, gwpSet);
const matBal = (categoryName: string, materialBalance: any) =>
  (engine as any).computeMaterialBalance({ category: categoryName }, { metadata: { materialBalance } });

const FOSSIL = (over: any = {}) => ({ co2: 2602, ch4: 0.276, n2o: 0.04, otherGhg: 0, metadata: {}, ...over });
const BIOMASS = (over: any = {}) => ({ co2: 52.07, ch4: 0.0032, n2o: 0.00063, otherGhg: 0, metadata: { biogenic: true }, ...over });

describe('computePerGasEmissions — biogenic split + per-gas CO2e', () => {
  it('non-biogenic factor: CO2 stays in scope, no biogenic memo (AR6)', () => {
    const r = perGas(1, FOSSIL(), 'AR6');
    expect(r).not.toBeNull();
    expect(r.co2).toBe(2602); // in-scope CO2 mass
    expect(r.ch4).toBe(0.276);
    expect(r.n2o).toBe(0.04);
    expect(r.co2e).toBe(2621.14); // 2602 + 0.276*29.8 + 0.04*273
    expect(r.biogenicCO2).toBeUndefined();
  });

  it('biogenic factor: CO2 split to memo, CH4/N2O stay in scope (AR6, 1000 units)', () => {
    const r = perGas(1000, BIOMASS(), 'AR6');
    expect(r.co2).toBe(0); // in-scope CO2 is zero for biomass
    expect(r.ch4).toBe(3.2); // 1000 * 0.0032
    expect(r.n2o).toBe(0.63); // 1000 * 0.00063
    expect(r.co2e).toBe(267.35); // 3.2*29.8 + 0.63*273 (CO2 excluded)
    expect(r.biogenicCO2).toBe(52070); // 1000 * 52.07, GWP-independent
  });

  it('biogenic CO2e follows the GWP set; biogenic mass does not (AR5)', () => {
    const r = perGas(1000, BIOMASS(), 'AR5');
    expect(r.co2e).toBe(256.55); // 3.2*28 + 0.63*265
    expect(r.biogenicCO2).toBe(52070);
  });

  it('biogenic under AR4', () => {
    const r = perGas(1000, BIOMASS(), 'AR4');
    expect(r.co2e).toBe(267.74); // 3.2*25 + 0.63*298
    expect(r.biogenicCO2).toBe(52070);
  });

  it('biogenic scope CO2e is GWP-independent for biomass CH4/N2O sanity (AR6 != AR5)', () => {
    expect(perGas(1000, BIOMASS(), 'AR6').co2e).not.toBe(perGas(1000, BIOMASS(), 'AR5').co2e);
    expect(perGas(1000, BIOMASS(), 'AR6').biogenicCO2).toBe(perGas(1000, BIOMASS(), 'AR5').biogenicCO2);
  });

  it('otherGhg (already CO2e) is added to the scope total', () => {
    const r = perGas(1000, BIOMASS({ otherGhg: 0.001 }), 'AR6');
    expect(r.co2e).toBe(268.35); // 267.35 + 1000*0.001
  });

  it('factor with no per-gas values returns null (CO2e-denominated path)', () => {
    expect(perGas(100, { co2: 0, ch4: 0, n2o: 0, metadata: {} }, 'AR6')).toBeNull();
  });

  it('non-activity_based category returns null', () => {
    const r = (engine as any).computePerGasEmissions(1, FOSSIL(), { calculationMethod: 'spend_based' }, 'AR6');
    expect(r).toBeNull();
  });

  it('biogenic flag must be exactly true (not truthy strings)', () => {
    const r = perGas(1000, BIOMASS({ metadata: { biogenic: 'yes' } }), 'AR6');
    // not boolean true -> treated as fossil: CO2 stays in scope, no memo
    expect(r.co2).toBe(52070);
    expect(r.biogenicCO2).toBeUndefined();
  });
});

describe('computeMaterialBalance — fugitive refrigerant mass balance', () => {
  it('full balance: purchases + Δinventory - charged - recovered', () => {
    const r = matBal('Fugitive Emissions', { purchases: 100, inventoryStart: 20, inventoryEnd: 15, chargedIntoEquipment: 30, recovered: 10 });
    expect(r.releasedKg).toBe(65); // 100 + (20-15) - 30 - 10
    expect(r.components).toEqual({ purchases: 100, inventoryStart: 20, inventoryEnd: 15, chargedIntoEquipment: 30, recovered: 10 });
  });

  it('clamps a net-negative balance to 0 (no negative emission)', () => {
    const r = matBal('Fugitive Emissions', { purchases: 5, chargedIntoEquipment: 30 });
    expect(r.releasedKg).toBe(0);
  });

  it('top-up only (purchases) = released', () => {
    expect(matBal('Fugitive Emissions', { purchases: 42 }).releasedKg).toBe(42);
  });

  it('inventory drawdown contributes to released', () => {
    expect(matBal('Fugitive Emissions', { inventoryStart: 50, inventoryEnd: 10 }).releasedKg).toBe(40);
  });

  it('sanitizes non-numeric / negative inputs to 0', () => {
    const r = matBal('Fugitive Emissions', { purchases: 'abc', inventoryStart: -5, recovered: 10 });
    expect(r.components.purchases).toBe(0);
    expect(r.components.inventoryStart).toBe(0);
    expect(r.components.recovered).toBe(10);
    expect(r.releasedKg).toBe(0); // 0 - 10 clamped
  });

  it('returns null for a non-fugitive category', () => {
    expect(matBal('Stationary Combustion', { purchases: 100 })).toBeNull();
  });

  it('returns null when no materialBalance metadata is present', () => {
    expect((engine as any).computeMaterialBalance({ category: 'Fugitive Emissions' }, { metadata: {} })).toBeNull();
  });
});

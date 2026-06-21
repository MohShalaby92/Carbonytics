import {
  normalizeHeader,
  resolveHeaderKey,
  mapRowToCanonical,
  stripScopePrefix,
  parseBoolean,
  parseNumberOrUndefined,
  buildMetadataFromRow,
  groupKey,
  duplicateKey,
  IMPORT_COLUMNS,
} from '../src/services/importMapping';

describe('importMapping — header resolution', () => {
  it('normalizes headers to lowercase alphanumerics', () => {
    expect(normalizeHeader('Period Start')).toBe('periodstart');
    expect(normalizeHeader('  MB Charged Into Equipment (kg) ')).toBe('mbchargedintoequipmentkg');
    expect(normalizeHeader(undefined)).toBe('');
  });

  it('resolves friendly headers, machine keys and aliases to canonical keys', () => {
    expect(resolveHeaderKey('Period Start')).toBe('periodStart');
    expect(resolveHeaderKey('period_start')).toBe('periodStart');
    expect(resolveHeaderKey('From')).toBe('periodStart'); // alias
    expect(resolveHeaderKey('Factor Code')).toBe('factorCode');
    expect(resolveHeaderKey('Title (groups rows)')).toBe('title');
    expect(resolveHeaderKey('totally unknown column')).toBeNull();
  });

  it('maps a raw row to canonical keys, dropping blanks and unknown columns', () => {
    const raw = {
      Category: 'Scope 2 — Purchased Electricity',
      Value: '1000',
      Unit: 'kWh',
      'Period Start': '2026-01-01',
      'Period End': '2026-03-31',
      'Factor Code': '',
      'Emissions (kg CO2e)': '458', // output-only export column — must be ignored
      Whatever: 'x',
    };
    const c = mapRowToCanonical(raw);
    expect(c.category).toBe('Scope 2 — Purchased Electricity');
    expect(c.value).toBe('1000');
    expect(c.periodStart).toBe('2026-01-01');
    expect(c.factorCode).toBeUndefined(); // blank dropped
    expect((c as any).emissions).toBeUndefined(); // not an input column
    expect((c as any).whatever).toBeUndefined();
  });
});

describe('importMapping — value parsing', () => {
  it('strips the "Scope N — " prefix from a category name', () => {
    expect(stripScopePrefix('Scope 2 — Purchased Electricity')).toBe('Purchased Electricity');
    expect(stripScopePrefix('Scope 1 - Stationary Combustion')).toBe('Stationary Combustion');
    expect(stripScopePrefix('Mobile Combustion')).toBe('Mobile Combustion');
  });

  it('parses booleans from yes/true/1/y', () => {
    ['Yes', 'yes', 'TRUE', '1', 'y'].forEach((v) => expect(parseBoolean(v)).toBe(true));
    ['No', 'false', '0', '', undefined].forEach((v) => expect(parseBoolean(v)).toBe(false));
  });

  it('parses numbers (with thousands separators) or undefined', () => {
    expect(parseNumberOrUndefined('1000')).toBe(1000);
    expect(parseNumberOrUndefined('1,200.5')).toBe(1200.5);
    expect(parseNumberOrUndefined('')).toBeUndefined();
    expect(parseNumberOrUndefined('abc')).toBeUndefined();
    expect(parseNumberOrUndefined('0')).toBe(0);
  });
});

describe('importMapping — metadata assembly', () => {
  it('collects travel / fuel / currency metadata only when present', () => {
    const md = buildMetadataFromRow({
      fuelType: 'Diesel',
      origin: 'CAI',
      destination: 'DXB',
      distance: '2196',
      travelMode: 'Flight',
      roundTrip: 'Yes',
      currency: 'USD',
    });
    expect(md).toMatchObject({
      fuelType: 'Diesel',
      origin: 'CAI',
      destination: 'DXB',
      distance: 2196,
      travelMode: 'Flight',
      roundTrip: true,
      currency: 'USD',
    });
    expect(md.materialBalance).toBeUndefined();
  });

  it('assembles materialBalance only when at least one MB component is given', () => {
    expect(buildMetadataFromRow({ unit: 'kg' }).materialBalance).toBeUndefined();
    const md = buildMetadataFromRow({
      mbPurchases: '100',
      mbInventoryStart: '20',
      mbInventoryEnd: '15',
      mbCharged: '30',
      mbRecovered: '10',
    });
    expect(md.materialBalance).toEqual({
      purchases: 100,
      inventoryStart: 20,
      inventoryEnd: 15,
      chargedIntoEquipment: 30,
      recovered: 10,
    });
  });

  it('defaults missing MB components to 0 when some are present', () => {
    const md = buildMetadataFromRow({ mbPurchases: '50' });
    expect(md.materialBalance).toEqual({
      purchases: 50,
      inventoryStart: 0,
      inventoryEnd: 0,
      chargedIntoEquipment: 0,
      recovered: 0,
    });
  });
});

describe('importMapping — grouping & duplicate keys', () => {
  it('keeps blank-title rows in their own group, merges shared Title+period+facility', () => {
    const a = groupKey({ title: '', periodStart: '2026-01-01', periodEnd: '2026-03-31' }, 5, 'fac1');
    const b = groupKey({ title: '', periodStart: '2026-01-01', periodEnd: '2026-03-31' }, 6, 'fac1');
    expect(a).toBe('__row_5');
    expect(b).toBe('__row_6');
    expect(a).not.toBe(b);

    const g1 = groupKey({ title: 'Q1 Energy', periodStart: '2026-01-01', periodEnd: '2026-03-31' }, 2, 'fac1');
    const g2 = groupKey({ title: 'Q1 Energy', periodStart: '2026-01-01', periodEnd: '2026-03-31' }, 3, 'fac1');
    expect(g1).toBe(g2); // same group → one multi-entry calculation

    const g3 = groupKey({ title: 'Q1 Energy', periodStart: '2026-01-01', periodEnd: '2026-03-31' }, 4, 'fac2');
    expect(g3).not.toBe(g1); // different facility → different group
  });

  it('builds a stable duplicate key (value rounded to 4dp, dates sliced to 10 chars)', () => {
    const k1 = duplicateKey({ categoryId: 'c1', periodStart: '2026-01-01', periodEnd: '2026-03-31', facilityId: 'f1', value: 1000 });
    const k2 = duplicateKey({ categoryId: 'c1', periodStart: '2026-01-01T00:00:00.000Z', periodEnd: '2026-03-31T00:00:00.000Z', facilityId: 'f1', value: 1000.00004 });
    expect(k1).toBe(k2);
    const k3 = duplicateKey({ categoryId: 'c1', periodStart: '2026-01-01', periodEnd: '2026-03-31', facilityId: 'f1', value: 1001 });
    expect(k3).not.toBe(k1);
  });
});

describe('importMapping — column model integrity', () => {
  it('exposes the 25 activity columns with unique keys', () => {
    const keys = IMPORT_COLUMNS.map((c) => c.key);
    expect(keys.length).toBe(25);
    expect(new Set(keys).size).toBe(25); // no duplicate keys
    ['category', 'value', 'unit', 'periodStart', 'periodEnd'].forEach((k) => expect(keys).toContain(k));
  });
});

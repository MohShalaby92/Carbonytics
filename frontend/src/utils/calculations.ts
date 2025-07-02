import { EmissionFactor, CalculationEntry } from '../types';
import { apiService } from '../services/api';

let categoryCache: Map<string, { scope: 1 | 2 | 3; name: string }> = new Map();
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function calculateEmissions(
  value: number,
  factor: EmissionFactor
): number {
  return value * factor.factor;
}

export function formatEmissions(emissions: number): string {
  if (emissions < 1000) {
    return `${emissions.toFixed(2)} kg CO₂e`;
  } else if (emissions < 1000000) {
    return `${(emissions / 1000).toFixed(2)} tonnes CO₂e`;
  } else {
    return `${(emissions / 1000000).toFixed(2)} kilotonnes CO₂e`;
  }
}

export function getEmissionIntensity(
  totalEmissions: number,
  metric: 'revenue' | 'employees' | 'area',
  value: number
): number {
  return totalEmissions / value;
}

export function classifyEmissionLevel(
  emissions: number
): 'low' | 'medium' | 'high' {
  if (emissions < 1000) return 'low';
  if (emissions < 10000) return 'medium';
  return 'high';
}

async function getCategoryScopeMappings(): Promise<Map<string, { scope: 1 | 2 | 3; name: string }>> {
  const now = Date.now();
  if (now - cacheTimestamp < CACHE_DURATION && categoryCache.size > 0) {
    return categoryCache;
  }

  try {
    const response = await apiService.get<{
      categories: Array<{ id: string; scope: 1 | 2 | 3; category: string }>;
    }>('/emission-categories');

    if (response.success && response.data?.categories) {
      categoryCache.clear();
      response.data.categories.forEach(cat => {
        categoryCache.set(cat.id, { scope: cat.scope, name: cat.category });
      });
      cacheTimestamp = now;
    }
  } catch (error) {
    console.warn('Failed to fetch category mappings, using cached data:', error);
  }

  return categoryCache;
}

export async function aggregateEmissionsByScope(
  entries: CalculationEntry[]
): Promise<{ scope1: number; scope2: number; scope3: number; total: number }> {
  if (entries.length === 0) {
    return { scope1: 0, scope2: 0, scope3: 0, total: 0 };
  }

  try {
    const scopeMappings = await getCategoryScopeMappings();
    const scopeTotals = { scope1: 0, scope2: 0, scope3: 0, total: 0 };

    entries.forEach(entry => {
      const emissions = entry.emissions || 0;
      scopeTotals.total += emissions;

      const categoryInfo = scopeMappings.get(entry.categoryId);
      const scope = categoryInfo?.scope;

      if (scope === 1) {
        scopeTotals.scope1 += emissions;
      } else if (scope === 2) {
        scopeTotals.scope2 += emissions;
      } else if (scope === 3) {
        scopeTotals.scope3 += emissions;
      } else {
        // Fallback: if scope not found, add to scope 3
        console.warn(`Scope not found for category ${entry.categoryId}, defaulting to Scope 3`);
        scopeTotals.scope3 += emissions;
      }
    });

    return scopeTotals;
  } catch (error) {
    console.error('Error aggregating emissions by scope:', error);
    
    // Fallback to original ratios logic if everything fails
    const total = entries.reduce((sum, entry) => sum + (entry.emissions || 0), 0);
    return {
      scope1: total * 0.3,
      scope2: total * 0.2,
      scope3: total * 0.5,
      total,
    };
  }
}

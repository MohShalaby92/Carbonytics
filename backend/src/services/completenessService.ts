import { Calculation } from '../models/Calculation';
import { EmissionCategory } from '../models/EmissionCategory';
import { Organization } from '../models/Organization';

/**
 * Completeness assessment (GHG Protocol completeness principle): account for all
 * relevant emission sources, and document + justify any omissions.
 *
 * A category is, for a given period:
 *  - covered   — it has at least one calculation entry in the period;
 *  - excluded  — it is documented in the exclusions register (explicit
 *                categoryId link, or a scope-tagged exclusion whose source text
 *                names the category) and has no data;
 *  - gap       — it is relevant but has neither data nor a documented exclusion
 *                (an UNDOCUMENTED omission — the thing completeness exists to flag).
 *
 * The "relevant" set is the union of:
 *  - categories the org explicitly screened relevant (relevantCategories);
 *  - categories that already have data in the period (clearly relevant);
 *  - categories referenced by exclusions (relevant-but-omitted).
 *
 * When the org has not screened any category, `screened` is false and the
 * relevant set is data ∪ exclusions, so completeness reads ~100% trivially —
 * the response says so and prompts a relevance screen rather than implying the
 * inventory is provably complete.
 */
export interface CompletenessResult {
  screened: boolean;
  relevantCount: number;
  coveredCount: number;
  excludedCount: number;
  gapCount: number;
  /** (covered + excluded) / relevant, as a percentage (0–100). */
  completenessPercent: number;
  byScope: Array<{
    scope: number;
    relevant: number;
    covered: number;
    excluded: number;
    gaps: number;
  }>;
  gaps: Array<{ categoryId: string; category: string; scope: number }>;
  note?: string;
}

interface CompletenessInput {
  organizationId: string;
  start: Date;
  end: Date;
}

export async function computeCompleteness(input: CompletenessInput): Promise<CompletenessResult> {
  const [organization, categories, calculations] = await Promise.all([
    Organization.findById(input.organizationId).select('exclusions relevantCategories').lean(),
    EmissionCategory.find({ isActive: true }).select('category scope').lean(),
    Calculation.find({
      organizationId: input.organizationId,
      'period.start': { $gte: input.start, $lte: input.end },
    })
      .select('data.categoryId')
      .lean(),
  ]);

  const catById = new Map<string, { category: string; scope: number }>();
  for (const c of categories as any[]) {
    catById.set(c._id.toString(), { category: c.category, scope: c.scope });
  }

  // Categories with data in the period.
  const covered = new Set<string>();
  for (const calc of calculations as any[]) {
    for (const entry of calc.data || []) {
      if (entry.categoryId) covered.add(entry.categoryId.toString());
    }
  }

  // Categories documented as excluded (explicit categoryId, or name match on a
  // scope-tagged exclusion).
  const exclusions = (organization as any)?.exclusions || [];
  const excluded = new Set<string>();
  for (const ex of exclusions) {
    if (ex.categoryId) {
      excluded.add(ex.categoryId.toString());
      continue;
    }
    const src = String(ex.source || '').toLowerCase();
    for (const [id, cat] of catById) {
      if (covered.has(id)) continue;
      const nameMatch = src.includes(cat.category.toLowerCase());
      const scopeMatch = ex.scope ? ex.scope === cat.scope : true;
      if (nameMatch && scopeMatch) excluded.add(id);
    }
  }

  const screenedList: string[] = ((organization as any)?.relevantCategories || []).map((c: any) =>
    c.toString()
  );
  const screened = screenedList.length > 0;

  // Relevant = screened ∪ has-data ∪ excluded.
  const relevant = new Set<string>([...screenedList, ...covered, ...excluded]);

  // Gaps: relevant categories with neither data nor a documented exclusion.
  const gaps: Array<{ categoryId: string; category: string; scope: number }> = [];
  for (const id of relevant) {
    if (covered.has(id) || excluded.has(id)) continue;
    const cat = catById.get(id);
    if (cat) gaps.push({ categoryId: id, category: cat.category, scope: cat.scope });
  }

  // Per-scope rollup.
  const scopes = [1, 2, 3];
  const byScope = scopes.map((scope) => {
    const inScope = (id: string) => catById.get(id)?.scope === scope;
    const rel = [...relevant].filter(inScope);
    const cov = rel.filter((id) => covered.has(id));
    const exc = rel.filter((id) => excluded.has(id) && !covered.has(id));
    return {
      scope,
      relevant: rel.length,
      covered: cov.length,
      excluded: exc.length,
      gaps: rel.length - cov.length - exc.length,
    };
  });

  const relevantCount = relevant.size;
  const coveredCount = [...relevant].filter((id) => covered.has(id)).length;
  const excludedCount = [...relevant].filter((id) => excluded.has(id) && !covered.has(id)).length;
  const gapCount = gaps.length;
  const completenessPercent =
    relevantCount > 0 ? Math.round(((coveredCount + excludedCount) / relevantCount) * 1000) / 10 : 0;

  return {
    screened,
    relevantCount,
    coveredCount,
    excludedCount,
    gapCount,
    completenessPercent,
    byScope,
    gaps: gaps.sort((a, b) => a.scope - b.scope || a.category.localeCompare(b.category)),
    note: screened
      ? undefined
      : 'No categories have been screened for relevance yet — completeness is measured only against categories with data or documented exclusions. Screen relevant categories under Compliance → Completeness to surface gaps.',
  };
}

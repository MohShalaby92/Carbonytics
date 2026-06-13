import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { complianceService } from '../../services/complianceService';
import { organizationService } from '../../services/organizationService';
import { calculationService } from '../../services/calculationService';
import { useAuth } from '../../hooks/useAuth';
import { CompletenessResult, EmissionCategory } from '../../types';
import { ClipboardCheck, CheckCircle2, AlertTriangle, Circle } from 'lucide-react';

const SCOPE_LABELS: Record<number, string> = { 1: 'Scope 1 — Direct', 2: 'Scope 2 — Energy', 3: 'Scope 3 — Value chain' };

/**
 * Completeness (GHG Protocol completeness principle): screen which categories
 * are relevant, then measure coverage against that set. A relevant category
 * with neither data nor a documented exclusion is an undocumented gap — the
 * thing this screen exists to surface before assurance.
 */
export const CompletenessTab: React.FC = () => {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'manager';

  const [categories, setCategories] = useState<EmissionCategory[]>([]);
  const [relevant, setRelevant] = useState<Set<string>>(new Set());
  const [completeness, setCompleteness] = useState<CompletenessResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Period for the completeness read — default to the current calendar year.
  const year = new Date().getFullYear();
  const [start, setStart] = useState(`${year}-01-01`);
  const [end, setEnd] = useState(`${year}-12-31`);

  const load = async () => {
    try {
      setLoading(true);
      const [cats, org, comp] = await Promise.all([
        calculationService.getEmissionCategories(),
        organizationService.getOrganization(),
        complianceService.getCompleteness(start, end),
      ]);
      setCategories(cats.categories || []);
      setRelevant(new Set(org.relevantCategories || []));
      setCompleteness(comp);
    } catch {
      setError('Failed to load completeness data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshCompleteness = async () => {
    try {
      setCompleteness(await complianceService.getCompleteness(start, end));
    } catch {
      /* surfaced on next save */
    }
  };

  const toggle = (id: string) => {
    if (!canEdit) return;
    setRelevant((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await complianceService.updateRelevantCategories([...relevant]);
      setMessage('Relevance screening saved.');
      await refreshCompleteness();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const byScope = useMemo(() => {
    const groups: Record<number, EmissionCategory[]> = { 1: [], 2: [], 3: [] };
    categories.forEach((c) => {
      if (groups[c.scope]) groups[c.scope].push(c);
    });
    return groups;
  }, [categories]);

  const gapIds = useMemo(
    () => new Set((completeness?.gaps || []).map((g) => g.categoryId)),
    [completeness]
  );

  const pct = completeness?.completenessPercent ?? 0;
  const pctColor = pct >= 90 ? 'text-green-600' : pct >= 60 ? 'text-yellow-600' : 'text-red-600';

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-2">
          <ClipboardCheck className="w-5 h-5 text-primary-600" />
          <h2 className="text-xl font-semibold text-fg">Completeness</h2>
        </div>
        <p className="text-sm text-muted mb-4">
          Mark the emission categories relevant to your organization, then coverage is measured
          against that set for the period below. A relevant category with neither data nor a
          documented exclusion is an undocumented gap. {!canEdit && '(Read-only — admin/manager can screen.)'}
        </p>

        {message && (
          <div className="mb-4 p-3 bg-green-500/10 border border-green-500/25 rounded-lg text-sm text-green-700 dark:text-green-300">
            {message}
          </div>
        )}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Period + summary */}
        <div className="flex flex-wrap items-end gap-3 mb-5">
          <div className="space-y-1">
            <label className="block text-xs text-muted">Period start</label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="block text-xs text-muted">Period end</label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <Button variant="outline" onClick={refreshCompleteness}>
            Recompute
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted py-6 text-center">Loading…</p>
        ) : completeness ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-2">
              <div className="rounded-lg border border-line p-3">
                <p className={`text-2xl font-bold ${pctColor}`}>{pct}%</p>
                <p className="text-xs text-muted mt-1">complete</p>
              </div>
              <div className="rounded-lg border border-line p-3">
                <p className="text-2xl font-semibold text-fg">{completeness.relevantCount}</p>
                <p className="text-xs text-muted mt-1">relevant</p>
              </div>
              <div className="rounded-lg border border-line p-3">
                <p className="text-2xl font-semibold text-green-600">{completeness.coveredCount}</p>
                <p className="text-xs text-muted mt-1">covered</p>
              </div>
              <div className="rounded-lg border border-line p-3">
                <p className="text-2xl font-semibold text-blue-600">{completeness.excludedCount}</p>
                <p className="text-xs text-muted mt-1">excluded</p>
              </div>
              <div className="rounded-lg border border-line p-3">
                <p className="text-2xl font-semibold text-red-600">{completeness.gapCount}</p>
                <p className="text-xs text-muted mt-1">gaps</p>
              </div>
            </div>
            {completeness.note && (
              <div className="mb-2 p-3 bg-blue-500/10 border border-blue-500/25 rounded-lg text-xs text-blue-700 dark:text-blue-300">
                {completeness.note}
              </div>
            )}
            {completeness.gapCount > 0 && (
              <div className="mb-2 p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-sm text-red-700 dark:text-red-300">
                <strong>Undocumented gaps:</strong>{' '}
                {completeness.gaps.map((g) => `S${g.scope} ${g.category}`).join(', ')}. Add data or
                document an exclusion in the Exclusions Register.
              </div>
            )}
          </>
        ) : null}
      </Card>

      {/* Relevance screening editor */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-fg">Relevance screening</h3>
          {canEdit && (
            <Button onClick={handleSave} loading={saving}>
              Save screening
            </Button>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-muted py-4 text-center">Loading…</p>
        ) : (
          <div className="space-y-5">
            {[1, 2, 3].map((scope) => (
              <div key={scope}>
                <p className="text-sm font-medium text-fg/80 mb-2">{SCOPE_LABELS[scope]}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                  {byScope[scope].map((c) => {
                    const isRelevant = relevant.has(c.id);
                    const isGap = gapIds.has(c.id);
                    return (
                      <label
                        key={c.id}
                        className={`flex items-center gap-2.5 p-2 rounded-lg border text-sm cursor-pointer transition-colors ${
                          isRelevant ? 'border-primary-500/40 bg-primary-50/40' : 'border-line hover:bg-fg/[0.03]'
                        } ${!canEdit ? 'cursor-default' : ''}`}
                      >
                        <input
                          type="checkbox"
                          className="rounded border-line"
                          checked={isRelevant}
                          disabled={!canEdit}
                          onChange={() => toggle(c.id)}
                        />
                        <span className="flex-1 text-fg/90">{c.category}</span>
                        {isGap ? (
                          <span title="Relevant but no data and no exclusion — undocumented gap">
                            <AlertTriangle className="w-4 h-4 text-red-500" />
                          </span>
                        ) : isRelevant ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <Circle className="w-4 h-4 text-muted/40" />
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
            <p className="text-xs text-muted">
              <AlertTriangle className="w-3.5 h-3.5 inline mb-0.5 text-red-500" /> = undocumented gap
              for the selected period · <CheckCircle2 className="w-3.5 h-3.5 inline mb-0.5 text-green-500" /> =
              relevant &amp; covered/excluded. Save, then Recompute to refresh the markers.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
};

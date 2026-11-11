import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { complianceService } from '../../services/complianceService';
import { useAuth } from '../../hooks/useAuth';
import { Inventory, RecalculationCheck } from '../../types';
import { CalendarRange, Plus, Lock, Unlock, Star, Send, Undo2, Calculator } from 'lucide-react';

/**
 * Reporting-year inventories: the year-level lifecycle layered over the
 * per-calculation lock. Draft → Review → Published (locked); publishing freezes
 * the GWP set + whole-year totals, locks the member calculations and writes a
 * snapshot. A base year can be designated (with a recalculation significance
 * threshold) and checked for drift.
 */
const statusVariant = (s: string): 'default' | 'warning' | 'success' =>
  s === 'published' ? 'success' : s === 'review' ? 'warning' : 'default';

export const InventoriesTab: React.FC = () => {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'manager';

  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newYear, setNewYear] = useState<number>(new Date().getFullYear());
  const [thresholdDraft, setThresholdDraft] = useState<Record<string, number>>({});
  const [recalc, setRecalc] = useState<Record<string, RecalculationCheck>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = async () => {
    try {
      setInventories(await complianceService.getInventories());
    } catch {
      setMessage({ type: 'error', text: 'Failed to load reporting-year inventories' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const errText = (err: any, fallback: string) =>
    err?.response?.data?.message || err?.message || fallback;

  const run = async (id: string, fn: () => Promise<any>, success: string) => {
    setBusyId(id);
    setMessage(null);
    try {
      await fn();
      await load();
      setMessage({ type: 'success', text: success });
    } catch (err: any) {
      setMessage({ type: 'error', text: errText(err, 'Action failed') });
    } finally {
      setBusyId(null);
    }
  };

  const create = async () => {
    if (!newYear || newYear < 2000 || newYear > 2100) {
      setMessage({ type: 'error', text: 'Enter a valid reporting year (2000–2100)' });
      return;
    }
    await run('new', () => complianceService.createInventory(newYear), `Reporting year ${newYear} created`);
  };

  const publish = (inv: Inventory) =>
    run(inv.id, () => complianceService.publishInventory(inv.id), `Reporting year ${inv.reportingYear} published`);

  const reopen = (inv: Inventory) => {
    if (!window.confirm(`Reopen ${inv.reportingYear}? This unlocks every member calculation for restatement.`)) return;
    return run(inv.id, () => complianceService.reopenInventory(inv.id), `Reporting year ${inv.reportingYear} reopened`);
  };

  const checkRecalc = async (inv: Inventory) => {
    setBusyId(inv.id);
    setMessage(null);
    try {
      const result = await complianceService.getRecalculationCheck(inv.id);
      setRecalc((prev) => ({ ...prev, [inv.id]: result }));
    } catch (err: any) {
      setMessage({ type: 'error', text: errText(err, 'Recalculation check failed') });
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <Card className="p-6 text-muted">Loading…</Card>;

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-2">
        <CalendarRange className="w-5 h-5 text-emphasis" />
        <h2 className="text-xl font-semibold text-fg">Reporting Years (Inventories)</h2>
      </div>
      <p className="text-sm text-muted mb-4">
        Each reporting year is an inventory with a lifecycle: <strong>Draft → Review → Published</strong>.
        Publishing freezes the GWP set and whole-year totals, locks the member calculations, and writes an
        immutable snapshot. Designate a base year (with a recalculation significance threshold) to track drift.
        {!canEdit && ' (Read-only — admin/manager can edit.)'}
      </p>

      {message && (
        <div
          className={`mb-4 p-3 rounded-lg border text-sm ${
            message.type === 'success'
              ? 'bg-green-500/10 border-green-500/25 text-green-800 dark:text-green-300'
              : 'bg-red-500/10 border-red-500/25 text-red-800 dark:text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {canEdit && (
        <div className="flex items-end gap-3 mb-6 p-3 border border-line rounded-lg bg-fg/[0.02]">
          <div className="space-y-1">
            <Input label="New reporting year"
              type="number"
              min="2000"
              max="2100"
              value={newYear || ''}
              onChange={(e) => setNewYear(parseInt(e.target.value, 10) || 0)}
              className="w-32"
            />
          </div>
          <Button variant="outline" size="sm" onClick={create} loading={busyId === 'new'}>
            <Plus className="w-4 h-4 me-1" /> Create
          </Button>
        </div>
      )}

      {inventories.length === 0 ? (
        <p className="text-sm text-muted py-6 text-center">No reporting-year inventories yet.</p>
      ) : (
        <div className="space-y-3">
          {inventories.map((inv) => {
            const figs = inv.current;
            const rc = recalc[inv.id];
            const busy = busyId === inv.id;
            return (
              <div key={inv.id} className="p-4 border border-line rounded-lg bg-fg/[0.02]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold text-fg">{inv.reportingYear}</span>
                    <Badge variant={statusVariant(inv.status)} size="sm">
                      {inv.status === 'published' ? 'Published / Locked' : inv.status}
                    </Badge>
                    {inv.isBaseYear && (
                      <Badge variant="info" size="sm">
                        <Star className="w-3 h-3 me-1" /> Base year
                      </Badge>
                    )}
                    {inv.status === 'published' && inv.gwpSet && (
                      <Badge variant="default" size="sm">GWP {inv.gwpSet} (pinned)</Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted">
                    {figs && (
                      <>
                        <span className="font-medium text-fg">{figs.total.toLocaleString()} kg CO₂e</span>
                        {' · '}
                        {figs.lockedCount}/{figs.calculationCount} locked
                      </>
                    )}
                  </div>
                </div>

                {figs && (
                  <div className="mt-2 text-xs text-muted">
                    Scope 1: {figs.scope1.toLocaleString()} · Scope 2: {figs.scope2.toLocaleString()} · Scope 3:{' '}
                    {figs.scope3.toLocaleString()} kg CO₂e
                    {inv.status === 'published' && inv.publishedAt && (
                      <> · published {String(inv.publishedAt).split('T')[0]} by {inv.publishedBy}</>
                    )}
                  </div>
                )}

                {canEdit && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {inv.status === 'draft' && (
                      <Button variant="outline" size="sm" disabled={busy}
                        onClick={() => run(inv.id, () => complianceService.transitionInventory(inv.id, 'review'), `${inv.reportingYear} moved to review`)}>
                        <Send className="w-4 h-4 me-1" /> Submit for review
                      </Button>
                    )}
                    {inv.status === 'review' && (
                      <Button variant="outline" size="sm" disabled={busy}
                        onClick={() => run(inv.id, () => complianceService.transitionInventory(inv.id, 'draft'), `${inv.reportingYear} returned to draft`)}>
                        <Undo2 className="w-4 h-4 me-1" /> Back to draft
                      </Button>
                    )}
                    {inv.status !== 'published' ? (
                      <Button variant="primary" size="sm" disabled={busy} onClick={() => publish(inv)}>
                        <Lock className="w-4 h-4 me-1" /> Publish
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" disabled={busy} onClick={() => reopen(inv)}>
                        <Unlock className="w-4 h-4 me-1" /> Reopen
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" disabled={busy}
                      onClick={() => run(inv.id, () => complianceService.setBaseYear(inv.id, !inv.isBaseYear), inv.isBaseYear ? `${inv.reportingYear} is no longer the base year` : `${inv.reportingYear} set as base year`)}>
                      <Star className="w-4 h-4 me-1" /> {inv.isBaseYear ? 'Unset base year' : 'Set base year'}
                    </Button>
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => checkRecalc(inv)}>
                      <Calculator className="w-4 h-4 me-1" /> Recalculation check
                    </Button>
                  </div>
                )}

                {/* Base-year recalculation threshold editor */}
                {canEdit && inv.isBaseYear && (
                  <div className="mt-3 flex items-end gap-2">
                    <div className="space-y-1">
                      <Input label="Recalculation threshold (%)"
                        type="number" min="0" max="100" step="any" className="w-28"
                        value={thresholdDraft[inv.id] ?? inv.recalcThresholdPercent}
                        onChange={(e) => setThresholdDraft((p) => ({ ...p, [inv.id]: parseFloat(e.target.value) }))}
                      />
                    </div>
                    <Button variant="outline" size="sm" disabled={busy}
                      onClick={() => run(inv.id, () => complianceService.setBaseYear(inv.id, true, thresholdDraft[inv.id] ?? inv.recalcThresholdPercent), 'Threshold saved')}>
                      Save threshold
                    </Button>
                  </div>
                )}

                {/* Recalculation check result */}
                {rc && (
                  <div className={`mt-3 p-3 rounded-lg border text-sm ${
                    !rc.applicable ? 'bg-fg/[0.03] border-line text-muted'
                      : rc.exceedsThreshold ? 'bg-amber-500/10 border-amber-500/25 text-amber-800 dark:text-amber-300'
                      : 'bg-green-500/10 border-green-500/25 text-green-800 dark:text-green-300'
                  }`}>
                    {!rc.applicable ? (
                      rc.note
                    ) : (
                      <>
                        <div>
                          Frozen (v{rc.frozen?.version}): <strong>{rc.frozen?.total?.toLocaleString()}</strong> kg ·
                          Current: <strong>{rc.current?.total?.toLocaleString()}</strong> kg · Drift:{' '}
                          <strong>{rc.deltaPercent}%</strong> vs {rc.thresholdPercent}% threshold ({rc.thresholdSource})
                        </div>
                        <div className="mt-1">{rc.recommendation}</div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

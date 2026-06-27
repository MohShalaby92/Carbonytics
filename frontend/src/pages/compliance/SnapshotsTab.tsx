import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { calculationService } from '../../services/calculationService';
import { complianceService } from '../../services/complianceService';
import { SnapshotMeta, SnapshotDiff, RecomputeCheckResult } from '../../types';
import { format } from 'date-fns';
import { History, GitCompareArrows, ShieldCheck, AlertTriangle } from 'lucide-react';

/**
 * Publication snapshots + restatement diffs: every lock records a version;
 * comparing two versions answers "what changed and why" for auditors.
 */
export const SnapshotsTab: React.FC = () => {
  const [calculations, setCalculations] = useState<any[]>([]);
  const [selectedCalcId, setSelectedCalcId] = useState('');
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [fromVersion, setFromVersion] = useState('');
  const [toVersion, setToVersion] = useState('');
  const [diff, setDiff] = useState<SnapshotDiff | null>(null);
  const [diffing, setDiffing] = useState(false);
  const [recompute, setRecompute] = useState<RecomputeCheckResult | null>(null);
  const [recomputing, setRecomputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Newest 100 calculations; snapshots only exist for ones that were locked.
    calculationService
      .getCalculations({ limit: 100 })
      .then((data: any) => setCalculations(Array.isArray(data) ? data : []))
      .catch(() => setCalculations([]));
  }, []);

  useEffect(() => {
    setSnapshots([]);
    setDiff(null);
    setRecompute(null);
    setFromVersion('');
    setToVersion('');
    setError(null);
    if (!selectedCalcId) return;
    setLoadingSnapshots(true);
    complianceService
      .getSnapshots(selectedCalcId)
      .then((snaps) => {
        setSnapshots(snaps);
        // Preselect the two most recent versions for a one-click diff.
        if (snaps.length >= 2) {
          setFromVersion(String(snaps[1].version));
          setToVersion(String(snaps[0].version));
        }
      })
      .catch((err: any) =>
        setError(err?.response?.data?.message || err?.message || 'Failed to load snapshots')
      )
      .finally(() => setLoadingSnapshots(false));
  }, [selectedCalcId]);

  const handleDiff = async () => {
    if (!selectedCalcId || !fromVersion || !toVersion) return;
    try {
      setDiffing(true);
      setError(null);
      setDiff(
        await complianceService.getSnapshotDiff(
          selectedCalcId,
          parseInt(fromVersion, 10),
          parseInt(toVersion, 10)
        )
      );
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Diff failed');
      setDiff(null);
    } finally {
      setDiffing(false);
    }
  };

  const handleRecompute = async () => {
    if (!selectedCalcId) return;
    try {
      setRecomputing(true);
      setError(null);
      setRecompute(await complianceService.getRecomputeCheck(selectedCalcId));
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Recompute check failed');
      setRecompute(null);
    } finally {
      setRecomputing(false);
    }
  };

  const formatValue = (value: any) =>
    value === undefined || value === null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-2">
        <History className="w-5 h-5 text-primary-600" />
        <h2 className="text-xl font-semibold text-fg">Snapshots & Restatements</h2>
      </div>
      <p className="text-sm text-muted mb-4">
        A versioned snapshot is recorded every time a calculation is locked (published).
        Compare two versions to see exactly what was restated, with the lock comments
        explaining why.
      </p>

      <div className="space-y-1 mb-4">
        <label className="block text-xs font-medium text-fg/80">Calculation</label>
        <Select value={selectedCalcId} onChange={(e) => setSelectedCalcId(e.target.value)}>
          <option value="">Select a calculation…</option>
          {calculations.map((calc: any) => {
            const id = calc.id || calc._id;
            return (
              <option key={id} value={id}>
                {calc.title} ({calc.status}
                {calc.createdAt ? `, ${format(new Date(calc.createdAt), 'MMM dd yyyy')}` : ''})
              </option>
            );
          })}
        </Select>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {selectedCalcId && (
        loadingSnapshots ? (
          <p className="text-sm text-muted py-4 text-center">Loading snapshots…</p>
        ) : snapshots.length === 0 ? (
          <p className="text-sm text-muted py-4 text-center">
            No snapshots recorded — a snapshot is written at every lock. Lock this calculation
            from the dashboard to record one. (Calculations locked before snapshotting was
            introduced have no versions until re-locked.)
          </p>
        ) : (
          <>
            <div className="space-y-2 mb-4">
              <p className="text-xs font-medium text-fg/80">
                Version history ({snapshots.length})
              </p>
              {snapshots.map((snap) => (
                <div
                  key={snap.id}
                  className="flex items-center justify-between p-3 bg-fg/[0.04] rounded-lg text-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="shrink-0 px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                      v{snap.version}
                    </span>
                    <span className="text-fg/80 truncate">
                      {snap.comment || 'locked'}
                    </span>
                  </div>
                  <span className="text-xs text-muted shrink-0 ml-3">
                    {snap.createdBy} · {format(new Date(snap.createdAt), 'MMM dd, yyyy HH:mm')}
                  </span>
                </div>
              ))}
            </div>

            {snapshots.length >= 2 && (
              <div className="p-4 border border-line rounded-lg space-y-3">
                <p className="text-xs font-medium text-fg/80 flex items-center gap-1.5">
                  <GitCompareArrows className="w-4 h-4" />
                  Restatement diff
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs text-muted">From version</label>
                    <Select value={fromVersion} onChange={(e) => setFromVersion(e.target.value)}>
                      {snapshots.map((s) => (
                        <option key={s.version} value={s.version}>v{s.version}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs text-muted">To version</label>
                    <Select value={toVersion} onChange={(e) => setToVersion(e.target.value)}>
                      {snapshots.map((s) => (
                        <option key={s.version} value={s.version}>v{s.version}</option>
                      ))}
                    </Select>
                  </div>
                  <Button size="sm" onClick={handleDiff} loading={diffing}>
                    Compare
                  </Button>
                </div>

                {diff && (
                  diff.identical ? (
                    <div className="p-3 bg-green-500/10 border border-green-500/25 rounded-lg text-sm text-green-700 dark:text-green-300">
                      Versions v{diff.from.version} and v{diff.to.version} are identical — no
                      restatement.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-muted border-b border-line">
                            <th className="py-2 pr-4 font-medium">Field</th>
                            <th className="py-2 pr-4 font-medium">v{diff.from.version}</th>
                            <th className="py-2 font-medium">v{diff.to.version}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {diff.changes.map((change, i) => (
                            <tr key={i} className="border-b border-line/50">
                              <td className="py-2 pr-4 font-mono text-xs text-fg/80">{change.path}</td>
                              <td className="py-2 pr-4 text-red-600 dark:text-red-400">
                                {formatValue(change.from)}
                              </td>
                              <td className="py-2 text-green-700 dark:text-green-400">
                                {formatValue(change.to)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </div>
            )}
          </>
        )
      )}

      {selectedCalcId && (
        <div className="mt-6 p-4 border border-line rounded-lg space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-fg flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-primary-600" />
                Deterministic recompute check
              </p>
              <p className="text-xs text-muted mt-0.5 max-w-xl">
                Re-runs the engine math against the immutable factor version pinned to each
                entry and confirms the stored figures still reproduce — even if the live
                factor was edited or a new annual set was imported over it.
              </p>
            </div>
            <Button size="sm" onClick={handleRecompute} loading={recomputing}>
              Run check
            </Button>
          </div>

          {recompute && (
            <>
              <div
                className={`p-3 rounded-lg text-sm border ${
                  recompute.summary.mismatches > 0
                    ? 'bg-red-500/10 border-red-500/25 text-red-700 dark:text-red-300'
                    : recompute.deterministic
                    ? 'bg-green-500/10 border-green-500/25 text-green-700 dark:text-green-300'
                    : 'bg-amber-500/10 border-amber-500/25 text-amber-700 dark:text-amber-300'
                }`}
              >
                <span className="font-semibold">
                  {recompute.summary.mismatches > 0
                    ? 'Not reproducible — recomputed figures differ from stored'
                    : recompute.deterministic
                    ? 'Deterministic — every entry reproduces from a pinned, immutable factor version'
                    : 'Reproducible against current factors — some entries predate version pinning'}
                </span>
                <div className="mt-1 text-xs opacity-90">
                  {recompute.summary.pinned} pinned · {recompute.summary.unpinned} unpinned ·{' '}
                  {recompute.summary.supported} checked · {recompute.summary.unsupported} not
                  recomputable · {recompute.summary.mismatches} mismatch(es) ·{' '}
                  {recompute.summary.driftedFactors} factor(s) drifted since pin
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted border-b border-line">
                      <th className="py-2 pr-4 font-medium">Category</th>
                      <th className="py-2 pr-4 font-medium">Factor</th>
                      <th className="py-2 pr-4 font-medium">Pinned ver.</th>
                      <th className="py-2 pr-4 font-medium text-right">Stored</th>
                      <th className="py-2 pr-4 font-medium text-right">Recomputed</th>
                      <th className="py-2 font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recompute.entries.map((e) => (
                      <tr key={e.index} className="border-b border-line/50">
                        <td className="py-2 pr-4 text-fg/80">{e.categoryName || '—'}</td>
                        <td className="py-2 pr-4 text-fg/70 truncate max-w-[14rem]">{e.factorName || '—'}</td>
                        <td className="py-2 pr-4 text-fg/70">
                          {e.versionPinned ? (
                            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-primary-500/15 text-primary-700 dark:text-primary-300">
                              v{e.factorVersion}
                            </span>
                          ) : (
                            <span className="text-xs text-muted">unpinned</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums text-fg/80">
                          {e.storedEmissions?.toLocaleString()}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums text-fg/80">
                          {e.recomputeSupported ? e.recomputedEmissions?.toLocaleString() : '—'}
                        </td>
                        <td className="py-2">
                          {!e.recomputeSupported ? (
                            <span className="text-xs text-muted" title={e.note}>not recomputable</span>
                          ) : e.matches ? (
                            <span className="text-xs text-green-700 dark:text-green-400 inline-flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5" /> reproduced
                              {e.factorChangedSincePin && (
                                <span
                                  className="ml-1 text-amber-600 dark:text-amber-400 inline-flex items-center gap-0.5"
                                  title={`Live factor (v${e.currentFactorVersion}) would now give ${e.liveEmissions?.toLocaleString()} — the pin preserves the original`}
                                >
                                  <AlertTriangle className="w-3.5 h-3.5" /> factor drifted
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-xs text-red-600 dark:text-red-400 inline-flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5" /> mismatch
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
};

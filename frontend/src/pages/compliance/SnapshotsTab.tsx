import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { calculationService } from '../../services/calculationService';
import { complianceService } from '../../services/complianceService';
import { SnapshotMeta, SnapshotDiff } from '../../types';
import { format } from 'date-fns';
import { History, GitCompareArrows } from 'lucide-react';

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
    </Card>
  );
};

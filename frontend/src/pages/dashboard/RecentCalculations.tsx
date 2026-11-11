import React, { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { formatEmissions } from '../../utils/calculations';
import { complianceService } from '../../services/complianceService';
import { useAuth } from '../../hooks/useAuth';
import { Clock, ExternalLink, Lock, LockOpen, BadgeCheck } from 'lucide-react';
import { format } from 'date-fns';

interface RecentCalculationsProps {
  calculations: any[];
  /** Called after a lock/unlock so the parent can refetch. */
  onChanged?: () => void;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-fg/[0.06] text-fg/70 border-line' },
  completed: { label: 'Completed', className: 'bg-sky-500/15 text-sky-800 dark:text-sky-300 border-sky-500/20' },
  verified: { label: 'Verified', className: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/20' },
  locked: { label: 'Locked', className: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/20' },
};

export const RecentCalculations: React.FC<RecentCalculationsProps> = ({ calculations, onChanged }) => {
  const { user } = useAuth();
  const canLock = user?.role === 'admin' || user?.role === 'manager';
  // Verifier (or admin) can independently sign off a locked inventory.
  const canVerify = user?.role === 'verifier' || user?.role === 'admin';
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLockToggle = async (calc: any) => {
    const id = calc.id || calc._id;
    if (!id) return;
    try {
      setBusyId(id);
      setError(null);
      if (calc.status === 'locked') {
        await complianceService.unlockCalculation(id);
      } else {
        await complianceService.lockCalculation(id);
      }
      onChanged?.();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Lock change failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleVerify = async (calc: any) => {
    const id = calc.id || calc._id;
    if (!id) return;
    try {
      setBusyId(id);
      setError(null);
      await complianceService.verifyCalculation(id);
      onChanged?.();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Verify failed');
    } finally {
      setBusyId(null);
    }
  };

  if (!calculations || calculations.length === 0) {
    return (
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-fg mb-4">Recent Calculations</h2>
        <div className="text-center py-6">
          <Clock className="w-8 h-8 text-muted mx-auto mb-2" />
          <p className="text-sm text-muted">No recent calculations</p>
          <Button variant="outline" className="mt-3" href="/calculations">
            Start Calculating
          </Button>
        </div>
      </Card>
    );
  }

  const recentCalcs = calculations.slice(0, 5);

  const getScopeColor = (scope: number) => {
    switch (scope) {
      case 1: return 'bg-red-500/15 text-red-800 dark:text-red-300';
      case 2: return 'bg-yellow-500/15 text-yellow-800 dark:text-yellow-300';
      case 3: return 'bg-green-500/15 text-green-800 dark:text-green-300';
      default: return 'bg-fg/[0.06] text-fg/80';
    }
  };

  // A saved calculation can span several scopes — show a chip for each non-zero one.
  const getScopes = (calc: any): number[] => {
    const e = calc.emissions || {};
    const scopes = [1, 2, 3].filter((s) => (e[`scope${s}`] || 0) > 0);
    return scopes.length > 0 ? scopes : [];
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-fg">Recent Calculations</h2>
        <Button variant="ghost" size="sm" href="/calculations">
          View All
        </Button>
      </div>

      {error && (
        <div className="mb-3 p-2 bg-red-500/10 border border-red-500/25 rounded text-xs text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {recentCalcs.map((calc, index) => {
          const id = calc.id || calc._id;
          const badge = STATUS_BADGE[calc.status] || STATUS_BADGE.draft;
          const isLocked = calc.status === 'locked';
          return (
            <div key={id || index} className="flex items-center justify-between p-3 bg-fg/[0.04] rounded-lg hover:bg-fg/[0.06] transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {getScopes(calc).map((s) => (
                    <span key={s} className={`px-2 py-0.5 text-xs font-medium rounded-full ${getScopeColor(s)}`}>
                      S{s}
                    </span>
                  ))}
                  <span className="text-sm font-medium text-fg truncate">
                    {calc.title || 'Untitled calculation'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span className={`px-1.5 py-0.5 font-semibold rounded-full border ${badge.className}`}>
                    {badge.label}
                  </span>
                  <Clock className="w-3 h-3" />
                  <span>
                    {calc.createdAt ? format(new Date(calc.createdAt), 'MMM dd, HH:mm') : 'Just now'}
                  </span>
                  {Array.isArray(calc.data) && (
                    <span>· {calc.data.length} {calc.data.length === 1 ? 'entry' : 'entries'}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 ms-3">
                <p className="text-sm font-medium text-fg whitespace-nowrap">
                  {formatEmissions(calc.emissions?.total || 0)}
                </p>
                {calc.verification?.verified && (
                  <span
                    title={`Independently verified${calc.verification.verifiedBy ? ` by ${calc.verification.verifiedBy}` : ''}`}
                  >
                    <BadgeCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </span>
                )}
                {canVerify && isLocked && !calc.verification?.verified && id && (
                  <button
                    onClick={() => handleVerify(calc)}
                    disabled={busyId === id}
                    title="Mark this locked inventory as independently verified (audited)"
                    className="p-1.5 rounded-lg text-muted hover:text-positive hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
                  >
                    <BadgeCheck className="w-4 h-4" />
                  </button>
                )}
                {canLock && id && (
                  <button
                    onClick={() => handleLockToggle(calc)}
                    disabled={busyId === id}
                    title={isLocked
                      ? 'Unlock (audited) — allows corrections, then re-lock'
                      : 'Lock (publish) — makes the calculation immutable and records a snapshot'}
                    className="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-fg/[0.08] transition-colors disabled:opacity-50"
                  >
                    {isLocked ? <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400" /> : <LockOpen className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Button variant="outline" className="w-full mt-4" href="/calculations">
        <ExternalLink className="w-4 h-4 me-2" />
        New Calculation
      </Button>
    </Card>
  );
};

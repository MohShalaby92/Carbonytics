import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Target, TrendingDown, Calendar } from 'lucide-react';
import { apiService } from '../../services/api';
import { calculationService } from '../../services/calculationService';
import { formatEmissions } from '../../utils/calculations';
import type { OrgTarget } from './TargetsModal';

interface TargetsProgressProps {
  /** Opens the targets configuration modal (owned by the dashboard page). */
  onConfigure?: () => void;
  /** Bump to force a reload after targets are saved. */
  refreshToken?: number;
}

interface TargetView extends OrgTarget {
  achievedReduction: number; // % reduction achieved vs baseline
  progressOfGoal: number; // % of the reduction goal achieved (0-100)
  expectedPace: number; // % of goal expected by now on a linear path
  status: 'ahead' | 'on-track' | 'needs-attention';
}

export const TargetsProgress: React.FC<TargetsProgressProps> = ({
  onConfigure,
  refreshToken = 0,
}) => {
  const [targets, setTargets] = useState<TargetView[]>([]);
  const [currentAnnual, setCurrentAnnual] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTargets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  const loadTargets = async () => {
    try {
      setLoading(true);

      // Trailing 12 months of saved calculations = current annual emissions.
      const end = new Date();
      const start = new Date();
      start.setFullYear(end.getFullYear() - 1);

      const [orgResponse, calcs] = await Promise.all([
        apiService.get<any>('/organizations'),
        calculationService.getCalculations({
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          limit: 100,
        }),
      ]);

      const annual = (Array.isArray(calcs) ? calcs : []).reduce(
        (sum: number, c: any) => sum + (c.emissions?.total || 0),
        0
      );
      setCurrentAnnual(annual);

      const raw: OrgTarget[] = orgResponse?.data?.targets || [];
      const now = new Date().getFullYear();

      setTargets(
        raw.map((t) => {
          const achievedReduction =
            t.baselineEmissions > 0
              ? Math.max(0, ((t.baselineEmissions - annual) / t.baselineEmissions) * 100)
              : 0;
          const progressOfGoal = Math.min(100, (achievedReduction / t.targetReduction) * 100);
          const span = Math.max(1, t.targetYear - t.baselineYear);
          const expectedPace = Math.min(100, Math.max(0, ((now - t.baselineYear) / span) * 100));
          const status: TargetView['status'] =
            progressOfGoal >= expectedPace + 10
              ? 'ahead'
              : progressOfGoal >= expectedPace - 10
              ? 'on-track'
              : 'needs-attention';
          return { ...t, achievedReduction, progressOfGoal, expectedPace, status };
        })
      );
    } catch (error) {
      console.error('Failed to load targets:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'on-track': return 'bg-green-500/15 text-green-800 dark:text-green-300';
      case 'ahead': return 'bg-blue-500/15 text-blue-800 dark:text-blue-300';
      case 'needs-attention': return 'bg-red-500/15 text-red-800 dark:text-red-300';
      default: return 'bg-fg/[0.06] text-fg/80';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'on-track': return 'On Track';
      case 'ahead': return 'Ahead of Schedule';
      case 'needs-attention': return 'Needs Attention';
      default: return 'Unknown';
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-emphasis" />
          <h2 className="text-lg font-semibold text-fg">Targets & Goals</h2>
        </div>
        <Button variant="outline" size="sm" onClick={onConfigure}>
          <Calendar className="w-4 h-4 me-2" />
          Set Targets
        </Button>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          <div className="h-20 bg-fg/[0.06] rounded-lg" />
          <div className="h-20 bg-fg/[0.06] rounded-lg" />
        </div>
      ) : targets.length === 0 ? (
        <div className="text-center py-6">
          <Target className="w-8 h-8 text-muted mx-auto mb-2" />
          <p className="text-sm text-muted mb-3">
            No targets set yet — define a baseline and reduction goal to track progress.
          </p>
          <Button variant="outline" onClick={onConfigure}>
            <TrendingDown className="w-4 h-4 me-2" />
            Set Your First Target
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {targets.map((target, idx) => (
            <div key={idx} className="border border-line rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-medium text-fg">{target.name}</h3>
                  <p className="text-sm text-muted mt-1">
                    {target.targetReduction}% below {target.baselineYear} baseline (
                    {formatEmissions(target.baselineEmissions)}) by {target.targetYear}
                  </p>
                </div>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(target.status)}`}>
                  {getStatusText(target.status)}
                </span>
              </div>

              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted">Progress toward goal</span>
                <span className="text-sm font-medium text-fg">
                  {target.progressOfGoal.toFixed(0)}%
                  <span className="text-xs text-muted ms-1">
                    (expected ~{target.expectedPace.toFixed(0)}% by now)
                  </span>
                </span>
              </div>

              <div className="w-full bg-fg/[0.08] rounded-full h-2 mb-3">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${
                    target.status === 'on-track' ? 'bg-green-500' :
                    target.status === 'ahead' ? 'bg-blue-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${Math.max(2, target.progressOfGoal)}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-muted">
                <span>
                  Current (trailing 12 mo): {formatEmissions(currentAnnual)} ·{' '}
                  {target.achievedReduction.toFixed(1)}% below baseline
                </span>
                <span>
                  {Math.max(0, target.targetYear - new Date().getFullYear())} years remaining
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

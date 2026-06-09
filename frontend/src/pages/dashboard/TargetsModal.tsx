import React, { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Plus, Trash2 } from 'lucide-react';
import { apiService } from '../../services/api';

export interface OrgTarget {
  name: string;
  description?: string;
  baselineYear: number;
  baselineEmissions: number; // kg CO2e in the baseline year
  targetYear: number;
  targetReduction: number; // percent vs baseline
}

interface TargetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const emptyTarget = (): OrgTarget => ({
  name: '',
  baselineYear: new Date().getFullYear() - 1,
  baselineEmissions: 0,
  targetYear: 2030,
  targetReduction: 50,
});

export const TargetsModal: React.FC<TargetsModalProps> = ({ isOpen, onClose, onSaved }) => {
  const [targets, setTargets] = useState<OrgTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await apiService.get<any>('/organizations');
        const existing = response?.data?.targets;
        setTargets(Array.isArray(existing) && existing.length > 0 ? existing : [emptyTarget()]);
      } catch (e) {
        console.error('Failed to load targets:', e);
        setTargets([emptyTarget()]);
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen]);

  const update = (index: number, patch: Partial<OrgTarget>) => {
    setTargets((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  };

  const handleSave = async () => {
    const cleaned = targets.filter((t) => t.name.trim() !== '');
    for (const t of cleaned) {
      if (!(t.baselineEmissions > 0)) {
        setError(`"${t.name}": baseline emissions must be greater than 0 kg CO₂e.`);
        return;
      }
      if (t.targetYear <= t.baselineYear) {
        setError(`"${t.name}": target year must be after the baseline year.`);
        return;
      }
    }
    try {
      setSaving(true);
      setError(null);
      const response = await apiService.put<any>('/organizations/targets', { targets: cleaned });
      if (!response.success) throw new Error(response.message || 'Save failed');
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to save targets');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Configure Emission Targets" size="lg">
      {loading ? (
        <div className="animate-pulse space-y-3">
          <div className="h-10 bg-fg/[0.08] rounded" />
          <div className="h-10 bg-fg/[0.08] rounded w-2/3" />
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-muted">
            Targets compare your trailing 12-month emissions against a baseline year you
            provide. Enter the baseline in <strong>kg CO₂e</strong> (1 tonne = 1,000 kg).
          </p>

          {targets.map((t, i) => (
            <div key={i} className="border border-line rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-fg/80 mb-1">Target name *</label>
                  <Input
                    value={t.name}
                    placeholder="e.g. 50% reduction by 2030"
                    onChange={(e) => update(i, { name: e.target.value })}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-5 text-red-600 dark:text-red-400"
                  onClick={() => setTargets((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-fg/80 mb-1">Baseline year</label>
                  <Input
                    type="number"
                    value={t.baselineYear}
                    onChange={(e) => update(i, { baselineYear: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-fg/80 mb-1">
                    Baseline (kg CO₂e)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    value={t.baselineEmissions}
                    onChange={(e) =>
                      update(i, { baselineEmissions: parseFloat(e.target.value) || 0 })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-fg/80 mb-1">Target year</label>
                  <Input
                    type="number"
                    value={t.targetYear}
                    onChange={(e) => update(i, { targetYear: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-fg/80 mb-1">Reduction %</label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={t.targetReduction}
                    onChange={(e) =>
                      update(i, { targetReduction: parseFloat(e.target.value) || 0 })
                    }
                  />
                </div>
              </div>
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setTargets((prev) => [...prev, emptyTarget()])}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add target
          </Button>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/25 rounded-md text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-2 border-t border-line">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving}>
              Save Targets
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

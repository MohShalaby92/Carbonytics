import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { organizationService } from '../../services/organizationService';
import { complianceService } from '../../services/complianceService';
import { useAuth } from '../../hooks/useAuth';
import { Denominator } from '../../types';
import { Plus, Trash2, Save, Divide } from 'lucide-react';

const METRICS = [
  { value: 'production', label: 'Production (physical output)', unitHint: 'e.g. tonnes, units' },
  { value: 'revenue', label: 'Revenue', unitHint: 'e.g. EGP' },
  { value: 'employees', label: 'Employees', unitHint: 'e.g. FTE' },
  { value: 'floor_area', label: 'Floor area', unitHint: 'e.g. m²' },
  { value: 'custom', label: 'Custom…', unitHint: 'any unit' },
] as const;

/**
 * Denominator series editor: one value per (year, metric). Powers intensity
 * metrics in the GHG inventory report and the estimation engine's
 * intensity-proxy rung. Physical production denominators are preferred.
 */
export const DenominatorsTab: React.FC = () => {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'manager';

  const [denominators, setDenominators] = useState<Denominator[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    organizationService
      .getOrganization()
      .then((org) => setDenominators(org.denominators || []))
      .catch(() => setMessage({ type: 'error', text: 'Failed to load denominators' }))
      .finally(() => setLoading(false));
  }, []);

  const updateRow = (index: number, patch: Partial<Denominator>) => {
    setDenominators((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
    setDirty(true);
    setMessage(null);
  };

  const addRow = () => {
    setDenominators((prev) => [
      ...prev,
      { year: new Date().getFullYear(), metric: 'revenue', value: 0, unit: 'EGP' },
    ]);
    setDirty(true);
    setMessage(null);
  };

  const removeRow = (index: number) => {
    setDenominators((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
    setMessage(null);
  };

  const handleSave = async () => {
    const invalid = denominators.some(
      (d) => !d.year || !d.metric || !(d.value > 0) || !d.unit.trim()
    );
    if (invalid) {
      setMessage({
        type: 'error',
        text: 'Every denominator needs a year, metric, a value greater than 0, and a unit.',
      });
      return;
    }
    try {
      setSaving(true);
      const saved = await complianceService.updateDenominators(
        denominators.map((d) => ({
          year: Number(d.year),
          metric: d.metric,
          ...(d.label?.trim() ? { label: d.label.trim() } : {}),
          value: Number(d.value),
          unit: d.unit.trim(),
        }))
      );
      setDenominators(saved);
      setDirty(false);
      setMessage({ type: 'success', text: 'Denominator series saved (audited).' });
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err?.response?.data?.message || err?.message || 'Save failed',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Card className="p-6 text-muted">Loading…</Card>;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Divide className="w-5 h-5 text-primary-600" />
          <h2 className="text-xl font-semibold text-fg">Intensity & Denominators</h2>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="w-4 h-4 mr-1" /> Add Denominator
          </Button>
        )}
      </div>
      <p className="text-sm text-muted mb-4">
        Record one value per year and metric (revenue, employees, floor area, production).
        They power intensity figures in the GHG inventory report and let the estimation
        engine scale history when a gap has no direct prior-year data.{' '}
        {!canEdit && '(Read-only — admin/manager can edit.)'}
      </p>

      {message && (
        <div
          className={`mb-4 p-3 rounded-lg border text-sm ${
            message.type === 'success'
              ? 'bg-green-500/10 border-green-500/25 text-green-700 dark:text-green-300'
              : 'bg-red-500/10 border-red-500/25 text-red-700 dark:text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {denominators.length === 0 ? (
        <p className="text-sm text-muted py-6 text-center">
          No denominators recorded. Add yearly values to enable intensity metrics
          (kg CO₂e per EGP revenue, per employee, …).
        </p>
      ) : (
        <div className="space-y-3">
          {denominators.map((d, index) => (
            <div key={index} className="p-3 border border-line rounded-lg bg-fg/[0.02]">
              <div className="grid grid-cols-2 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-2 space-y-1">
                  <label className="block text-xs font-medium text-fg/80">Year *</label>
                  <Input
                    type="number"
                    min="2000"
                    max="2100"
                    disabled={!canEdit}
                    value={d.year || ''}
                    onChange={(e) => updateRow(index, { year: parseInt(e.target.value, 10) || 0 })}
                  />
                </div>
                <div className="md:col-span-3 space-y-1">
                  <label className="block text-xs font-medium text-fg/80">Metric *</label>
                  <Select
                    value={d.metric}
                    disabled={!canEdit}
                    onChange={(e) => updateRow(index, { metric: e.target.value as Denominator['metric'] })}
                  >
                    {METRICS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </Select>
                </div>
                {d.metric === 'custom' && (
                  <div className="md:col-span-2 space-y-1">
                    <label className="block text-xs font-medium text-fg/80">Label *</label>
                    <Input
                      disabled={!canEdit}
                      value={d.label || ''}
                      placeholder="e.g. tonnes of cement"
                      onChange={(e) => updateRow(index, { label: e.target.value })}
                    />
                  </div>
                )}
                <div className={`${d.metric === 'custom' ? 'md:col-span-2' : 'md:col-span-3'} space-y-1`}>
                  <label className="block text-xs font-medium text-fg/80">Value *</label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    disabled={!canEdit}
                    value={d.value || ''}
                    onChange={(e) => updateRow(index, { value: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="md:col-span-2 space-y-1">
                  <label className="block text-xs font-medium text-fg/80">
                    Unit * <span className="text-muted font-normal">({METRICS.find((m) => m.value === d.metric)?.unitHint})</span>
                  </label>
                  <Input
                    disabled={!canEdit}
                    value={d.unit}
                    onChange={(e) => updateRow(index, { unit: e.target.value })}
                  />
                </div>
                {canEdit && (
                  <div className="md:col-span-1 flex justify-end">
                    <button
                      onClick={() => removeRow(index)}
                      className="p-2 rounded-lg text-muted hover:text-red-600 hover:bg-red-500/10 transition-colors"
                      title="Remove denominator"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div className="mt-6 flex justify-end">
          <Button onClick={handleSave} loading={saving} disabled={!dirty}>
            <Save className="w-4 h-4 mr-2" />
            Save Denominators
          </Button>
        </div>
      )}
    </Card>
  );
};

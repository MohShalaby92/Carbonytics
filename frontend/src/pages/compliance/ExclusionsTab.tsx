import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Textarea } from '../../components/ui/Textarea';
import { organizationService } from '../../services/organizationService';
import { complianceService } from '../../services/complianceService';
import { useAuth } from '../../hooks/useAuth';
import { OrgExclusion } from '../../types';
import { Plus, Trash2, Save, ListX } from 'lucide-react';

/**
 * Documented exclusions register (GHG Protocol completeness/transparency):
 * every excluded source needs a justification and, ideally, a materiality
 * estimate. Auditors ask for this list first.
 */
export const ExclusionsTab: React.FC = () => {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'manager';

  const [exclusions, setExclusions] = useState<OrgExclusion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    organizationService
      .getOrganization()
      .then((org) => setExclusions(org.exclusions || []))
      .catch(() => setMessage({ type: 'error', text: 'Failed to load exclusions' }))
      .finally(() => setLoading(false));
  }, []);

  const updateRow = (index: number, patch: Partial<OrgExclusion>) => {
    setExclusions((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
    setDirty(true);
    setMessage(null);
  };

  const addRow = () => {
    setExclusions((prev) => [...prev, { source: '', justification: '' }]);
    setDirty(true);
    setMessage(null);
  };

  const removeRow = (index: number) => {
    setExclusions((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
    setMessage(null);
  };

  const handleSave = async () => {
    const invalid = exclusions.some((e) => !e.source.trim() || !e.justification.trim());
    if (invalid) {
      setMessage({ type: 'error', text: 'Every exclusion needs a source and a justification.' });
      return;
    }
    try {
      setSaving(true);
      const saved = await complianceService.updateExclusions(
        exclusions.map((e) => ({
          source: e.source.trim(),
          justification: e.justification.trim(),
          ...(e.scope ? { scope: Number(e.scope) as 1 | 2 | 3 } : {}),
          ...(e.estimatedEmissions !== undefined && e.estimatedEmissions !== null && `${e.estimatedEmissions}` !== ''
            ? { estimatedEmissions: Number(e.estimatedEmissions) }
            : {}),
        }))
      );
      setExclusions(saved);
      setDirty(false);
      setMessage({ type: 'success', text: 'Exclusions register saved (audited).' });
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
          <ListX className="w-5 h-5 text-primary-600" />
          <h2 className="text-xl font-semibold text-fg">Exclusions Register</h2>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="w-4 h-4 mr-1" /> Add Exclusion
          </Button>
        )}
      </div>
      <p className="text-sm text-muted mb-4">
        Document every emission source you exclude from the inventory, why, and its estimated
        materiality. Changes are audited. {!canEdit && '(Read-only — admin/manager can edit.)'}
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

      {exclusions.length === 0 ? (
        <p className="text-sm text-muted py-6 text-center">
          No exclusions documented. An empty register means you assert complete coverage of all
          sources within the boundary.
        </p>
      ) : (
        <div className="space-y-4">
          {exclusions.map((exclusion, index) => (
            <div key={index} className="p-4 border border-line rounded-lg space-y-3 bg-fg/[0.02]">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-5 space-y-1">
                  <label className="block text-xs font-medium text-fg/80">Excluded source *</label>
                  <Input
                    value={exclusion.source}
                    disabled={!canEdit}
                    placeholder="e.g. Refrigerant top-ups at leased warehouse"
                    onChange={(e) => updateRow(index, { source: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2 space-y-1">
                  <label className="block text-xs font-medium text-fg/80">Scope</label>
                  <Select
                    value={exclusion.scope ? String(exclusion.scope) : ''}
                    disabled={!canEdit}
                    onChange={(e) =>
                      updateRow(index, {
                        scope: e.target.value ? (Number(e.target.value) as 1 | 2 | 3) : undefined,
                      })
                    }
                  >
                    <option value="">—</option>
                    <option value="1">Scope 1</option>
                    <option value="2">Scope 2</option>
                    <option value="3">Scope 3</option>
                  </Select>
                </div>
                <div className="md:col-span-4 space-y-1">
                  <label className="block text-xs font-medium text-fg/80">
                    Materiality estimate (kg CO₂e/yr)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    disabled={!canEdit}
                    value={exclusion.estimatedEmissions ?? ''}
                    placeholder="optional"
                    onChange={(e) =>
                      updateRow(index, {
                        estimatedEmissions: e.target.value === '' ? undefined : parseFloat(e.target.value),
                      })
                    }
                  />
                </div>
                {canEdit && (
                  <div className="md:col-span-1 flex items-end justify-end">
                    <button
                      onClick={() => removeRow(index)}
                      className="p-2 rounded-lg text-muted hover:text-red-600 hover:bg-red-500/10 transition-colors"
                      title="Remove exclusion"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-fg/80">Justification *</label>
                <Textarea
                  rows={2}
                  disabled={!canEdit}
                  value={exclusion.justification}
                  placeholder="Why is this source excluded? (e.g. data inaccessible, immaterial vs total)"
                  onChange={(e) => updateRow(index, { justification: e.target.value })}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div className="mt-6 flex justify-end">
          <Button onClick={handleSave} loading={saving} disabled={!dirty}>
            <Save className="w-4 h-4 mr-2" />
            Save Register
          </Button>
        </div>
      )}
    </Card>
  );
};

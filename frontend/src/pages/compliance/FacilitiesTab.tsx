import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { complianceService } from '../../services/complianceService';
import { useAuth } from '../../hooks/useAuth';
import { Facility } from '../../types';
import { Building2, Plus, Pencil, Archive } from 'lucide-react';

const emptyForm = {
  name: '',
  country: 'Egypt',
  city: '',
  ownershipPercent: '100',
  operationalControl: true,
  notes: '',
};

/**
 * Facilities manager: the organization → site level of the organizational
 * boundary. Ownership % and operational control feed the consolidation
 * approach; calculations can be tagged per facility.
 */
export const FacilitiesTab: React.FC = () => {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'manager';

  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Facility | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setFacilities(await complianceService.getFacilities());
    } catch {
      setError('Failed to load facilities');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (facility: Facility) => {
    setEditing(facility);
    setForm({
      name: facility.name || '',
      country: facility.country || 'Egypt',
      city: facility.city || '',
      ownershipPercent: String(facility.ownershipPercent ?? 100),
      operationalControl: facility.operationalControl ?? true,
      notes: facility.notes || '',
    });
    setError(null);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setError('Facility name is required.');
      return;
    }
    const ownership = parseFloat(form.ownershipPercent);
    if (isNaN(ownership) || ownership < 0 || ownership > 100) {
      setError('Ownership must be between 0 and 100%.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const payload = {
        name: form.name.trim(),
        country: form.country.trim() || 'Egypt',
        city: form.city.trim() || undefined,
        ownershipPercent: ownership,
        operationalControl: form.operationalControl,
        notes: form.notes.trim() || undefined,
      };
      if (editing) {
        await complianceService.updateFacility(editing.id, payload);
        setMessage(`Facility "${payload.name}" updated.`);
      } else {
        await complianceService.createFacility(payload);
        setMessage(`Facility "${payload.name}" created.`);
      }
      setModalOpen(false);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (facility: Facility) => {
    if (!window.confirm(`Deactivate facility "${facility.name}"? Past calculations keep their tag; it will no longer be selectable.`)) {
      return;
    }
    try {
      await complianceService.deactivateFacility(facility.id);
      setMessage(`Facility "${facility.name}" deactivated.`);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Deactivate failed');
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary-600" />
          <h2 className="text-xl font-semibold text-fg">Facilities</h2>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" /> Add Facility
          </Button>
        )}
      </div>
      <p className="text-sm text-muted mb-4">
        Sites within your organizational boundary. Calculations can be tagged per facility and
        filtered on the dashboard. {!canEdit && '(Read-only — admin/manager can edit.)'}
      </p>

      {message && (
        <div className="mb-4 p-3 bg-green-500/10 border border-green-500/25 rounded-lg text-sm text-green-700 dark:text-green-300">
          {message}
        </div>
      )}
      {error && !modalOpen && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted py-6 text-center">Loading…</p>
      ) : facilities.length === 0 ? (
        <p className="text-sm text-muted py-6 text-center">
          No facilities defined — calculations apply to the whole organization. Add sites to
          enable per-facility tagging and filtering.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted border-b border-line">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Location</th>
                <th className="py-2 pr-4 font-medium">Ownership</th>
                <th className="py-2 pr-4 font-medium">Operational control</th>
                {canEdit && <th className="py-2 font-medium text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {facilities.map((facility) => (
                <tr key={facility.id} className="border-b border-line/50">
                  <td className="py-3 pr-4 font-medium text-fg">{facility.name}</td>
                  <td className="py-3 pr-4 text-fg/80">
                    {[facility.city, facility.country].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="py-3 pr-4 text-fg/80">{facility.ownershipPercent ?? 100}%</td>
                  <td className="py-3 pr-4 text-fg/80">
                    {facility.operationalControl !== false ? 'Yes' : 'No'}
                  </td>
                  {canEdit && (
                    <td className="py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => openEdit(facility)}
                        className="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-fg/[0.08] transition-colors"
                        title="Edit facility"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeactivate(facility)}
                        className="p-1.5 rounded-lg text-muted hover:text-red-600 hover:bg-red-500/10 transition-colors"
                        title="Deactivate facility (soft delete)"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Add Facility'}
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-fg/80">Name *</label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Cairo HQ"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-fg/80">Country</label>
              <Input
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-fg/80">City</label>
              <Input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="optional"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-fg/80">Ownership %</label>
              <Input
                type="number"
                min="0"
                max="100"
                value={form.ownershipPercent}
                onChange={(e) => setForm({ ...form, ownershipPercent: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-fg/80 pb-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.operationalControl}
                onChange={(e) => setForm({ ...form, operationalControl: e.target.checked })}
                className="rounded border-line"
              />
              Operational control
            </label>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-fg/80">Notes</label>
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="optional"
            />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={saving}>
              {editing ? 'Save Changes' : 'Create Facility'}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
};

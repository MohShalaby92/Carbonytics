import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { complianceService } from '../../services/complianceService';
import { calculationService } from '../../services/calculationService';
import { useAuth } from '../../hooks/useAuth';
import { Vehicle, EmissionFactor } from '../../types';
import { Truck, Plus, Pencil, Archive } from 'lucide-react';

const VEHICLE_TYPES: Vehicle['vehicleType'][] = ['car', 'van', 'hgv', 'motorbike', 'bus', 'other'];

const emptyForm = {
  name: '',
  vehicleType: 'car' as Vehicle['vehicleType'],
  fuel: '',
  size: '',
  registration: '',
  factorId: '',
  notes: '',
};

/** Short label for a vehicle's distance factor (handles populated or bare id). */
const factorLabel = (f: Vehicle['factorId']): string => {
  if (!f || typeof f === 'string') return '—';
  return `${f.name} (${f.factor} ${f.unit})`;
};

export const FleetTab: React.FC = () => {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'manager';

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [kmFactors, setKmFactors] = useState<EmissionFactor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const [list, cats] = await Promise.all([
        complianceService.getVehicles(),
        calculationService.getEmissionCategories(),
      ]);
      setVehicles(list);
      const mobile = cats.categories.find((c: any) => /mobile combustion/i.test(c.category));
      if (mobile) {
        const { factors } = await calculationService.getEmissionFactors((mobile as any).id);
        setKmFactors((factors || []).filter((f: any) => f.unit === 'kg CO2e/km'));
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load fleet');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setModalOpen(true);
  };

  const openEdit = (v: Vehicle) => {
    setEditing(v);
    setForm({
      name: v.name || '',
      vehicleType: v.vehicleType || 'car',
      fuel: v.fuel || '',
      size: v.size || '',
      registration: v.registration || '',
      factorId: typeof v.factorId === 'string' ? v.factorId : (v.factorId as any)?.id || (v.factorId as any)?._id || '',
      notes: v.notes || '',
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setError('Vehicle name is required.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const payload: Partial<Vehicle> = {
        name: form.name.trim(),
        vehicleType: form.vehicleType,
        fuel: form.fuel.trim() || undefined,
        size: form.size.trim() || undefined,
        registration: form.registration.trim() || undefined,
        factorId: form.factorId || null,
        notes: form.notes.trim() || undefined,
      };
      if (editing) {
        await complianceService.updateVehicle(editing.id, payload);
      } else {
        await complianceService.createVehicle(payload);
      }
      setModalOpen(false);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (v: Vehicle) => {
    if (!window.confirm(`Deactivate ${v.name}? It will be hidden from the fleet.`)) return;
    try {
      await complianceService.deactivateVehicle(v.id);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Deactivate failed');
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <h2 className="text-xl font-semibold text-fg flex items-center gap-2">
              <Truck className="w-5 h-5" /> Fleet Registry
            </h2>
            <p className="text-sm text-muted mt-1">
              Owned/controlled vehicles for the distance-based mobile-combustion method (Scope 1).
              Each vehicle's default per-km factor is applied when you pick it in the calculator.
            </p>
          </div>
          {canEdit && (
            <Button onClick={openAdd} className="shrink-0">
              <Plus className="w-4 h-4 mr-1" /> Add vehicle
            </Button>
          )}
        </div>

        {error && (
          <div className="mt-3 p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted mt-4">Loading…</p>
        ) : vehicles.length === 0 ? (
          <p className="text-sm text-muted mt-4">
            No vehicles registered yet. Add your company cars, vans and HGVs to track distance-based
            emissions per vehicle.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-line">
                  <th className="py-2 pr-4 font-medium">Vehicle</th>
                  <th className="py-2 pr-4 font-medium">Type</th>
                  <th className="py-2 pr-4 font-medium">Fuel</th>
                  <th className="py-2 pr-4 font-medium">Default distance factor</th>
                  {canEdit && <th className="py-2 font-medium text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="text-fg/90">
                {vehicles.map((v) => (
                  <tr key={v.id} className="border-b border-line/60">
                    <td className="py-2 pr-4">
                      <div className="font-medium text-fg">{v.name}</div>
                      {v.registration && <div className="text-xs text-muted">{v.registration}</div>}
                    </td>
                    <td className="py-2 pr-4 capitalize">{v.vehicleType}</td>
                    <td className="py-2 pr-4">{v.fuel || '—'}{v.size ? ` · ${v.size}` : ''}</td>
                    <td className="py-2 pr-4">{factorLabel(v.factorId)}</td>
                    {canEdit && (
                      <td className="py-2 text-right whitespace-nowrap">
                        <button
                          onClick={() => openEdit(v)}
                          className="p-1.5 text-muted hover:text-fg"
                          title="Edit vehicle"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deactivate(v)}
                          className="p-1.5 text-muted hover:text-red-600"
                          title="Deactivate vehicle"
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
      </Card>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Edit ${editing.name}` : 'Add vehicle'}>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-fg/80">Name / plate *</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Delivery van 1 / ABC-123" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-fg/80">Type</label>
              <Select value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value as Vehicle['vehicleType'] })}>
                {VEHICLE_TYPES.map((t) => (
                  <option key={t} value={t} className="capitalize">{t}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-fg/80">Fuel</label>
              <Input value={form.fuel} onChange={(e) => setForm({ ...form, fuel: e.target.value })} placeholder="Diesel / Petrol / Electric…" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-fg/80">Size / class</label>
              <Input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} placeholder="Supermini / Class II…" />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-fg/80">Registration (optional)</label>
              <Input value={form.registration} onChange={(e) => setForm({ ...form, registration: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-fg/80">Default distance factor (kg CO₂e/km)</label>
            <Select value={form.factorId} onChange={(e) => setForm({ ...form, factorId: e.target.value })}>
              <option value="">None — choose later</option>
              {kmFactors.map((f: any) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.factor} {f.unit})
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted">
              Distance-based factors imported from DEFRA per-vehicle-km tables. Pick the closest
              match for this vehicle; it auto-applies when you select the vehicle in the calculator.
            </p>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-fg/80">Notes (optional)</label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add vehicle'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

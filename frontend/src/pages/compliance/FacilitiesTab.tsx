import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { complianceService } from '../../services/complianceService';
import { useAuth } from '../../hooks/useAuth';
import { Facility, ConsolidationResult } from '../../types';
import { Building2, Plus, Pencil, Archive, Layers } from 'lucide-react';

const emptyForm = {
  name: '',
  country: 'Egypt',
  city: '',
  parentFacilityId: '',
  entityType: 'site' as Facility['entityType'],
  ownershipPercent: '100',
  operationalControl: true,
  financialControl: true,
  acquiredDate: '',
  disposedDate: '',
  notes: '',
};

const ENTITY_TYPES = ['subsidiary', 'division', 'site', 'asset'] as const;
const APPROACHES = [
  { value: 'operational_control', label: 'Operational control' },
  { value: 'financial_control', label: 'Financial control' },
  { value: 'equity_share', label: 'Equity share' },
] as const;

const toDateInput = (iso?: string | null) => (iso ? String(iso).split('T')[0] : '');

/**
 * Entity hierarchy & facilities (GHG Protocol §1.2): the organization → its
 * subsidiaries/divisions → sites. Each node's ownership %, control flags and
 * M&A dates drive the consolidation roll-up shown below (gross vs the share the
 * organization reports under its consolidation approach).
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

  // Consolidation roll-up panel
  const [year, setYear] = useState(new Date().getFullYear());
  const [approach, setApproach] = useState<ConsolidationResult['approach']>('operational_control');
  const [cons, setCons] = useState<ConsolidationResult | null>(null);

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

  const loadCons = async () => {
    try {
      setCons(await complianceService.getConsolidation(`${year}-01-01`, `${year}-12-31`, approach));
    } catch {
      /* roll-up is advisory; ignore */
    }
  };

  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    loadCons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approach, year, facilities.length]);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    facilities.forEach((f) => m.set(f.id, f.name));
    return m;
  }, [facilities]);

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
      parentFacilityId: facility.parentFacilityId || '',
      entityType: facility.entityType || 'site',
      ownershipPercent: String(facility.ownershipPercent ?? 100),
      operationalControl: facility.operationalControl ?? true,
      financialControl: facility.financialControl ?? true,
      acquiredDate: toDateInput(facility.acquiredDate),
      disposedDate: toDateInput(facility.disposedDate),
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
      const payload: any = {
        name: form.name.trim(),
        country: form.country.trim() || 'Egypt',
        city: form.city.trim() || undefined,
        parentFacilityId: form.parentFacilityId || null,
        entityType: form.entityType,
        ownershipPercent: ownership,
        operationalControl: form.operationalControl,
        financialControl: form.financialControl,
        acquiredDate: form.acquiredDate || '',
        disposedDate: form.disposedDate || '',
        notes: form.notes.trim() || undefined,
      };
      if (editing) {
        await complianceService.updateFacility(editing.id, payload);
        setMessage(`Entity "${payload.name}" updated.`);
      } else {
        await complianceService.createFacility(payload);
        setMessage(`Entity "${payload.name}" created.`);
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
    if (!window.confirm(`Deactivate "${facility.name}"? Past calculations keep their tag; it will no longer be selectable.`)) {
      return;
    }
    try {
      await complianceService.deactivateFacility(facility.id);
      setMessage(`"${facility.name}" deactivated.`);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Deactivate failed');
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary-600" />
            <h2 className="text-xl font-semibold text-fg">Entities & Facilities</h2>
          </div>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1" /> Add Entity
            </Button>
          )}
        </div>
        <p className="text-sm text-muted mb-4">
          Your organizational boundary as a hierarchy — subsidiaries/divisions and the sites beneath
          them. Ownership %, control flags and acquisition/disposal dates drive the consolidation
          roll-up below. {!canEdit && '(Read-only — admin/manager can edit.)'}
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
            No entities defined — calculations apply to the whole organization (100% consolidated).
            Add subsidiaries and sites to model your boundary.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted border-b border-line">
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Type</th>
                  <th className="py-2 pr-4 font-medium">Parent</th>
                  <th className="py-2 pr-4 font-medium">Ownership</th>
                  <th className="py-2 pr-4 font-medium">Control (op/fin)</th>
                  <th className="py-2 pr-4 font-medium">Held</th>
                  {canEdit && <th className="py-2 font-medium text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {facilities.map((f) => (
                  <tr key={f.id} className="border-b border-line/50">
                    <td className="py-3 pr-4 font-medium text-fg">
                      {f.name}
                      <span className="block text-xs text-muted font-normal">
                        {[f.city, f.country].filter(Boolean).join(', ') || '—'}
                      </span>
                    </td>
                    <td className="py-3 pr-4"><Badge size="sm" variant="default">{f.entityType || 'site'}</Badge></td>
                    <td className="py-3 pr-4 text-fg/80">
                      {f.parentFacilityId ? (nameById.get(f.parentFacilityId) || '—') : <span className="text-muted">org</span>}
                    </td>
                    <td className="py-3 pr-4 text-fg/80">{f.ownershipPercent ?? 100}%</td>
                    <td className="py-3 pr-4 text-fg/80">
                      {f.operationalControl !== false ? 'Yes' : 'No'} / {f.financialControl !== false ? 'Yes' : 'No'}
                    </td>
                    <td className="py-3 pr-4 text-fg/80 text-xs">
                      {f.acquiredDate || f.disposedDate
                        ? `${toDateInput(f.acquiredDate) || '…'} → ${toDateInput(f.disposedDate) || 'now'}`
                        : 'full period'}
                    </td>
                    {canEdit && (
                      <td className="py-3 text-right whitespace-nowrap">
                        <button onClick={() => openEdit(f)} className="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-fg/[0.08] transition-colors" title="Edit">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeactivate(f)} className="p-1.5 rounded-lg text-muted hover:text-red-600 hover:bg-red-500/10 transition-colors" title="Deactivate (soft delete)">
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

      {/* Consolidation roll-up */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-fg">Consolidation roll-up</h3>
          </div>
          <div className="flex items-center gap-2">
            <Input type="number" min="2000" max="2100" value={year} onChange={(e) => setYear(parseInt(e.target.value, 10) || new Date().getFullYear())} className="w-24" />
            <Select value={approach} onChange={(e) => setApproach(e.target.value as ConsolidationResult['approach'])} className="w-52">
              {APPROACHES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </Select>
          </div>
        </div>
        <p className="text-sm text-muted mb-4">
          Gross emissions are 100% of activity; the consolidated total is the share your organization
          reports under the selected approach (equity = cumulative ownership; control = 100%/0%),
          pro-rated for M&A timing.
        </p>
        {cons ? (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg border border-line p-3">
                <p className="text-2xl font-bold text-fg">{cons.grossTotal.toLocaleString()}</p>
                <p className="text-xs text-muted mt-1">Gross kg CO₂e</p>
              </div>
              <div className="rounded-lg border border-line p-3">
                <p className="text-2xl font-bold text-primary-600">{cons.consolidatedTotal.toLocaleString()}</p>
                <p className="text-xs text-muted mt-1">Consolidated kg CO₂e</p>
              </div>
              <div className="rounded-lg border border-line p-3">
                <p className="text-2xl font-bold text-fg">{cons.overallSharePercent}%</p>
                <p className="text-xs text-muted mt-1">of gross</p>
              </div>
            </div>
            {cons.byEntity.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted border-b border-line">
                      <th className="py-2 pr-4 font-medium">Entity</th>
                      <th className="py-2 pr-4 font-medium">Share</th>
                      <th className="py-2 pr-4 font-medium">Gross</th>
                      <th className="py-2 pr-4 font-medium">Consolidated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cons.byEntity.map((e) => (
                      <tr key={e.entityId || 'unassigned'} className="border-b border-line/50">
                        <td className="py-2 pr-4 text-fg/90">{e.name}</td>
                        <td className="py-2 pr-4 text-fg/80">{e.sharePercent}%</td>
                        <td className="py-2 pr-4 text-fg/80">{e.gross.toLocaleString()}</td>
                        <td className="py-2 pr-4 text-fg/80">{e.consolidated.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted py-4 text-center">No consolidation data for {year}.</p>
        )}
      </Card>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Edit ${editing.name}` : 'Add Entity'}>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-fg/80">Name *</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Nile Subsidiary" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-fg/80">Type</label>
              <Select value={form.entityType} onChange={(e) => setForm({ ...form, entityType: e.target.value as Facility['entityType'] })}>
                {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-fg/80">Parent entity</label>
              <Select value={form.parentFacilityId} onChange={(e) => setForm({ ...form, parentFacilityId: e.target.value })}>
                <option value="">— directly under organization —</option>
                {facilities.filter((f) => !editing || f.id !== editing.id).map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-fg/80">Country</label>
              <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-fg/80">City</label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="optional" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 items-end">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-fg/80">Ownership % <span className="text-muted font-normal">(held by parent)</span></label>
              <Input type="number" min="0" max="100" value={form.ownershipPercent} onChange={(e) => setForm({ ...form, ownershipPercent: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm text-fg/80 pb-2.5 cursor-pointer">
              <input type="checkbox" checked={form.operationalControl} onChange={(e) => setForm({ ...form, operationalControl: e.target.checked })} className="rounded border-line" />
              Operational control
            </label>
            <label className="flex items-center gap-2 text-sm text-fg/80 pb-2.5 cursor-pointer">
              <input type="checkbox" checked={form.financialControl} onChange={(e) => setForm({ ...form, financialControl: e.target.checked })} className="rounded border-line" />
              Financial control
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-fg/80">Acquired date <span className="text-muted font-normal">(M&A)</span></label>
              <Input type="date" value={form.acquiredDate} onChange={(e) => setForm({ ...form, acquiredDate: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-fg/80">Disposed date <span className="text-muted font-normal">(M&A)</span></label>
              <Input type="date" value={form.disposedDate} onChange={(e) => setForm({ ...form, disposedDate: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-fg/80">Notes</label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="optional" />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} loading={saving}>{editing ? 'Save Changes' : 'Create Entity'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

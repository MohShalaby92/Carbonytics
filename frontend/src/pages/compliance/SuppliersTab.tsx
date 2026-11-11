import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { complianceService } from '../../services/complianceService';
import { calculationService } from '../../services/calculationService';
import { useAuth } from '../../hooks/useAuth';
import { Supplier, SupplierDataRequest, SupplierEngagementSummary, EmissionCategory } from '../../types';
import {
  Handshake,
  Plus,
  Pencil,
  Archive,
  ChevronDown,
  ChevronRight,
  Send,
} from 'lucide-react';

const STATUS_BADGES: Record<string, { label: string; classes: string }> = {
  not_engaged: { label: 'Not engaged', classes: 'bg-fg/[0.08] text-muted' },
  awaiting_response: { label: 'Awaiting response', classes: 'bg-amber-500/15 text-amber-800 dark:text-amber-300' },
  data_received: { label: 'Data received', classes: 'bg-blue-500/15 text-blue-800 dark:text-blue-300' },
  data_integrated: { label: 'Data integrated', classes: 'bg-green-500/15 text-green-800 dark:text-green-300' },
};

const REQUEST_BADGES: Record<string, string> = {
  sent: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  received: 'bg-blue-500/15 text-blue-800 dark:text-blue-300',
  fulfilled: 'bg-green-500/15 text-green-800 dark:text-green-300',
  declined: 'bg-red-500/15 text-red-800 dark:text-red-300',
};

const emptySupplierForm = { name: '', contactName: '', contactEmail: '', notes: '', categories: [] as string[] };
const emptyRequestForm = { start: '', end: '', categoryId: '', message: '' };
const emptyFulfillForm = {
  type: 'custom-factor' as 'custom-factor' | 'activity-data' | 'document',
  categoryId: '',
  name: '',
  factor: '',
  unit: '',
  year: '',
  source: '',
  calculationId: '',
  notes: '',
};

const categoryName = (c: any): string => (typeof c === 'object' && c ? c.category : '');

/**
 * Supplier engagement (GHG Protocol Scope 3 method hierarchy): registry of
 * suppliers, tracked data requests, and fulfillment into supplier-specific
 * factors (entries computed with them record the supplier-specific method
 * and DQ 1) or linked activity data. The platform tracks the lifecycle — the
 * actual ask goes to the supplier outside the platform (e.g. email).
 */
export const SuppliersTab: React.FC = () => {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'manager';

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [engagement, setEngagement] = useState<SupplierEngagementSummary | null>(null);
  const [categories, setCategories] = useState<EmissionCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Supplier create/edit modal
  const [supplierModal, setSupplierModal] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [supplierForm, setSupplierForm] = useState({ ...emptySupplierForm });
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // New-request inline form (within the expanded supplier)
  const [requestFormFor, setRequestFormFor] = useState<string | null>(null);
  const [requestForm, setRequestForm] = useState({ ...emptyRequestForm });

  // Fulfillment modal
  const [fulfillTarget, setFulfillTarget] = useState<{ supplier: Supplier; request: SupplierDataRequest } | null>(null);
  const [fulfillForm, setFulfillForm] = useState({ ...emptyFulfillForm });
  const [calculations, setCalculations] = useState<Array<{ id: string; title: string }>>([]);

  const load = async () => {
    try {
      setLoading(true);
      const [{ suppliers: list, engagement: summary }, cats] = await Promise.all([
        complianceService.getSuppliers(),
        calculationService.getEmissionCategories(),
      ]);
      setSuppliers(list);
      setEngagement(summary);
      setCategories(cats.categories || []);
    } catch {
      setError('Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  /** Replace one supplier in the list from a mutation response. */
  const replaceSupplier = (updated: Supplier) => {
    setSuppliers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  const resolveCategoryName = (id?: string): string => {
    if (!id) return 'Whole footprint';
    const cat = categories.find((c) => c.id === id);
    return cat ? cat.category : 'Category';
  };

  // ---- Supplier CRUD ----

  const openCreate = () => {
    setEditing(null);
    setSupplierForm({ ...emptySupplierForm });
    setModalError(null);
    setSupplierModal(true);
  };

  const openEdit = (supplier: Supplier) => {
    setEditing(supplier);
    setSupplierForm({
      name: supplier.name || '',
      contactName: supplier.contactName || '',
      contactEmail: supplier.contactEmail || '',
      notes: supplier.notes || '',
      categories: (supplier.categories || []).map((c: any) => (typeof c === 'object' ? c.id || c._id : c)),
    });
    setModalError(null);
    setSupplierModal(true);
  };

  const handleSupplierSubmit = async () => {
    if (!supplierForm.name.trim()) {
      setModalError('Supplier name is required.');
      return;
    }
    try {
      setSaving(true);
      setModalError(null);
      const payload = {
        name: supplierForm.name.trim(),
        contactName: supplierForm.contactName.trim() || undefined,
        contactEmail: supplierForm.contactEmail.trim() || undefined,
        notes: supplierForm.notes.trim() || undefined,
        categories: supplierForm.categories,
      };
      if (editing) {
        const updated = await complianceService.updateSupplier(editing.id, payload);
        replaceSupplier(updated);
        setMessage(`Supplier "${payload.name}" updated.`);
      } else {
        await complianceService.createSupplier(payload);
        setMessage(`Supplier "${payload.name}" created.`);
        await load();
      }
      setSupplierModal(false);
    } catch (err: any) {
      setModalError(err?.response?.data?.message || err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (supplier: Supplier) => {
    if (!window.confirm(`Deactivate supplier "${supplier.name}"? Supplier-specific factors and request history remain.`)) {
      return;
    }
    try {
      await complianceService.deactivateSupplier(supplier.id);
      setMessage(`Supplier "${supplier.name}" deactivated.`);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Deactivate failed');
    }
  };

  // ---- Data requests ----

  const handleCreateRequest = async (supplier: Supplier) => {
    if (!requestForm.start || !requestForm.end) {
      setError('Request period start and end are required.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const updated = await complianceService.createSupplierRequest(supplier.id, {
        period: { start: requestForm.start, end: requestForm.end },
        categoryId: requestForm.categoryId || undefined,
        message: requestForm.message.trim() || undefined,
      });
      replaceSupplier(updated);
      setRequestFormFor(null);
      setRequestForm({ ...emptyRequestForm });
      setMessage(`Data request recorded for "${supplier.name}" — send the actual ask by email.`);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Request failed');
    } finally {
      setSaving(false);
    }
  };

  const handleRequestStatus = async (supplier: Supplier, request: SupplierDataRequest, status: 'received' | 'declined') => {
    try {
      const updated = await complianceService.updateSupplierRequest(supplier.id, request.id, { status });
      replaceSupplier(updated);
      setMessage(`Request marked ${status}.`);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Update failed');
    }
  };

  const openFulfill = async (supplier: Supplier, request: SupplierDataRequest) => {
    setFulfillTarget({ supplier, request });
    setFulfillForm({
      ...emptyFulfillForm,
      categoryId: request.categoryId || '',
      source: `Supplier: ${supplier.name}`,
    });
    setModalError(null);
    try {
      const data: any = await calculationService.getCalculations({ limit: 50 });
      const list = Array.isArray(data) ? data : data?.calculations || [];
      setCalculations(list.map((c: any) => ({ id: c.id || c._id, title: c.title })));
    } catch {
      setCalculations([]);
    }
  };

  const handleFulfill = async () => {
    if (!fulfillTarget) return;
    const { supplier, request } = fulfillTarget;
    try {
      setSaving(true);
      setModalError(null);
      let payload: any;
      if (fulfillForm.type === 'custom-factor') {
        if (!fulfillForm.categoryId || !fulfillForm.name.trim() || !fulfillForm.factor || !fulfillForm.unit.trim()) {
          setModalError('Category, factor name, value and unit are required.');
          setSaving(false);
          return;
        }
        payload = {
          type: 'custom-factor',
          factor: {
            categoryId: fulfillForm.categoryId,
            name: fulfillForm.name.trim(),
            factor: parseFloat(fulfillForm.factor),
            unit: fulfillForm.unit.trim(),
            source: fulfillForm.source.trim() || undefined,
            year: fulfillForm.year ? parseInt(fulfillForm.year, 10) : undefined,
          },
          notes: fulfillForm.notes.trim() || undefined,
        };
      } else if (fulfillForm.type === 'activity-data') {
        if (!fulfillForm.calculationId) {
          setModalError('Select the calculation that captured the supplier data.');
          setSaving(false);
          return;
        }
        payload = {
          type: 'activity-data',
          calculationId: fulfillForm.calculationId,
          notes: fulfillForm.notes.trim() || undefined,
        };
      } else {
        if (!fulfillForm.notes.trim()) {
          setModalError('Describe the documentation received.');
          setSaving(false);
          return;
        }
        payload = { type: 'document', notes: fulfillForm.notes.trim() };
      }

      const result = await complianceService.fulfillSupplierRequest(supplier.id, request.id, payload);
      replaceSupplier(result.supplier);
      setFulfillTarget(null);
      setMessage(
        payload.type === 'custom-factor'
          ? `Request fulfilled — supplier-specific factor "${payload.factor.name}" created (entries using it record DQ 1).`
          : 'Request fulfilled.'
      );
    } catch (err: any) {
      setModalError(err?.response?.data?.message || err?.message || 'Fulfill failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Handshake className="w-5 h-5 text-emphasis" />
          <h2 className="text-xl font-semibold text-fg">Suppliers</h2>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 me-1" /> Add Supplier
          </Button>
        )}
      </div>
      <p className="text-sm text-muted mb-4">
        Supplier-specific (primary) data sits at the top of the Scope 3 method hierarchy: fulfilled
        requests land as supplier-linked factors (entries record the supplier-specific method, DQ 1)
        or linked activity data. Requests are tracked here — the actual ask goes to the supplier by
        email. {!canEdit && '(Read-only — admin/manager can edit.)'}
      </p>

      {engagement && engagement.total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Not engaged', value: engagement.notEngaged, key: 'not_engaged' },
            { label: 'Awaiting response', value: engagement.awaitingResponse, key: 'awaiting_response' },
            { label: 'Data received', value: engagement.dataReceived, key: 'data_received' },
            { label: 'Data integrated', value: engagement.dataIntegrated, key: 'data_integrated' },
          ].map((chip) => (
            <div key={chip.key} className="rounded-lg border border-line p-3">
              <p className="text-2xl font-semibold text-fg">{chip.value}</p>
              <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGES[chip.key].classes}`}>
                {chip.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {message && (
        <div className="mb-4 p-3 bg-green-500/10 border border-green-500/25 rounded-lg text-sm text-green-800 dark:text-green-300">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-sm text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted py-6 text-center">Loading…</p>
      ) : suppliers.length === 0 ? (
        <p className="text-sm text-muted py-6 text-center">
          No suppliers registered yet. Add the suppliers behind your largest Scope 3 categories to
          start replacing averages with primary data.
        </p>
      ) : (
        <div className="space-y-2">
          {suppliers.map((supplier) => {
            const isOpen = expanded === supplier.id;
            const badge = STATUS_BADGES[supplier.engagementStatus] || STATUS_BADGES.not_engaged;
            return (
              <div key={supplier.id} className="border border-line rounded-lg">
                <div
                  className="flex items-center gap-3 p-3 cursor-pointer hover:bg-fg/[0.03] transition-colors"
                  onClick={() => setExpanded(isOpen ? null : supplier.id)}
                >
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4 text-muted shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-fg truncate">{supplier.name}</p>
                    <p className="text-xs text-muted truncate">
                      {[supplier.contactName, supplier.contactEmail].filter(Boolean).join(' · ') || 'No contact recorded'}
                      {supplier.categories?.length > 0 &&
                        ` · ${supplier.categories.map(categoryName).filter(Boolean).join(', ')}`}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${badge.classes}`}>
                    {badge.label}
                  </span>
                  <span className="text-xs text-muted whitespace-nowrap">
                    {supplier.dataRequests?.length || 0} request{(supplier.dataRequests?.length || 0) === 1 ? '' : 's'}
                  </span>
                  {canEdit && (
                    <span className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => openEdit(supplier)}
                        className="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-fg/[0.08] transition-colors"
                        title="Edit supplier"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeactivate(supplier)}
                        className="p-1.5 rounded-lg text-muted hover:text-critical hover:bg-red-500/10 transition-colors"
                        title="Deactivate supplier (soft delete)"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    </span>
                  )}
                </div>

                {isOpen && (
                  <div className="border-t border-line p-3 space-y-3">
                    {(supplier.dataRequests?.length || 0) === 0 ? (
                      <p className="text-sm text-muted">No data requests yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {supplier.dataRequests.map((request) => (
                          <div key={request.id} className="flex flex-wrap items-center gap-2 text-sm border border-line/60 rounded-lg p-2.5">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${REQUEST_BADGES[request.status]}`}>
                              {request.status}
                            </span>
                            <span className="text-fg/80">
                              {resolveCategoryName(request.categoryId)} ·{' '}
                              {String(request.period.start).split('T')[0]} → {String(request.period.end).split('T')[0]}
                            </span>
                            {request.fulfillment?.type && (
                              <span className="text-xs text-muted">
                                fulfilled via {request.fulfillment.type}
                                {request.fulfillment.notes ? ` — ${request.fulfillment.notes}` : ''}
                              </span>
                            )}
                            {request.message && !request.fulfillment?.type && (
                              <span className="text-xs text-muted italic truncate max-w-[40ch]" title={request.message}>
                                “{request.message}”
                              </span>
                            )}
                            {canEdit && (request.status === 'sent' || request.status === 'received') && (
                              <span className="ms-auto flex gap-1.5">
                                {request.status === 'sent' && (
                                  <>
                                    <Button size="sm" variant="ghost" onClick={() => handleRequestStatus(supplier, request, 'received')}>
                                      Mark received
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => handleRequestStatus(supplier, request, 'declined')}>
                                      Declined
                                    </Button>
                                  </>
                                )}
                                <Button size="sm" variant="outline" onClick={() => openFulfill(supplier, request)}>
                                  Fulfill…
                                </Button>
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {canEdit && supplier.isActive !== false && (
                      requestFormFor === supplier.id ? (
                        <div className="border border-line rounded-lg p-3 space-y-3">
                          <p className="text-xs font-medium text-fg/80">
                            New data request (tracking only — email the supplier separately)
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <Input label="Period start *"
                                type="date"
                                value={requestForm.start}
                                onChange={(e) => setRequestForm({ ...requestForm, start: e.target.value })}
                              />
                            </div>
                            <div className="space-y-1">
                              <Input label="Period end *"
                                type="date"
                                value={requestForm.end}
                                onChange={(e) => setRequestForm({ ...requestForm, end: e.target.value })}
                              />
                            </div>
                            <div className="space-y-1">
                              <Select label="Category"
                                value={requestForm.categoryId}
                                onChange={(e) => setRequestForm({ ...requestForm, categoryId: e.target.value })}
                              >
                                <option value="">Whole footprint</option>
                                {categories.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    S{c.scope} · {c.category}
                                  </option>
                                ))}
                              </Select>
                            </div>
                          </div>
                          <Input
                            value={requestForm.message}
                            onChange={(e) => setRequestForm({ ...requestForm, message: e.target.value })}
                            placeholder="What was asked for (optional)"
                          />
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={() => setRequestFormFor(null)}>
                              Cancel
                            </Button>
                            <Button size="sm" loading={saving} onClick={() => handleCreateRequest(supplier)}>
                              Record request
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => { setRequestFormFor(supplier.id); setRequestForm({ ...emptyRequestForm }); }}>
                          <Send className="w-3.5 h-3.5 me-1.5" /> New data request
                        </Button>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Supplier create/edit modal */}
      <Modal
        isOpen={supplierModal}
        onClose={() => setSupplierModal(false)}
        title={editing ? `Edit ${editing.name}` : 'Add Supplier'}
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <Input label="Name *"
              value={supplierForm.name}
              onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
              placeholder="e.g. Misr Cement Co."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Input label="Contact name"
                value={supplierForm.contactName}
                onChange={(e) => setSupplierForm({ ...supplierForm, contactName: e.target.value })}
                placeholder="optional"
              />
            </div>
            <div className="space-y-1">
              <Input label="Contact email"
                type="email"
                value={supplierForm.contactEmail}
                onChange={(e) => setSupplierForm({ ...supplierForm, contactEmail: e.target.value })}
                placeholder="optional"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-fg/80">Categories supplied</label>
            <div className="max-h-40 overflow-y-auto border border-line rounded-md p-2 space-y-1">
              {categories.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm text-fg/80 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-line"
                    checked={supplierForm.categories.includes(c.id)}
                    onChange={(e) =>
                      setSupplierForm({
                        ...supplierForm,
                        categories: e.target.checked
                          ? [...supplierForm.categories, c.id]
                          : supplierForm.categories.filter((id) => id !== c.id),
                      })
                    }
                  />
                  S{c.scope} · {c.category}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Input label="Notes"
              value={supplierForm.notes}
              onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })}
              placeholder="optional"
            />
          </div>
          {modalError && <p className="text-sm text-red-600 dark:text-red-400">{modalError}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setSupplierModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSupplierSubmit} loading={saving}>
              {editing ? 'Save Changes' : 'Create Supplier'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Fulfillment modal */}
      <Modal
        isOpen={!!fulfillTarget}
        onClose={() => setFulfillTarget(null)}
        title={fulfillTarget ? `Fulfill request — ${fulfillTarget.supplier.name}` : 'Fulfill request'}
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <Select label="How did the data land?"
              value={fulfillForm.type}
              onChange={(e) => setFulfillForm({ ...fulfillForm, type: e.target.value as any })}
            >
              <option value="custom-factor">Supplier-specific emission factor (best: DQ 1)</option>
              <option value="activity-data">Activity data (link an existing calculation)</option>
              <option value="document">Documentation only</option>
            </Select>
          </div>

          {fulfillForm.type === 'custom-factor' && (
            <>
              <div className="space-y-1">
                <Select label="Category *"
                  value={fulfillForm.categoryId}
                  onChange={(e) => setFulfillForm({ ...fulfillForm, categoryId: e.target.value })}
                >
                  <option value="">Select category…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      S{c.scope} · {c.category}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Input label="Factor name *"
                  value={fulfillForm.name}
                  onChange={(e) => setFulfillForm({ ...fulfillForm, name: e.target.value })}
                  placeholder="e.g. Supplier cement, cradle-to-gate"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Input label="Value (kg CO2e) *"
                    type="number"
                    step="any"
                    min="0"
                    value={fulfillForm.factor}
                    onChange={(e) => setFulfillForm({ ...fulfillForm, factor: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Input label="Per unit *"
                    value={fulfillForm.unit}
                    onChange={(e) => setFulfillForm({ ...fulfillForm, unit: e.target.value })}
                    placeholder="e.g. kg, t, kWh"
                  />
                </div>
                <div className="space-y-1">
                  <Input label="Data year"
                    type="number"
                    value={fulfillForm.year}
                    onChange={(e) => setFulfillForm({ ...fulfillForm, year: e.target.value })}
                    placeholder={String(new Date().getFullYear())}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Input label="Source documentation"
                  value={fulfillForm.source}
                  onChange={(e) => setFulfillForm({ ...fulfillForm, source: e.target.value })}
                />
              </div>
            </>
          )}

          {fulfillForm.type === 'activity-data' && (
            <div className="space-y-1">
              <Select label="Calculation *"
                value={fulfillForm.calculationId}
                onChange={(e) => setFulfillForm({ ...fulfillForm, calculationId: e.target.value })}
              >
                <option value="">Select the calculation…</option>
                {calculations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Input label={<>Notes{fulfillForm.type === 'document' ? ' (what was received) *' : ''}</>}
              value={fulfillForm.notes}
              onChange={(e) => setFulfillForm({ ...fulfillForm, notes: e.target.value })}
              placeholder={fulfillForm.type === 'document' ? 'e.g. 2025 EPD PDF received' : 'optional'}
            />
          </div>

          {modalError && <p className="text-sm text-red-600 dark:text-red-400">{modalError}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setFulfillTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleFulfill} loading={saving}>
              Fulfill request
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
};

import { apiService } from './api';
import {
  AuditLogEntry,
  Denominator,
  EstimateSuggestion,
  Facility,
  OrgExclusion,
  SnapshotDiff,
  SnapshotMeta,
  RecomputeCheckResult,
  EvidenceList,
  EvidenceItem,
  DataQualityTrend,
  Supplier,
  SupplierEngagementSummary,
  CompletenessResult,
  ConsolidationResult,
  Inventory,
  RecalculationCheck,
  Vehicle,
  LineageReport,
} from '../types';

/**
 * Client for the enterprise/compliance endpoints: gap-filling estimates,
 * inventory locking + snapshots, facilities, exclusions register, audit trail,
 * and the GHG inventory / assurance package exports.
 */

/** Trigger a browser download for a Blob. */
const downloadBlob = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

const dateRangeQuery = (startDate: string, endDate: string) =>
  `startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;

export const complianceService = {
  // ---- Gap-filling estimation ----
  suggestEstimate: async (params: {
    categoryId: string;
    period: { start: string; end: string };
    facilityId?: string;
  }): Promise<EstimateSuggestion> => {
    const response = await apiService.post<EstimateSuggestion>('/calculations/estimate', params);
    if (!response.success || !response.data) {
      throw new Error(response.message || 'No estimate available');
    }
    return response.data;
  },

  // ---- Inventory lifecycle (lock/unlock + snapshots) ----
  lockCalculation: async (id: string, comment?: string) => {
    const response = await apiService.patch<any>(`/calculations/${id}/lock`, { comment });
    if (!response.success) throw new Error(response.message || 'Lock failed');
    return response;
  },

  unlockCalculation: async (id: string, comment?: string) => {
    const response = await apiService.patch<any>(`/calculations/${id}/unlock`, { comment });
    if (!response.success) throw new Error(response.message || 'Unlock failed');
    return response;
  },

  /** Independent verification of a locked inventory (verifier/admin). */
  verifyCalculation: async (id: string, comment?: string) => {
    const response = await apiService.patch<any>(`/calculations/${id}/verify`, { comment });
    if (!response.success) throw new Error(response.message || 'Verify failed');
    return response;
  },

  getSnapshots: async (calculationId: string): Promise<SnapshotMeta[]> => {
    const response = await apiService.get<{ snapshots: SnapshotMeta[]; count: number }>(
      `/calculations/${calculationId}/snapshots`
    );
    return response.data?.snapshots || [];
  },

  getSnapshotDiff: async (calculationId: string, from: number, to: number): Promise<SnapshotDiff> => {
    const response = await apiService.get<SnapshotDiff>(
      `/calculations/${calculationId}/snapshots/diff?from=${from}&to=${to}`
    );
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Diff failed');
    }
    return response.data;
  },

  // Deterministic recompute check (§3): re-run the engine math against the pinned
  // immutable factor versions and confirm the stored figures reproduce.
  getRecomputeCheck: async (calculationId: string): Promise<RecomputeCheckResult> => {
    const response = await apiService.get<RecomputeCheckResult>(
      `/calculations/${calculationId}/recompute-check`
    );
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Recompute check failed');
    }
    return response.data;
  },

  // ---- Evidence attachments per data line (§4.3) ----
  listEvidence: async (calculationId: string): Promise<EvidenceList> => {
    const response = await apiService.get<EvidenceList>(`/evidence/calculation/${calculationId}`);
    if (!response.success || !response.data) throw new Error(response.message || 'Failed to load evidence');
    return response.data;
  },

  uploadEvidence: async (
    calculationId: string,
    entryIndex: number,
    file: File,
    description?: string
  ): Promise<EvidenceItem> => {
    const form = new FormData();
    form.append('file', file);
    form.append('entryIndex', String(entryIndex));
    if (description) form.append('description', description);
    const response = await apiService.postForm<EvidenceItem>(
      `/evidence/calculation/${calculationId}`,
      form
    );
    if (!response.success || !response.data) throw new Error(response.message || 'Upload failed');
    return response.data;
  },

  downloadEvidence: async (item: EvidenceItem) => {
    const blob = (await apiService.get<any>(`/evidence/${item.id}/download`, {
      responseType: 'blob',
    })) as unknown as Blob;
    downloadBlob(blob, item.filename);
  },

  deleteEvidence: async (id: string) => {
    const response = await apiService.delete(`/evidence/${id}`);
    if (!response.success) throw new Error(response.message || 'Delete failed');
    return response;
  },

  // Year-over-year data-quality trend (§5).
  getDataQualityTrend: async (): Promise<DataQualityTrend> => {
    const response = await apiService.get<DataQualityTrend>('/reports/data-quality-trend');
    if (!response.success || !response.data) throw new Error(response.message || 'Failed to load trend');
    return response.data;
  },

  // ---- Facilities (organizational boundary) ----
  getFacilities: async (includeInactive = false): Promise<Facility[]> => {
    const response = await apiService.get<{ facilities: Facility[]; count: number }>(
      `/organizations/facilities${includeInactive ? '?includeInactive=true' : ''}`
    );
    return response.data?.facilities || [];
  },

  createFacility: async (data: Partial<Facility>): Promise<Facility> => {
    const response = await apiService.post<Facility>('/organizations/facilities', data);
    if (!response.success || !response.data) throw new Error(response.message || 'Create failed');
    return response.data;
  },

  updateFacility: async (id: string, data: Partial<Facility>): Promise<Facility> => {
    const response = await apiService.put<Facility>(`/organizations/facilities/${id}`, data);
    if (!response.success || !response.data) throw new Error(response.message || 'Update failed');
    return response.data;
  },

  deactivateFacility: async (id: string) => {
    const response = await apiService.delete<any>(`/organizations/facilities/${id}`);
    if (!response.success) throw new Error(response.message || 'Deactivate failed');
    return response;
  },

  // ---- Exclusions register ----
  updateExclusions: async (exclusions: OrgExclusion[]): Promise<OrgExclusion[]> => {
    const response = await apiService.put<{ exclusions: OrgExclusion[] }>(
      '/organizations/exclusions',
      { exclusions }
    );
    if (!response.success) throw new Error(response.message || 'Update failed');
    return response.data?.exclusions || [];
  },

  // ---- Denominator series (intensity metrics) ----
  updateDenominators: async (denominators: Denominator[]): Promise<Denominator[]> => {
    const response = await apiService.put<{ denominators: Denominator[] }>(
      '/organizations/denominators',
      { denominators }
    );
    if (!response.success) throw new Error(response.message || 'Update failed');
    return response.data?.denominators || [];
  },

  // ---- Suppliers (Scope 3 supplier engagement) ----
  getSuppliers: async (
    includeInactive = false
  ): Promise<{ suppliers: Supplier[]; engagement: SupplierEngagementSummary }> => {
    const response = await apiService.get<{
      suppliers: Supplier[];
      count: number;
      engagement: SupplierEngagementSummary;
    }>(`/suppliers${includeInactive ? '?includeInactive=true' : ''}`);
    return {
      suppliers: response.data?.suppliers || [],
      engagement:
        response.data?.engagement || {
          total: 0,
          notEngaged: 0,
          awaitingResponse: 0,
          dataReceived: 0,
          dataIntegrated: 0,
        },
    };
  },

  createSupplier: async (data: {
    name: string;
    contactName?: string;
    contactEmail?: string;
    categories?: string[];
    notes?: string;
  }): Promise<Supplier> => {
    const response = await apiService.post<Supplier>('/suppliers', data);
    if (!response.success || !response.data) throw new Error(response.message || 'Create failed');
    return response.data;
  },

  updateSupplier: async (id: string, data: Partial<{
    name: string;
    contactName: string;
    contactEmail: string;
    categories: string[];
    notes: string;
    isActive: boolean;
  }>): Promise<Supplier> => {
    const response = await apiService.put<Supplier>(`/suppliers/${id}`, data);
    if (!response.success || !response.data) throw new Error(response.message || 'Update failed');
    return response.data;
  },

  deactivateSupplier: async (id: string) => {
    const response = await apiService.delete<any>(`/suppliers/${id}`);
    if (!response.success) throw new Error(response.message || 'Deactivate failed');
    return response;
  },

  createSupplierRequest: async (
    supplierId: string,
    data: { period: { start: string; end: string }; categoryId?: string; message?: string }
  ): Promise<Supplier> => {
    const response = await apiService.post<Supplier>(`/suppliers/${supplierId}/requests`, data);
    if (!response.success || !response.data) throw new Error(response.message || 'Request failed');
    return response.data;
  },

  updateSupplierRequest: async (
    supplierId: string,
    requestId: string,
    data: { status: 'received' | 'declined'; notes?: string }
  ): Promise<Supplier> => {
    const response = await apiService.patch<Supplier>(
      `/suppliers/${supplierId}/requests/${requestId}`,
      data
    );
    if (!response.success || !response.data) throw new Error(response.message || 'Update failed');
    return response.data;
  },

  fulfillSupplierRequest: async (
    supplierId: string,
    requestId: string,
    data:
      | {
          type: 'custom-factor';
          factor: {
            categoryId: string;
            name: string;
            factor: number;
            unit: string;
            source?: string;
            year?: number;
            description?: string;
          };
          notes?: string;
        }
      | { type: 'activity-data'; calculationId: string; notes?: string }
      | { type: 'document'; notes: string }
  ): Promise<{ supplier: Supplier; factor?: any }> => {
    const response = await apiService.post<{ supplier: Supplier; factor?: any }>(
      `/suppliers/${supplierId}/requests/${requestId}/fulfill`,
      data
    );
    if (!response.success || !response.data) throw new Error(response.message || 'Fulfill failed');
    return response.data;
  },

  // ---- Completeness & relevance screening ----
  getCompleteness: async (startDate: string, endDate: string): Promise<CompletenessResult> => {
    const response = await apiService.get<CompletenessResult>(
      `/reports/completeness?${dateRangeQuery(startDate, endDate)}`
    );
    if (!response.success || !response.data) throw new Error(response.message || 'Completeness failed');
    return response.data;
  },

  // ---- Consolidation roll-up (entity hierarchy §1.2) ----
  getConsolidation: async (
    startDate: string,
    endDate: string,
    approach?: 'equity_share' | 'operational_control' | 'financial_control'
  ): Promise<ConsolidationResult> => {
    const q = `${dateRangeQuery(startDate, endDate)}${approach ? `&approach=${approach}` : ''}`;
    const response = await apiService.get<ConsolidationResult>(`/reports/consolidation?${q}`);
    if (!response.success || !response.data) throw new Error(response.message || 'Consolidation failed');
    return response.data;
  },

  updateRelevantCategories: async (relevantCategories: string[]): Promise<string[]> => {
    const response = await apiService.put<{ relevantCategories: string[] }>(
      '/organizations/relevant-categories',
      { relevantCategories }
    );
    if (!response.success) throw new Error(response.message || 'Update failed');
    return response.data?.relevantCategories || [];
  },

  // ---- Reporting-year inventories (lifecycle, base year, recalculation) ----
  getInventories: async (): Promise<Inventory[]> => {
    const response = await apiService.get<{ inventories: Inventory[]; count: number }>('/inventories');
    return response.data?.inventories || [];
  },

  getInventory: async (id: string): Promise<Inventory> => {
    const response = await apiService.get<Inventory>(`/inventories/${id}`);
    if (!response.success || !response.data) throw new Error(response.message || 'Load failed');
    return response.data;
  },

  createInventory: async (
    reportingYear: number,
    period?: { start: string; end: string }
  ): Promise<Inventory> => {
    const response = await apiService.post<Inventory>('/inventories', { reportingYear, period });
    if (!response.success || !response.data) throw new Error(response.message || 'Create failed');
    return response.data;
  },

  transitionInventory: async (id: string, status: 'draft' | 'review'): Promise<Inventory> => {
    const response = await apiService.patch<Inventory>(`/inventories/${id}/status`, { status });
    if (!response.success || !response.data) throw new Error(response.message || 'Transition failed');
    return response.data;
  },

  /** Publish (lock) a reporting year. Rejects (HTTP 422) on undocumented gaps —
   * the caller surfaces err.response.data.message (the hard completeness gate). */
  publishInventory: async (id: string, comment?: string): Promise<Inventory> => {
    const response = await apiService.patch<Inventory>(`/inventories/${id}/publish`, { comment });
    if (!response.success || !response.data) throw new Error(response.message || 'Publish failed');
    return response.data;
  },

  reopenInventory: async (id: string, comment?: string): Promise<Inventory> => {
    const response = await apiService.patch<Inventory>(`/inventories/${id}/reopen`, { comment });
    if (!response.success || !response.data) throw new Error(response.message || 'Reopen failed');
    return response.data;
  },

  setBaseYear: async (
    id: string,
    isBaseYear: boolean,
    recalcThresholdPercent?: number
  ): Promise<Inventory> => {
    const response = await apiService.patch<Inventory>(`/inventories/${id}/base-year`, {
      isBaseYear,
      ...(recalcThresholdPercent !== undefined ? { recalcThresholdPercent } : {}),
    });
    if (!response.success || !response.data) throw new Error(response.message || 'Update failed');
    return response.data;
  },

  getRecalculationCheck: async (id: string): Promise<RecalculationCheck> => {
    const response = await apiService.get<RecalculationCheck>(`/inventories/${id}/recalculation-check`);
    if (!response.success || !response.data) throw new Error(response.message || 'Check failed');
    return response.data;
  },

  getInventorySnapshots: async (id: string): Promise<SnapshotMeta[]> => {
    const response = await apiService.get<{ snapshots: SnapshotMeta[]; count: number }>(
      `/inventories/${id}/snapshots`
    );
    return response.data?.snapshots || [];
  },

  // ---- Audit trail (admin read) ----
  getAuditLog: async (params?: { resourceType?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.resourceType) query.append('resourceType', params.resourceType);
    if (params?.page) query.append('page', String(params.page));
    if (params?.limit) query.append('limit', String(params.limit));
    const response = await apiService.get<AuditLogEntry[]>(
      `/organizations/audit-log?${query.toString()}`
    );
    return { entries: response.data || [], pagination: response.pagination };
  },

  // ---- Reports / exports ----
  getGhgInventoryReport: async (startDate: string, endDate: string) => {
    const response = await apiService.get<any>(
      `/reports/ghg-inventory?${dateRangeQuery(startDate, endDate)}`
    );
    if (!response.success || !response.data) throw new Error(response.message || 'Report failed');
    return response.data;
  },

  downloadGhgInventoryMarkdown: async (startDate: string, endDate: string) => {
    const blob = (await apiService.get<any>(
      `/reports/ghg-inventory?${dateRangeQuery(startDate, endDate)}&format=markdown`,
      { responseType: 'blob' }
    )) as unknown as Blob;
    downloadBlob(blob, `ghg-inventory_${startDate}_${endDate}.md`);
  },

  /** GHG inventory report in a document format (markdown/pdf/docx/xlsx). */
  downloadGhgInventory: async (
    startDate: string,
    endDate: string,
    format: 'markdown' | 'pdf' | 'docx' | 'xlsx'
  ) => {
    const ext = format === 'markdown' ? 'md' : format;
    const blob = (await apiService.get<any>(
      `/reports/ghg-inventory?${dateRangeQuery(startDate, endDate)}&format=${format}`,
      { responseType: 'blob' }
    )) as unknown as Blob;
    downloadBlob(blob, `ghg-inventory_${startDate}_${endDate}.${ext}`);
  },

  // Calculation-lineage drill-down (§7): reported numbers -> contributing lines
  // with full provenance, derived formulas, evidence and reconciliation.
  getLineage: async (startDate: string, endDate: string): Promise<LineageReport> => {
    const response = await apiService.get<LineageReport>(
      `/reports/lineage?${dateRangeQuery(startDate, endDate)}`
    );
    if (!response.success || !response.data) throw new Error(response.message || 'Failed to load lineage');
    return response.data;
  },

  /** Assurance / IMP / CDP / SBTi / ESRS report in a document format (pdf/docx/xlsx). */
  downloadReport: async (
    kind: 'assurance' | 'imp' | 'cdp' | 'sbti' | 'esrs',
    startDate: string,
    endDate: string,
    format: 'pdf' | 'docx' | 'xlsx'
  ) => {
    const map: Record<string, { path: string; stem: string }> = {
      assurance: { path: '/reports/assurance-package', stem: 'assurance-package' },
      imp: { path: '/reports/imp', stem: 'imp' },
      cdp: { path: '/reports/cdp', stem: 'cdp-mapping' },
      sbti: { path: '/reports/sbti', stem: 'sbti-summary' },
      esrs: { path: '/reports/esrs', stem: 'esrs-e1' },
    };
    const { path, stem } = map[kind];
    const blob = (await apiService.get<any>(
      `${path}?${dateRangeQuery(startDate, endDate)}&format=${format}`,
      { responseType: 'blob' }
    )) as unknown as Blob;
    downloadBlob(blob, `${stem}_${startDate}_${endDate}.${format}`);
  },

  // ---- Fleet registry (§2.2 mobile distance-based) ----
  getVehicles: async (includeInactive = false): Promise<Vehicle[]> => {
    const response = await apiService.get<{ vehicles: Vehicle[]; count: number }>(
      `/vehicles${includeInactive ? '?includeInactive=true' : ''}`
    );
    return response.data?.vehicles || [];
  },

  createVehicle: async (data: Partial<Vehicle>): Promise<Vehicle> => {
    const response = await apiService.post<Vehicle>('/vehicles', data);
    if (!response.success || !response.data) throw new Error(response.message || 'Create failed');
    return response.data;
  },

  updateVehicle: async (id: string, data: Partial<Vehicle>): Promise<Vehicle> => {
    const response = await apiService.put<Vehicle>(`/vehicles/${id}`, data);
    if (!response.success || !response.data) throw new Error(response.message || 'Update failed');
    return response.data;
  },

  deactivateVehicle: async (id: string) => {
    const response = await apiService.delete<any>(`/vehicles/${id}`);
    if (!response.success) throw new Error(response.message || 'Deactivate failed');
    return response;
  },
};

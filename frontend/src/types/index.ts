export interface User {
	id: string;
	email: string;
	name: string;
	organizationId: string;
	role: 'admin' | 'manager' | 'user' | 'viewer' | 'verifier';
	createdAt: string;
	updatedAt: string;
  }
  
  export interface Organization {
	id: string;
	name: string;
	industry: string;
	country: string;
	size: 'micro' | 'small' | 'medium' | 'large';
	consolidationApproach?: 'equity_share' | 'financial_control' | 'operational_control';
	settings?: {
		currency?: string;
		timezone?: string;
		language?: string;
		gwpSet?: 'AR4' | 'AR5' | 'AR6';
	};
	exclusions?: OrgExclusion[];
	denominators?: Denominator[];
	relevantCategories?: string[];
	createdAt: string;
  }

  /** Per-year denominator for intensity metrics (one value per year+metric). */
  export interface Denominator {
	year: number;
	metric: 'production' | 'revenue' | 'employees' | 'floor_area' | 'custom';
	label?: string;
	value: number;
	unit: string;
  }

  /** Documented exclusion (GHG Protocol completeness/transparency register). */
  export interface OrgExclusion {
	source: string;
	scope?: 1 | 2 | 3;
	categoryId?: string;
	justification: string;
	estimatedEmissions?: number;
	createdAt?: string;
  }

  /** Facility/site within the organizational boundary. */
  export interface Facility {
	id: string;
	organizationId?: string;
	name: string;
	country?: string;
	city?: string;
	parentFacilityId?: string | null;
	entityType?: 'subsidiary' | 'division' | 'site' | 'asset';
	ownershipPercent?: number;
	operationalControl?: boolean;
	financialControl?: boolean;
	acquiredDate?: string | null;
	disposedDate?: string | null;
	notes?: string;
	isActive?: boolean;
	createdAt?: string;
  }

  /** Fleet vehicle (GET /vehicles) — owned mobile-combustion source (§2.2). */
  export interface Vehicle {
	id: string;
	organizationId?: string;
	name: string;
	vehicleType: 'car' | 'van' | 'hgv' | 'motorbike' | 'bus' | 'other';
	fuel?: string;
	size?: string;
	registration?: string;
	// Populated on read (name/factor/unit), or a bare id string on write.
	factorId?: string | { id?: string; _id?: string; name: string; factor: number; unit: string } | null;
	facilityId?: string | { id?: string; _id?: string; name: string } | null;
	notes?: string;
	isActive?: boolean;
	createdAt?: string;
  }

  /** Consolidation roll-up (GET /reports/consolidation). */
  export interface ConsolidationResult {
	approach: 'equity_share' | 'operational_control' | 'financial_control';
	grossTotal: number;
	consolidatedTotal: number;
	overallSharePercent: number;
	byEntity: Array<{
		entityId: string | null;
		name: string;
		entityType?: string;
		sharePercent: number;
		gross: number;
		consolidated: number;
	}>;
  }

  /** Append-only audit trail entry (who/when/action/resource). */
  export interface AuditLogEntry {
	id: string;
	userEmail?: string;
	action: string;
	resourceType: string;
	resourceId?: string;
	before?: Record<string, any>;
	after?: Record<string, any>;
	comment?: string;
	createdAt: string;
  }

  /** Snapshot version metadata recorded at every calculation lock. */
  export interface SnapshotMeta {
	id: string;
	version: number;
	reason: string;
	comment?: string;
	createdBy?: string;
	createdAt: string;
  }

  /** Field-level restatement diff between two snapshot versions. */
  export interface SnapshotDiff {
	calculationId: string;
	from: { version: number; lockedAt: string; comment?: string };
	to: { version: number; lockedAt: string; comment?: string };
	identical: boolean;
	changes: Array<{ path: string; from: any; to: any }>;
  }

  /** A single recompute-check entry result (§3 deterministic recompute). */
  export interface RecomputeEntry {
	index: number;
	categoryName?: string;
	factorName?: string;
	factorVersion?: number | null;
	currentFactorVersion?: number | null;
	versionPinned: boolean;
	recomputeSupported: boolean;
	storedEmissions?: number;
	recomputedEmissions?: number;
	matches?: boolean;
	liveEmissions?: number;
	factorChangedSincePin?: boolean;
	note?: string;
  }

  /** Result of GET /calculations/:id/recompute-check (§3). */
  export interface RecomputeCheckResult {
	calculationId: string;
	title: string;
	status: string;
	locked: boolean;
	entryCount: number;
	reproducible: boolean;
	deterministic: boolean;
	summary: {
		pinned: number;
		unpinned: number;
		supported: number;
		unsupported: number;
		mismatches: number;
		driftedFactors: number;
	};
	entries: RecomputeEntry[];
  }

  /** A single evidence attachment on a calculation data line (§4.3). */
  export interface EvidenceItem {
	id: string;
	calculationId: string;
	entryIndex: number;
	filename: string;
	contentType: string;
	size: number;
	sha256: string;
	description?: string;
	uploadedByEmail: string;
	createdAt: string;
  }

  /** Result of GET /evidence/calculation/:calcId (§4.3). */
  export interface EvidenceList {
	calculationId: string;
	count: number;
	countByEntry: Record<number, number>;
	evidence: EvidenceItem[];
  }

  /** One reporting year in the data-quality trend (§5). */
  export interface DataQualityTrendYear {
	year: number;
	totalEmissions: number;
	entries: number;
	weightedDqScore: number | null;
	primarySharePercent: number;
	secondarySharePercent: number;
	estimatedEmissions: number;
	dqScoreDelta?: number | null;
	primaryShareDelta?: number;
	improving?: boolean;
  }

  /** Result of GET /reports/data-quality-trend (§5). */
  export interface DataQualityTrend {
	years: DataQualityTrendYear[];
	count: number;
	note: string;
  }

  /** Conservative gap-filling suggestion from POST /calculations/estimate. */
  export interface EstimateSuggestion {
	suggestedValue: number;
	rawValue: number;
	unit: string;
	method: string;
	conservativenessUplift: number;
	basedOnCalculations: Array<{ id: string; title: string; periodStart: string; value: number }>;
	notes: string[];
  }

  /** Live whole-year figures for a reporting-year inventory. */
  export interface InventoryFigures {
	scope1: number;
	scope2: number;
	scope3: number;
	total: number;
	calculationCount: number;
	lockedCount: number;
  }

  /** Reporting-year inventory (Draft → Review → Published lifecycle). */
  export interface Inventory {
	id: string;
	reportingYear: number;
	period: { start: string; end: string };
	status: 'draft' | 'review' | 'published';
	gwpSet?: 'AR4' | 'AR5' | 'AR6';
	isBaseYear: boolean;
	recalcThresholdPercent: number;
	frozenTotals?: { scope1: number; scope2: number; scope3: number; total: number };
	frozenCompletenessPercent?: number;
	publishedAt?: string;
	publishedBy?: string;
	current?: InventoryFigures;
	completeness?: CompletenessResult;
	snapshotVersions?: number;
  }

  /** Guided onboarding state (GET /organizations/onboarding). */
  export interface OnboardingState {
	completed: boolean;
	completedAt?: string;
	skipped: boolean;
	currentStep: number;
	shouldShowWizard: boolean;
	checklist: {
		consolidationApproach: string;
		gwpSet: string;
		relevanceScreened: boolean;
		facilities: number;
		denominators: number;
		reportingYears: number;
		calculations: number;
	};
  }

  /** Base-year recalculation drift check (GET /inventories/:id/recalculation-check). */
  export interface RecalculationCheck {
	reportingYear: number;
	isBaseYear: boolean;
	applicable: boolean;
	note?: string;
	frozen?: { version: number; total: number; publishedAt?: string };
	latestPublishedVersion?: number;
	current?: { total: number };
	deltaKg?: number;
	deltaPercent?: number | null;
	thresholdPercent?: number;
	thresholdSource?: string;
	exceedsThreshold?: boolean;
	recommendation?: string;
  }
  
  export interface EmissionCategory {
	id: string;
	scope: 1 | 2 | 3;
	category: string;
	subcategory?: string;
	description: string;
	clarification?: string;
	allowedUnits?: Array<{
		unit: string;
		description: string;
		conversionToBase: number;
	}>;
	baseUnit: string;
	unit: string;
	priority: 'high' | 'medium' | 'low';
	industry?: string[];
	industries?: string[];
	egyptianContext?: {
		relevance: 'high' | 'medium' | 'low';
		localFactors?: string;
		considerations?: string;
	};
	calculationMethod: 'direct' | 'activity_based' | 'spend_based' | 'hybrid';
	requiredInputs?: Array<{
		field: string;
		type: 'number' | 'text' | 'date' | 'select';
		required: boolean;
		options?: string[];
	}>;
	isActive: boolean;
	displayOrder?: number;
	icon?: string;
	color?: string;
  }
  
  export interface EmissionFactor {
	id: string;
	categoryId: string;
	factor: number;
	unit: string;
	source: string;
	region: 'egypt' | 'global';
	year: number;
	// Set when the factor came from a specific supplier (supplier engagement)
	supplierId?: string;
	supplierName?: string;
  }

  /** Supplier data request lifecycle (sent → received → fulfilled/declined). */
  export interface SupplierDataRequest {
	id: string;
	period: { start: string; end: string };
	categoryId?: string;
	message?: string;
	status: 'sent' | 'received' | 'fulfilled' | 'declined';
	sentAt: string;
	respondedAt?: string;
	fulfillment?: {
	  type?: 'custom-factor' | 'activity-data' | 'document';
	  factorId?: string;
	  calculationId?: string;
	  notes?: string;
	};
  }

  /** Supplier registry entry with derived engagement status. */
  export interface Supplier {
	id: string;
	organizationId?: string;
	name: string;
	contactName?: string;
	contactEmail?: string;
	categories: Array<string | { id?: string; _id?: string; category: string; scope: number }>;
	notes?: string;
	isActive?: boolean;
	dataRequests: SupplierDataRequest[];
	engagementStatus: 'not_engaged' | 'awaiting_response' | 'data_received' | 'data_integrated';
	requestCounts: { sent: number; received: number; fulfilled: number; declined: number };
	createdAt?: string;
  }

  /** Org-wide supplier engagement summary returned by GET /suppliers. */
  export interface SupplierEngagementSummary {
	total: number;
	notEngaged: number;
	awaitingResponse: number;
	dataReceived: number;
	dataIntegrated: number;
  }

  /** Completeness assessment (relevant vs covered/excluded/gaps). */
  export interface CompletenessResult {
	screened: boolean;
	relevantCount: number;
	coveredCount: number;
	excludedCount: number;
	gapCount: number;
	completenessPercent: number;
	byScope: Array<{ scope: number; relevant: number; covered: number; excluded: number; gaps: number }>;
	gaps: Array<{ categoryId: string; category: string; scope: number }>;
	note?: string;
  }
  
  export interface Calculation {
	id: string;
	organizationId: string;
	userId: string;
	facilityId?: string;
	title: string;
	description?: string;
	period: {
	  start: string;
	  end: string;
	};
	emissions: {
	  scope1: number;
	  scope2: number;
	  scope3: number;
	  total: number;
	};
	data: CalculationEntry[];
	status: 'draft' | 'completed' | 'verified' | 'locked';
	verification?: {
	  verified: boolean;
	  verifiedBy?: string;
	  verifiedAt?: string;
	  comment?: string;
	};
	createdAt: string;
	updatedAt: string;
  }

  export interface CalculationEntry {
	categoryId: string;
	value: number;
	unit: string;
	factor: number;
	emissions: number;
	notes?: string;
	// Data quality + provenance (stored server-side on save)
	quality?: 'high' | 'medium' | 'low';
	dqScore?: number; // PCAF-style 1 (best) … 5 (worst)
	factorId?: string;
	factorName?: string;
	factorSource?: string;
	factorYear?: number;
	gwpSet?: string;
	gwpApplied?: 'per-gas' | 'embedded';
	method?: string;
	// Supplier provenance (entry computed with a supplier-linked factor)
	supplierId?: string;
	supplierName?: string;
	// Scope 2 dual reporting (purchased-electricity entries)
	scope2Location?: number;
	scope2Market?: number;
	scope2MarketMethod?: string;
	// Estimation flags — estimates are never silently mixed with measured data
	isEstimate?: boolean;
	estimationMethod?: string;
  }
  
  export interface ApiResponse<T> {
	success: boolean;
	data?: T;
	message?: string;
	errors?: Record<string, string[]>;
	pagination?: {
	  page: number;
	  limit: number;
	  total: number;
	  pages: number;
	};
  }
  
  export * from './calculations'; 
  
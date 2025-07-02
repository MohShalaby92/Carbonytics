export interface User {
	id: string;
	email: string;
	name: string;
	organizationId: string;
	role: 'admin' | 'manager' | 'user';
	createdAt: string;
	updatedAt: string;
  }
  
  export interface Organization {
	id: string;
	name: string;
	industry: string;
	country: string;
	size: 'small' | 'medium' | 'large';
	createdAt: string;
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
  }
  
  export interface Calculation {
	id: string;
	organizationId: string;
	userId: string;
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
	status: 'draft' | 'completed' | 'verified';
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
  }
  
  export interface ApiResponse<T> {
	success: boolean;
	data?: T;
	message?: string;
	errors?: Record<string, string[]>;
  }
  
  export * from './calculations'; 
  
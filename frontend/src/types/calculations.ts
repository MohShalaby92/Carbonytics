export interface CalculationEntry {
    id?: string;
    categoryId: string;
    value: number;
    unit: string;
    factor: number;
    emissions: number;
    notes?: string;
    timestamp?: string;
    metadata?: Record<string, any>;
  }
  
  export interface CalculationSession {
    id?: string;
    title: string;
    description?: string;
    period: {
      start: string;
      end: string;
    };
    calculations: CalculationEntry[];
    emissions: {
      scope1: number;
      scope2: number;
      scope3: number;
      total: number;
    };
    status: 'draft' | 'completed' | 'verified';
    createdAt?: string;
    updatedAt?: string;
  }
  
  export interface CalculationResult {
    calculation: CalculationEntry;
    factor: {
      id: string;
      name: string;
      value: number;
      unit: string;
      source: string;
      year: number;
      region: string;
    };
    category: {
      id: string;
      name: string;
      scope: number;
    };
  }
  
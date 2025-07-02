import { apiService } from './api';
import { CalculationResult, EmissionCategory, EmissionFactor } from '../types';

export class CalculationService {
  
  async calculateEmissions(data: {
    categoryId: string;
    value: number;
    unit: string;
    factorId?: string;
    metadata?: any;
  }): Promise<CalculationResult> {
    const response = await apiService.post<CalculationResult>('/calculations/calculate', data);
    
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Calculation failed');
    }
    
    return response.data;
  }

  async saveCalculation(data: {
    title: string;
    description?: string;
    period: { start: string; end: string };
    calculations: any[];
  }) {
    const response = await apiService.post('/calculations', data);
    
    if (!response.success) {
      throw new Error(response.message || 'Failed to save calculation');
    }
    
    return response.data;
  }

  async getCalculations(params?: {
    status?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, value.toString());
        }
      });
    }

    const response = await apiService.get(`/calculations?${queryParams.toString()}`);
    
    if (!response.success) {
      throw new Error(response.message || 'Failed to load calculations');
    }
    
    return response.data;
  }

  async getCalculationById(id: string) {
    const response = await apiService.get(`/calculations/${id}`);
    
    if (!response.success) {
      throw new Error(response.message || 'Failed to load calculation');
    }
    
    return response.data;
  }

  async getEmissionCategories(params?: {
    scope?: number;
    industry?: string;
    priority?: string;
    search?: string;
  }) {
    const queryParams = new URLSearchParams();
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, value.toString());
        }
      });
    }

    const response = await apiService.get<{ categories: EmissionCategory[]; grouped: Record<string, EmissionCategory[]> }>(`/emission-categories?${queryParams.toString()}`);
    
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to load categories');
    }
    
    return response.data;
  }

  async getEmissionFactors(categoryId: string, params?: {
    region?: string;
    preferLocal?: boolean;
    fuelType?: string;
    vehicleType?: string;
  }) {
    const queryParams = new URLSearchParams();
    queryParams.append('preferLocal', 'true'); // Default to Egyptian factors
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, value.toString());
        }
      });
    }

    const response = await apiService.get<{ factors: EmissionFactor[] }>(`/emission-factors/category/${categoryId}?${queryParams.toString()}`);
    
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to load emission factors');
    }
    
    return response.data;
  }

  async searchFactors(query: string, params?: {
    region?: string;
    scope?: number;
  }) {
    const queryParams = new URLSearchParams();
    queryParams.append('q', query);
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, value.toString());
        }
      });
    }

    const response = await apiService.get(`/emission-factors/search?${queryParams.toString()}`);
    
    if (!response.success) {
      throw new Error(response.message || 'Search failed');
    }
    
    return response.data;
  }

  // Business travel specific calculation with airport distance
  async calculateBusinessTravel(data: {
    origin: string;
    destination: string;
    travelClass?: string;
    roundTrip: boolean;
    travelMode: string;
  }): Promise<CalculationResult> {
    // First get the distance if it's air travel
    let distance = 0;
    
    if (data.travelMode === 'Flight') {
      try {
        // You would integrate with airport distance API here
        // For now, using a placeholder calculation
        distance = await this.calculateAirportDistance(data.origin, data.destination);
      } catch (error) {
        console.warn('Failed to calculate airport distance:', error);
        // Fallback to manual distance input
        throw new Error('Please enter distance manually for this route');
      }
    }

    const calculationData = {
      categoryId: '', // Business Travel category ID
      value: data.roundTrip ? distance * 2 : distance,
      unit: 'km',
      metadata: {
        origin: data.origin,
        destination: data.destination,
        travelClass: data.travelClass,
        roundTrip: data.roundTrip,
        travelMode: data.travelMode,
      },
    };

    return this.calculateEmissions(calculationData);
  }

  private async calculateAirportDistance(origin: string, destination: string): Promise<number> {
    // Integration with airport distance API
    // This would use the airport.com API mentioned in your requirements
    try {
      const response = await fetch(`https://airportgap.com/api/airports/distance?from=${origin}&to=${destination}`);
      const data = await response.json();
      
      if (data && data.data && data.data.attributes) {
        return data.data.attributes.kilometers;
      }
      
      throw new Error('Invalid response from airport API');
    } catch (error) {
      console.error('Airport distance calculation failed:', error);
      throw error;
    }
  }
}

export const calculationService = new CalculationService();

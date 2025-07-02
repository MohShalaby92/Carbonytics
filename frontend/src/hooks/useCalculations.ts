import { useState, useEffect } from 'react';
import { calculationService } from '../services/calculationService';
import { CalculationResult, EmissionCategory } from '../types';

export const useCalculations = () => {
  const [calculations, setCalculations] = useState<any[]>([]);
  const [categories, setCategories] = useState<EmissionCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await calculationService.getEmissionCategories();
      setCategories(data.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  const addCalculation = async (calculationData: any): Promise<CalculationResult> => {
    try {
      setError(null);
      
      const result = await calculationService.calculateEmissions(calculationData);
      
      // Add to local state
      setCalculations(prev => [...prev, {
        ...result.calculation,
        category: result.category,
        factor: result.factor,
        timestamp: new Date().toISOString(),
      }]);
      
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Calculation failed';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const removeCalculation = (index: number) => {
    setCalculations(prev => prev.filter((_, i) => i !== index));
  };

  const clearCalculations = () => {
    setCalculations([]);
  };

  const getTotalEmissionsByScope = () => {
    return calculations.reduce((acc, calc) => {
      const scope = calc.category?.scope || 1;
      acc[scope] = (acc[scope] || 0) + (calc.emissions || 0);
      return acc;
    }, {} as Record<number, number>);
  };

  const getTotalEmissions = () => {
    return calculations.reduce((sum, calc) => sum + (calc.emissions || 0), 0);
  };

  const saveCalculationSession = async (sessionData: {
    title: string;
    description?: string;
    period: { start: string; end: string };
  }) => {
    try {
      setError(null);
      
      const data = {
        ...sessionData,
        calculations: calculations.map(calc => ({
          categoryId: calc.categoryId,
          value: calc.value,
          unit: calc.unit,
          factor: calc.factor,
          emissions: calc.emissions,
          notes: calc.notes,
        })),
      };
      
      const result = await calculationService.saveCalculation(data);
      
      // Clear local calculations after saving
      clearCalculations();
      
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save calculation';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  return {
    calculations,
    categories,
    loading,
    error,
    addCalculation,
    removeCalculation,
    clearCalculations,
    getTotalEmissionsByScope,
    getTotalEmissions,
    saveCalculationSession,
    setError,
  };
};

import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Alert } from '../ui/Alert';
import { apiService } from '../../services/api';
import { EmissionCategory, EmissionFactor, CalculationResult } from '../../types';
import { formatEmissions } from '../../utils/calculations';
import { Calculator, Zap, Truck, Factory } from 'lucide-react';

// Dynamic schema builder based on category requirements
const buildValidationSchema = (category: EmissionCategory) => {
  const baseSchema = {
    categoryId: z.string().min(1, 'Category is required'),
    value: z.number().positive('Value must be positive'),
    unit: z.string().min(1, 'Unit is required'),
    period: z.object({
      start: z.string().min(1, 'Start date is required'),
      end: z.string().min(1, 'End date is required'),
    }),
    notes: z.string().optional(),
  };

  // Add dynamic fields based on category requirements
  const dynamicFields: any = {};
  
  category.requiredInputs?.forEach(input => {
    if (input.required) {
      if (input.type === 'number') {
        dynamicFields[input.field] = z.number().positive();
      } else {
        dynamicFields[input.field] = z.string().min(1, `${input.field} is required`);
      }
    } else {
      if (input.type === 'number') {
        dynamicFields[input.field] = z.number().optional();
      } else {
        dynamicFields[input.field] = z.string().optional();
      }
    }
  });

  return z.object({ ...baseSchema, ...dynamicFields });
};

interface EmissionCalculationFormProps {
  categoryId?: string;
  onCalculationComplete?: (result: CalculationResult) => void;
  onSave?: (calculation: any) => void;
}

type FormData = {
  categoryId: string;
  value: number;
  unit: string;
  period: {
    start: string;
    end: string;
  };
  notes?: string;
  // Add any dynamic fields if needed
};

export const EmissionCalculationForm: React.FC<EmissionCalculationFormProps> = ({
  categoryId,
  onCalculationComplete,
  onSave,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<EmissionCategory | null>(null);
  const [categories, setCategories] = useState<EmissionCategory[]>([]);
  const [availableFactors, setAvailableFactors] = useState<EmissionFactor[]>([]);
  const [calculationResult, setCalculationResult] = useState<CalculationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);

  // Dynamic form setup
  const emptySchema = z.object({
    categoryId: z.string(),
    value: z.number(),
    unit: z.string(),
    period: z.object({
      start: z.string(),
      end: z.string(),
    }),
    notes: z.string().optional(),
    // Add any dynamic fields if needed
  });

  const validationSchema = selectedCategory ? buildValidationSchema(selectedCategory) : emptySchema;
  
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(validationSchema),
    defaultValues: {
      categoryId: categoryId || '',
      value: 0,
      unit: '',
      period: {
        start: '',
        end: '',
      },
      notes: '',
    },
  });

  const watchedValue = watch('value');
  const watchedUnit = watch('unit');
  const watchedCategoryId = watch('categoryId');

  // Load categories on mount
  useEffect(() => {
    loadCategories();
  }, []);

  // Load category details when selected
  useEffect(() => {
    if (watchedCategoryId) {
      loadCategoryDetails(watchedCategoryId);
    }
  }, [watchedCategoryId]);

  // Real-time calculation
  useEffect(() => {
    if (selectedCategory && watchedValue > 0 && watchedUnit) {
      performCalculation();
    }
  }, [watchedValue, watchedUnit, selectedCategory]);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const response = await apiService.get<{ categories: EmissionCategory[] }>('/emission-categories');
      if (response.success && response.data) {
        setCategories(response.data.categories);
        
        // Auto-select if categoryId provided
        if (categoryId) {
          const category = response.data.categories.find(c => c.id === categoryId);
          if (category) {
            setSelectedCategory(category);
            setValue('categoryId', categoryId);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCategoryDetails = async (categoryId: string) => {
    try {
      const [categoryResponse, factorsResponse] = await Promise.all([
        apiService.get<EmissionCategory>(`/emission-categories/${categoryId}`),
        apiService.get<{ factors: EmissionFactor[] }>(`/emission-factors/category/${categoryId}?preferLocal=true`),
      ]);

      if (categoryResponse.success && categoryResponse.data) {
        setSelectedCategory(categoryResponse.data);
        
        // Set default unit
        if (categoryResponse.data.baseUnit) {
          setValue('unit', categoryResponse.data.baseUnit);
        }
      }

      if (factorsResponse.success && factorsResponse.data) {
        setAvailableFactors(factorsResponse.data.factors);
      }
    } catch (error) {
      console.error('Failed to load category details:', error);
    }
  };

  const performCalculation = async () => {
    if (!selectedCategory || !watchedValue || !watchedUnit) return;

    try {
      setCalculating(true);
      
      const calculationData = {
        categoryId: selectedCategory.id,
        value: watchedValue,
        unit: watchedUnit,
      };

      const response = await apiService.post<CalculationResult>('/calculations/calculate', calculationData);
      
      if (response.success && response.data) {
        setCalculationResult(response.data);
        onCalculationComplete?.(response.data);
      }
    } catch (error) {
      console.error('Calculation failed:', error);
    } finally {
      setCalculating(false);
    }
  };

  const onSubmit = async (data: any) => {
    if (!calculationResult) {
      await performCalculation();
      return;
    }

    // Save the calculation
    const calculationEntry = {
      ...calculationResult.calculation,
      ...data,
      timestamp: new Date().toISOString(),
    };

    onSave?.(calculationEntry);
    reset();
    setCalculationResult(null);
  };

  const getScopeIcon = (scope: number) => {
    switch (scope) {
      case 1: return <Factory className="w-5 h-5" />;
      case 2: return <Zap className="w-5 h-5" />;
      case 3: return <Truck className="w-5 h-5" />;
      default: return <Calculator className="w-5 h-5" />;
    }
  };

  const getScopeColor = (scope: number) => {
    switch (scope) {
      case 1: return 'text-red-600 bg-red-50';
      case 2: return 'text-yellow-600 bg-yellow-50';
      case 3: return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="h-10 bg-gray-200 rounded"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center space-x-3">
        <Calculator className="w-6 h-6 text-primary-600" />
        <h2 className="text-xl font-semibold text-gray-900">Calculate Emissions</h2>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Category Selection */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Emission Category
          </label>
          <Controller
            name="categoryId"
            control={control}
            render={({ field }) => (
              <Select
                {...field}
                error={errors.categoryId?.message}
              >
                <option value="">Select an emission category</option>
                {categories.map(category => (
                  <option key={category.id} value={category.id}>
                    Scope {category.scope} - {category.category}
                  </option>
                ))}
              </Select>
            )}
          />
        </div>

        {/* Category Details */}
        {selectedCategory && (
          <Alert className={`border-l-4 ${getScopeColor(selectedCategory.scope)} border-l-current`}>
            <div className="flex items-start space-x-3">
              <div className={`p-2 rounded-full ${getScopeColor(selectedCategory.scope)}`}>
                {getScopeIcon(selectedCategory.scope)}
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-gray-900">
                  Scope {selectedCategory.scope}: {selectedCategory.category}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedCategory.description}
                </p>
                {selectedCategory.clarification && (
                  <p className="text-xs text-gray-500 mt-2">
                    💡 {selectedCategory.clarification}
                  </p>
                )}
                {selectedCategory.egyptianContext?.considerations && (
                  <p className="text-xs text-blue-600 mt-2">
                    🇪🇬 Egyptian Context: {selectedCategory.egyptianContext.considerations}
                  </p>
                )}
              </div>
            </div>
          </Alert>
        )}

        {/* Dynamic Input Fields */}
        {selectedCategory && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Primary Value Input */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Value *
              </label>
              <Controller
                name="value"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    type="number"
                    step="0.01"
                    placeholder="Enter amount"
                    error={errors.value?.message}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                  />
                )}
              />
            </div>

            {/* Unit Selection */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Unit *
              </label>
              <Controller
                name="unit"
                control={control}
                render={({ field }) => (
                  <Select
                    {...field}
                    error={errors.unit?.message}
                  >
                    <option value="">Select unit...</option>
                    {selectedCategory.allowedUnits?.map(unit => (
                      <option key={unit.unit} value={unit.unit}>
                        {unit.unit} - {unit.description}
                      </option>
                    ))}
                  </Select>
                )}
              />
            </div>

            {/* Dynamic Category-Specific Fields */}
            {selectedCategory.requiredInputs?.map(input => (
              <div key={input.field} className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  {input.field.charAt(0).toUpperCase() + input.field.slice(1).replace(/([A-Z])/g, ' $1')}
                  {input.required && ' *'}
                </label>
                <Controller
                  name={input.field as any}
                  control={control}
                  render={({ field }) => {
                    if (input.type === 'select' && input.options) {
                      return (
                        <Select {...field} error={(errors as any)[input.field]?.message}>
                          <option value="">Select...</option>
                          {input.options.map(option => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </Select>
                      );
                    } else if (input.type === 'number') {
                      return (
                        <Input
                          {...field}
                          type="number"
                          step="0.01"
                          error={(errors as any)[input.field]?.message}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      );
                    } else if (input.type === 'date') {
                      return (
                        <Input
                          {...field}
                          type="date"
                          error={(errors as any)[input.field]?.message}
                        />
                      );
                    } else {
                      return (
                        <Input
                          {...field}
                          type="text"
                          error={(errors as any)[input.field]?.message}
                        />
                      );
                    }
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Period Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Period Start *
            </label>
            <Controller
              name="period.start"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  type="date"
                  error={errors.period?.start?.message}
                />
              )}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Period End *
            </label>
            <Controller
              name="period.end"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  type="date"
                  error={errors.period?.end?.message}
                />
              )}
            />
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Notes (optional)
          </label>
          <Controller
            name="notes"
            control={control}
            render={({ field }) => (
              <Textarea
                {...field}
                rows={3}
                placeholder="Add any additional notes or context..."
              />
            )}
          />
        </div>

        {/* Real-time Calculation Result */}
        {calculationResult && (
          <Card className="p-4 bg-green-50 border-green-200">
            <h3 className="font-medium text-green-800 mb-2">Calculation Result</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Emissions:</span>
                <span className="font-medium text-green-800">
                  {formatEmissions(calculationResult.calculation.emissions)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Factor:</span>
                <span className="text-green-700">
                  {calculationResult.factor.value} {calculationResult.factor.unit}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Source:</span>
                <span className="text-green-700">
                  {calculationResult.factor.source} ({calculationResult.factor.year})
                </span>
              </div>
              {calculationResult.factor.region === 'egypt' && (
                <div className="text-xs text-blue-600 mt-2">
                  🇪🇬 Using Egyptian-specific emission factor
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="flex space-x-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={performCalculation}
            loading={calculating}
            disabled={!selectedCategory || !watchedValue || !watchedUnit}
          >
            {calculating ? 'Calculating...' : 'Calculate'}
          </Button>
          
          <Button
            type="submit"
            disabled={!calculationResult}
          >
            Save Calculation
          </Button>
          
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              reset();
              setCalculationResult(null);
            }}
          >
            Clear
          </Button>
        </div>
      </form>
    </Card>
  );
};

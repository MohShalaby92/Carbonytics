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
import { complianceService } from '../../services/complianceService';
import { EmissionCategory, EmissionFactor, CalculationResult, EstimateSuggestion } from '../../types';
import { formatEmissions } from '../../utils/calculations';
import { Calculator, Zap, Truck, Factory, Lightbulb } from 'lucide-react';

// Category requiredInputs that duplicate the form's own base fields. Rendering
// them twice bound the same form path twice (and the 'period' one clobbered the
// period {start,end} object, breaking validation), so they are skipped.
const RESERVED_INPUT_FIELDS = ['unit', 'period', 'value'];

const dynamicInputs = (category: EmissionCategory | null) =>
  (category?.requiredInputs || []).filter(
    (input) => !RESERVED_INPUT_FIELDS.includes(input.field)
  );

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

  dynamicInputs(category).forEach(input => {
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
  const [selectedFactorId, setSelectedFactorId] = useState<string>('');
  const [calculationResult, setCalculationResult] = useState<CalculationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  // Inline "add custom factor" mini-form
  const [showCustomFactor, setShowCustomFactor] = useState(false);
  const [customFactor, setCustomFactor] = useState({ name: '', factor: '', unit: '', source: '' });
  const [customFactorError, setCustomFactorError] = useState<string | null>(null);
  const [customFactorSaving, setCustomFactorSaving] = useState(false);
  // Gap-filling estimate suggestion: when applied, the entry is saved flagged
  // isEstimate + estimationMethod so it stays distinguishable from measured data.
  const [estimate, setEstimate] = useState<EstimateSuggestion | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);

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
    getValues,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(validationSchema) as any,
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
  const watchedPeriod = watch('period');

  // The estimate flag only survives as long as the suggested value is what's in
  // the field — a manual edit makes it the user's own (measured) figure again.
  useEffect(() => {
    if (estimate && watchedValue !== estimate.suggestedValue) {
      setEstimate(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedValue]);

  // Load categories on mount
  useEffect(() => {
    loadCategories();
  }, []);

  // Keep the form in sync when a category is picked in the sidebar selector.
  useEffect(() => {
    if (categoryId && categoryId !== watchedCategoryId) {
      setValue('categoryId', categoryId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  // Load category details when selected
  useEffect(() => {
    if (watchedCategoryId) {
      loadCategoryDetails(watchedCategoryId);
    }
  }, [watchedCategoryId]);

  // Real-time calculation (re-runs when the chosen factor changes too)
  useEffect(() => {
    if (selectedCategory && watchedValue > 0 && watchedUnit) {
      performCalculation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedValue, watchedUnit, selectedCategory, selectedFactorId]);

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
        const factors = factorsResponse.data.factors || [];
        setAvailableFactors(factors);
        // Preselect the first factor (custom org factors come first, then
        // Egyptian, then global — matching the backend's ordering).
        setSelectedFactorId((factors[0] as any)?.id || '');
      }
      setCalculationResult(null);
      setEstimate(null);
      setEstimateError(null);
    } catch (error) {
      console.error('Failed to load category details:', error);
    }
  };

  /** Metadata payload from the category-specific dynamic fields. */
  const collectMetadata = (): Record<string, any> => {
    const all = getValues() as any;
    const metadata: Record<string, any> = {};
    dynamicInputs(selectedCategory).forEach((input) => {
      const v = all[input.field];
      if (v !== undefined && v !== '' && !(typeof v === 'number' && isNaN(v))) {
        metadata[input.field] = v;
      }
    });
    return metadata;
  };

  const handleCreateCustomFactor = async () => {
    if (!selectedCategory) return;
    if (!customFactor.name.trim() || !customFactor.factor || !customFactor.unit.trim()) {
      setCustomFactorError('Name, factor value and unit are required.');
      return;
    }
    try {
      setCustomFactorSaving(true);
      setCustomFactorError(null);
      const response = await apiService.post<any>('/emission-factors', {
        categoryId: selectedCategory.id,
        name: customFactor.name.trim(),
        factor: parseFloat(customFactor.factor),
        unit: customFactor.unit.trim(),
        source: customFactor.source.trim() || 'Custom',
      });
      if (!response.success || !response.data) {
        throw new Error(response.message || 'Failed to create factor');
      }
      // Reload the factor list and select the new factor.
      await loadCategoryDetails(selectedCategory.id);
      setSelectedFactorId(response.data.id);
      setShowCustomFactor(false);
      setCustomFactor({ name: '', factor: '', unit: '', source: '' });
    } catch (error: any) {
      setCustomFactorError(
        error?.response?.data?.message || error?.message || 'Failed to create factor'
      );
    } finally {
      setCustomFactorSaving(false);
    }
  };

  /**
   * Conservative gap-filling: ask the server for a suggestion from the org's
   * own history (prior-year first, adjacent-period fallback, +10% uplift).
   */
  const handleSuggestEstimate = async () => {
    if (!selectedCategory) return;
    const period = getValues('period');
    if (!period?.start || !period?.end) {
      setEstimateError('Set the period first — estimates are based on your history for the same period.');
      return;
    }
    try {
      setEstimating(true);
      setEstimateError(null);
      const suggestion = await complianceService.suggestEstimate({
        categoryId: selectedCategory.id,
        period,
      });
      setValue('value', suggestion.suggestedValue, { shouldValidate: true });
      if (suggestion.unit) {
        setValue('unit', suggestion.unit, { shouldValidate: true });
      }
      // The clearing effect won't wipe this: it only clears when the field
      // value diverges from suggestedValue, and we just set them equal.
      setEstimate(suggestion);
    } catch (error: any) {
      setEstimate(null);
      setEstimateError(
        error?.response?.data?.message || error?.message || 'No estimate available'
      );
    } finally {
      setEstimating(false);
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
        ...(selectedFactorId ? { factorId: selectedFactorId } : {}),
        metadata: collectMetadata(),
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
    if (!calculationResult || !selectedCategory) {
      await performCalculation();
      return;
    }

    // Hand a complete entry to the page: enough to display in the summary AND to
    // persist via POST /calculations (which recomputes server-side).
    const calculationEntry = {
      categoryId: selectedCategory.id,
      value: data.value,
      unit: data.unit,
      ...(selectedFactorId ? { factorId: selectedFactorId } : {}),
      metadata: collectMetadata(),
      notes: data.notes,
      period: data.period,
      emissions: calculationResult.calculation.emissions,
      factor: calculationResult.factor.value,
      factorName: calculationResult.factor.name,
      factorUnit: calculationResult.factor.unit,
      // Estimates are forced to quality=low / DQ 5 at save time (server rule);
      // mirror that here so the session summary matches what will be stored.
      quality: estimate ? 'low' : calculationResult.quality?.rating,
      dqScore: estimate ? 5 : calculationResult.quality?.dqScore,
      // The method string from the server already documents the uplift.
      ...(estimate ? { isEstimate: true, estimationMethod: estimate.method } : {}),
      category: { category: selectedCategory.category, scope: selectedCategory.scope },
      timestamp: new Date().toISOString(),
    };

    onSave?.(calculationEntry);
    reset();
    setCalculationResult(null);
    setEstimate(null);
    setEstimateError(null);
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
      case 1: return 'text-red-600 dark:text-red-400 bg-red-500/10';
      case 2: return 'text-yellow-600 dark:text-yellow-400 bg-yellow-500/10';
      case 3: return 'text-green-600 dark:text-green-400 bg-green-500/10';
      default: return 'text-muted bg-fg/[0.04]';
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-fg/[0.08] rounded w-1/4"></div>
          <div className="h-10 bg-fg/[0.08] rounded"></div>
          <div className="h-4 bg-fg/[0.08] rounded w-1/2"></div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center space-x-3">
        <Calculator className="w-6 h-6 text-primary-600" />
        <h2 className="text-xl font-semibold text-fg">Calculate Emissions</h2>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Category Selection */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-fg/80">
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
                <h3 className="font-medium text-fg">
                  Scope {selectedCategory.scope}: {selectedCategory.category}
                </h3>
                <p className="text-sm text-muted mt-1">
                  {selectedCategory.description}
                </p>
                {selectedCategory.clarification && (
                  <p className="text-xs text-muted mt-2">
                    💡 {selectedCategory.clarification}
                  </p>
                )}
                {selectedCategory.egyptianContext?.considerations && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                    🇪🇬 Egyptian Context: {selectedCategory.egyptianContext.considerations}
                  </p>
                )}
              </div>
            </div>
          </Alert>
        )}

        {/* Emission Factor selection */}
        {selectedCategory && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-fg/80">
                Emission Factor
              </label>
              <button
                type="button"
                onClick={() => { setShowCustomFactor((v) => !v); setCustomFactorError(null); }}
                className="text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-300"
              >
                {showCustomFactor ? 'Cancel custom factor' : '+ Add custom factor'}
              </button>
            </div>

            {availableFactors.length > 0 ? (
              <>
                <Select
                  value={selectedFactorId}
                  onChange={(e) => setSelectedFactorId(e.target.value)}
                >
                  {availableFactors.map((f: any) => (
                    <option key={f.id} value={f.id}>
                      {f.name} — {f.factor} {f.unit}
                      {f.organizationId ? ' (custom)' : ''}
                    </option>
                  ))}
                </Select>
                {(() => {
                  const f: any = availableFactors.find((x: any) => x.id === selectedFactorId);
                  if (!f) return null;
                  return (
                    <div className="text-xs text-muted flex flex-wrap gap-x-3 gap-y-1 pt-1">
                      <span>
                        Factor: <span className="font-medium text-fg/80">{f.factor} {f.unit}</span>
                      </span>
                      <span>Source: {f.source}{f.year ? ` (${f.year})` : ''}</span>
                      {f.region && <span>Region: {f.region}</span>}
                      {f.qualityRating && <span>Quality: {f.qualityRating}</span>}
                      {f.organizationId && (
                        <span className="text-primary-600 dark:text-primary-300">Custom (your organization)</span>
                      )}
                    </div>
                  );
                })()}
              </>
            ) : (
              <p className="text-xs text-muted">
                No factors available for this category yet — add a custom factor to proceed.
              </p>
            )}

            {showCustomFactor && (
              <div className="mt-2 p-3 border border-line rounded-lg space-y-3 bg-fg/[0.02]">
                <p className="text-xs text-muted">
                  Define your own factor for this category (admin/manager only). It will be
                  available to your organization and used for this calculation.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    placeholder="Factor name (e.g. Supplier-specific electricity)"
                    value={customFactor.name}
                    onChange={(e) => setCustomFactor({ ...customFactor, name: e.target.value })}
                  />
                  <Input
                    type="number"
                    step="0.00001"
                    placeholder="Factor value (e.g. 0.42)"
                    value={customFactor.factor}
                    onChange={(e) => setCustomFactor({ ...customFactor, factor: e.target.value })}
                  />
                  <Input
                    placeholder={`Unit (e.g. kg CO2e/${selectedCategory.baseUnit || 'unit'})`}
                    value={customFactor.unit}
                    onChange={(e) => setCustomFactor({ ...customFactor, unit: e.target.value })}
                  />
                  <Input
                    placeholder="Source (optional, defaults to 'Custom')"
                    value={customFactor.source}
                    onChange={(e) => setCustomFactor({ ...customFactor, source: e.target.value })}
                  />
                </div>
                {customFactorError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{customFactorError}</p>
                )}
                <Button
                  type="button"
                  size="sm"
                  onClick={handleCreateCustomFactor}
                  loading={customFactorSaving}
                >
                  Save Factor
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Dynamic Input Fields */}
        {selectedCategory && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Primary Value Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-fg/80">
                  Value *
                </label>
                <button
                  type="button"
                  onClick={handleSuggestEstimate}
                  disabled={estimating || !watchedPeriod?.start || !watchedPeriod?.end}
                  title={
                    !watchedPeriod?.start || !watchedPeriod?.end
                      ? 'Set the period first — estimates come from your history for the same period'
                      : 'Suggest a conservative estimate from your historical data'
                  }
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  {estimating ? 'Estimating…' : 'Suggest estimate'}
                </button>
              </div>
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
              <label className="block text-sm font-medium text-fg/80">
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

            {/* Dynamic Category-Specific Fields (base fields like unit/period excluded) */}
            {dynamicInputs(selectedCategory).map(input => (
              <div key={input.field} className="space-y-2">
                <label className="block text-sm font-medium text-fg/80">
                  {input.field.charAt(0).toUpperCase() + input.field.slice(1).replace(/([A-Z])/g, ' $1')}
                  {input.required && ' *'}
                </label>
                <Controller
                  name={input.field as any}
                  control={control}
                  render={({ field }) => {
                    // Dynamic fields have no default value; coerce undefined to ''
                    // so the input stays controlled for its whole lifetime.
                    const value = (field.value as any) ?? '';
                    if (input.type === 'select' && input.options) {
                      return (
                        <Select {...field} value={value} error={(errors as any)[input.field]?.message}>
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
                          value={value}
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
                          value={value}
                          type="date"
                          error={(errors as any)[input.field]?.message}
                        />
                      );
                    } else {
                      return (
                        <Input
                          {...field}
                          value={value}
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

        {/* Gap-filling estimate status */}
        {estimateError && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-lg text-xs text-amber-700 dark:text-amber-300">
            {estimateError}
          </div>
        )}
        {estimate && (
          <div className="p-3 bg-sky-500/10 border border-sky-500/25 rounded-lg text-xs text-sky-700 dark:text-sky-300 space-y-1">
            <p className="font-medium flex items-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5" />
              Estimated value applied — will be saved flagged as an estimate (quality low, DQ 5)
            </p>
            <p>
              Method: <span className="font-medium">{estimate.method}</span> · raw average{' '}
              {estimate.rawValue} {estimate.unit} +{Math.round(estimate.conservativenessUplift * 100)}%
              conservativeness uplift → <span className="font-medium">{estimate.suggestedValue} {estimate.unit}</span>
            </p>
            {estimate.basedOnCalculations?.length > 0 && (
              <p>
                Based on {estimate.basedOnCalculations.length}{' '}
                {estimate.basedOnCalculations.length === 1 ? 'entry' : 'entries'}:{' '}
                {estimate.basedOnCalculations.map((b) => b.title).join(', ')}
              </p>
            )}
            <p className="text-sky-600/80 dark:text-sky-400/80">
              Review before saving — editing the value reverts it to a measured entry.
            </p>
          </div>
        )}

        {/* Period Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-fg/80">
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
            <label className="block text-sm font-medium text-fg/80">
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
          <label className="block text-sm font-medium text-fg/80">
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
          <Card className="p-4 bg-green-500/10 border-green-500/25">
            <h3 className="font-medium text-green-700 dark:text-green-300 dark:text-green-300 mb-2">Calculation Result</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Emissions:</span>
                <span className="font-medium text-green-700 dark:text-green-300 dark:text-green-300">
                  {formatEmissions(calculationResult.calculation.emissions)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Factor:</span>
                <span className="text-green-700 dark:text-green-300">
                  {calculationResult.factor.value} {calculationResult.factor.unit}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Source:</span>
                <span className="text-green-700 dark:text-green-300">
                  {calculationResult.factor.source} ({calculationResult.factor.year})
                </span>
              </div>
              {calculationResult.quality?.dqScore != null && (
                <div className="flex justify-between">
                  <span className="text-muted">Data quality (PCAF 1–5):</span>
                  <span className="font-medium text-green-700 dark:text-green-300">
                    DQ {calculationResult.quality.dqScore}
                    {calculationResult.quality.rating ? ` · ${calculationResult.quality.rating}` : ''}
                  </span>
                </div>
              )}
              {calculationResult.provenance?.gwpSet && (
                <div className="flex justify-between">
                  <span className="text-muted">GWP set:</span>
                  <span className="text-green-700 dark:text-green-300">
                    {calculationResult.provenance.gwpSet}
                    {calculationResult.provenance.gwpApplied === 'per-gas'
                      ? ' (applied per gas)'
                      : ' (embedded in CO₂e factor)'}
                  </span>
                </div>
              )}
              {calculationResult.scope2Dual && (
                <div className="mt-2 pt-2 border-t border-green-500/25 space-y-1">
                  <p className="text-xs font-medium text-green-700 dark:text-green-300">
                    Scope 2 dual reporting
                  </p>
                  <div className="flex justify-between">
                    <span className="text-muted">Location-based:</span>
                    <span className="text-green-700 dark:text-green-300">
                      {formatEmissions(calculationResult.scope2Dual.locationBased)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Market-based:</span>
                    <span className="text-green-700 dark:text-green-300">
                      {formatEmissions(calculationResult.scope2Dual.marketBased)}
                    </span>
                  </div>
                  <p className="text-xs text-muted">
                    {calculationResult.scope2Dual.marketMethod}
                  </p>
                </div>
              )}
              {calculationResult.factor.region === 'egypt' && (
                <div className="text-xs text-blue-600 dark:text-blue-400 mt-2">
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
              setEstimate(null);
              setEstimateError(null);
            }}
          >
            Clear
          </Button>
        </div>
      </form>
    </Card>
  );
};

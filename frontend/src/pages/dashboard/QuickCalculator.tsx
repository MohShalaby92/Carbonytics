import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Calculator, Zap } from 'lucide-react';
import { apiService } from '../../services/api';
import { formatEmissions } from '../../utils/calculations';

interface QuickType {
  id: string;
  name: string;
  unit: string;
  factorCode: string;
  factor: number; // fallback value, replaced by the live DB factor when loaded
  source: string;
  year?: number;
}

// Fallback values mirror the seeded Egyptian factors; the live values are
// fetched from the API so the widget always shows the factor actually in use.
const DEFAULT_TYPES: QuickType[] = [
  { id: 'electricity', name: 'Electricity', unit: 'kWh', factorCode: 'ELECTRICITY_GRID_EG', factor: 0.458, source: 'IEA Egypt/EEHC' },
  { id: 'petrol', name: 'Petrol', unit: 'L', factorCode: 'PETROL_EG', factor: 2.168, source: 'Local factors' },
  { id: 'diesel', name: 'Diesel', unit: 'L', factorCode: 'DIESEL_EG', factor: 2.667, source: 'Local factors' },
  { id: 'gas', name: 'Natural Gas', unit: 'kWh', factorCode: 'NATURAL_GAS_EG', factor: 0.18159, source: 'DEFRA equivalent' },
];

export const QuickCalculator: React.FC = () => {
  const [types, setTypes] = useState<QuickType[]>(DEFAULT_TYPES);
  const [selectedType, setSelectedType] = useState('electricity');
  const [value, setValue] = useState('');
  const [result, setResult] = useState<number | null>(null);
  const [calculating, setCalculating] = useState(false);

  // Replace fallback factors with the live ones from the factor library.
  useEffect(() => {
    (async () => {
      try {
        const response = await apiService.get<any[]>('/emission-factors?limit=50');
        const factors = Array.isArray(response?.data) ? response.data : [];
        setTypes((prev) =>
          prev.map((t) => {
            const live = factors.find((f: any) => f.factorCode === t.factorCode);
            return live
              ? { ...t, factor: live.factor, source: live.source, year: live.year }
              : t;
          })
        );
      } catch (error) {
        console.error('Failed to load live factors for quick calculator:', error);
      }
    })();
  }, []);

  const selectedCalcType = types.find((type) => type.id === selectedType);

  const handleCalculate = () => {
    if (!value || !selectedCalcType) return;
    setCalculating(true);
    try {
      setResult(parseFloat(value) * selectedCalcType.factor);
    } finally {
      setCalculating(false);
    }
  };

  const handleReset = () => {
    setValue('');
    setResult(null);
  };

  return (
    <Card className="p-6">
      <div className="flex items-center space-x-2 mb-4">
        <Calculator className="w-5 h-5 text-primary-600" />
        <h3 className="text-lg font-semibold text-fg">Quick Calculator</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-fg/80 mb-2">
            Type
          </label>
          <Select
            value={selectedType}
            onChange={(e) => { setSelectedType(e.target.value); setResult(null); }}
          >
            {types.map(type => (
              <option key={type.id} value={type.id}>
                {type.name} ({type.unit})
              </option>
            ))}
          </Select>
          {selectedCalcType && (
            <p className="mt-2 text-xs text-muted">
              Factor:{' '}
              <span className="font-medium text-fg/80">
                {selectedCalcType.factor} kg CO₂e/{selectedCalcType.unit}
              </span>{' '}
              · {selectedCalcType.source}
              {selectedCalcType.year ? ` (${selectedCalcType.year})` : ''}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-fg/80 mb-2">
            Amount ({selectedCalcType?.unit})
          </label>
          <Input
            type="number"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`Enter ${selectedCalcType?.unit} consumed`}
          />
        </div>

        <div className="flex space-x-2">
          <Button
            onClick={handleCalculate}
            loading={calculating}
            disabled={!value}
            className="flex-1"
          >
            <Zap className="w-4 h-4 mr-2" />
            Calculate
          </Button>
          <Button
            variant="outline"
            onClick={handleReset}
          >
            Reset
          </Button>
        </div>

        {result !== null && selectedCalcType && (
          <div className="p-4 bg-green-500/10 border border-green-500/25 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-green-700 dark:text-green-300">Emissions:</span>
              <span className="text-lg font-bold text-green-700 dark:text-green-300">
                {formatEmissions(result)}
              </span>
            </div>
            <p className="text-xs text-green-700 dark:text-green-300 mt-1">
              = {value} {selectedCalcType.unit} × {selectedCalcType.factor} kg CO₂e/
              {selectedCalcType.unit} ({selectedCalcType.source})
            </p>
          </div>
        )}

        <div className="text-xs text-muted">
          <p>💡 Quick estimates using the live factor library</p>
          <p>For detailed calculations, use the full calculator</p>
        </div>
      </div>
    </Card>
  );
};

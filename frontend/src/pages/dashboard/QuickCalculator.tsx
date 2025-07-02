import React, { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Calculator, Zap } from 'lucide-react';
import { calculationService } from '../../services/calculationService';
import { formatEmissions } from '../../utils/calculations';

export const QuickCalculator: React.FC = () => {
  const [selectedType, setSelectedType] = useState('electricity');
  const [value, setValue] = useState('');
  const [result, setResult] = useState<number | null>(null);
  const [calculating, setCalculating] = useState(false);

  const quickCalcTypes = [
    { id: 'electricity', name: 'Electricity', unit: 'kWh', factor: 0.458 },
    { id: 'petrol', name: 'Petrol', unit: 'L', factor: 2.168 },
    { id: 'diesel', name: 'Diesel', unit: 'L', factor: 2.667 },
    { id: 'gas', name: 'Natural Gas', unit: 'kWh', factor: 0.18159 },
  ];

  const selectedCalcType = quickCalcTypes.find(type => type.id === selectedType);

  const handleCalculate = async () => {
    if (!value || !selectedCalcType) return;

    setCalculating(true);
    try {
      // Quick calculation using Egyptian factors
      const emissions = parseFloat(value) * selectedCalcType.factor;
      setResult(emissions);
    } catch (error) {
      console.error('Quick calculation failed:', error);
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
        <h3 className="text-lg font-semibold text-gray-900">Quick Calculator</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Type
          </label>
          <Select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
          >
            {quickCalcTypes.map(type => (
              <option key={type.id} value={type.id}>
                {type.name} ({type.unit})
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
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

        {result !== null && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-green-800">Emissions:</span>
              <span className="text-lg font-bold text-green-900">
                {formatEmissions(result)}
              </span>
            </div>
            <p className="text-xs text-green-700 mt-1">
              Using Egyptian emission factor: {selectedCalcType?.factor} kg CO₂e/{selectedCalcType?.unit}
            </p>
          </div>
        )}

        <div className="text-xs text-gray-500">
          <p>💡 Quick estimates using Egyptian emission factors</p>
          <p>For detailed calculations, use the full calculator</p>
        </div>
      </div>
    </Card>
  );
};

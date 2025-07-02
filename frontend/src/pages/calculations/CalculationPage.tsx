import React, { useState } from 'react';
import { EmissionCalculationForm } from '../../components/forms/EmissionCalculationForm';
import { CalculationSummary } from './CalculationSummary';
import { CategorySelector } from './CategorySelector';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { CalculationResult } from '../../types';
import { Plus, Save, FileText } from 'lucide-react';

export const CalculationPage: React.FC = () => {
  const [calculations, setCalculations] = useState<any[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [showForm, setShowForm] = useState(false);

  const handleCalculationComplete = (result: CalculationResult) => {
    // Real-time calculation completed - just for display
    console.log('Calculation completed:', result);
  };

  const handleSaveCalculation = (calculation: any) => {
    setCalculations(prev => [...prev, calculation]);
    setShowForm(false);
    setSelectedCategoryId('');
  };

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    setShowForm(true);
  };

  const totalEmissions = calculations.reduce((sum, calc) => sum + (calc.emissions || 0), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Carbon Emissions Calculator</h1>
        <p className="mt-2 text-gray-600">
          Calculate your organization's carbon footprint across Scope 1, 2, and 3 emissions
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column - Category Selection */}
        <div className="lg:col-span-1">
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Emission Categories</h2>
            <CategorySelector
              onCategorySelect={handleCategorySelect}
              selectedCategoryId={selectedCategoryId}
            />
            
            {!showForm && (
              <Button
                onClick={() => setShowForm(true)}
                className="w-full mt-4"
                variant="outline"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Calculation
              </Button>
            )}
          </Card>

          {/* Summary */}
          {calculations.length > 0 && (
            <Card className="p-6 mt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Summary</h3>
              <CalculationSummary calculations={calculations} />
              
              <div className="pt-4 border-t border-gray-200 mt-4">
                <div className="flex justify-between items-center text-lg font-semibold">
                  <span>Total Emissions:</span>
                  <span className="text-primary-600">
                    {totalEmissions.toFixed(2)} kg CO₂e
                  </span>
                </div>
              </div>

              <div className="flex space-x-2 mt-4">
                <Button size="sm" variant="outline">
                  <Save className="w-4 h-4 mr-2" />
                  Save Report
                </Button>
                <Button size="sm" variant="outline">
                  <FileText className="w-4 h-4 mr-2" />
                  Export
                </Button>
              </div>
            </Card>
          )}
        </div>

        {/* Right Column - Calculation Form */}
        <div className="lg:col-span-2">
          {showForm ? (
            <EmissionCalculationForm
              categoryId={selectedCategoryId}
              onCalculationComplete={handleCalculationComplete}
              onSave={handleSaveCalculation}
            />
          ) : (
            <Card className="p-12 text-center">
              <div className="text-gray-400 mb-4">
                <Plus className="w-16 h-16 mx-auto" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Select a Category to Start
              </h3>
              <p className="text-gray-600">
                Choose an emission category from the left to begin calculating your carbon footprint
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

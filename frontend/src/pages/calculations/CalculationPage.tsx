import React, { useEffect, useRef, useState } from 'react';
import { EmissionCalculationForm } from '../../components/forms/EmissionCalculationForm';
import { CalculationSummary } from './CalculationSummary';
import { CategorySelector } from './CategorySelector';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { CalculationResult, Facility } from '../../types';
import { apiService } from '../../services/api';
import { complianceService } from '../../services/complianceService';
import { Plus, Save } from 'lucide-react';

export const CalculationPage: React.FC = () => {
  const [calculations, setCalculations] = useState<any[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [showForm, setShowForm] = useState(false);
  const [savingReport, setSavingReport] = useState(false);
  const [reportMessage, setReportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilityId, setFacilityId] = useState<string>('');
  const formRef = useRef<HTMLDivElement>(null);

  // Facilities are optional; when the org has none the picker stays hidden.
  useEffect(() => {
    complianceService.getFacilities().then(setFacilities).catch(() => setFacilities([]));
  }, []);

  const handleCalculationComplete = (_result: CalculationResult) => {
    // Real-time calculation completed — result is shown inside the form.
  };

  const handleSaveCalculation = (calculation: any) => {
    setCalculations(prev => [...prev, calculation]);
    setShowForm(false);
    setSelectedCategoryId('');
  };

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    setShowForm(true);
    // Bring the form into view (it sits in the right column / below on mobile).
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  /** Persist the session's entries as one calculation report on the server. */
  const handleSaveReport = async () => {
    if (calculations.length === 0) return;
    try {
      setSavingReport(true);
      setReportMessage(null);

      const starts = calculations.map(c => c.period?.start).filter(Boolean).sort();
      const ends = calculations.map(c => c.period?.end).filter(Boolean).sort();
      const now = new Date();
      let start = starts[0] || new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      let end = ends[ends.length - 1] || now.toISOString();
      // The API requires end > start; pad by a day if entries share one date.
      if (new Date(start) >= new Date(end)) {
        end = new Date(new Date(start).getTime() + 24 * 60 * 60 * 1000).toISOString();
      }

      const payload = {
        title: `Calculation Report — ${now.toLocaleDateString()}`,
        period: { start, end },
        ...(facilityId ? { facilityId } : {}),
        calculations: calculations.map(c => ({
          categoryId: c.categoryId,
          value: c.value,
          unit: c.unit,
          ...(c.factorId ? { factorId: c.factorId } : {}),
          // Estimate provenance travels with the entry; the server forces
          // quality=low / DQ 5 for estimates.
          ...(c.isEstimate ? { isEstimate: true, estimationMethod: c.estimationMethod } : {}),
          metadata: c.metadata || {},
          notes: c.notes,
        })),
      };

      const response = await apiService.post<any>('/calculations', payload);
      if (!response.success) throw new Error(response.message || 'Save failed');

      setCalculations([]);
      setFacilityId('');
      setReportMessage({
        type: 'success',
        text: 'Report saved — emissions were recomputed server-side and now appear on your dashboard.',
      });
    } catch (error: any) {
      setReportMessage({
        type: 'error',
        text: error?.response?.data?.message || error?.message || 'Failed to save report',
      });
    } finally {
      setSavingReport(false);
    }
  };

  const totalEmissions = calculations.reduce((sum, calc) => sum + (calc.emissions || 0), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-fg">Carbon Emissions Calculator</h1>
        <p className="mt-2 text-muted">
          Calculate your organization's carbon footprint across Scope 1, 2, and 3 emissions
        </p>
      </div>

      {reportMessage && (
        <div
          className={`mb-6 p-3 rounded-lg border text-sm ${
            reportMessage.type === 'success'
              ? 'bg-green-500/10 border-green-500/25 text-green-700 dark:text-green-300'
              : 'bg-red-500/10 border-red-500/25 text-red-700 dark:text-red-300'
          }`}
        >
          {reportMessage.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column - Category Selection */}
        <div className="lg:col-span-1">
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-fg mb-4">Emission Categories</h2>
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
              <h3 className="text-lg font-semibold text-fg mb-4">Summary</h3>
              <CalculationSummary calculations={calculations} />

              <div className="pt-4 border-t border-line mt-4">
                <div className="flex justify-between items-center text-lg font-semibold">
                  <span>Total Emissions:</span>
                  <span className="text-primary-600">
                    {totalEmissions.toFixed(2)} kg CO₂e
                  </span>
                </div>
              </div>

              {facilities.length > 0 && (
                <div className="mt-4 space-y-1">
                  <label className="block text-xs font-medium text-fg/80">
                    Facility (optional)
                  </label>
                  <Select value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
                    <option value="">Whole organization</option>
                    {facilities.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}{f.city ? ` — ${f.city}` : ''}</option>
                    ))}
                  </Select>
                </div>
              )}

              <Button
                size="sm"
                className="w-full mt-4"
                onClick={handleSaveReport}
                loading={savingReport}
              >
                <Save className="w-4 h-4 mr-2" />
                Save Report ({calculations.length} {calculations.length === 1 ? 'entry' : 'entries'})
              </Button>
            </Card>
          )}
        </div>

        {/* Right Column - Calculation Form */}
        <div className="lg:col-span-2" ref={formRef}>
          {showForm ? (
            <EmissionCalculationForm
              categoryId={selectedCategoryId}
              onCalculationComplete={handleCalculationComplete}
              onSave={handleSaveCalculation}
            />
          ) : (
            <Card className="p-12 text-center">
              <div className="text-muted mb-4">
                <Plus className="w-16 h-16 mx-auto" />
              </div>
              <h3 className="text-lg font-medium text-fg mb-2">
                Select a Category to Start
              </h3>
              <p className="text-muted">
                Choose an emission category from the left to begin calculating your carbon footprint
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

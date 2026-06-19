import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmissionOverview } from '../../pages/dashboard/EmissionOverview';
import { ScopeBreakdown } from '../../pages/dashboard/ScopeBreakdown';
import { CategoryAnalysis } from '../../pages/dashboard/CategoryAnalysis';
import { ParetoAnalysis } from '../../pages/dashboard/ParetoAnalysis';
import { RecentCalculations } from '../../pages/dashboard/RecentCalculations';
import { QuickCalculator } from '../../pages/dashboard/QuickCalculator';
import { TargetsProgress } from '../../pages/dashboard/TargetsProgress';
import { TargetsModal } from '../../pages/dashboard/TargetsModal';
import { QualityIndicators } from '../../pages/dashboard/QualityIndicators';
import { CompletenessCard } from '../../pages/dashboard/CompletenessCard';
import { useCalculations } from '../../hooks/useCalculations';
import { calculationService } from '../../services/calculationService';
import { complianceService } from '../../services/complianceService';
import { apiService } from '../../services/api';
import { Facility, CompletenessResult } from '../../types';
import { 
  BarChart3, 
  TrendingUp, 
  Target, 
  Calculator,
  Download,
  Settings,
  Plus,
  RefreshCw
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const [timeframe, setTimeframe] = useState<'month' | 'quarter' | 'year'>('month');
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showTargetsModal, setShowTargetsModal] = useState(false);
  const [targetsRefreshToken, setTargetsRefreshToken] = useState(0);
  const [exporting, setExporting] = useState(false);
  // Facility filter (organizational-boundary dimension); hidden when the org
  // has no facilities defined.
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilityId, setFacilityId] = useState<string>('');
  // Completeness over the selected timeframe (relevance screening coverage).
  const [completeness, setCompleteness] = useState<CompletenessResult | null>(null);

  const {
    calculations: sessionCalculations,
    getTotalEmissions,
    getTotalEmissionsByScope,
  } = useCalculations();

  useEffect(() => {
    loadDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe, facilityId]);

  useEffect(() => {
    complianceService.getFacilities().then(setFacilities).catch(() => setFacilities([]));
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // Current period range based on the selected timeframe.
      const endDate = new Date();
      const startDate = new Date();
      switch (timeframe) {
        case 'month':
          startDate.setMonth(endDate.getMonth() - 1);
          break;
        case 'quarter':
          startDate.setMonth(endDate.getMonth() - 3);
          break;
        case 'year':
          startDate.setFullYear(endDate.getFullYear() - 1);
          break;
      }

      // Immediately-preceding period of equal length, for a real trend comparison.
      const spanMs = endDate.getTime() - startDate.getTime();
      const prevEnd = new Date(startDate.getTime());
      const prevStart = new Date(startDate.getTime() - spanMs);

      // getCalculations() resolves to the calculations ARRAY (not an object).
      const [current, previous, categoriesResp] = await Promise.all([
        calculationService.getCalculations({
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          ...(facilityId ? { facilityId } : {}),
          limit: 100,
        }),
        calculationService.getCalculations({
          startDate: prevStart.toISOString(),
          endDate: prevEnd.toISOString(),
          ...(facilityId ? { facilityId } : {}),
          limit: 100,
        }),
        // /emission-categories returns { data: { categories: [...] } } (gotcha 14),
        // not a flat array — read .data.categories so the category map actually
        // builds (else every entry fell back to "Other" in the breakdowns).
        apiService
          .get<any>('/emission-categories')
          .then((r: any) => r?.data?.categories ?? r?.data ?? [])
          .catch(() => []),
      ]);

      const currentCalcs = Array.isArray(current) ? current : [];
      const previousCalcs = Array.isArray(previous) ? previous : [];

      // Completeness is an annual inventory concept — always measured over the
      // trailing 12 months, independent of the emissions timeframe toggle and
      // the facility filter, so the card doesn't flip with month/quarter views.
      const completenessStart = new Date(endDate);
      completenessStart.setFullYear(endDate.getFullYear() - 1);
      complianceService
        .getCompleteness(completenessStart.toISOString(), endDate.toISOString())
        .then(setCompleteness)
        .catch(() => setCompleteness(null));

      // Map category id -> name for the category breakdown.
      const catMap: Record<string, string> = {};
      (Array.isArray(categoriesResp) ? categoriesResp : []).forEach((c: any) => {
        const id = (c._id || c.id || '').toString();
        if (id) catMap[id] = c.category || 'Other';
      });

      // Unsaved session entries carry no facility tag — only meaningful in the
      // whole-organization view.
      const allCalculations = facilityId
        ? currentCalcs
        : [...currentCalcs, ...sessionCalculations];
      setDashboardData(processDashboardData(allCalculations, previousCalcs, catMap));
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const sumTotals = (calcs: any[]): number =>
    calcs.reduce(
      (sum, calc) =>
        sum + (calc.emissions?.total ?? (typeof calc.emissions === 'number' ? calc.emissions : 0)),
      0
    );

  const processDashboardData = (
    calculations: any[],
    previousCalcs: any[] = [],
    catMap: Record<string, string> = {}
  ) => {
    const totalEmissions = sumTotals(calculations);

    // Scope totals come from each calculation's authoritative emissions object.
    const scopeBreakdown = calculations.reduce(
      (acc, calc) => {
        const e = calc.emissions || {};
        acc[1] += e.scope1 || 0;
        acc[2] += e.scope2 || 0;
        acc[3] += e.scope3 || 0;
        return acc;
      },
      { 1: 0, 2: 0, 3: 0 } as Record<number, number>
    );

    // Category totals come from each calculation's entries.
    const categoryBreakdown = calculations.reduce((acc, calc) => {
      const entries = Array.isArray(calc.data) ? calc.data : [];
      entries.forEach((entry: any) => {
        const id = (entry.categoryId?._id || entry.categoryId || '').toString();
        const name = catMap[id] || entry.categoryId?.category || 'Other';
        acc[name] = (acc[name] || 0) + (entry.emissions || 0);
      });
      return acc;
    }, {} as Record<string, number>);

    // Real trend vs the previous period (guarded against divide-by-zero).
    const prevTotal = sumTotals(previousCalcs);
    let changePercent = 0;
    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (prevTotal > 0) {
      changePercent = ((totalEmissions - prevTotal) / prevTotal) * 100;
      trend = changePercent > 0.5 ? 'up' : changePercent < -0.5 ? 'down' : 'stable';
    } else if (totalEmissions > 0) {
      changePercent = 100;
      trend = 'up';
    }

    const trends = {
      thisMonth: totalEmissions,
      lastMonth: prevTotal,
      changePercent: Math.round(changePercent * 10) / 10,
      trend,
    };

    return {
      totalEmissions,
      scopeBreakdown,
      categoryBreakdown,
      trends,
      calculations,
      lastUpdated: new Date(),
    };
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const handleExportReport = async () => {
    try {
      setExporting(true);
      // The export endpoint streams a CSV; fetch as a blob and trigger a download.
      const blob = (await apiService.get<any>('/csv/export', {
        responseType: 'blob',
      })) as unknown as Blob;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `carbonytics_emissions_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-fg/[0.08] rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 bg-fg/[0.08] rounded"></div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-64 bg-fg/[0.08] rounded"></div>
            <div className="h-64 bg-fg/[0.08] rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-fg">Carbon Dashboard</h1>
          <p className="mt-2 text-muted">
            Track and analyze your organization's carbon footprint
          </p>
        </div>
        
        <div className="mt-4 sm:mt-0 flex flex-col sm:flex-row gap-3">
          {/* Facility filter (only when facilities exist) */}
          {facilities.length > 0 && (
            <select
              value={facilityId}
              onChange={(e) => setFacilityId(e.target.value)}
              className="px-3 py-2 text-sm font-medium bg-surface text-fg/80 border border-line rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              aria-label="Filter by facility"
            >
              <option value="">All facilities</option>
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>{f.name}{f.city ? ` — ${f.city}` : ''}</option>
              ))}
            </select>
          )}

          {/* Timeframe Selector */}
          <div className="flex rounded-md shadow-sm">
            {(['month', 'quarter', 'year'] as const).map((period) => (
              <button
                key={period}
                onClick={() => setTimeframe(period)}
                className={`
                  px-4 py-2 text-sm font-medium border
                  ${period === 'month' ? 'rounded-l-md' : period === 'year' ? 'rounded-r-md' : ''}
                  ${timeframe === period
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-surface text-fg/80 border-line hover:bg-fg/[0.04]'
                  }
                `}
              >
                {period.charAt(0).toUpperCase() + period.slice(1)}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            onClick={handleRefresh}
            loading={refreshing}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>

          <Button
            variant="outline"
            onClick={handleExportReport}
            loading={exporting}
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>

          <Button href="/calculations">
            <Plus className="w-4 h-4 mr-2" />
            New Calculation
          </Button>
        </div>
      </div>

      {/* Key Metrics Overview */}
      <EmissionOverview 
        data={dashboardData}
        timeframe={timeframe}
      />

      {/* Main Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
        {/* Left Column - Charts and Analysis */}
        <div className="lg:col-span-2 space-y-6">
          <ScopeBreakdown data={dashboardData?.scopeBreakdown} />
          <CategoryAnalysis data={dashboardData?.categoryBreakdown} />
          <ParetoAnalysis data={dashboardData?.categoryBreakdown} />
          <TargetsProgress
            onConfigure={() => setShowTargetsModal(true)}
            refreshToken={targetsRefreshToken}
          />
        </div>

        {/* Right Column - Tools and Details */}
        <div className="space-y-6">
          <QuickCalculator />
          <CompletenessCard completeness={completeness} />
          <QualityIndicators calculations={dashboardData?.calculations} />
          <RecentCalculations
            calculations={dashboardData?.calculations?.slice(0, 5)}
            onChanged={loadDashboardData}
          />
        </div>
      </div>

      {/* Bottom Section - Additional Insights */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-fg mb-1">Insights & Recommendations</h3>
          <p className="text-xs text-muted mb-4">
            Generated automatically from rule-based checks on your current scope mix
            (e.g. Scope 3 &gt; 50% of total, Scope 2 &gt; 30% of total).
          </p>
          <div className="space-y-3">
            {dashboardData && (
              <>
                {dashboardData.scopeBreakdown[3] > dashboardData.totalEmissions * 0.5 && (
                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/25 rounded-md">
                    <p className="text-sm text-yellow-700 dark:text-yellow-300 dark:text-yellow-300">
                      <strong>Scope 3 Focus:</strong> Over 50% of emissions are from Scope 3. 
                      Consider supplier engagement and value chain optimization.
                    </p>
                  </div>
                )}
                
                {dashboardData.scopeBreakdown[2] > dashboardData.totalEmissions * 0.3 && (
                  <div className="p-3 bg-blue-500/10 border border-blue-500/25 rounded-md">
                    <p className="text-sm text-blue-700 dark:text-blue-300 dark:text-blue-300">
                      <strong>Energy Opportunity:</strong> Significant Scope 2 emissions detected. 
                      Consider renewable energy procurement or energy efficiency measures.
                    </p>
                  </div>
                )}

                <div className="p-3 bg-green-500/10 border border-green-500/25 rounded-md">
                  <p className="text-sm text-green-700 dark:text-green-300 dark:text-green-300">
                    <strong>Egyptian Context:</strong> Using local emission factors for more accurate calculations. 
                    Consider the growing renewable energy sector in Egypt.
                  </p>
                </div>
              </>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold text-fg mb-4">Next Steps</h3>
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center mt-0.5">
                <span className="text-xs font-medium text-primary-600">1</span>
              </div>
              <div>
                <p className="text-sm font-medium text-fg">Set Science-Based Targets</p>
                <p className="text-xs text-muted">Align with 1.5°C pathway and Egyptian NDCs</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center mt-0.5">
                <span className="text-xs font-medium text-primary-600">2</span>
              </div>
              <div>
                <p className="text-sm font-medium text-fg">Expand Data Collection</p>
                <p className="text-xs text-muted">Include more Scope 3 categories and suppliers</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center mt-0.5">
                <span className="text-xs font-medium text-primary-600">3</span>
              </div>
              <div>
                <p className="text-sm font-medium text-fg">Monitor Progress</p>
                <p className="text-xs text-muted">Regular tracking and verification</p>
              </div>
            </div>
          </div>
          
          <Button
            variant="outline"
            className="w-full mt-4"
            onClick={() => setShowTargetsModal(true)}
          >
            <Settings className="w-4 h-4 mr-2" />
            Configure Targets
          </Button>
        </Card>
      </div>

      <TargetsModal
        isOpen={showTargetsModal}
        onClose={() => setShowTargetsModal(false)}
        onSaved={() => {
          setShowTargetsModal(false);
          setTargetsRefreshToken((v) => v + 1);
        }}
      />
    </div>
  );
};

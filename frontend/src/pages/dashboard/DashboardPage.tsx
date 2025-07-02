import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmissionOverview } from '../../pages/dashboard/EmissionOverview';
import { ScopeBreakdown } from '../../pages/dashboard/ScopeBreakdown';
import { CategoryAnalysis } from '../../pages/dashboard/CategoryAnalysis';
import { RecentCalculations } from '../../pages/dashboard/RecentCalculations';
import { QuickCalculator } from '../../pages/dashboard/QuickCalculator';
import { TargetsProgress } from '../../pages/dashboard/TargetsProgress';
import { QualityIndicators } from '../../pages/dashboard/QualityIndicators';
import { useCalculations } from '../../hooks/useCalculations';
import { calculationService } from '../../services/calculationService';
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

  const {
    calculations: sessionCalculations,
    getTotalEmissions,
    getTotalEmissionsByScope,
  } = useCalculations();

  useEffect(() => {
    loadDashboardData();
  }, [timeframe]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Calculate date range based on timeframe
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

      // Load saved calculations from API
      const savedCalculations = await calculationService.getCalculations({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        limit: 100,
      }) as { data: any[] };

      // Combine with session calculations
      const allCalculations = [
        ...savedCalculations.data || [],
        ...sessionCalculations,
      ];

      // Process dashboard data
      const processedData = processDashboardData(allCalculations);
      setDashboardData(processedData);

    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const processDashboardData = (calculations: any[]) => {
    const totalEmissions = calculations.reduce((sum, calc) => sum + (calc.emissions?.total || calc.emissions || 0), 0);
    
    const scopeBreakdown = calculations.reduce((acc, calc) => {
      const scope = calc.category?.scope || calc.scope || 1;
      const emissions = calc.emissions?.total || calc.emissions || 0;
      acc[scope] = (acc[scope] || 0) + emissions;
      return acc;
    }, {} as Record<number, number>);

    const categoryBreakdown = calculations.reduce((acc, calc) => {
      const category = calc.category?.name || calc.category || 'Unknown';
      const emissions = calc.emissions?.total || calc.emissions || 0;
      acc[category] = (acc[category] || 0) + emissions;
      return acc;
    }, {} as Record<string, number>);

    // Calculate trends (mock data for now)
    const trends = {
      thisMonth: totalEmissions,
      lastMonth: totalEmissions * 0.9, // 10% reduction (example)
      changePercent: 10,
      trend: 'down' as 'up' | 'down' | 'stable',
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

  const handleExportReport = () => {
    // TODO: Implement report export
    console.log('Exporting report...');
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-64 bg-gray-200 rounded"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
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
          <h1 className="text-3xl font-bold text-gray-900">Carbon Dashboard</h1>
          <p className="mt-2 text-gray-600">
            Track and analyze your organization's carbon footprint
          </p>
        </div>
        
        <div className="mt-4 sm:mt-0 flex flex-col sm:flex-row gap-3">
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
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
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
          <TargetsProgress />
        </div>

        {/* Right Column - Tools and Details */}
        <div className="space-y-6">
          <QuickCalculator />
          <QualityIndicators calculations={dashboardData?.calculations} />
          <RecentCalculations calculations={dashboardData?.calculations?.slice(0, 5)} />
        </div>
      </div>

      {/* Bottom Section - Additional Insights */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Insights & Recommendations</h3>
          <div className="space-y-3">
            {dashboardData && (
              <>
                {dashboardData.scopeBreakdown[3] > dashboardData.totalEmissions * 0.5 && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                    <p className="text-sm text-yellow-800">
                      <strong>Scope 3 Focus:</strong> Over 50% of emissions are from Scope 3. 
                      Consider supplier engagement and value chain optimization.
                    </p>
                  </div>
                )}
                
                {dashboardData.scopeBreakdown[2] > dashboardData.totalEmissions * 0.3 && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <p className="text-sm text-blue-800">
                      <strong>Energy Opportunity:</strong> Significant Scope 2 emissions detected. 
                      Consider renewable energy procurement or energy efficiency measures.
                    </p>
                  </div>
                )}

                <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                  <p className="text-sm text-green-800">
                    <strong>Egyptian Context:</strong> Using local emission factors for more accurate calculations. 
                    Consider the growing renewable energy sector in Egypt.
                  </p>
                </div>
              </>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Next Steps</h3>
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center mt-0.5">
                <span className="text-xs font-medium text-primary-600">1</span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Set Science-Based Targets</p>
                <p className="text-xs text-gray-600">Align with 1.5°C pathway and Egyptian NDCs</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center mt-0.5">
                <span className="text-xs font-medium text-primary-600">2</span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Expand Data Collection</p>
                <p className="text-xs text-gray-600">Include more Scope 3 categories and suppliers</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center mt-0.5">
                <span className="text-xs font-medium text-primary-600">3</span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Monitor Progress</p>
                <p className="text-xs text-gray-600">Regular tracking and verification</p>
              </div>
            </div>
          </div>
          
          <Button variant="outline" className="w-full mt-4">
            <Settings className="w-4 h-4 mr-2" />
            Configure Targets
          </Button>
        </Card>
      </div>
    </div>
  );
};

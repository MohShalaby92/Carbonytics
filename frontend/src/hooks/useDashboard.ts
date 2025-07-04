import { useState, useEffect } from 'react';
import { calculationService } from '../services/calculationService';

export interface DashboardData {
  totalEmissions: number;
  scopeBreakdown: Record<number, number>;
  categoryBreakdown: Record<string, number>;
  trends: {
    thisMonth: number;
    lastMonth: number;
    changePercent: number;
    trend: 'up' | 'down' | 'stable';
  };
  calculations: any[];
  lastUpdated: Date;
}

export const useDashboard = (timeframe: 'month' | 'quarter' | 'year' = 'month') => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Calculate date range
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

      // Load calculations
      const calculations = await calculationService.getCalculations({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        limit: 100,
      });

      // Process data
      const processedData = processDashboardData((calculations as any)?.data || []);
      setData(processedData);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const processDashboardData = (calculations: any[]): DashboardData => {
    const totalEmissions = calculations.reduce((sum, calc) => 
      sum + (calc.emissions?.total || calc.emissions || 0), 0);
    
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

    // Calculate trends (simplified for demo)
    const trends = {
      thisMonth: totalEmissions,
      lastMonth: totalEmissions * 0.9, // 10% reduction (example)
      changePercent: 10,
      trend: 'down' as const,
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

  const refreshData = () => {
    loadDashboardData();
  };

  useEffect(() => {
    loadDashboardData();
  }, [timeframe]);

  return {
    data,
    loading,
    error,
    refreshData,
  };
};

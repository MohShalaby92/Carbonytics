import React from 'react';
import { ChartContainer } from '../../components/ui/ChartContainer';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { formatEmissions } from '../../utils/calculations';

interface CalculationSummaryProps {
  calculations: any[];
}

export const CalculationSummary: React.FC<CalculationSummaryProps> = ({ calculations }) => {
  // Group calculations by scope
  const scopeData = calculations.reduce((acc, calc) => {
    const scope = calc.category?.scope || 1;
    const scopeKey = `Scope ${scope}`;
    
    if (!acc[scopeKey]) {
      acc[scopeKey] = { scope, total: 0, count: 0, categories: [] };
    }
    
    acc[scopeKey].total += calc.emissions || 0;
    acc[scopeKey].count += 1;
    acc[scopeKey].categories.push(calc);
    
    return acc;
  }, {} as Record<string, any>);

  // Prepare data for charts
  const pieData = Object.entries(scopeData).map(([name, data]: [string, any]) => ({
    name,
    value: data.total,
    percentage: ((data.total / Object.values(scopeData).reduce((sum: number, s: any) => sum + s.total, 0)) * 100),
  }));

  const barData = Object.entries(scopeData).map(([name, data]: [string, any]) => ({
    scope: name,
    emissions: data.total,
    count: data.count,
  }));

  const COLORS = {
    'Scope 1': '#ef4444',
    'Scope 2': '#f59e0b', 
    'Scope 3': '#10b981',
  };

  const totalEmissions = Object.values(scopeData).reduce((sum: number, data: any) => sum + data.total, 0);

  if (calculations.length === 0) {
    return (
      <div className="text-center py-8 text-muted">
        <p>No calculations added yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-primary-600">
            {formatEmissions(totalEmissions)}
          </div>
          <div className="text-sm text-muted">Total Emissions</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-fg">
            {calculations.length}
          </div>
          <div className="text-sm text-muted">Calculations</div>
        </div>
      </div>

      {/* Scope Breakdown */}
      <div className="space-y-3">
        <h4 className="font-medium text-fg">Scope Breakdown</h4>
        {Object.entries(scopeData).map(([scopeName, data]: [string, any]) => (
          <div key={scopeName} className="flex items-center justify-between p-3 bg-fg/[0.04] rounded">
            <div className="flex items-center space-x-3">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: COLORS[scopeName as keyof typeof COLORS] }}
              />
              <span className="font-medium text-sm">{scopeName}</span>
              <span className="text-xs text-muted">({data.count} items)</span>
            </div>
            <div className="text-right">
              <div className="font-medium text-sm">{formatEmissions(data.total)}</div>
              <div className="text-xs text-muted">
                {((data.total / totalEmissions) * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pie Chart */}
      {pieData.length > 1 && (
        <ChartContainer className="h-48">
          <h4 className="font-medium text-fg mb-2">Distribution</h4>
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            minHeight={150}
            initialDimension={{ width: 300, height: 160 }}
          >
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[entry.name as keyof typeof COLORS]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => [formatEmissions(Number(value)), 'Emissions']}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>
      )}

      {/* Recent Calculations */}
      <div className="space-y-2">
        <h4 className="font-medium text-fg">Recent Calculations</h4>
        <div className="space-y-2 max-h-32 overflow-y-auto">
          {calculations.slice(-5).reverse().map((calc, index) => (
            <div key={index} className="flex justify-between items-center text-sm p-2 bg-fg/[0.04] rounded">
              <span className="truncate flex items-center gap-1.5 min-w-0">
                <span className="truncate">{calc.category?.category || 'Unknown'}</span>
                {calc.isEstimate && (
                  <span
                    className="shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/20"
                    title={calc.estimationMethod || 'Gap-filled estimate'}
                  >
                    estimate
                  </span>
                )}
                {calc.dqScore != null && (
                  <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-fg/[0.06] text-fg/70 border border-line" title="PCAF-style data quality score (1 best – 5 worst)">
                    DQ {calc.dqScore}
                  </span>
                )}
              </span>
              <span className="font-medium">{formatEmissions(calc.emissions || 0)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

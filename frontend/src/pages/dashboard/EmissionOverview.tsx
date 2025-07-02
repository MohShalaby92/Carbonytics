import React from 'react';
import { Card } from '../../components/ui/Card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatEmissions } from '../../utils/calculations';

interface EmissionOverviewProps {
  data: any;
  timeframe: 'month' | 'quarter' | 'year';
}

export const EmissionOverview: React.FC<EmissionOverviewProps> = ({ data, timeframe }) => {
  if (!data) return null;

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="w-4 h-4 text-red-500" />;
      case 'down':
        return <TrendingDown className="w-4 h-4 text-green-500" />;
      default:
        return <Minus className="w-4 h-4 text-gray-500" />;
    }
  };

  const getTrendColor = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return 'text-red-600';
      case 'down':
        return 'text-green-600';
      default:
        return 'text-gray-600';
    }
  };

  const metrics = [
    {
      title: 'Total Emissions',
      value: formatEmissions(data.totalEmissions),
      change: `${Math.abs(data.trends.changePercent)}%`,
      trend: data.trends.trend,
      subtitle: `This ${timeframe}`,
    },
    {
      title: 'Scope 1',
      value: formatEmissions(data.scopeBreakdown[1] || 0),
      change: `${((data.scopeBreakdown[1] || 0) / data.totalEmissions * 100).toFixed(1)}%`,
      trend: 'stable' as const,
      subtitle: 'Direct emissions',
    },
    {
      title: 'Scope 2',
      value: formatEmissions(data.scopeBreakdown[2] || 0),
      change: `${((data.scopeBreakdown[2] || 0) / data.totalEmissions * 100).toFixed(1)}%`,
      trend: 'stable' as const,
      subtitle: 'Energy emissions',
    },
    {
      title: 'Scope 3',
      value: formatEmissions(data.scopeBreakdown[3] || 0),
      change: `${((data.scopeBreakdown[3] || 0) / data.totalEmissions * 100).toFixed(1)}%`,
      trend: 'stable' as const,
      subtitle: 'Value chain emissions',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {metrics.map((metric, index) => (
        <Card key={index} className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600">{metric.title}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{metric.value}</p>
            </div>
            <div className="ml-3">
              {getTrendIcon(metric.trend)}
            </div>
          </div>
          
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-gray-500">{metric.subtitle}</span>
            <span className={`text-xs font-medium ${getTrendColor(metric.trend)}`}>
              {metric.change}
            </span>
          </div>
        </Card>
      ))}
    </div>
  );
};

import React, { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { ChartContainer } from '../../components/ui/ChartContainer';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatEmissions } from '../../utils/calculations';
import { ChevronDown } from 'lucide-react';

interface CategoryAnalysisProps {
  data: Record<string, number>;
}

export const CategoryAnalysis: React.FC<CategoryAnalysisProps> = ({ data }) => {
  const [showAll, setShowAll] = useState(false);
  
  if (!data) return null;

  // Sort categories by emissions (highest first)
  const sortedData = Object.entries(data)
    .sort(([, a], [, b]) => b - a)
    .map(([category, emissions]) => ({
      category: category.length > 16 ? category.substring(0, 16) + '…' : category,
      fullCategory: category,
      emissions,
      formattedEmissions: formatEmissions(emissions),
    }));

  const displayData = showAll ? sortedData : sortedData.slice(0, 8);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-surface p-3 border border-line rounded-lg shadow-lg">
          <p className="font-medium text-fg">{data.fullCategory}</p>
          <p className="text-primary-600">{data.formattedEmissions}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-fg">Emissions by Category</h3>
        {sortedData.length > 8 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="flex items-center text-sm text-primary-600 hover:text-primary-700"
          >
            {showAll ? 'Show Less' : `Show All (${sortedData.length})`}
            <ChevronDown className={`w-4 h-4 ml-1 transition-transform ${showAll ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      <ChartContainer className="h-80 mb-4">
        {displayData.length > 0 ? (
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            minHeight={300}
            initialDimension={{ width: 400, height: 320 }}
          >
            <BarChart data={displayData} margin={{ top: 20, right: 30, left: 20, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" />
              <XAxis
                dataKey="category"
                angle={-45}
                textAnchor="end"
                height={110}
                interval={0}
                fontSize={11}
                tick={{ fill: 'rgb(var(--muted))' }}
                stroke="rgb(var(--line))"
              />
              <YAxis
                tickFormatter={(value) =>
                  value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}t` : `${value}`
                }
                fontSize={12}
                tick={{ fill: 'rgb(var(--muted))' }}
                stroke="rgb(var(--line))"
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgb(var(--fg) / 0.04)' }} />
              <Bar dataKey="emissions" fill="rgb(var(--brand))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-muted">
            No category data in this period yet
          </div>
        )}
      </ChartContainer>

      {/* Top Contributors Table */}
      <div className="border-t border-line pt-4">
        <h4 className="text-sm font-medium text-fg mb-3">Top Contributors</h4>
        <div className="space-y-2">
          {sortedData.slice(0, 5).map((item, index) => {
            const total = Object.values(data).reduce((sum, val) => sum + val, 0);
            const percentage = total > 0 ? (item.emissions / total * 100).toFixed(1) : '0';
            
            return (
              <div key={index} className="flex items-center justify-between py-2 px-3 bg-fg/[0.04] rounded">
                <div className="flex items-center space-x-3">
                  <span className="w-6 h-6 bg-primary-500/15 text-primary-600 dark:text-primary-300 rounded-full flex items-center justify-center text-xs font-medium">
                    {index + 1}
                  </span>
                  <span className="text-sm font-medium text-fg truncate max-w-xs">
                    {item.fullCategory}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-medium text-fg">{item.formattedEmissions}</span>
                  <span className="text-xs text-muted ml-2">{percentage}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
};

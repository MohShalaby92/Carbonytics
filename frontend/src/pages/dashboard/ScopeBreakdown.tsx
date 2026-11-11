import React from 'react';
import { Card } from '../../components/ui/Card';
import { ChartContainer } from '../../components/ui/ChartContainer';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { formatEmissions } from '../../utils/calculations';
import { scopeColor } from '../../constants';

interface ScopeBreakdownProps {
  data: Record<number, number>;
}

export const ScopeBreakdown: React.FC<ScopeBreakdownProps> = ({ data }) => {
  if (!data) return null;

  const chartData = Object.entries(data).map(([scope, emissions]) => ({
    name: `Scope ${scope}`,
    value: emissions,
    emissions: formatEmissions(emissions),
  }));

  const total = Object.values(data).reduce((sum, value) => sum + value, 0);

  const ThemedTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const value = Number(payload[0].value);
      const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
      return (
        <div className="bg-surface p-3 border border-line rounded-lg shadow-lg">
          <p className="font-medium text-fg">{payload[0].name}</p>
          <p className="text-emphasis">
            {formatEmissions(value)} · {pct}%
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-fg mb-6">Emissions by Scope</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <ChartContainer className="h-64">
          {total > 0 ? (
            <ResponsiveContainer
              width="100%"
              height="100%"
              minWidth={0}
              minHeight={220}
              initialDimension={{ width: 400, height: 240 }}
            >
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={scopeColor(entry.name)} />
                  ))}
                </Pie>
                <Tooltip content={<ThemedTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted">
              No emissions in this period yet
            </div>
          )}
        </ChartContainer>

        {/* Breakdown List */}
        <div className="space-y-4">
          {chartData.map((item, index) => {
            const percentage = total > 0 ? (item.value / total * 100).toFixed(1) : '0';
            
            return (
              <div key={index} className="flex items-center justify-between p-3 bg-fg/[0.04] rounded-lg">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: scopeColor(item.name) }}
                  />
                  <div>
                    <p className="font-medium text-fg">{item.name}</p>
                    <p className="text-sm text-muted">
                      {item.name === 'Scope 1' && 'Direct emissions'}
                      {item.name === 'Scope 2' && 'Indirect emissions'}
                      {item.name === 'Scope 3' && 'Value chain emissions'}
                    </p>
                  </div>
                </div>
                <div className="text-end">
                  <p className="font-medium text-fg">{item.emissions}</p>
                  <p className="text-sm text-muted">{percentage}%</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
};
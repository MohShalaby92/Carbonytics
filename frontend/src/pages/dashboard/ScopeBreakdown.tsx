import React from 'react';
import { Card } from '../../components/ui/Card';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { formatEmissions } from '../../utils/calculations';

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

  const COLORS = {
    'Scope 1': '#ef4444',
    'Scope 2': '#f59e0b',
    'Scope 3': '#10b981',
  };

  const total = Object.values(data).reduce((sum, value) => sum + value, 0);

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">Emissions by Scope</h3>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
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
                  <Cell key={`cell-${index}`} fill={COLORS[entry.name as keyof typeof COLORS]} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: number) => [formatEmissions(value), 'Emissions']}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Breakdown List */}
        <div className="space-y-4">
          {chartData.map((item, index) => {
            const percentage = total > 0 ? (item.value / total * 100).toFixed(1) : '0';
            
            return (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div 
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: COLORS[item.name as keyof typeof COLORS] }}
                  />
                  <div>
                    <p className="font-medium text-gray-900">{item.name}</p>
                    <p className="text-sm text-gray-600">
                      {item.name === 'Scope 1' && 'Direct emissions'}
                      {item.name === 'Scope 2' && 'Energy emissions'}
                      {item.name === 'Scope 3' && 'Value chain emissions'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium text-gray-900">{item.emissions}</p>
                  <p className="text-sm text-gray-600">{percentage}%</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
};
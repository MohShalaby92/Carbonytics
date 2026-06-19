import React from 'react';
import { Card } from '../../components/ui/Card';
import { ChartContainer } from '../../components/ui/ChartContainer';
import {
  ComposedChart,
  Bar,
  Line,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { formatEmissions } from '../../utils/calculations';
import { TrendingUp } from 'lucide-react';

interface ParetoAnalysisProps {
  /** Category name -> emissions (kg CO2e) for the current period. */
  data: Record<string, number>;
}

/**
 * Pareto (materiality) view: categories sorted by contribution with a cumulative
 * percentage line and an 80% "vital few" marker — the classic 80/20 lens an
 * auditor or sustainability lead uses to find where the footprint actually lives
 * and where reduction effort pays off. Complements the plain "by category" bar
 * chart (which is unsorted-for-cumulative and has no threshold line).
 */
const short = (s: string) => (s.length > 18 ? s.slice(0, 18) + '…' : s);

export const ParetoAnalysis: React.FC<ParetoAnalysisProps> = ({ data }) => {
  if (!data) return null;

  const sorted = Object.entries(data)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a);
  const total = sorted.reduce((s, [, v]) => s + v, 0);

  let running = 0;
  const chartData = sorted.map(([category, emissions]) => {
    running += emissions;
    return {
      category: short(category),
      fullCategory: category,
      emissions,
      sharePercent: total > 0 ? Math.round((emissions / total) * 1000) / 10 : 0,
      cumulativePercent: total > 0 ? Math.round((running / total) * 1000) / 10 : 0,
    };
  });

  // The "vital few": the first k categories whose cumulative share reaches 80%.
  const crossIdx = chartData.findIndex((d) => d.cumulativePercent >= 80);
  const vitalFew = crossIdx === -1 ? chartData.length : crossIdx + 1;

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-surface p-3 border border-line rounded-lg shadow-lg">
          <p className="font-medium text-fg">{d.fullCategory}</p>
          <p className="text-primary-600">{formatEmissions(d.emissions)} · {d.sharePercent}%</p>
          <p className="text-xs text-muted">cumulative {d.cumulativePercent}%</p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold text-fg">Materiality (Pareto)</h3>
        <TrendingUp className="w-5 h-5 text-primary-600" />
      </div>
      <p className="text-xs text-muted mb-4">
        Categories ranked by contribution, with the cumulative share. The dashed line marks 80% —
        the "vital few" categories above it are where reduction effort pays off most.
      </p>

      <ChartContainer className="h-72 mb-3">
        {chartData.length > 0 ? (
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            minHeight={240}
            initialDimension={{ width: 400, height: 280 }}
          >
            <ComposedChart data={chartData} margin={{ top: 20, right: 16, left: 8, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" />
              <XAxis
                dataKey="category"
                angle={-45}
                textAnchor="end"
                height={80}
                fontSize={12}
                tick={{ fill: 'rgb(var(--muted))' }}
                stroke="rgb(var(--line))"
              />
              <YAxis
                yAxisId="left"
                tickFormatter={(value) =>
                  value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}t` : `${value}`
                }
                fontSize={12}
                tick={{ fill: 'rgb(var(--muted))' }}
                stroke="rgb(var(--line))"
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                fontSize={12}
                tick={{ fill: 'rgb(var(--muted))' }}
                stroke="rgb(var(--line))"
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgb(var(--fg) / 0.04)' }} />
              <ReferenceLine
                yAxisId="right"
                y={80}
                stroke="#d97706"
                strokeDasharray="4 4"
                label={{ value: '80%', position: 'right', fill: '#d97706', fontSize: 11 }}
              />
              <Bar yAxisId="left" dataKey="emissions" radius={[4, 4, 0, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={i < vitalFew ? 'rgb(var(--brand))' : 'rgb(var(--fg) / 0.22)'} />
                ))}
              </Bar>
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="cumulativePercent"
                stroke="#d97706"
                strokeWidth={2}
                dot={{ r: 3, fill: '#d97706' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-muted">
            No category data in this period yet
          </div>
        )}
      </ChartContainer>

      {chartData.length > 0 && (
        <p className="text-sm text-fg/80">
          <span className="font-semibold text-primary-600">{vitalFew}</span> of {chartData.length}{' '}
          {chartData.length === 1 ? 'category' : 'categories'} drive{' '}
          <span className="font-semibold">
            {chartData[Math.min(vitalFew, chartData.length) - 1]?.cumulativePercent ?? 0}%
          </span>{' '}
          of the footprint.
        </p>
      )}
    </Card>
  );
};

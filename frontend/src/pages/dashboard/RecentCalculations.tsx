import React from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { formatEmissions } from '../../utils/calculations';
import { Clock, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';

interface RecentCalculationsProps {
  calculations: any[];
}

export const RecentCalculations: React.FC<RecentCalculationsProps> = ({ calculations }) => {
  if (!calculations || calculations.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-fg mb-4">Recent Calculations</h3>
        <div className="text-center py-6">
          <Clock className="w-8 h-8 text-muted mx-auto mb-2" />
          <p className="text-sm text-muted">No recent calculations</p>
          <Button variant="outline" className="mt-3" href="/calculations">
            Start Calculating
          </Button>
        </div>
      </Card>
    );
  }

  const recentCalcs = calculations.slice(0, 5);

  const getScopeColor = (scope: number) => {
    switch (scope) {
      case 1: return 'bg-red-500/15 text-red-700 dark:text-red-300';
      case 2: return 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300';
      case 3: return 'bg-green-500/15 text-green-700 dark:text-green-300';
      default: return 'bg-fg/[0.06] text-fg/80';
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-fg">Recent Calculations</h3>
        <Button variant="ghost" size="sm" href="/calculations">
          View All
        </Button>
      </div>

      <div className="space-y-3">
        {recentCalcs.map((calc, index) => (
          <div key={index} className="flex items-center justify-between p-3 bg-fg/[0.04] rounded-lg hover:bg-fg/[0.06] transition-colors">
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-1">
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${getScopeColor(calc.category?.scope || calc.scope || 1)}`}>
                  Scope {calc.category?.scope || calc.scope || 1}
                </span>
                <span className="text-sm font-medium text-fg truncate">
                  {calc.category?.name || calc.category || 'Unknown Category'}
                </span>
              </div>
              <div className="flex items-center space-x-2 text-xs text-muted">
                <Clock className="w-3 h-3" />
                <span>
                  {calc.createdAt ? format(new Date(calc.createdAt), 'MMM dd, HH:mm') : 'Just now'}
                </span>
              </div>
            </div>
            <div className="text-right ml-3">
              <p className="text-sm font-medium text-fg">
                {formatEmissions(calc.emissions?.total || calc.emissions || 0)}
              </p>
              {calc.quality?.rating && (
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  calc.quality.rating === 'high' ? 'bg-green-500/15 text-green-700 dark:text-green-300' :
                  calc.quality.rating === 'medium' ? 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300' :
                  'bg-red-500/15 text-red-700 dark:text-red-300'
                }`}>
                  {calc.quality.rating}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <Button variant="outline" className="w-full mt-4" href="/calculations">
        <ExternalLink className="w-4 h-4 mr-2" />
        New Calculation
      </Button>
    </Card>
  );
};

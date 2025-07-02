import React from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Target, TrendingDown, Calendar } from 'lucide-react';

export const TargetsProgress: React.FC = () => {
  // Mock targets data - in real app, this would come from API
  const targets = [
    {
      id: 1,
      name: '50% Reduction by 2030',
      description: 'Reduce total emissions by 50% compared to 2020 baseline',
      targetYear: 2030,
      currentProgress: 15,
      targetReduction: 50,
      status: 'on-track',
    },
    {
      id: 2,
      name: 'Net Zero by 2050',
      description: 'Achieve net-zero emissions across all scopes',
      targetYear: 2050,
      currentProgress: 5,
      targetReduction: 100,
      status: 'needs-attention',
    },
    {
      id: 3,
      name: '100% Renewable Energy',
      description: 'Source 100% of electricity from renewable sources',
      targetYear: 2025,
      currentProgress: 25,
      targetReduction: 100,
      status: 'ahead',
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'on-track': return 'bg-green-100 text-green-700';
      case 'ahead': return 'bg-blue-100 text-blue-700';
      case 'needs-attention': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'on-track': return 'On Track';
      case 'ahead': return 'Ahead of Schedule';
      case 'needs-attention': return 'Needs Attention';
      default: return 'Unknown';
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <Target className="w-5 h-5 text-primary-600" />
          <h3 className="text-lg font-semibold text-gray-900">Targets & Goals</h3>
        </div>
        <Button variant="outline" size="sm">
          <Calendar className="w-4 h-4 mr-2" />
          Set Targets
        </Button>
      </div>

      <div className="space-y-4">
        {targets.map((target) => (
          <div key={target.id} className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <h4 className="font-medium text-gray-900">{target.name}</h4>
                <p className="text-sm text-gray-600 mt-1">{target.description}</p>
              </div>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(target.status)}`}>
                {getStatusText(target.status)}
              </span>
            </div>

            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Progress</span>
              <span className="text-sm font-medium text-gray-900">
                {target.currentProgress}% of {target.targetReduction}%
              </span>
            </div>

            <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
              <div 
                className={`h-2 rounded-full transition-all duration-300 ${
                  target.status === 'on-track' ? 'bg-green-500' :
                  target.status === 'ahead' ? 'bg-blue-500' :
                  'bg-red-500'
                }`}
                style={{ width: `${(target.currentProgress / target.targetReduction) * 100}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Target Year: {target.targetYear}</span>
              <span>{target.targetYear - new Date().getFullYear()} years remaining</span>
            </div>
          </div>
        ))}
      </div>

      {targets.length === 0 && (
        <div className="text-center py-6">
          <Target className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600 mb-3">No targets set yet</p>
          <Button variant="outline">
            <TrendingDown className="w-4 h-4 mr-2" />
            Set Your First Target
          </Button>
        </div>
      )}
    </Card>
  );
};

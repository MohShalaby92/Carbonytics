import React from 'react';
import { Card } from '../../components/ui/Card';
import { CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-react';

interface QualityIndicatorsProps {
  calculations: any[];
}

export const QualityIndicators: React.FC<QualityIndicatorsProps> = ({ calculations }) => {
  if (!calculations || calculations.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Data Quality</h3>
        <div className="text-center py-4">
          <Info className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600">No calculations to assess</p>
        </div>
      </Card>
    );
  }

  // Mock quality assessment for current calculations
  const qualityAssessment = {
    high: calculations.filter(calc => calc.quality?.rating === 'high' || Math.random() > 0.6).length,
    medium: calculations.filter(calc => calc.quality?.rating === 'medium' || Math.random() > 0.3).length,
    low: calculations.filter(calc => calc.quality?.rating === 'low' || Math.random() > 0.8).length,
  };

  // If no quality data, distribute randomly for demo
  if (qualityAssessment.high + qualityAssessment.medium + qualityAssessment.low === 0) {
    qualityAssessment.high = Math.floor(calculations.length * 0.6);
    qualityAssessment.medium = Math.floor(calculations.length * 0.3);
    qualityAssessment.low = calculations.length - qualityAssessment.high - qualityAssessment.medium;
  }

  const total = calculations.length;
  const averageQuality = total > 0 ? 
    ((qualityAssessment.high * 3 + qualityAssessment.medium * 2 + qualityAssessment.low * 1) / total / 3 * 100) : 0;

  const indicators = [
    {
      label: 'High Quality',
      count: qualityAssessment.high,
      percentage: total > 0 ? (qualityAssessment.high / total * 100).toFixed(0) : '0',
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      description: 'Egyptian factors, recent data',
    },
    {
      label: 'Medium Quality',
      count: qualityAssessment.medium,
      percentage: total > 0 ? (qualityAssessment.medium / total * 100).toFixed(0) : '0',
      icon: AlertTriangle,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
      description: 'Global factors, some uncertainty',
    },
    {
      label: 'Low Quality',
      count: qualityAssessment.low,
      percentage: total > 0 ? (qualityAssessment.low / total * 100).toFixed(0) : '0',
      icon: XCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      description: 'Estimated factors, high uncertainty',
    },
  ];

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Data Quality</h3>
      
      {/* Overall Quality Score */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Overall Quality Score</span>
          <span className="text-2xl font-bold text-primary-600">
            {averageQuality.toFixed(0)}%
          </span>
        </div>
        <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-primary-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${averageQuality}%` }}
          />
        </div>
      </div>

      {/* Quality Breakdown */}
      <div className="space-y-3">
        {indicators.map((indicator, index) => {
          const Icon = indicator.icon;
          return (
            <div key={index} className={`p-3 ${indicator.bgColor} rounded-lg`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Icon className={`w-5 h-5 ${indicator.color}`} />
                  <div>
                    <p className={`font-medium ${indicator.color}`}>{indicator.label}</p>
                    <p className="text-xs text-gray-600">{indicator.description}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-bold ${indicator.color}`}>{indicator.count}</p>
                  <p className="text-xs text-gray-600">{indicator.percentage}%</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recommendations */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-600">
          💡 <strong>Tip:</strong> Use Egyptian-specific emission factors when available for higher accuracy
        </p>
      </div>
    </Card>
  );
};

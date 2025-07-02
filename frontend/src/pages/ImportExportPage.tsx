import React, { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { FileUpload } from '../components/forms/FileUpload';
import { Alert } from '../components/ui/Alert';
import { apiService } from '../services/api';
import { 
  Upload, 
  Download, 
  BarChart3, 
  Calendar,
  Filter,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

export const ImportExportPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import');
  const [exportFilters, setExportFilters] = useState({
    startDate: '',
    endDate: '',
    scopes: [] as number[],
  });
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  const handleImportSuccess = (result: any) => {
    setMessage({
      type: 'success',
      text: `Successfully imported ${result.successful} calculations!`
    });
  };

  const handleImportError = (error: string) => {
    setMessage({
      type: 'error',
      text: error
    });
  };

  const handleExport = async () => {
    setExporting(true);
    setMessage(null);

    try {
      const params = new URLSearchParams();
      if (exportFilters.startDate) params.append('startDate', exportFilters.startDate);
      if (exportFilters.endDate) params.append('endDate', exportFilters.endDate);
      if (exportFilters.scopes.length > 0) params.append('scopes', exportFilters.scopes.join(','));

      const response = await apiService.get(`/csv/export?${params.toString()}`, {
        responseType: 'blob',
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data as BlobPart]));
      const link = document.createElement('a');
      link.href = url;
      
      const fileName = `emissions_data_${Date.now()}.csv`;
      
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setMessage({
        type: 'success',
        text: 'CSV export downloaded successfully!'
      });

    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Export failed'
      });
    } finally {
      setExporting(false);
    }
  };

  const toggleScope = (scope: number) => {
    setExportFilters(prev => ({
      ...prev,
      scopes: prev.scopes.includes(scope)
        ? prev.scopes.filter(s => s !== scope)
        : [...prev.scopes, scope]
    }));
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Import & Export Data</h1>
        <p className="mt-2 text-gray-600">
          Import calculations from CSV files or export your emissions data
        </p>
      </div>

      {/* Message Alert */}
      {message && (
        <Alert 
          variant={message.type === 'success' ? 'success' : 'error'} 
          className="mb-6"
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          <span>{message.text}</span>
        </Alert>
      )}

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg mb-8">
        <button
          onClick={() => setActiveTab('import')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'import'
              ? 'bg-white text-primary-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Upload className="w-4 h-4" />
          <span>Import Data</span>
        </button>
        <button
          onClick={() => setActiveTab('export')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'export'
              ? 'bg-white text-primary-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Download className="w-4 h-4" />
          <span>Export Data</span>
        </button>
      </div>

      {/* Import Tab */}
      {activeTab === 'import' && (
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-start space-x-4 mb-6">
              <div className="flex-shrink-0">
                <Upload className="w-8 h-8 text-primary-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Import Calculations</h2>
                <p className="mt-1 text-gray-600">
                  Upload a CSV file with your emissions calculation data. The file should include 
                  category, value, unit, and date information for each calculation.
                </p>
              </div>
            </div>

            <FileUpload
              onUploadSuccess={handleImportSuccess}
              onUploadError={handleImportError}
              accept=".csv"
              maxSize={10}
            />
          </Card>

          {/* Import Guidelines */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Import Guidelines</h3>
            <div className="space-y-4 text-sm text-gray-600">
              <div>
                <h4 className="font-medium text-gray-900">Required Columns:</h4>
                <ul className="mt-1 list-disc list-inside space-y-1">
                  <li><strong>category</strong> - Emission category name (e.g., "Purchased Electricity")</li>
                  <li><strong>value</strong> - Numeric value for the activity</li>
                  <li><strong>unit</strong> - Unit of measurement (e.g., "kWh", "km", "L")</li>
                  <li><strong>period_start</strong> - Start date (YYYY-MM-DD format)</li>
                  <li><strong>period_end</strong> - End date (YYYY-MM-DD format)</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-gray-900">Optional Columns:</h4>
                <ul className="mt-1 list-disc list-inside space-y-1">
                  <li><strong>notes</strong> - Additional notes or context</li>
                  <li><strong>location</strong> - Geographic location</li>
                  <li><strong>supplier</strong> - Supplier or vendor name</li>
                  <li><strong>distance</strong> - Distance for travel calculations</li>
                  <li><strong>fuel_type</strong> - Type of fuel used</li>
                </ul>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Export Tab */}
      {activeTab === 'export' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Export Options */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6">
              <div className="flex items-start space-x-4 mb-6">
                <div className="flex-shrink-0">
                  <Download className="w-8 h-8 text-primary-600" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Export Data</h2>
                  <p className="mt-1 text-gray-600">
                    Export your emissions calculation data as CSV for analysis in Excel or other tools
                  </p>
                </div>
              </div>

              {/* Date Range */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-900 mb-3">Date Range</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={exportFilters.startDate}
                      onChange={(e) => setExportFilters(prev => ({
                        ...prev,
                        startDate: e.target.value
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">End Date</label>
                    <input
                      type="date"
                      value={exportFilters.endDate}
                      onChange={(e) => setExportFilters(prev => ({
                        ...prev,
                        endDate: e.target.value
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
              </div>

              {/* Scope Selection */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-900 mb-3">Emission Scopes</h3>
                <div className="space-y-2">
                  {[1, 2, 3].map(scope => (
                    <label key={scope} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={exportFilters.scopes.includes(scope)}
                        onChange={() => toggleScope(scope)}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                      <span className="ml-2 text-sm text-gray-700">
                        Scope {scope} - {
                          scope === 1 ? 'Direct Emissions' :
                          scope === 2 ? 'Energy Indirect' :
                          'Other Indirect'
                        }
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Leave empty to include all scopes
                </p>
              </div>

              <Button
                onClick={handleExport}
                loading={exporting}
                disabled={exporting}
                className="w-full"
              >
                {exporting ? 'Generating...' : 'Export CSV'}
              </Button>
            </Card>
          </div>

          {/* Export Info */}
          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Export Format</h3>
              <div className="flex items-start space-x-3">
                <BarChart3 className="w-5 h-5 text-green-500 mt-0.5" />
                <div>
                  <h4 className="font-medium text-gray-900">CSV Data</h4>
                  <p className="text-sm text-gray-600">
                    Raw calculation data for analysis in Excel or other tools
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setExportFilters({
                      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                      endDate: new Date().toISOString().split('T')[0],
                      scopes: [],
                    });
                  }}
                  className="w-full justify-start"
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Last 30 Days Export
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setExportFilters({
                      startDate: '',
                      endDate: '',
                      scopes: [],
                    });
                  }}
                  className="w-full justify-start"
                >
                  <Filter className="w-4 h-4 mr-2" />
                  All Data Export
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};
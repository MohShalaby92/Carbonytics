import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { organizationService, OrganizationSettings } from '../../services/organizationService';
import { CURRENCIES, LANGUAGES } from '../../constants';
import { Settings as SettingsIcon, Save, Globe, DollarSign, Clock } from 'lucide-react';

export const GeneralSettings: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<OrganizationSettings>({
    currency: 'USD',
    timezone: 'UTC',
    language: 'en',
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await organizationService.getSettings();
      setSettings(data);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const updated = await organizationService.updateSettings(settings);
      setSettings(updated);
      setMessage({ type: 'success', text: 'Settings updated successfully' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to update settings' });
    } finally {
      setLoading(false);
    }
  };

  // Common timezones for dropdown
  const timezones = [
    { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
    { value: 'America/New_York', label: 'Eastern Time (US & Canada)' },
    { value: 'America/Chicago', label: 'Central Time (US & Canada)' },
    { value: 'America/Denver', label: 'Mountain Time (US & Canada)' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada)' },
    { value: 'Europe/London', label: 'London (GMT/BST)' },
    { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
    { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
    { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
    { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
    { value: 'Asia/Dubai', label: 'Dubai (GST)' },
    { value: 'Africa/Cairo', label: 'Cairo (EET)' },
    { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
  ];

  return (
    <div className="space-y-6">
      {message && (
        <Alert variant={message.type === 'success' ? 'success' : 'error'}>
          {message.text}
        </Alert>
      )}

      <Card className="p-6">
        <div className="flex items-center mb-6">
          <SettingsIcon className="w-5 h-5 text-primary-600 mr-2" />
          <h2 className="text-xl font-semibold text-gray-900">General Settings</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Currency */}
            <div>
              <label htmlFor="currency" className="block text-sm font-medium text-gray-700 mb-2">
                <DollarSign className="w-4 h-4 inline mr-1" />
                Default Currency
              </label>
              <select
                id="currency"
                value={settings.currency}
                onChange={(e) => setSettings(prev => ({ ...prev, currency: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              >
                {Object.entries(CURRENCIES).map(([code, config]) => (
                  <option key={code} value={code}>{code} - {config.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                This will be used for displaying monetary values in reports
              </p>
            </div>

            {/* Language */}
            <div>
              <label htmlFor="language" className="block text-sm font-medium text-gray-700 mb-2">
                <Globe className="w-4 h-4 inline mr-1" />
                Language
              </label>
              <select
                id="language"
                value={settings.language}
                onChange={(e) => setSettings(prev => ({ ...prev, language: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              >
                {Object.entries(LANGUAGES).map(([code, config]) => (
                  <option key={code} value={code}>{config.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Interface language for your organization
              </p>
            </div>

            {/* Timezone */}
            <div className="md:col-span-2">
              <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-2">
                <Clock className="w-4 h-4 inline mr-1" />
                Timezone
              </label>
              <select
                id="timezone"
                value={settings.timezone}
                onChange={(e) => setSettings(prev => ({ ...prev, timezone: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              >
                {timezones.map(tz => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Default timezone for displaying dates and times
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-200">
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-600">
                <p>These settings apply to your entire organization</p>
              </div>
              <Button type="submit" loading={loading}>
                <Save className="w-4 h-4 mr-2" />
                Save Settings
              </Button>
            </div>
          </div>
        </form>
      </Card>

      {/* Additional Settings */}
      <Card className="p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Additional Preferences</h3>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
            <div>
              <h4 className="font-medium text-gray-900">Data Export Format</h4>
              <p className="text-sm text-gray-600">Default format for exporting calculation data</p>
            </div>
            <select className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500">
              <option value="csv">CSV</option>
              <option value="excel">Excel</option>
              <option value="pdf">PDF</option>
            </select>
          </div>

          <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
            <div>
              <h4 className="font-medium text-gray-900">Measurement Units</h4>
              <p className="text-sm text-gray-600">Preferred units for emission calculations</p>
            </div>
            <select className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500">
              <option value="metric">Metric (kg, km, L)</option>
              <option value="imperial">Imperial (lbs, miles, gal)</option>
            </select>
          </div>

          <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
            <div>
              <h4 className="font-medium text-gray-900">Auto-save Calculations</h4>
              <p className="text-sm text-gray-600">Automatically save calculations as you work</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>
        </div>
      </Card>
    </div>
  );
};

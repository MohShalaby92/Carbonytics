import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { organizationService, OrganizationSettings } from '../../services/organizationService';
import { usePersona, PERSONAS } from '../../hooks/usePersona';
import { useAuth } from '../../hooks/useAuth';
import { CURRENCIES, LANGUAGES } from '../../constants';
import { Settings as SettingsIcon, Save, Globe, DollarSign, Clock, LayoutGrid, Check } from 'lucide-react';

export const GeneralSettings: React.FC = () => {
  const { persona, setPersona } = usePersona();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
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

      {/* Persona / workspace mode (§10) */}
      <Card className="p-6">
        <div className="flex items-center mb-2">
          <LayoutGrid className="w-5 h-5 text-emphasis me-2" />
          <h2 className="text-xl font-semibold text-fg">Workspace mode</h2>
        </div>
        <p className="text-sm text-muted mb-4">
          Tailors the interface to how your team works.{' '}
          {isAdmin ? 'Changes apply organization-wide immediately.' : 'This is set by an administrator.'}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {PERSONAS.map((p) => {
            const active = persona === p.id;
            return (
              <button
                key={p.id}
                type="button"
                disabled={!isAdmin}
                onClick={() => isAdmin && setPersona(p.id)}
                className={`text-start rounded-xl border p-4 transition-colors ${
                  active ? 'border-brand/50 -brand/10' : 'border-line hover:bg-fg/[0.03]'
                } ${!isAdmin ? 'cursor-default opacity-80' : ''}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-fg">{p.label}</span>
                  {active && <Check className="w-4 h-4 text-emphasis" />}
                </div>
                <p className="text-xs text-emphasis mb-1">{p.tagline}</p>
                <p className="text-xs text-muted leading-relaxed">{p.description}</p>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center mb-6">
          <SettingsIcon className="w-5 h-5 text-emphasis me-2" />
          <h2 className="text-xl font-semibold text-fg">General Settings</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Currency */}
            <div>
              <label htmlFor="currency" className="block text-sm font-medium text-fg/80 mb-2">
                <DollarSign className="w-4 h-4 inline me-1" />
                Default Currency
              </label>
              <Select
                id="currency"
                value={settings.currency}
                onChange={(e) => setSettings(prev => ({ ...prev, currency: e.target.value }))}
                
              >
                {Object.entries(CURRENCIES).map(([code, config]) => (
                  <option key={code} value={code}>{code} - {config.name}</option>
                ))}
              </Select>
              <p className="text-xs text-muted mt-1">
                This will be used for displaying monetary values in reports
              </p>
            </div>

            {/* Language */}
            <div>
              <label htmlFor="language" className="block text-sm font-medium text-fg/80 mb-2">
                <Globe className="w-4 h-4 inline me-1" />
                Language
              </label>
              <Select
                id="language"
                value={settings.language}
                onChange={(e) => setSettings(prev => ({ ...prev, language: e.target.value }))}
                
              >
                {Object.entries(LANGUAGES).map(([code, config]) => (
                  <option key={code} value={code}>{config.name}</option>
                ))}
              </Select>
              <p className="text-xs text-muted mt-1">
                Interface language for your organization
              </p>
            </div>

            {/* Timezone */}
            <div className="md:col-span-2">
              <label htmlFor="timezone" className="block text-sm font-medium text-fg/80 mb-2">
                <Clock className="w-4 h-4 inline me-1" />
                Timezone
              </label>
              <Select
                id="timezone"
                value={settings.timezone}
                onChange={(e) => setSettings(prev => ({ ...prev, timezone: e.target.value }))}
                
              >
                {timezones.map(tz => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </Select>
              <p className="text-xs text-muted mt-1">
                Default timezone for displaying dates and times
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-line">
            <div className="flex justify-between items-center">
              <div className="text-sm text-muted">
                <p>These settings apply to your entire organization</p>
              </div>
              <Button type="submit" loading={loading}>
                <Save className="w-4 h-4 me-2" />
                Save Settings
              </Button>
            </div>
          </div>
        </form>
      </Card>

      {/* Additional preferences: not persisted yet, so shown disabled rather than pretending to save. */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <h3 className="text-lg font-medium text-fg">Additional Preferences</h3>
          <Badge size="sm">Coming soon</Badge>
        </div>
        <p className="text-sm text-muted mb-4">These preferences aren't saved yet. They'll switch on in a later release.</p>

        <div className="space-y-4" aria-disabled="true">
          {[
            { id: 'pref-export', title: 'Data Export Format', hint: 'Default format for exporting calculation data', options: [['csv', 'CSV'], ['excel', 'Excel'], ['pdf', 'PDF']] },
            { id: 'pref-units', title: 'Measurement Units', hint: 'Preferred units for emission calculations', options: [['metric', 'Metric (kg, km, L)'], ['imperial', 'Imperial (lbs, miles, gal)']] },
          ].map((pref) => (
            <div key={pref.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border border-line rounded-lg">
              <div>
                <label htmlFor={pref.id} className="font-medium text-fg">{pref.title}</label>
                <p className="text-sm text-muted">{pref.hint}</p>
              </div>
              <Select id={pref.id} disabled className="sm:w-56">
                {pref.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </div>
          ))}

          <div className="flex items-center justify-between gap-3 p-4 border border-line rounded-lg">
            <div>
              <span id="pref-autosave" className="font-medium text-fg">Auto-save Calculations</span>
              <p className="text-sm text-muted">Automatically save calculations as you work</p>
            </div>
            <button type="button" role="switch" aria-checked="false" aria-labelledby="pref-autosave" disabled
              className="relative inline-flex h-6 w-11 shrink-0 rounded-full bg-fg/[0.08] border border-line disabled:opacity-50 disabled:cursor-not-allowed">
              <span className="absolute top-0.5 start-0.5 h-[18px] w-[18px] rounded-full bg-surface border border-line shadow-sm" />
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
};

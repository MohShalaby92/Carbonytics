import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { organizationService } from '../../services/organizationService';
import { INDUSTRIES, ORGANIZATION_SIZES } from '../../constants';
import { Organization } from '../../types';
import { Building2, Save, MapPin, Briefcase, FlaskConical } from 'lucide-react';

const GWP_SETS = [
  { value: 'AR4', label: 'AR4 (IPCC Fourth Assessment Report, 2007)' },
  { value: 'AR5', label: 'AR5 (IPCC Fifth Assessment Report, 2014)' },
  { value: 'AR6', label: 'AR6 (IPCC Sixth Assessment Report, 2021) — recommended' },
] as const;

const CONSOLIDATION_APPROACHES = [
  { value: 'operational_control', label: 'Operational control', hint: '100% of emissions from operations you control' },
  { value: 'financial_control', label: 'Financial control', hint: '100% of emissions from operations you financially control' },
  { value: 'equity_share', label: 'Equity share', hint: 'Emissions proportional to your ownership stake' },
] as const;

export const OrganizationSettingsTab: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [savingMethodology, setSavingMethodology] = useState(false);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [gwpSet, setGwpSet] = useState<'AR4' | 'AR5' | 'AR6'>('AR6');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadOrganization();
  }, []);

  const loadOrganization = async () => {
    try {
      const data = await organizationService.getOrganization();
      setOrganization(data);
      if (data.settings?.gwpSet) setGwpSet(data.settings.gwpSet);
    } catch (error) {
      console.error('Failed to load organization:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization) return;

    setLoading(true);
    setMessage(null);

    try {
      const updated = await organizationService.updateOrganization({
        name: organization.name,
        industry: organization.industry,
        country: organization.country,
        size: organization.size,
      });

      setOrganization(updated);
      setMessage({ type: 'success', text: 'Organization updated successfully' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to update organization' });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Methodology settings save: GWP set (org settings) + consolidation approach
   * (organization). Both changes are audited server-side; the GWP set applies
   * from the next calculation onward.
   */
  const handleMethodologySave = async () => {
    if (!organization) return;
    setSavingMethodology(true);
    setMessage(null);
    try {
      await organizationService.updateSettings({ gwpSet });
      const updated = await organizationService.updateOrganization({
        consolidationApproach: organization.consolidationApproach || 'operational_control',
      });
      setOrganization(updated);
      setMessage({
        type: 'success',
        text: 'Methodology updated (audited). The GWP set applies to calculations from now on; existing entries keep the set they were computed with.',
      });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to update methodology' });
    } finally {
      setSavingMethodology(false);
    }
  };

  if (!organization) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {message && (
        <Alert variant={message.type === 'success' ? 'success' : 'error'}>
          {message.text}
        </Alert>
      )}

      <Card className="p-6">
        <div className="flex items-center mb-6">
          <Building2 className="w-5 h-5 text-primary-600 mr-2" />
          <h2 className="text-xl font-semibold text-fg">Organization Details</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="organizationName" className="block text-sm font-medium text-fg/80 mb-2">
                Organization Name
              </label>
              <Input
                id="organizationName"
                value={organization.name}
                onChange={(e) => setOrganization(prev => prev ? { ...prev, name: e.target.value } : null)}
                placeholder="Enter organization name"
                required
              />
            </div>

            <div>
              <label htmlFor="industry" className="block text-sm font-medium text-fg/80 mb-2">
                <Briefcase className="w-4 h-4 inline mr-1" />
                Industry
              </label>
              <select
                id="industry"
                value={organization.industry}
                onChange={(e) => setOrganization(prev => prev ? { ...prev, industry: e.target.value } : null)}
                className="w-full px-3 py-2 border border-line rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                required
              >
                {INDUSTRIES.map(industry => (
                  <option key={industry} value={industry}>{industry}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="country" className="block text-sm font-medium text-fg/80 mb-2">
                <MapPin className="w-4 h-4 inline mr-1" />
                Country
              </label>
              <Input
                id="country"
                value={organization.country}
                onChange={(e) => setOrganization(prev => prev ? { ...prev, country: e.target.value } : null)}
                placeholder="Enter country"
                required
              />
            </div>

            <div>
              <label htmlFor="size" className="block text-sm font-medium text-fg/80 mb-2">
                Organization Size
              </label>
              <select
                id="size"
                value={organization.size}
                onChange={(e) => setOrganization(prev => prev ? { ...prev, size: e.target.value as any } : null)}
                className="w-full px-3 py-2 border border-line rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                required
              >
                {Object.entries(ORGANIZATION_SIZES).map(([key, config]) => (
                  <option key={key} value={key}>{config.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-4 border-t border-line">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted">
                <p>Created: {new Date(organization.createdAt).toLocaleDateString()}</p>
              </div>
              <Button type="submit" loading={loading}>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
            </div>
          </div>
        </form>
      </Card>

      {/* Methodology: GWP set + consolidation approach (both audited) */}
      <Card className="p-6">
        <div className="flex items-center mb-2">
          <FlaskConical className="w-5 h-5 text-primary-600 mr-2" />
          <h2 className="text-xl font-semibold text-fg">Methodology</h2>
        </div>
        <p className="text-sm text-muted mb-6">
          Reporting-methodology choices required by the GHG Protocol. Changes are recorded in
          the audit trail.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="gwpSet" className="block text-sm font-medium text-fg/80 mb-2">
              GWP value set
            </label>
            <select
              id="gwpSet"
              value={gwpSet}
              onChange={(e) => setGwpSet(e.target.value as 'AR4' | 'AR5' | 'AR6')}
              className="w-full px-3 py-2 border border-line rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            >
              {GWP_SETS.map((set) => (
                <option key={set.value} value={set.value}>{set.label}</option>
              ))}
            </select>
            <p className="mt-2 text-xs text-muted">
              Applied when converting per-gas factors (CH₄, N₂O…) to CO₂e. Factors already
              denominated in CO₂e are used as-is — GWPs are never applied twice.
            </p>
          </div>

          <div>
            <label htmlFor="consolidationApproach" className="block text-sm font-medium text-fg/80 mb-2">
              Consolidation approach
            </label>
            <select
              id="consolidationApproach"
              value={organization.consolidationApproach || 'operational_control'}
              onChange={(e) =>
                setOrganization((prev) =>
                  prev ? { ...prev, consolidationApproach: e.target.value as any } : null
                )
              }
              className="w-full px-3 py-2 border border-line rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            >
              {CONSOLIDATION_APPROACHES.map((approach) => (
                <option key={approach.value} value={approach.value}>{approach.label}</option>
              ))}
            </select>
            <p className="mt-2 text-xs text-muted">
              {
                CONSOLIDATION_APPROACHES.find(
                  (a) => a.value === (organization.consolidationApproach || 'operational_control')
                )?.hint
              }
              . Choose once and apply consistently across reporting periods.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={handleMethodologySave} loading={savingMethodology}>
            <Save className="w-4 h-4 mr-2" />
            Save Methodology
          </Button>
        </div>
      </Card>
    </div>
  );
};

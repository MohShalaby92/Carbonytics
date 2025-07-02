import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { organizationService } from '../../services/organizationService';
import { INDUSTRIES, ORGANIZATION_SIZES } from '../../constants';
import { Organization } from '../../types';
import { Building2, Save, MapPin, Briefcase } from 'lucide-react';

export const OrganizationSettingsTab: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadOrganization();
  }, []);

  const loadOrganization = async () => {
    try {
      const data = await organizationService.getOrganization();
      setOrganization(data);
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
          <h2 className="text-xl font-semibold text-gray-900">Organization Details</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="organizationName" className="block text-sm font-medium text-gray-700 mb-2">
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
              <label htmlFor="industry" className="block text-sm font-medium text-gray-700 mb-2">
                <Briefcase className="w-4 h-4 inline mr-1" />
                Industry
              </label>
              <select
                id="industry"
                value={organization.industry}
                onChange={(e) => setOrganization(prev => prev ? { ...prev, industry: e.target.value } : null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                required
              >
                {INDUSTRIES.map(industry => (
                  <option key={industry} value={industry}>{industry}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="country" className="block text-sm font-medium text-gray-700 mb-2">
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
              <label htmlFor="size" className="block text-sm font-medium text-gray-700 mb-2">
                Organization Size
              </label>
              <select
                id="size"
                value={organization.size}
                onChange={(e) => setOrganization(prev => prev ? { ...prev, size: e.target.value as any } : null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                required
              >
                {Object.entries(ORGANIZATION_SIZES).map(([key, config]) => (
                  <option key={key} value={key}>{config.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
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
    </div>
  );
};

import React, { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { ProfileSettings } from './ProfileSettings';
import { OrganizationSettingsTab } from './OrganizationSettingsTab';
import { UserManagement } from './UserManagement';
import { GeneralSettings } from './GeneralSettings';
import { useAuth } from '../../hooks/useAuth';
import { 
  User, 
  Building2, 
  Users, 
  Settings as SettingsIcon,
  Shield,
  Bell
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');

  const tabs = [
    { id: 'profile', name: 'Profile', icon: User, component: ProfileSettings },
    { id: 'organization', name: 'Organization', icon: Building2, component: OrganizationSettingsTab, adminOnly: true },
    { id: 'users', name: 'Users', icon: Users, component: UserManagement, adminOnly: true },
    { id: 'general', name: 'General', icon: SettingsIcon, component: GeneralSettings, adminOnly: true },
    { id: 'notifications', name: 'Notifications', icon: Bell, component: () => <div className="p-6 text-center text-gray-500">Coming Soon</div> },
    { id: 'security', name: 'Security', icon: Shield, component: () => <div className="p-6 text-center text-gray-500">Coming Soon</div> },
  ];

  const visibleTabs = tabs.filter(tab => !tab.adminOnly || user?.role === 'admin');
  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component || ProfileSettings;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="mt-2 text-gray-600">Manage your account and organization preferences</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="lg:w-64">
            <Card className="p-4">
              <nav className="space-y-2">
                {visibleTabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                        activeTab === tab.id
                          ? 'bg-primary-50 text-primary-700 border-r-2 border-primary-600'
                          : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <Icon className="w-4 h-4 mr-3" />
                      {tab.name}
                    </button>
                  );
                })}
              </nav>
            </Card>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            <ActiveComponent />
          </div>
        </div>
      </div>
    </div>
  );
};

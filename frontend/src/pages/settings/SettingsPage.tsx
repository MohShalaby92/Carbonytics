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
    { id: 'notifications', name: 'Notifications', icon: Bell, component: () => <div className="p-6 text-center text-muted">Coming Soon</div> },
    { id: 'security', name: 'Security', icon: Shield, component: () => <div className="p-6 text-center text-muted">Coming Soon</div> },
  ];

  const visibleTabs = tabs.filter(tab => !tab.adminOnly || user?.role === 'admin');
  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component || ProfileSettings;

  return (
    <div className="min-h-screen bg-fg/[0.04] py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-fg">Settings</h1>
          <p className="mt-2 text-muted">Manage your account and organization preferences</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="lg:w-64">
            <Card className="p-1.5 lg:p-4">
              <nav className="flex gap-1 overflow-x-auto snap-x [scrollbar-width:none] [mask-image:linear-gradient(to_right,#000_calc(100%-2.5rem),transparent)] rtl:[mask-image:linear-gradient(to_left,#000_calc(100%-2.5rem),transparent)] pe-10 lg:pe-0 lg:[mask-image:none] lg:flex-col lg:gap-2 lg:overflow-visible">
                {visibleTabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      aria-current={activeTab === tab.id ? 'page' : undefined}
                      className={`shrink-0 snap-start whitespace-nowrap lg:w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                        activeTab === tab.id
                          ? 'bg-brand/10 text-fg'
                          : 'text-fg/80 hover:bg-fg/[0.04] hover:text-fg'
                      }`}
                    >
                      <Icon className="w-4 h-4 me-3 shrink-0" aria-hidden="true" />
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

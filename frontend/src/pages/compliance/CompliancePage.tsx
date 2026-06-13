import React, { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { useAuth } from '../../hooks/useAuth';
import { ReportsTab } from './ReportsTab';
import { ExclusionsTab } from './ExclusionsTab';
import { FacilitiesTab } from './FacilitiesTab';
import { DenominatorsTab } from './DenominatorsTab';
import { AuditLogTab } from './AuditLogTab';
import { SnapshotsTab } from './SnapshotsTab';
import { SuppliersTab } from './SuppliersTab';
import { CompletenessTab } from './CompletenessTab';
import {
  FileText,
  ListX,
  Building2,
  Divide,
  ScrollText,
  History,
  Handshake,
  ClipboardCheck,
} from 'lucide-react';

/**
 * Compliance hub: everything an auditor (or the person preparing for one)
 * needs — report exports, the exclusions register, the facility boundary,
 * the audit trail, and snapshot/restatement history.
 */
export const CompliancePage: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('reports');

  const tabs = [
    { id: 'reports', name: 'Reports & Exports', icon: FileText, component: ReportsTab },
    { id: 'completeness', name: 'Completeness', icon: ClipboardCheck, component: CompletenessTab },
    { id: 'exclusions', name: 'Exclusions Register', icon: ListX, component: ExclusionsTab },
    { id: 'facilities', name: 'Facilities', icon: Building2, component: FacilitiesTab },
    { id: 'suppliers', name: 'Suppliers', icon: Handshake, component: SuppliersTab },
    { id: 'denominators', name: 'Intensity & Denominators', icon: Divide, component: DenominatorsTab },
    { id: 'snapshots', name: 'Snapshots & Restatements', icon: History, component: SnapshotsTab },
    { id: 'audit', name: 'Audit Trail', icon: ScrollText, component: AuditLogTab, adminOnly: true },
  ];

  const visibleTabs = tabs.filter((tab) => !tab.adminOnly || user?.role === 'admin');
  const ActiveComponent =
    visibleTabs.find((tab) => tab.id === activeTab)?.component || ReportsTab;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-fg">Compliance</h1>
        <p className="mt-2 text-muted">
          Audit-ready exports, documented exclusions, organizational boundary and inventory controls
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <div className="lg:w-64 shrink-0">
          <Card className="p-4">
            <nav className="space-y-2">
              {visibleTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors text-left ${
                      activeTab === tab.id
                        ? 'bg-primary-50 text-primary-700 border-r-2 border-primary-600'
                        : 'text-fg/80 hover:bg-fg/[0.04] hover:text-fg'
                    }`}
                  >
                    <Icon className="w-4 h-4 mr-3 shrink-0" />
                    {tab.name}
                  </button>
                );
              })}
            </nav>
          </Card>
        </div>

        <div className="flex-1 min-w-0">
          <ActiveComponent />
        </div>
      </div>
    </div>
  );
};

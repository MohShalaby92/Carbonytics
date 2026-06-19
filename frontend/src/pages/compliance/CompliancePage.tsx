import React, { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { useAuth } from '../../hooks/useAuth';
import { usePersona, complianceTabVisible } from '../../hooks/usePersona';
import { ReportsTab } from './ReportsTab';
import { ExclusionsTab } from './ExclusionsTab';
import { FacilitiesTab } from './FacilitiesTab';
import { DenominatorsTab } from './DenominatorsTab';
import { AuditLogTab } from './AuditLogTab';
import { SnapshotsTab } from './SnapshotsTab';
import { LineageTab } from './LineageTab';
import { SuppliersTab } from './SuppliersTab';
import { FleetTab } from './FleetTab';
import { CompletenessTab } from './CompletenessTab';
import { InventoriesTab } from './InventoriesTab';
import { EvidenceTab } from './EvidenceTab';
import { DataQualityTab } from './DataQualityTab';
import {
  FileText,
  ListX,
  Building2,
  Divide,
  ScrollText,
  History,
  Handshake,
  ClipboardCheck,
  CalendarRange,
  Truck,
  FileCheck2,
  Gauge,
  Network,
} from 'lucide-react';

/**
 * Compliance hub: everything an auditor (or the person preparing for one)
 * needs — report exports, the exclusions register, the facility boundary,
 * the audit trail, and snapshot/restatement history.
 */
export const CompliancePage: React.FC = () => {
  const { user } = useAuth();
  const { persona } = usePersona();
  const [activeTab, setActiveTab] = useState('reports');
  // Deep-link context: a "Trace" from the Reports preview opens the Lineage tab
  // focused on the same reporting period.
  const [lineageContext, setLineageContext] = useState<{ start: string; end: string } | null>(null);

  const tabs = [
    { id: 'reports', name: 'Reports & Exports', icon: FileText, component: ReportsTab },
    { id: 'inventories', name: 'Reporting Years', icon: CalendarRange, component: InventoriesTab },
    { id: 'completeness', name: 'Completeness', icon: ClipboardCheck, component: CompletenessTab },
    { id: 'data-quality', name: 'Data Quality', icon: Gauge, component: DataQualityTab },
    { id: 'exclusions', name: 'Exclusions Register', icon: ListX, component: ExclusionsTab },
    { id: 'facilities', name: 'Facilities', icon: Building2, component: FacilitiesTab },
    { id: 'fleet', name: 'Fleet', icon: Truck, component: FleetTab },
    { id: 'suppliers', name: 'Suppliers', icon: Handshake, component: SuppliersTab },
    { id: 'denominators', name: 'Intensity & Denominators', icon: Divide, component: DenominatorsTab },
    { id: 'snapshots', name: 'Snapshots & Restatements', icon: History, component: SnapshotsTab },
    { id: 'lineage', name: 'Calculation Lineage', icon: Network, component: LineageTab },
    { id: 'evidence', name: 'Evidence', icon: FileCheck2, component: EvidenceTab },
    { id: 'audit', name: 'Audit Trail', icon: ScrollText, component: AuditLogTab, adminOnly: true },
  ];

  const visibleTabs = tabs.filter(
    (tab) => (!tab.adminOnly || user?.role === 'admin') && complianceTabVisible(tab.id, persona)
  );
  const ActiveComponent =
    visibleTabs.find((tab) => tab.id === activeTab)?.component || ReportsTab;

  // Reports and Lineage take props (deep-link wiring); the rest render plain.
  const renderActive = () => {
    if (activeTab === 'reports') {
      return (
        <ReportsTab
          onTrace={(start, end) => {
            setLineageContext({ start, end });
            setActiveTab('lineage');
          }}
        />
      );
    }
    if (activeTab === 'lineage') {
      return <LineageTab initialPeriod={lineageContext} />;
    }
    return <ActiveComponent />;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-fg">Compliance</h1>
        <p className="mt-2 text-muted">
          Audit-ready exports, documented exclusions, organizational boundary and inventory controls
        </p>
        {persona === 'sme' && (
          <p className="mt-3 text-xs text-muted inline-flex items-center gap-1.5 rounded-lg border border-line bg-fg/[0.03] px-3 py-1.5">
            <Gauge className="w-3.5 h-3.5" />
            Streamlined (SME) view — showing the essentials. Switch to Enterprise in the menu to see
            consolidation, frameworks, lineage and the audit trail.
          </p>
        )}
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
          {renderActive()}
        </div>
      </div>
    </div>
  );
};

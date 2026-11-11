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
          <Card className="p-1.5 lg:p-4">
            {/* Phone/tablet: one swipeable strip so the panel is above the fold; desktop: a rail. */}
            <div
              role="tablist"
              aria-label="Compliance sections"
              className="flex gap-1 overflow-x-auto snap-x scroll-px-1.5 [scrollbar-width:none] [mask-image:linear-gradient(to_right,#000_calc(100%-2.5rem),transparent)] rtl:[mask-image:linear-gradient(to_left,#000_calc(100%-2.5rem),transparent)] pe-10 lg:pe-0 lg:[mask-image:none] lg:flex-col lg:gap-2 lg:overflow-visible"
              onKeyDown={(e) => {
                const keys: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, ArrowRight: 1, ArrowLeft: -1 };
                const i = visibleTabs.findIndex((t) => t.id === activeTab);
                let next: number | null = null;
                if (e.key in keys) next = (i + keys[e.key] + visibleTabs.length) % visibleTabs.length;
                else if (e.key === 'Home') next = 0;
                else if (e.key === 'End') next = visibleTabs.length - 1;
                if (next === null) return;
                e.preventDefault();
                setActiveTab(visibleTabs[next].id);
                document.getElementById(`compliance-tab-${visibleTabs[next].id}`)?.focus();
              }}
            >
              {visibleTabs.map((tab) => {
                const Icon = tab.icon;
                const selected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    id={`compliance-tab-${tab.id}`}
                    role="tab"
                    aria-selected={selected}
                    aria-controls="compliance-panel"
                    tabIndex={selected ? 0 : -1}
                    onClick={(e) => {
                      setActiveTab(tab.id);
                      e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                    }}
                    className={`focus-ring shrink-0 snap-start whitespace-nowrap lg:w-full lg:whitespace-normal flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors text-start ${
                      selected
                        ? 'bg-brand/10 text-fg'
                        : 'text-fg/80 hover:bg-fg/[0.04] hover:text-fg'
                    }`}
                  >
                    <Icon className="w-4 h-4 me-3 shrink-0" aria-hidden="true" />
                    {tab.name}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        <div
          id="compliance-panel"
          role="tabpanel"
          aria-labelledby={`compliance-tab-${activeTab}`}
          tabIndex={0}
          className="flex-1 min-w-0 focus-ring rounded-2xl"
        >
          {renderActive()}
        </div>
      </div>
    </div>
  );
};

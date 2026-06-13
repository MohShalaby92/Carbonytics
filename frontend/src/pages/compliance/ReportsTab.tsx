import React, { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { complianceService } from '../../services/complianceService';
import { formatEmissions } from '../../utils/calculations';
import { Download, FileText, ShieldCheck, RefreshCw, ClipboardList, Globe, Target } from 'lucide-react';

const currentYear = new Date().getFullYear();

/**
 * GHG inventory report + assurance package exports for an arbitrary reporting
 * period, with an on-screen preview of the inventory content.
 */
export const ReportsTab: React.FC = () => {
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(`${currentYear}-12-31`);
  const [report, setReport] = useState<any>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [downloading, setDownloading] = useState<'ghg' | 'assurance' | 'imp' | 'cdp' | 'sbti' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = async () => {
    try {
      setLoadingReport(true);
      setError(null);
      const data = await complianceService.getGhgInventoryReport(startDate, endDate);
      setReport(data);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load report');
      setReport(null);
    } finally {
      setLoadingReport(false);
    }
  };

  const handleDownload = async (kind: 'ghg' | 'assurance' | 'imp' | 'cdp' | 'sbti') => {
    try {
      setDownloading(kind);
      setError(null);
      if (kind === 'ghg') {
        await complianceService.downloadGhgInventoryMarkdown(startDate, endDate);
      } else if (kind === 'imp') {
        await complianceService.downloadImpMarkdown(startDate, endDate);
      } else if (kind === 'cdp') {
        await complianceService.downloadCdpMapping(startDate, endDate);
      } else if (kind === 'sbti') {
        await complianceService.downloadSbtiSummary(startDate, endDate);
      } else {
        await complianceService.downloadAssurancePackage(startDate, endDate);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Download failed');
    } finally {
      setDownloading(null);
    }
  };

  const scopes = report?.emissions?.byScope;
  const dq = report?.dataQuality;
  const scope2 = report?.emissions?.scope2Dual;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-xl font-semibold text-fg mb-1">Reporting Period</h2>
        <p className="text-sm text-muted mb-4">
          All exports below cover this period. Fiscal years and arbitrary ranges are supported.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-fg/80">Start</label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-fg/80">End</label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <Button variant="outline" onClick={loadPreview} loading={loadingReport}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Preview Inventory
          </Button>
        </div>
        {error && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-fg">GHG Inventory Report</h3>
          </div>
          <p className="text-sm text-muted mb-4">
            GHG Protocol / ISO 14064-1 content: organizational boundary and consolidation
            approach, methodology (GWP set, factor policy), emissions by scope with dual
            Scope 2 figures, category breakdown with method mix, data-quality summary,
            factor register, exclusions, targets and inventory controls.
          </p>
          <Button
            onClick={() => handleDownload('ghg')}
            loading={downloading === 'ghg'}
          >
            <Download className="w-4 h-4 mr-2" />
            Download (Markdown)
          </Button>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-fg">Assurance Package</h3>
          </div>
          <p className="text-sm text-muted mb-4">
            Verifier bundle: the inventory report plus a flat activity-data register (every
            entry with factor, source, year, GWP, method, quality and dual-Scope-2
            provenance), the audit-trail extract and snapshot history.
          </p>
          <Button
            onClick={() => handleDownload('assurance')}
            loading={downloading === 'assurance'}
          >
            <Download className="w-4 h-4 mr-2" />
            Download (JSON)
          </Button>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardList className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-fg">Inventory Management Plan</h3>
          </div>
          <p className="text-sm text-muted mb-4">
            The process document auditors ask for first: boundary, roles, methodology,
            estimation and rounding policies, QA/QC controls, DQ rubric and recalculation
            policy — generated from the live system configuration so it never drifts from
            actual behavior.
          </p>
          <Button
            onClick={() => handleDownload('imp')}
            loading={downloading === 'imp'}
          >
            <Download className="w-4 h-4 mr-2" />
            Download (Markdown)
          </Button>
        </Card>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-fg/80 mb-1">Disclosure framework mappings</h3>
        <p className="text-xs text-muted mb-4">
          Preparation aids that reshape your inventory onto external frameworks — not official
          submissions. File through each framework's own portal after review.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-5 h-5 text-primary-600" />
              <h3 className="text-lg font-semibold text-fg">CDP Climate Change</h3>
            </div>
            <p className="text-sm text-muted mb-4">
              Maps emissions onto CDP's climate modules (C0/C5/C6/C7/C10) in metric tonnes CO₂e:
              Scope 1, dual Scope 2 (location + market), Scope 3 by category with methods,
              intensity and verification status.
            </p>
            <Button onClick={() => handleDownload('cdp')} loading={downloading === 'cdp'}>
              <Download className="w-4 h-4 mr-2" />
              Download (Markdown)
            </Button>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-5 h-5 text-primary-600" />
              <h3 className="text-lg font-semibold text-fg">SBTi Target Readiness</h3>
            </div>
            <p className="text-sm text-muted mb-4">
              Frames your inventory and targets against SBTi near-term criteria: Scope 1+2 and
              Scope 3 share (the ≥40% Scope 3 rule), implied annual linear reduction vs the
              ~4.2%/yr 1.5°C minimum, and readiness next steps.
            </p>
            <Button onClick={() => handleDownload('sbti')} loading={downloading === 'sbti'}>
              <Download className="w-4 h-4 mr-2" />
              Download (Markdown)
            </Button>
          </Card>
        </div>
      </div>

      {report && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-fg mb-4">
            Inventory Preview — {report.organization?.name}
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-3 bg-fg/[0.04] rounded-lg">
              <p className="text-xs text-muted">Total</p>
              <p className="text-lg font-bold text-fg">
                {formatEmissions(scopes?.total || 0)}
              </p>
            </div>
            {[1, 2, 3].map((s) => (
              <div key={s} className="p-3 bg-fg/[0.04] rounded-lg">
                <p className="text-xs text-muted">Scope {s}</p>
                <p className="text-lg font-bold text-fg">
                  {formatEmissions(scopes?.[`scope${s}`] || 0)}
                </p>
              </div>
            ))}
          </div>

          {scope2 && (
            <div className="mb-6 p-3 bg-sky-500/10 border border-sky-500/25 rounded-lg text-sm text-sky-700 dark:text-sky-300">
              <p className="font-medium mb-1">Scope 2 dual reporting</p>
              <p>
                Location-based: {formatEmissions(scope2.locationBased || 0)} · Market-based:{' '}
                {formatEmissions(scope2.marketBased || 0)}
              </p>
            </div>
          )}

          {report.intensity && (
            <div className="mb-6 p-3 bg-fg/[0.04] rounded-lg text-sm">
              <p className="font-medium text-fg mb-1">
                Intensity metrics ({report.intensity.year})
              </p>
              {report.intensity.metrics?.length > 0 ? (
                <div className="space-y-0.5">
                  {report.intensity.metrics.map((m: any, i: number) => (
                    <p key={i} className="text-muted">
                      <span className="text-fg/80">{m.label}</span>:{' '}
                      {m.intensityKgCo2ePerUnit} kg CO₂e per {m.denominatorUnit}{' '}
                      <span className="text-xs">
                        (denominator {m.denominatorValue.toLocaleString()} {m.denominatorUnit})
                      </span>
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-muted text-xs">{report.intensity.note}</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <p className="font-medium text-fg">Methodology</p>
              <p className="text-muted">
                GWP set: <span className="text-fg/80">{report.methodology?.gwpSet}</span>
              </p>
              <p className="text-muted">
                Consolidation:{' '}
                <span className="text-fg/80">
                  {report.organization?.consolidationApproach?.replace(/_/g, ' ')}
                </span>
              </p>
              <p className="text-muted">
                Facilities: <span className="text-fg/80">{report.organization?.facilities?.length ?? 0}</span>
                {' · '}Exclusions: <span className="text-fg/80">{report.exclusions?.length ?? 0}</span>
              </p>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-fg">Data quality</p>
              <p className="text-muted">
                Weighted DQ score:{' '}
                <span className="text-fg/80">{dq?.weightedDqScore ?? '—'} / 5 (1 = best)</span>
              </p>
              <p className="text-muted">
                Estimated data:{' '}
                <span className="text-fg/80">
                  {dq?.estimates?.count ?? 0} entries · {dq?.estimates?.emissionsShare ?? 0}% of emissions
                </span>
              </p>
              <p className="text-muted">
                Locked calculations:{' '}
                <span className="text-fg/80">{report.inventoryControls?.lockedCalculations ?? 0}</span>
                {' · '}Audit entries:{' '}
                <span className="text-fg/80">{report.inventoryControls?.auditTrailEntriesInPeriod ?? 0}</span>
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

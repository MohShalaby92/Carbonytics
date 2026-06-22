import React, { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { FileUpload } from '../components/forms/FileUpload';
import { Alert } from '../components/ui/Alert';
import { apiService } from '../services/api';
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  ListChecks,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

const downloadBlob = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Defer revoke: revoking the object URL in the same tick as click() can cancel
  // the download in some browsers (older Safari/Firefox, larger blobs).
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
};

const EXPORT_INCLUDES = [
  'Category, scope, period, facility, title',
  'Activity value & unit',
  'Emissions (kg CO₂e)',
  'Factor name, value, source, year & pinned version',
  'Method, GWP set, data-quality score',
  'Scope-2 location/market, biogenic, per-gas',
  'Material-balance & supplier provenance',
  'Status, verification, calculation id',
];

export const ImportExportPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import');
  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [filters, setFilters] = useState({ startDate: '', endDate: '', scopes: [] as number[], status: '' });
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleImportSuccess = (result: any) => {
    setMessage({
      type: 'success',
      text: `Imported ${result.successful} row(s) into ${result.createdCalculations} calculation(s).`,
    });
  };
  const handleImportError = (error: string) => setMessage({ type: 'error', text: error });

  const handleExport = async () => {
    setExporting(true);
    setMessage(null);
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.scopes.length > 0) params.append('scopes', filters.scopes.join(','));
      if (filters.status) params.append('status', filters.status);
      params.append('format', format);

      const blob = await apiService.getBlob(`/csv/export?${params.toString()}`);
      downloadBlob(blob, `carbonytics_emissions_${Date.now()}.${format}`);
      setMessage({ type: 'success', text: `Export downloaded as ${format.toUpperCase()}.` });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Export failed' });
    } finally {
      setExporting(false);
    }
  };

  const toggleScope = (scope: number) =>
    setFilters((prev) => ({
      ...prev,
      scopes: prev.scopes.includes(scope) ? prev.scopes.filter((s) => s !== scope) : [...prev.scopes, scope],
    }));

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <img src="/icon.png" alt="Carbonytics" className="w-8 h-8" />
        <h1 className="text-3xl font-bold text-fg">Import &amp; Export Data</h1>
      </div>
      <p className="mb-8 text-muted">
        Move activity data in and out of the calculator. Imports are recomputed by the same engine the
        calculator uses — with full provenance and a preview of every row before anything is saved.
      </p>

      {message && (
        <Alert variant={message.type === 'success' ? 'success' : 'error'} className="mb-6">
          {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{message.text}</span>
        </Alert>
      )}

      {/* Tabs */}
      <div className="flex space-x-1 bg-fg/[0.06] p-1 rounded-lg mb-8 w-fit">
        {([
          { key: 'import', label: 'Import Data', icon: Upload },
          { key: 'export', label: 'Export Data', icon: Download },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === t.key ? 'bg-surface text-primary-600 shadow-sm' : 'text-muted hover:text-fg'
            }`}
          >
            <t.icon className="w-4 h-4" />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Import */}
      {activeTab === 'import' && (
        <div className="space-y-6">
          <Card className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { n: 1, t: 'Download the template', d: 'A guided Excel workbook with dropdowns, examples and your live factor library.' },
                { n: 2, t: 'Fill the Activity Data sheet', d: 'One activity per row. Leave Factor Code blank to use the Egyptian-default factor.' },
                { n: 3, t: 'Validate, then import', d: 'Preview each row’s resolved factor and emissions, then import with one click.' },
              ].map((s, i) => (
                <div key={s.n} className="flex gap-3">
                  <div className="shrink-0 w-7 h-7 rounded-full bg-primary-500/10 text-primary-600 font-semibold flex items-center justify-center">{s.n}</div>
                  <div>
                    <p className="font-medium text-fg flex items-center gap-1">{s.t}{i < 2 && <ArrowRight className="w-3.5 h-3.5 text-muted hidden sm:inline" />}</p>
                    <p className="text-sm text-muted">{s.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <FileUpload onUploadSuccess={handleImportSuccess} onUploadError={handleImportError} accept=".xlsx,.xls,.csv" maxSize={10} />
        </div>
      )}

      {/* Export */}
      {activeTab === 'export' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6">
              <div className="flex items-start gap-3 mb-6">
                <div className="p-2 rounded-lg bg-primary-500/10"><Download className="w-5 h-5 text-primary-600" /></div>
                <div>
                  <h2 className="text-xl font-semibold text-fg">Export your data</h2>
                  <p className="text-sm text-muted">
                    A complete, audit-ready record. The leading columns match the import template, so you can
                    edit an export and re-import it.
                  </p>
                </div>
              </div>

              {/* Format */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-fg mb-2">Format</h3>
                <div className="inline-flex rounded-lg border border-line overflow-hidden">
                  {(['xlsx', 'csv'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFormat(f)}
                      className={`px-4 py-2 text-sm font-medium flex items-center gap-1.5 ${
                        format === f ? 'bg-primary-600 text-white' : 'bg-surface text-muted hover:text-fg'
                      }`}
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      {f === 'xlsx' ? 'Excel (branded)' : 'CSV'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date range */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-fg mb-3">Reporting period</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-fg/80 mb-1">Start date</label>
                    <input type="date" value={filters.startDate} onChange={(e) => setFilters((p) => ({ ...p, startDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-line rounded-md bg-surface focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-fg/80 mb-1">End date</label>
                    <input type="date" value={filters.endDate} onChange={(e) => setFilters((p) => ({ ...p, endDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-line rounded-md bg-surface focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                </div>
              </div>

              {/* Scopes + status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                <div>
                  <h3 className="text-sm font-medium text-fg mb-3">Scopes</h3>
                  <div className="space-y-2">
                    {[1, 2, 3].map((scope) => (
                      <label key={scope} className="flex items-center">
                        <input type="checkbox" checked={filters.scopes.includes(scope)} onChange={() => toggleScope(scope)}
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-line rounded" />
                        <span className="ml-2 text-sm text-fg/80">
                          Scope {scope} — {scope === 1 ? 'Direct' : scope === 2 ? 'Indirect (energy)' : 'Value chain'}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted mt-2">Leave empty for all scopes.</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-fg mb-3">Status</h3>
                  <Select value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
                    <option value="">All statuses</option>
                    <option value="draft">Draft</option>
                    <option value="completed">Completed</option>
                    <option value="verified">Verified</option>
                    <option value="locked">Locked (published)</option>
                  </Select>
                  <p className="text-xs text-muted mt-2">Locked &amp; verified data is included by default.</p>
                </div>
              </div>

              <Button onClick={handleExport} loading={exporting} disabled={exporting} className="w-full">
                {exporting ? 'Generating…' : `Export ${format.toUpperCase()}`}
              </Button>
            </Card>
          </div>

          {/* What's included */}
          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-fg mb-1 flex items-center gap-2">
                <ListChecks className="w-5 h-5 text-primary-600" /> What's included
              </h3>
              <p className="text-sm text-muted mb-3">Every stored data point, one row per entry:</p>
              <ul className="space-y-1.5 text-sm text-fg/80">
                {EXPORT_INCLUDES.map((x) => (
                  <li key={x} className="flex items-start gap-2">
                    <CheckCircle className="w-3.5 h-3.5 mt-0.5 text-green-500 shrink-0" />
                    {x}
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-5 bg-primary-500/[0.04] border-primary-500/20">
              <div className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 mt-0.5 text-primary-600 shrink-0" />
                <p className="text-sm text-fg/80">
                  <span className="font-medium text-fg">Round-trip:</span> export, edit the values, and re-import.
                  Validation flags anything that already exists so you choose what to bring back in.
                </p>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};

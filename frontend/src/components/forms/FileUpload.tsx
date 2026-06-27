import React, { useState, useRef } from 'react';
import {
  Upload,
  File,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Download,
  Copy,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Alert } from '../ui/Alert';
import { apiService } from '../../services/api';

interface FileUploadProps {
  onUploadSuccess?: (result: any) => void;
  onUploadError?: (error: string) => void;
  accept?: string;
  maxSize?: number; // in MB
  className?: string;
}

interface ImportWarning {
  type: string;
  rows: number[];
  message: string;
}

interface PreviewRow {
  rowNumber: number;
  category?: string;
  scope?: number;
  factor?: string;
  factorSource?: string;
  facility?: string;
  value?: number;
  unit?: string;
  emissions?: number;
  dqScore?: number;
  isEstimate: boolean;
  duplicate: boolean;
  errors: string[];
}

interface PreviewResult {
  valid: boolean;
  rowCount: number;
  errors: string[];
  warnings?: ImportWarning[];
  duplicateCount: number;
  rows: PreviewRow[];
}

interface ImportRowResult {
  rowNumber: number;
  status: 'imported' | 'failed' | 'skipped';
  category?: string;
  emissions?: number;
  error?: string;
}

interface ImportResult {
  processed: number;
  successful: number;
  failed: number;
  skipped: number;
  createdCalculations: number;
  rows: ImportRowResult[];
  errors: { row: number; error: string }[];
}

const WARNING_LABEL: Record<string, string> = {
  duplicate: 'Possible duplicate (within file)',
  outlier: 'Outlier vs prior period',
  'spend-double-count': 'Spend double-counting risk',
  'duplicate-header': 'Duplicate column',
};

const fmtNum = (n?: number) =>
  n === undefined || n === null ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: 2 });

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

export const FileUpload: React.FC<FileUploadProps> = ({
  onUploadSuccess,
  onUploadError,
  accept = '.xlsx,.xls,.csv',
  maxSize = 10,
  className = '',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [validation, setValidation] = useState<PreviewResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleFileSelection(files[0]);
  };

  const handleFileSelection = (file: File) => {
    const name = file.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.csv') && !name.endsWith('.xls')) {
      onUploadError?.('Please select an Excel (.xlsx) or CSV file');
      return;
    }
    if (file.size > maxSize * 1024 * 1024) {
      onUploadError?.(`File size must be less than ${maxSize}MB`);
      return;
    }
    setSelectedFile(file);
    setValidation(null);
    setImportResult(null);
    setSkipDuplicates(false);
  };

  const downloadTemplate = async (format: 'xlsx' | 'csv') => {
    setDownloading(true);
    try {
      const blob = await apiService.getBlob(`/csv/template?format=${format}`);
      downloadBlob(blob, `carbonytics_import_template.${format}`);
    } catch {
      onUploadError?.('Failed to download template');
    } finally {
      setDownloading(false);
    }
  };

  const validateFile = async () => {
    if (!selectedFile) return;
    setValidating(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      // postForm so the multipart Content-Type (with boundary) is set.
      const response = await apiService.postForm('/csv/validate', formData);
      setValidation((response.data as { validation: PreviewResult }).validation);
    } catch (error: any) {
      onUploadError?.(error.response?.data?.message || 'Validation failed');
    } finally {
      setValidating(false);
    }
  };

  const importFile = async () => {
    if (!selectedFile || !validation) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('skipDuplicates', String(skipDuplicates));
      const response = await apiService.postForm('/csv/import', formData);
      const result = (response.data as { result: ImportResult }).result;
      setImportResult(result);
      onUploadSuccess?.(result);
    } catch (error: any) {
      onUploadError?.(error.response?.data?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const resetUpload = () => {
    setSelectedFile(null);
    setValidation(null);
    setImportResult(null);
    setSkipDuplicates(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const importableCount = validation ? validation.rows.filter((r) => r.errors.length === 0).length : 0;
  const errorCount = validation ? validation.rows.filter((r) => r.errors.length > 0).length : 0;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Template Download */}
      <Card className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary-500/10">
              <FileSpreadsheet className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h3 className="font-semibold text-fg">Start with the template</h3>
              <p className="text-sm text-muted">
                A guided Excel workbook with dropdowns, a worked example, and your live category &amp;
                factor reference. Fill the <strong>Activity Data</strong> sheet, then upload it below.
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button onClick={() => downloadTemplate('xlsx')} loading={downloading} className="flex items-center gap-2">
              <Download className="w-4 h-4" />
              Excel template
            </Button>
            <Button variant="outline" onClick={() => downloadTemplate('csv')} disabled={downloading} className="flex items-center gap-2">
              CSV
            </Button>
          </div>
        </div>
      </Card>

      {/* File Upload Area */}
      <Card className="p-6">
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragging ? 'border-primary-500 bg-primary-500/5' : 'border-line hover:border-primary-500/40'
          }`}
        >
          <Upload className="w-12 h-12 text-muted mx-auto mb-4" />
          {selectedFile ? (
            <div className="space-y-2">
              <div className="flex items-center justify-center space-x-2">
                <File className="w-5 h-5 text-primary-600" />
                <span className="font-medium text-fg">{selectedFile.name}</span>
              </div>
              <p className="text-sm text-muted">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
              <Button variant="ghost" size="sm" onClick={resetUpload} className="text-muted">
                Choose different file
              </Button>
            </div>
          ) : (
            <>
              <h3 className="text-lg font-medium text-fg mb-2">Upload your file</h3>
              <p className="text-muted mb-4">Drag &amp; drop an Excel (.xlsx) or CSV file here, or browse</p>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>Choose File</Button>
            </>
          )}
          <input ref={fileInputRef} type="file" accept={accept} onChange={(e) => e.target.files?.[0] && handleFileSelection(e.target.files[0])} className="hidden" />
        </div>

        {selectedFile && !validation && (
          <div className="mt-4 flex justify-center">
            <Button onClick={validateFile} loading={validating} disabled={validating}>
              {validating ? 'Checking…' : 'Validate & preview'}
            </Button>
          </div>
        )}
      </Card>

      {/* Validation / Preview */}
      {validation && !importResult && (
        <Card className="p-6">
          <h3 className="font-semibold text-fg mb-1">Preview</h3>
          <p className="text-sm text-muted mb-4">
            Exactly what each row will produce — resolved factor and computed emissions — before anything is saved.
          </p>

          {/* Empty file — explain rather than show a dead-end empty preview */}
          {validation.rowCount === 0 && (
            <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-sm text-amber-800 dark:text-amber-300">
              No data rows were found in this file. Put your activity on the <strong>Activity Data</strong> sheet
              (data starts at row 2, just below the headers), then validate again.
            </div>
          )}

          {/* Summary chips */}
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm bg-green-500/10 text-green-700 dark:text-green-300">
              <CheckCircle className="w-4 h-4" /> {importableCount} ready to import
            </span>
            {errorCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm bg-red-500/10 text-red-700 dark:text-red-300">
                <AlertCircle className="w-4 h-4" /> {errorCount} with errors
              </span>
            )}
            {validation.duplicateCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm bg-amber-500/10 text-amber-700 dark:text-amber-300">
                <Copy className="w-4 h-4" /> {validation.duplicateCount} already in your data
              </span>
            )}
          </div>

          {/* Blocking errors */}
          {validation.errors.length > 0 && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/25">
              <h4 className="font-medium text-red-800 dark:text-red-300 mb-1.5">Rows with errors (these are skipped on import):</h4>
              <ul className="text-sm text-red-700 dark:text-red-300 space-y-1 max-h-32 overflow-y-auto">
                {validation.errors.slice(0, 12).map((e, i) => <li key={i}>• {e}</li>)}
                {validation.errors.length > 12 && <li className="text-muted">… and {validation.errors.length - 12} more</li>}
              </ul>
            </div>
          )}

          {/* Advisory warnings */}
          {validation.warnings && validation.warnings.length > 0 && (
            <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/25">
              <h4 className="font-medium text-amber-800 dark:text-amber-300 mb-1.5 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" /> Data-quality warnings ({validation.warnings.length}) — advisory
              </h4>
              <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
                {validation.warnings.map((w, i) => (
                  <li key={i}><span className="font-medium">{WARNING_LABEL[w.type] || w.type}:</span> {w.message}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Per-row preview table */}
          {validation.rowCount > 0 && (
          <div className="overflow-x-auto border border-line rounded-lg mb-4">
            <table className="min-w-full text-sm">
              <thead className="bg-fg/[0.04] text-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">#</th>
                  <th className="px-3 py-2 text-left font-medium">Category</th>
                  <th className="px-3 py-2 text-left font-medium">Factor</th>
                  <th className="px-3 py-2 text-right font-medium">Activity</th>
                  <th className="px-3 py-2 text-right font-medium">Emissions (kg CO₂e)</th>
                  <th className="px-3 py-2 text-center font-medium">DQ</th>
                  <th className="px-3 py-2 text-left font-medium">Flags</th>
                </tr>
              </thead>
              <tbody>
                {validation.rows.map((r) => {
                  const hasError = r.errors.length > 0;
                  return (
                    <tr key={r.rowNumber} className={`border-t border-line ${hasError ? 'bg-red-500/[0.04]' : ''}`}>
                      <td className="px-3 py-2 text-muted">{r.rowNumber}</td>
                      <td className="px-3 py-2">
                        {r.category ? (
                          <span className="text-fg">{r.scope ? `S${r.scope} · ` : ''}{r.category}</span>
                        ) : (
                          <span className="text-red-600 dark:text-red-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-fg/80">
                        {r.factor || '—'}
                        {r.factorSource && <span className="block text-xs text-muted">{r.factorSource}</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-fg/80">{r.value !== undefined ? `${fmtNum(r.value)} ${r.unit || ''}` : '—'}</td>
                      <td className="px-3 py-2 text-right font-medium text-fg">{hasError ? '—' : fmtNum(r.emissions)}</td>
                      <td className="px-3 py-2 text-center text-fg/80">{r.dqScore ?? '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {hasError && <span className="px-1.5 py-0.5 rounded text-xs bg-red-500/15 text-red-700 dark:text-red-300" title={r.errors.join('; ')}>error</span>}
                          {r.isEstimate && <span className="px-1.5 py-0.5 rounded text-xs bg-sky-500/15 text-sky-700 dark:text-sky-300">estimate</span>}
                          {r.duplicate && <span className="px-1.5 py-0.5 rounded text-xs bg-amber-500/15 text-amber-700 dark:text-amber-300">duplicate</span>}
                          {!hasError && !r.isEstimate && !r.duplicate && <span className="px-1.5 py-0.5 rounded text-xs bg-green-500/15 text-green-700 dark:text-green-300">ready</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}

          {/* Duplicate decision */}
          {validation.duplicateCount > 0 && (
            <label className="flex items-center gap-2 mb-4 text-sm text-fg/90 cursor-pointer">
              <input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} className="rounded border-line" />
              Skip the {validation.duplicateCount} row(s) flagged as already in your data
            </label>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={importFile} loading={importing} disabled={importing || importableCount === 0} className="bg-green-600 hover:bg-green-700">
              {importing ? 'Importing…' : `Import ${skipDuplicates ? Math.max(0, importableCount - validation.duplicateCount) : importableCount} row(s)`}
            </Button>
            <Button variant="ghost" onClick={resetUpload}>Cancel</Button>
          </div>
        </Card>
      )}

      {/* Import Results */}
      {importResult && (
        <Card className="p-6">
          <h3 className="font-semibold text-fg mb-4">Import complete</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            {[
              { label: 'Imported', value: importResult.successful, cls: 'text-green-600 dark:text-green-400' },
              { label: 'Calculations', value: importResult.createdCalculations, cls: 'text-primary-600' },
              { label: 'Skipped', value: importResult.skipped, cls: 'text-amber-600 dark:text-amber-400' },
              { label: 'Failed', value: importResult.failed, cls: 'text-red-600 dark:text-red-400' },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className={`text-2xl font-bold ${s.cls}`}>{s.value}</div>
                <div className="text-sm text-muted">{s.label}</div>
              </div>
            ))}
          </div>

          {importResult.successful > 0 && (
            <Alert variant="success" className="mb-4">
              <CheckCircle className="w-4 h-4" />
              <span>Imported {importResult.successful} row(s) into {importResult.createdCalculations} calculation(s).</span>
            </Alert>
          )}

          {importResult.errors && importResult.errors.length > 0 && (
            <div className="mb-2">
              <h4 className="font-medium text-red-800 dark:text-red-300 mb-1.5">Rows not imported:</h4>
              <ul className="text-sm text-red-700 dark:text-red-300 space-y-1 max-h-40 overflow-y-auto">
                {importResult.errors.slice(0, 15).map((e, i) => <li key={i}>Row {e.row}: {e.error}</li>)}
                {importResult.errors.length > 15 && <li className="text-muted">… and {importResult.errors.length - 15} more</li>}
              </ul>
            </div>
          )}

          <div className="mt-4 flex justify-center">
            <Button onClick={resetUpload} variant="outline">Import another file</Button>
          </div>
        </Card>
      )}
    </div>
  );
};

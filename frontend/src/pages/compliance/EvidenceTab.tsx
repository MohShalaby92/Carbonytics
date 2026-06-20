import React, { useEffect, useRef, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { calculationService } from '../../services/calculationService';
import { complianceService } from '../../services/complianceService';
import { EvidenceList, EvidenceItem } from '../../types';
import { format } from 'date-fns';
import { Paperclip, Download, Trash2, FileCheck2, Lock } from 'lucide-react';

/**
 * Evidence attachments per data line (§4.3): attach an invoice / meter photo /
 * supplier letter to a specific calculation entry so a verifier can trace any
 * reported number to its source document. Files are stored in GridFS.
 */
const fmtSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

export const EvidenceTab: React.FC = () => {
  const [calculations, setCalculations] = useState<any[]>([]);
  const [selectedCalcId, setSelectedCalcId] = useState('');
  const [evidence, setEvidence] = useState<EvidenceList | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyEntry, setBusyEntry] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});
  const descInputs = useRef<Record<number, HTMLInputElement | null>>({});

  useEffect(() => {
    calculationService
      .getCalculations({ limit: 100 })
      .then((data: any) => setCalculations(Array.isArray(data) ? data : []))
      .catch(() => setCalculations([]));
  }, []);

  const selectedCalc = calculations.find((c) => (c.id || c._id) === selectedCalcId);
  const isLocked = selectedCalc?.status === 'locked';

  const loadEvidence = (calcId: string) => {
    setLoading(true);
    setError(null);
    complianceService
      .listEvidence(calcId)
      .then(setEvidence)
      .catch((err: any) => setError(err?.response?.data?.message || err?.message || 'Failed to load evidence'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setEvidence(null);
    if (selectedCalcId) loadEvidence(selectedCalcId);
  }, [selectedCalcId]);

  const handleUpload = async (entryIndex: number) => {
    const input = fileInputs.current[entryIndex];
    const file = input?.files?.[0];
    if (!file) {
      setError('Choose a file first.');
      return;
    }
    try {
      setBusyEntry(entryIndex);
      setError(null);
      await complianceService.uploadEvidence(
        selectedCalcId,
        entryIndex,
        file,
        descInputs.current[entryIndex]?.value || undefined
      );
      if (input) input.value = '';
      if (descInputs.current[entryIndex]) descInputs.current[entryIndex]!.value = '';
      loadEvidence(selectedCalcId);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Upload failed');
    } finally {
      setBusyEntry(null);
    }
  };

  const handleDelete = async (item: EvidenceItem) => {
    if (!window.confirm(`Delete evidence "${item.filename}"?`)) return;
    try {
      setError(null);
      await complianceService.deleteEvidence(item.id);
      loadEvidence(selectedCalcId);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Delete failed');
    }
  };

  const evidenceFor = (entryIndex: number) =>
    (evidence?.evidence || []).filter((e) => e.entryIndex === entryIndex);

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-2">
        <FileCheck2 className="w-5 h-5 text-primary-600" />
        <h2 className="text-xl font-semibold text-fg">Evidence Attachments</h2>
      </div>
      <p className="text-sm text-muted mb-4">
        Attach supporting documents (invoice PDF, meter photo, supplier letter) to each calculation
        data line. Evidence is stored securely and surfaced in the assurance package so a verifier can
        trace any number to its source.
      </p>

      <div className="space-y-1 mb-4">
        <label className="block text-xs font-medium text-fg/80">Calculation</label>
        <Select value={selectedCalcId} onChange={(e) => setSelectedCalcId(e.target.value)}>
          <option value="">Select a calculation…</option>
          {calculations.map((calc: any) => {
            const id = calc.id || calc._id;
            return (
              <option key={id} value={id}>
                {calc.title} ({calc.status}
                {calc.createdAt ? `, ${format(new Date(calc.createdAt), 'MMM dd yyyy')}` : ''})
              </option>
            );
          })}
        </Select>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {selectedCalc && (
        <>
          {isLocked && (
            <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/25 rounded-lg text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              This calculation is locked (published). You can still attach assurance evidence, but
              existing evidence cannot be deleted while it is locked.
            </div>
          )}

          {loading ? (
            <p className="text-sm text-muted py-4 text-center">Loading evidence…</p>
          ) : (
            <div className="space-y-3">
              {(selectedCalc.data || []).map((entry: any, idx: number) => {
                const items = evidenceFor(idx);
                return (
                  <div key={idx} className="p-4 border border-line rounded-lg">
                    <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                      <div className="text-sm">
                        <span className="font-semibold text-fg">Line {idx + 1}</span>
                        <span className="text-fg/70">
                          {' '}
                          — {entry.value?.toLocaleString()} {entry.unit} → {entry.emissions?.toLocaleString()} kg CO₂e
                        </span>
                        <div className="text-xs text-muted mt-0.5">
                          {entry.factorName || 'factor'} {entry.method ? `· ${entry.method}` : ''}
                        </div>
                      </div>
                      <span className="shrink-0 px-2 py-0.5 text-xs font-semibold rounded-full bg-primary-500/15 text-primary-700 dark:text-primary-300">
                        {items.length} file{items.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    {items.length > 0 && (
                      <ul className="space-y-1.5 mb-3">
                        {items.map((item) => (
                          <li
                            key={item.id}
                            className="flex items-center justify-between gap-3 p-2 bg-fg/[0.04] rounded text-sm"
                          >
                            <div className="min-w-0">
                              <span className="text-fg/90 truncate">{item.filename}</span>
                              <span className="text-xs text-muted ml-2">
                                {fmtSize(item.size)} · {item.uploadedByEmail}
                                {item.description ? ` · ${item.description}` : ''}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => complianceService.downloadEvidence(item)}
                                className="p-1.5 rounded hover:bg-fg/[0.08] text-fg/70"
                                title="Download"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                              {!isLocked && (
                                <button
                                  onClick={() => handleDelete(item)}
                                  className="p-1.5 rounded hover:bg-red-500/10 text-red-600 dark:text-red-400"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Hidden native input; the branded button below is the single
                          control — it opens the picker and uploads on selection. */}
                      <input
                        ref={(el) => {
                          fileInputs.current[idx] = el;
                        }}
                        type="file"
                        className="hidden"
                        onChange={() => handleUpload(idx)}
                      />
                      <input
                        ref={(el) => {
                          descInputs.current[idx] = el;
                        }}
                        type="text"
                        placeholder="Description (optional)"
                        className="flex-1 min-w-[8rem] px-2 py-1 text-xs rounded border border-line bg-transparent text-fg/90"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => fileInputs.current[idx]?.click()}
                        loading={busyEntry === idx}
                        disabled={busyEntry !== null}
                      >
                        <Paperclip className="w-3.5 h-3.5 mr-1" />
                        Attach file
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </Card>
  );
};

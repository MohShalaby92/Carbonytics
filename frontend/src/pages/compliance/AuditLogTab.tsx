import React, { useCallback, useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { complianceService } from '../../services/complianceService';
import { AuditLogEntry } from '../../types';
import { format } from 'date-fns';
import { ScrollText, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';

const RESOURCE_TYPES = [
  { value: '', label: 'All resources' },
  { value: 'calculation', label: 'Calculations' },
  { value: 'emission-factor', label: 'Emission factors' },
  { value: 'facility', label: 'Facilities' },
  { value: 'organization', label: 'Organization' },
  { value: 'organization-settings', label: 'Settings' },
  { value: 'organization-exclusions', label: 'Exclusions' },
  { value: 'organization-targets', label: 'Targets' },
];

const ACTION_BADGE: Record<string, string> = {
  create: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
  update: 'bg-sky-500/15 text-sky-800 dark:text-sky-300',
  delete: 'bg-red-500/15 text-red-800 dark:text-red-300',
  lock: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  unlock: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  import: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
};

/** Append-only audit trail viewer (admin): who did what, when, before → after. */
export const AuditLogTab: React.FC = () => {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [resourceType, setResourceType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async (pageNum: number, type: string) => {
    try {
      setLoading(true);
      setError(null);
      const result = await complianceService.getAuditLog({
        page: pageNum,
        limit: 25,
        ...(type ? { resourceType: type } : {}),
      });
      setEntries(result.entries);
      setPages(result.pagination?.pages || 1);
      setTotal(result.pagination?.total || result.entries.length);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(page, resourceType);
  }, [page, resourceType, load]);

  const handleFilterChange = (type: string) => {
    setResourceType(type);
    setPage(1);
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <ScrollText className="w-5 h-5 text-emphasis" />
          <h2 className="text-xl font-semibold text-fg">Audit Trail</h2>
        </div>
        <div className="w-48">
          <Select aria-label="Filter by resource type" value={resourceType} onChange={(e) => handleFilterChange(e.target.value)}>
            {RESOURCE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
        </div>
      </div>
      <p className="text-sm text-muted mb-4">
        Append-only record of every methodology-relevant change: calculations, locks, factors,
        settings, exclusions, facilities and imports. {total > 0 && `${total} entries.`}
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-sm text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted py-6 text-center">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted py-6 text-center">No audit entries.</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const expanded = expandedId === entry.id;
            const hasDetail = entry.before || entry.after || entry.comment;
            return (
              <div key={entry.id} className="border border-line rounded-lg">
                <button
                  className="w-full flex items-center justify-between p-3 text-start hover:bg-fg/[0.03] transition-colors"
                  onClick={() => setExpandedId(expanded ? null : entry.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`shrink-0 px-2 py-0.5 text-xs font-semibold rounded-full ${
                        ACTION_BADGE[entry.action] || 'bg-fg/[0.06] text-fg/70'
                      }`}
                    >
                      {entry.action}
                    </span>
                    <span className="text-sm text-fg/90 truncate">
                      {entry.resourceType}
                      {entry.resourceId ? ` · ${entry.resourceId.slice(-6)}` : ''}
                    </span>
                    <span className="text-xs text-muted truncate hidden sm:inline">
                      {entry.userEmail}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ms-3">
                    <span className="text-xs text-muted whitespace-nowrap">
                      {format(new Date(entry.createdAt), 'MMM dd, yyyy HH:mm')}
                    </span>
                    {hasDetail &&
                      (expanded ? (
                        <ChevronUp className="w-4 h-4 text-muted" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted" />
                      ))}
                  </div>
                </button>
                {expanded && hasDetail && (
                  <div className="px-3 pb-3 text-xs space-y-2 border-t border-line/50 pt-2">
                    {entry.comment && (
                      <p className="text-fg/80">
                        <span className="font-medium">Comment:</span> {entry.comment}
                      </p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {entry.before && (
                        <div>
                          <p className="font-medium text-fg/80 mb-1">Before</p>
                          <pre className="p-2 bg-fg/[0.04] rounded overflow-x-auto text-[11px] leading-relaxed max-h-48 overflow-y-auto">
                            {JSON.stringify(entry.before, null, 2)}
                          </pre>
                        </div>
                      )}
                      {entry.after && (
                        <div>
                          <p className="font-medium text-fg/80 mb-1">After</p>
                          <pre className="p-2 bg-fg/[0.04] rounded overflow-x-auto text-[11px] leading-relaxed max-h-48 overflow-y-auto">
                            {JSON.stringify(entry.after, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="w-4 h-4 me-1" /> Previous
          </Button>
          <span className="text-sm text-muted">
            Page {page} of {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next <ChevronRight className="w-4 h-4 ms-1" />
          </Button>
        </div>
      )}
    </Card>
  );
};

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Shield } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { esbApi } from '../api/esb-api';

interface AuditEvent {
  id: string;
  routeName: string;
  correlationId: string;
  method: string;
  path: string;
  sourceIp: string;
  statusCode: number;
  durationMs: number;
  timestamp: string;
}

function StatusBadge({ code }: { code: number }) {
  if (code >= 500) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">
        {code}
      </span>
    );
  }
  if (code >= 400) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-yellow-100 text-yellow-700">
        {code}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700">
      {code}
    </span>
  );
}

export default function AuditPage() {
  const [events, setEvents]   = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    try {
      const res = await esbApi.getAuditLog(100);
      setEvents(res.data);
    } catch {
      // silently ignore — backend may not be up yet
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + auto-refresh every 3 seconds
  useEffect(() => {
    fetchAudit();
    const timer = setInterval(fetchAudit, 3_000);
    return () => clearInterval(timer);
  }, [fetchAudit]);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1e3a8a] flex items-center gap-2">
            <Shield className="w-6 h-6" />
            Audit Log
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {events.length} event{events.length !== 1 ? 's' : ''} — refreshes every 3 s
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={<RefreshCw className="w-4 h-4" />}
          loading={loading}
          onClick={fetchAudit}
        >
          Refresh
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                {['Correlation ID', 'Route', 'Method', 'Path', 'Status', 'Duration', 'Time'].map(h => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/70"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((e, idx) => (
                <tr
                  key={e.id}
                  className={`border-b border-slate-50 hover:bg-blue-50/30 transition-colors ${
                    idx === events.length - 1 ? 'border-0' : ''
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-xs text-slate-500 max-w-[160px] truncate">
                    {e.correlationId}
                  </td>
                  <td className="px-4 py-3 font-semibold text-[#1e3a8a] text-xs">
                    {e.routeName}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-bold text-white bg-blue-500 rounded px-1.5 py-0.5">
                      {e.method}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500 max-w-[200px] truncate">
                    {e.path}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge code={e.statusCode} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {e.durationMs} ms
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                    {new Date(e.timestamp).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-14 text-center text-slate-400 text-sm">
                    No audit events yet — make an API call to see entries here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

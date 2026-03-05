import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Search, Radio, Filter } from 'lucide-react';
import { useRoutes } from '../hooks/useRoutes';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { LogLevelBadge } from '../components/ui/Badge';
import type { LogEntry, LogLevel } from '../types';

const MOCK_LOGS: LogEntry[] = [
  { id: '1',  timestamp: '2026-03-04T10:42:01.123Z', correlationId: 'CID-001-abc', route: 'customer-create-route',  level: 'INFO',  message: 'Route started processing incoming request' },
  { id: '2',  timestamp: '2026-03-04T10:42:01.245Z', correlationId: 'CID-001-abc', route: 'customer-create-route',  level: 'DEBUG', message: 'Applying Jolt transform to request payload' },
  { id: '3',  timestamp: '2026-03-04T10:42:01.890Z', correlationId: 'CID-001-abc', route: 'customer-create-route',  level: 'INFO',  message: 'SOAP call to createCustomer completed in 645ms' },
  { id: '4',  timestamp: '2026-03-04T10:42:02.010Z', correlationId: 'CID-001-abc', route: 'customer-create-route',  level: 'INFO',  message: 'Response transform applied, returning 200 OK to caller' },
  { id: '5',  timestamp: '2026-03-04T10:43:15.001Z', correlationId: 'CID-002-def', route: 'order-lookup-route',     level: 'INFO',  message: 'Route started processing GET /v1/orders/{id}' },
  { id: '6',  timestamp: '2026-03-04T10:43:15.444Z', correlationId: 'CID-002-def', route: 'order-lookup-route',     level: 'WARN',  message: 'Target responded with 404 — returning empty result body' },
  { id: '7',  timestamp: '2026-03-04T10:44:00.002Z', correlationId: 'CID-003-ghi', route: 'payment-gateway-route', level: 'INFO',  message: 'Processing POST /v1/payments — correlationId assigned' },
  { id: '8',  timestamp: '2026-03-04T10:44:01.999Z', correlationId: 'CID-003-ghi', route: 'payment-gateway-route', level: 'ERROR', message: 'Connection timeout to payment-gateway.example.com after 30000ms' },
  { id: '9',  timestamp: '2026-03-04T10:44:02.001Z', correlationId: 'CID-003-ghi', route: 'payment-gateway-route', level: 'WARN',  message: 'RetryInterceptor: scheduling retry 1 of 3 in 1000ms' },
  { id: '10', timestamp: '2026-03-04T10:44:03.100Z', correlationId: 'CID-003-ghi', route: 'payment-gateway-route', level: 'INFO',  message: 'Retry attempt 1 succeeded — gateway responded in 1101ms' },
  { id: '11', timestamp: '2026-03-04T10:45:10.300Z', correlationId: 'CID-004-jkl', route: 'inventory-sync-route',  level: 'ERROR', message: 'Route is Stopped — message rejected, no consumer available' },
  { id: '12', timestamp: '2026-03-04T10:46:00.001Z', correlationId: 'CID-005-mno', route: 'customer-create-route', level: 'DEBUG', message: 'CorrelationInterceptor: assigned correlationId CID-005-mno' },
  { id: '13', timestamp: '2026-03-04T10:47:20.500Z', correlationId: 'CID-006-pqr', route: 'order-lookup-route',    level: 'INFO',  message: 'Passthrough transform applied — no transformation needed' },
  { id: '14', timestamp: '2026-03-04T10:48:01.002Z', correlationId: 'CID-007-stu', route: 'payment-gateway-route', level: 'INFO',  message: 'Route processed request in 892ms — status 200' },
  { id: '15', timestamp: '2026-03-04T10:49:05.777Z', correlationId: 'CID-008-vwx', route: 'customer-create-route', level: 'WARN',  message: 'SOAP response envelope missing optional header, continuing' },
];

const LOG_LEVELS: LogLevel[] = ['ERROR', 'WARN', 'INFO', 'DEBUG'];

const LEVEL_ROW_BG: Record<LogLevel, string> = {
  ERROR: 'bg-red-50/40',
  WARN:  'bg-amber-50/30',
  INFO:  '',
  DEBUG: '',
};

function fmtTime(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
    '.' + String(d.getMilliseconds()).padStart(3, '0')
  );
}

export default function MonitoringPage() {
  const { routes, fetchRoutes } = useRoutes();
  const [logs, setLogs] = useState<LogEntry[]>(MOCK_LOGS);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<LogLevel | ''>('');
  const [routeFilter, setRouteFilter] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => { fetchRoutes(); }, [fetchRoutes]);

  const addFakeLog = useCallback(() => {
    const routeOptions = ['customer-create-route', 'order-lookup-route', 'payment-gateway-route'];
    const msgs: [LogLevel, string][] = [
      ['INFO',  'Route started processing incoming request'],
      ['DEBUG', 'CorrelationInterceptor: correlationId assigned'],
      ['INFO',  'Request transform applied — Jolt spec executed'],
      ['INFO',  'Target call completed successfully'],
      ['WARN',  'Target responded slowly (>5s), SLA warning'],
    ];
    const [level, message] = msgs[Math.floor(Math.random() * msgs.length)];
    const newLog: LogEntry = {
      id: String(Date.now()),
      timestamp: new Date().toISOString(),
      correlationId: `CID-${Math.floor(Math.random() * 900 + 100)}-live`,
      route: routeOptions[Math.floor(Math.random() * routeOptions.length)],
      level,
      message,
    };
    setLogs(prev => [newLog, ...prev].slice(0, 200));
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(addFakeLog, 2500);
    return () => clearInterval(id);
  }, [autoRefresh, addFakeLog]);

  const filteredLogs = logs.filter(log => {
    if (levelFilter && log.level !== levelFilter) return false;
    if (routeFilter && log.route !== routeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!log.message.toLowerCase().includes(q) && !log.correlationId.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const routeNames = Array.from(new Set([
    ...routes.map(r => r.name),
    ...logs.map(l => l.route),
  ]));

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1e3a8a]">Monitoring</h1>
          <p className="text-slate-400 text-sm mt-0.5">{filteredLogs.length} log entries</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={autoRefresh ? 'success' : 'secondary'}
            size="sm"
            icon={<Radio className="w-4 h-4" />}
            onClick={() => setAutoRefresh(v => !v)}
          >
            {autoRefresh ? 'Live' : 'Auto-Refresh'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw className="w-4 h-4" />}
            onClick={addFakeLog}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search messages or correlation IDs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field pl-9"
          />
        </div>

        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <select
            value={levelFilter}
            onChange={e => setLevelFilter(e.target.value as LogLevel | '')}
            className="input-field pl-9 pr-8 appearance-none cursor-pointer min-w-36"
          >
            <option value="">All Levels</option>
            {LOG_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <select
            value={routeFilter}
            onChange={e => setRouteFilter(e.target.value)}
            className="input-field pl-9 pr-8 appearance-none cursor-pointer min-w-52"
          >
            <option value="">All Routes</option>
            {routeNames.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      {/* Log table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/70 w-28">Time</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/70 w-36">Correlation ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/70 w-52">Route</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/70 w-20">Level</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/70">Message</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log, idx) => (
                <tr
                  key={log.id}
                  className={`border-b border-slate-50 hover:bg-blue-50/20 transition-colors ${LEVEL_ROW_BG[log.level]} ${idx === filteredLogs.length - 1 ? 'border-0' : ''}`}
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-400 whitespace-nowrap">
                    {fmtTime(log.timestamp)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-indigo-500 whitespace-nowrap">
                    {log.correlationId}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500 truncate max-w-52">
                    {log.route}
                  </td>
                  <td className="px-4 py-2.5">
                    <LogLevelBadge level={log.level} />
                  </td>
                  <td className="px-4 py-2.5 text-sm text-slate-600">
                    {log.message}
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-14 text-center text-slate-400 text-sm">
                    No log entries match the current filters.
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

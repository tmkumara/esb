import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Activity, CheckCircle, AlertCircle, PauseCircle, ArrowRight, Plus, RefreshCw } from 'lucide-react';
import { useRoutes } from '../hooks/useRoutes';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import { Badge, StatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { routes, loading, fetchRoutes } = useRoutes();

  useEffect(() => { fetchRoutes(); }, [fetchRoutes]);

  const total = routes.length;
  const started = routes.filter(r => r.status === 'Started').length;
  const stopped = routes.filter(r => r.status === 'Stopped').length;
  const suspended = routes.filter(r => r.status === 'Suspended').length;

  const stats = [
    { label: 'Total Routes', value: total, icon: Zap, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
    { label: 'Started', value: started, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
    { label: 'Stopped', value: stopped, icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-100' },
    { label: 'Suspended', value: suspended, icon: PauseCircle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1e3a8a]">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">ESB runtime overview</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" icon={<RefreshCw className="w-4 h-4" />} onClick={() => fetchRoutes()} loading={loading}>
            Refresh
          </Button>
          <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => navigate('/builder')}>
            New Route
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg, border }) => (
          <div key={label} className={`bg-white rounded-xl p-5 shadow-sm border ${border}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
                <p className={`text-3xl font-bold mt-1 ${color}`}>{loading ? '–' : value}</p>
              </div>
              <div className={`w-12 h-12 rounded-xl ${bg} flex items-center justify-center`}>
                <Icon className={`w-6 h-6 ${color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Health + Active Routes */}
      <div className="grid grid-cols-3 gap-6">
        {/* System Health */}
        <Card className="col-span-1">
          <CardHeader>
            <h2 className="text-sm font-semibold text-[#1e3a8a] flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-500" /> System Health
            </h2>
          </CardHeader>
          <CardBody className="space-y-1">
            {[
              { label: 'ESB Status', value: <Badge variant="success">UP</Badge> },
              { label: 'Camel Context', value: <Badge variant="success">Running</Badge> },
              { label: 'Route Registry', value: <Badge variant="info">{total} routes</Badge> },
              { label: 'Hot Reload', value: <Badge variant="success">Active</Badge> },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <span className="text-sm text-slate-500">{label}</span>
                {value}
              </div>
            ))}
          </CardBody>
        </Card>

        {/* Active routes table */}
        <Card className="col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#1e3a8a]">Active Routes</h2>
              <button
                onClick={() => navigate('/routes')}
                className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1 transition-colors"
              >
                View all <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Route</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Source</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Target</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {routes.slice(0, 5).map(route => (
                  <tr key={route.name} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="px-5 py-3 font-medium text-slate-700">{route.name}</td>
                    <td className="px-5 py-3 text-slate-500">
                      {route.source.method && (
                        <span className="text-xs font-bold text-white bg-blue-500 rounded px-1.5 py-0.5 mr-1.5">{route.source.method}</span>
                      )}
                      <span className="font-mono text-xs">{route.source.path || route.source.type}</span>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant="neutral">{route.target.type}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={route.status} />
                    </td>
                  </tr>
                ))}
                {routes.length === 0 && !loading && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-slate-400 text-sm">
                      No routes deployed yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardBody>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-[#1e3a8a]">Quick Actions</h2>
        </CardHeader>
        <CardBody>
          <div className="flex gap-3 flex-wrap">
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => navigate('/builder')}>
              Build New Route
            </Button>
            <Button variant="secondary" icon={<CheckCircle className="w-4 h-4" />} onClick={() => navigate('/validation')}>
              Validate YAML
            </Button>
            <Button variant="secondary" icon={<Activity className="w-4 h-4" />} onClick={() => navigate('/monitoring')}>
              View Logs
            </Button>
            <Button variant="secondary" icon={<Zap className="w-4 h-4" />} onClick={() => navigate('/routes')}>
              Manage Routes
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

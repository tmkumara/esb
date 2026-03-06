import { useEffect, useState } from 'react';
import { Plus, Trash2, RefreshCw, Search, ArrowRight, RotateCcw, Pencil, Square, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useRoutes } from '../hooks/useRoutes';
import { useToast } from '../hooks/useToast';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Badge, StatusBadge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { esbApi } from '../api/esb-api';
import Editor from '@monaco-editor/react';

const DEFAULT_YAML = `apiVersion: esb/v1
kind: Route
metadata:
  name: my-new-route
source:
  type: rest
  method: POST
  path: /v1/example
target:
  type: http
  endpointUrl: http://target-service/api/endpoint
  timeout: 30000
transform:
  request:
    type: passthrough
  response:
    type: passthrough
interceptors:
  - type: correlation
  - type: retry
    config:
      maxAttempts: 3
`;

export default function RoutesPage() {
  const { routes, loading, fetchRoutes, deleteRoute, reloadRoute, deployRoute } = useRoutes();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [deployOpen, setDeployOpen] = useState(false);
  const [yaml, setYaml] = useState(DEFAULT_YAML);
  const [deploying, setDeploying] = useState(false);
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [reloadingName, setReloadingName] = useState<string | null>(null);
  const [togglingName, setTogglingName]   = useState<string | null>(null);

  useEffect(() => { fetchRoutes(); }, [fetchRoutes]);

  const filtered = routes.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.source.path || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleDeploy = async () => {
    setDeploying(true);
    try {
      await deployRoute(yaml);
      toast.success('Route deployed', 'Route is now active in the ESB runtime.');
      setDeployOpen(false);
    } catch (e: unknown) {
      const err = e as { displayMessage?: string; message?: string };
      toast.error('Deploy failed', err.displayMessage || err.message);
    } finally {
      setDeploying(false);
    }
  };

  const handleDelete = async (name: string) => {
    setDeletingName(name);
    try {
      await deleteRoute(name);
      toast.success('Route deleted', `"${name}" removed from ESB.`);
    } catch (e: unknown) {
      const err = e as { displayMessage?: string; message?: string };
      toast.error('Delete failed', err.displayMessage || err.message);
    } finally {
      setDeletingName(null);
    }
  };

  const handleToggle = async (name: string, currentStatus: string) => {
    setTogglingName(name);
    try {
      if (currentStatus === 'Suspended') {
        await esbApi.startRoute(name);
        toast.success('Route started', `"${name}" is now accepting messages.`);
      } else {
        await esbApi.stopRoute(name);
        toast.success('Route suspended', `"${name}" is paused.`);
      }
      await fetchRoutes();
    } catch (e: unknown) {
      const err = e as { displayMessage?: string; message?: string };
      toast.error('Toggle failed', err.displayMessage || err.message);
    } finally {
      setTogglingName(null);
    }
  };

  const handleReload = async (name: string) => {
    setReloadingName(name);
    try {
      await reloadRoute(name);
      toast.success('Route reloaded', `"${name}" reloaded successfully.`);
    } catch (e: unknown) {
      const err = e as { displayMessage?: string; message?: string };
      toast.error('Reload failed', err.displayMessage || err.message);
    } finally {
      setReloadingName(null);
    }
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1e3a8a]">Routes</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {routes.length} route{routes.length !== 1 ? 's' : ''} deployed
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw className="w-4 h-4" />}
            loading={loading}
            onClick={() => fetchRoutes()}
          >
            Refresh
          </Button>
          <Button
            size="sm"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setDeployOpen(true)}
          >
            Deploy Route
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name or path..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-field pl-9"
        />
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/70 rounded-tl-xl">
                  Route Name
                </th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/70">
                  Source
                </th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/70">
                  Target
                </th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/70">
                  Transforms
                </th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/70">
                  Status
                </th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/70 rounded-tr-xl">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((route, idx) => (
                <tr
                  key={route.name}
                  className={`border-b border-slate-50 hover:bg-blue-50/30 transition-colors ${idx === filtered.length - 1 ? 'border-0' : ''}`}
                >
                  <td className="px-5 py-4">
                    <span className="font-semibold text-[#1e3a8a]">{route.name}</span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5">
                      {route.source.method && (
                        <span className="text-xs font-bold text-white bg-blue-500 rounded-md px-1.5 py-0.5">
                          {route.source.method}
                        </span>
                      )}
                      <span className="font-mono text-xs text-slate-500">
                        {route.source.path || route.source.type}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div>
                      <Badge variant="neutral">{route.target.type}</Badge>
                      {route.target.operation && (
                        <p className="text-xs text-slate-400 mt-0.5 font-mono">{route.target.operation}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-1.5 flex-wrap">
                      {route.transform?.request && (
                        <Badge variant="purple">REQ: {route.transform.request.type}</Badge>
                      )}
                      {route.transform?.response && (
                        <Badge variant="info">RES: {route.transform.response.type}</Badge>
                      )}
                      {!route.transform && (
                        <span className="text-slate-300 text-xs">none</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={route.status} />
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {route.status === 'Suspended' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Play className="w-3.5 h-3.5 text-green-600" />}
                          loading={togglingName === route.name}
                          onClick={() => handleToggle(route.name, route.status)}
                        >
                          <span className="text-green-600">Start</span>
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Square className="w-3.5 h-3.5 text-red-500" />}
                          loading={togglingName === route.name}
                          onClick={() => handleToggle(route.name, route.status)}
                        >
                          <span className="text-red-500">Stop</span>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Pencil className="w-3.5 h-3.5" />}
                        onClick={async () => {
                          try {
                            const res = await esbApi.getRoute(route.name);
                            navigate('/builder', { state: { spec: res.data, routeName: route.name } });
                          } catch {
                            toast.error('Load failed', `Could not load route "${route.name}".`);
                          }
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<RotateCcw className="w-3.5 h-3.5" />}
                        loading={reloadingName === route.name}
                        onClick={() => handleReload(route.name)}
                      >
                        Reload
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        icon={<Trash2 className="w-3.5 h-3.5" />}
                        loading={deletingName === route.name}
                        onClick={() => handleDelete(route.name)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center text-slate-400 text-sm">
                    {search ? `No routes match "${search}"` : 'No routes deployed yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Deploy Modal */}
      <Modal
        isOpen={deployOpen}
        onClose={() => setDeployOpen(false)}
        title="Deploy Route — YAML Spec"
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeployOpen(false)}>Cancel</Button>
            <Button
              loading={deploying}
              onClick={handleDeploy}
              icon={<ArrowRight className="w-4 h-4" />}
            >
              Deploy Route
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-500 mb-3">
          Paste or edit a RouteSpec YAML. The spec will be validated and deployed to the ESB runtime.
        </p>
        <div className="monaco-container" style={{ height: 400 }}>
          <Editor
            height={400}
            language="yaml"
            value={yaml}
            onChange={v => setYaml(v || '')}
            theme="vs"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
            }}
          />
        </div>
      </Modal>
    </div>
  );
}

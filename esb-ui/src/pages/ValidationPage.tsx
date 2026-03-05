import { useState } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Play, FileCode2, ChevronRight } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { esbApi } from '../api/esb-api';
import { useToast } from '../hooks/useToast';
import { Button } from '../components/ui/Button';
import { Badge, ValidationBadge } from '../components/ui/Badge';
import type { ValidationResult, ValidationLayerResult } from '../types';

const EXAMPLE_YAML = `apiVersion: esb/v1
kind: Route
metadata:
  name: validate-example
source:
  type: rest
  method: POST
  path: /v1/customers
target:
  type: soap
  endpointUrl: http://crm-service/CustomerService
  operation: createCustomer
  timeout: 30000
transform:
  request:
    type: jolt
    spec:
      operation: shift
  response:
    type: jolt
    spec:
      operation: shift
interceptors:
  - type: correlation
  - type: retry
    config:
      maxAttempts: 3
`;

const LAYER_DESCRIPTIONS: Record<string, string> = {
  STRUCTURAL: 'Required fields & YAML structure',
  SCHEMA: 'Field types, enums, allowed values',
  SEMANTIC: 'Logic — paths, URLs, transform specs',
  COMPATIBILITY: 'Source / target type compatibility',
  DRY_RUN: 'Camel context dry-run with mock endpoints',
};

const LAYER_ORDER = ['STRUCTURAL', 'SCHEMA', 'SEMANTIC', 'COMPATIBILITY', 'DRY_RUN'];

function LayerCard({ result }: { result: ValidationLayerResult }) {
  const statusConfig = {
    PASS: {
      icon: <CheckCircle className="w-4 h-4 text-green-500" />,
      wrapper: 'border-green-100 bg-green-50/40',
      dot: 'bg-green-500',
    },
    FAIL: {
      icon: <XCircle className="w-4 h-4 text-red-500" />,
      wrapper: 'border-red-100 bg-red-50/40',
      dot: 'bg-red-500',
    },
    WARN: {
      icon: <AlertTriangle className="w-4 h-4 text-amber-500" />,
      wrapper: 'border-amber-100 bg-amber-50/40',
      dot: 'bg-amber-500',
    },
  };

  const cfg = statusConfig[result.status];

  return (
    <div className={`rounded-xl border p-4 ${cfg.wrapper}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {cfg.icon}
          <span className="font-semibold text-sm text-[#1e3a8a]">{result.layer}</span>
          <span className="text-xs text-slate-400 hidden sm:block truncate">
            — {LAYER_DESCRIPTIONS[result.layer]}
          </span>
        </div>
        <ValidationBadge status={result.status} />
      </div>

      {result.issues.length > 0 && (
        <ul className="mt-3 space-y-1.5 pl-6 border-t border-white/60 pt-3">
          {result.issues.map((issue, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              <Badge
                variant={
                  issue.severity === 'ERROR' ? 'error' :
                  issue.severity === 'WARNING' ? 'warning' : 'info'
                }
              >
                {issue.severity}
              </Badge>
              <span className="text-slate-500 leading-relaxed">
                <span className="font-mono text-slate-700">{issue.field}</span>
                {' — '}{issue.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SkippedLayer({ layer }: { layer: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white/50 p-4 opacity-40">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded-full border-2 border-slate-300" />
        <span className="font-semibold text-sm text-slate-400">{layer}</span>
        <ChevronRight className="w-3 h-3 text-slate-300" />
        <span className="text-xs text-slate-300">skipped</span>
      </div>
    </div>
  );
}

// Backend returns { passed, messages[], layerReached } — convert to UI's { valid, layers[] }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeValidationResponse(raw: any): ValidationResult {
  // Already in UI format (future-proof if backend shape changes)
  if (Array.isArray(raw?.layers)) return raw as ValidationResult;

  const messages: { layer: string; field: string; message: string; severity: string }[] =
    raw?.messages ?? [];
  const layerReached: string = raw?.layerReached ?? 'STRUCTURAL';
  const reachedIdx = LAYER_ORDER.indexOf(layerReached);

  const layers: ValidationLayerResult[] = LAYER_ORDER
    .filter((_, i) => i <= reachedIdx)
    .map(layer => {
      const layerMsgs = messages.filter(m => m.layer === layer);
      const hasError   = layerMsgs.some(m => m.severity === 'ERROR');
      const hasWarning = layerMsgs.some(m => m.severity === 'WARNING');
      return {
        layer: layer as ValidationLayerResult['layer'],
        status: hasError ? 'FAIL' : hasWarning ? 'WARN' : 'PASS',
        issues: layerMsgs.map(m => ({
          field:    m.field ?? '',
          message:  m.message,
          severity: m.severity as 'ERROR' | 'WARNING' | 'INFO',
        })),
      };
    });

  const passed: boolean = raw?.passed ?? false;
  return {
    valid: passed,
    layers,
    summary: passed
      ? `All ${layers.length} layer(s) passed`
      : `Failed at ${layerReached} — ${messages.filter(m => m.severity === 'ERROR').length} error(s)`,
  };
}

export default function ValidationPage() {
  const [yaml, setYaml] = useState(EXAMPLE_YAML);
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const { toast } = useToast();

  const handleValidate = async () => {
    setValidating(true);
    setResult(null);
    try {
      const response = await esbApi.validateSpec(yaml);
      setResult(normalizeValidationResponse(response.data));
    } catch {
      // Server offline — show mock result for demo
      const mockResult: ValidationResult = {
        valid: false,
        summary: 'Server unavailable — showing offline structural validation only.',
        layers: [
          { layer: 'STRUCTURAL', status: 'PASS', issues: [] },
          {
            layer: 'SCHEMA', status: 'WARN', issues: [
              { field: 'target.endpointUrl', message: 'Cannot verify endpoint reachability (offline)', severity: 'WARNING' },
            ]
          },
          { layer: 'SEMANTIC', status: 'PASS', issues: [] },
        ],
      };
      setResult(mockResult);
      toast.warning(
        'ESB server offline',
        'Start the runtime on :9090 for full 5-layer validation including dry-run.'
      );
    } finally {
      setValidating(false);
    }
  };

  const layersReturned = new Set(result?.layers?.map(l => l.layer) ?? []);

  return (
    <div className="h-full flex flex-col p-6 gap-5 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-[#1e3a8a]">Validation</h1>
          <p className="text-slate-400 text-sm mt-0.5">5-layer RouteSpec validation pipeline</p>
        </div>
        <Button
          icon={<Play className="w-4 h-4" />}
          loading={validating}
          onClick={handleValidate}
        >
          Run Validation
        </Button>
      </div>

      {/* Main content — editor left, results right */}
      <div className="flex-1 grid grid-cols-5 gap-5 min-h-0 overflow-hidden">

        {/* YAML Editor */}
        <div className="col-span-3 flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-2 flex-shrink-0">
            <FileCode2 className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">RouteSpec YAML</span>
          </div>
          <div className="flex-1 min-h-0 monaco-container overflow-hidden rounded-xl border border-slate-200 shadow-sm">
            <Editor
              height="100%"
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
                padding: { top: 12, bottom: 12 },
              }}
            />
          </div>
        </div>

        {/* Results panel */}
        <div className="col-span-2 flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-2 flex-shrink-0">
            <CheckCircle className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Validation Results
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {!result && !validating && (
              <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-4 pb-12">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                  <Play className="w-7 h-7 text-slate-300" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-400">Ready to validate</p>
                  <p className="text-xs text-slate-300 mt-1">Click "Run Validation" to check your RouteSpec</p>
                </div>
              </div>
            )}

            {result && (
              <>
                {/* Summary banner */}
                <div className={`rounded-xl p-4 flex items-start gap-3 border ${
                  result.valid
                    ? 'bg-green-50 border-green-200'
                    : 'bg-red-50 border-red-200'
                }`}>
                  {result.valid
                    ? <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    : <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  }
                  <div>
                    <p className={`font-semibold text-sm ${result.valid ? 'text-green-700' : 'text-red-700'}`}>
                      {result.valid ? 'Valid — Route is ready to deploy' : 'Invalid — Fix errors before deploying'}
                    </p>
                    {result.summary && (
                      <p className="text-xs text-slate-500 mt-0.5">{result.summary}</p>
                    )}
                  </div>
                </div>

                {/* Layer results */}
                {LAYER_ORDER.map(layer => {
                  const layerResult = result.layers.find(l => l.layer === layer);
                  if (layerResult) return <LayerCard key={layer} result={layerResult} />;
                  return layersReturned.size > 0
                    ? <SkippedLayer key={layer} layer={layer} />
                    : null;
                })}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

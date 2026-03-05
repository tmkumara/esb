import { useState, useCallback, useEffect, type DragEvent } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  addEdge,
  Background,
  Controls,
  ReactFlowProvider,
  useReactFlow,
  Handle,
  Position,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Play, Send, RotateCcw, Code2, X, ChevronDown, Save,
  Wifi, Globe, ArrowRightLeft, ShieldCheck, GitMerge,
} from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { esbApi } from '../api/esb-api';
import { Button } from '../components/ui/Button';
import { JoltFieldMapperModal } from '../components/route-builder/JoltFieldMapperModal';
import { CodeEditorModal } from '../components/route-builder/CodeEditorModal';

// ─── Transform editor plugin config ───────────────────────────────────────────
interface TransformEditorConfig {
  editorMode: 'visual-mapper' | 'code-editor' | 'none';
  language?: string;
  inputFormat: 'json' | 'xml' | 'text';
  outputFormat: 'json' | 'xml' | 'text';
  label: string;
}

const TRANSFORM_EDITOR_CONFIG: Record<string, TransformEditorConfig> = {
  jolt:        { editorMode: 'visual-mapper', inputFormat: 'json',  outputFormat: 'json',  label: 'Field Mapper (JSON)' },
  xslt:        { editorMode: 'code-editor',   language: 'xml',    inputFormat: 'xml',   outputFormat: 'xml',   label: 'XSLT Editor' },
  groovy:      { editorMode: 'code-editor',   language: 'groovy', inputFormat: 'text',  outputFormat: 'text',  label: 'Script Editor' },
  passthrough: { editorMode: 'none',          inputFormat: 'text',  outputFormat: 'text',  label: '' },
};

// ─── Node data types ──────────────────────────────────────────────────────────
interface FlowNodeData extends Record<string, unknown> {
  label: string;
  subType: string;
  // source fields
  method?: string;
  path?: string;
  // target fields
  endpointUrl?: string;
  operation?: string;
  timeout?: number;
  targetType?: string;
  mockBody?: string;
  mockStatusCode?: number;
  // transform fields
  transformType?: string;
  role?: 'request' | 'response';
  inlineSpec?: string;   // compact JSON (Jolt) or plain text (XSLT/Groovy)
  // interceptor fields
  interceptorType?: string;
  maxAttempts?: number;
}
type FlowNode = Node<FlowNodeData>;

// ─── Shared node handle styles ────────────────────────────────────────────────
const handleStyle = { width: 10, height: 10, borderRadius: 5 };

// ─── Custom node: Source ──────────────────────────────────────────────────────
function SourceNode({ data, selected }: { data: FlowNodeData; selected: boolean }) {
  return (
    <div className={`rounded-xl shadow-sm border-2 min-w-[160px] overflow-hidden transition-all ${selected ? 'border-blue-500 shadow-blue-200 shadow-md' : 'border-blue-200'}`}>
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-3 py-2 flex items-center gap-1.5">
        <Wifi className="w-3.5 h-3.5 text-white" />
        <span className="text-white text-xs font-bold uppercase tracking-wide">Source</span>
      </div>
      <div className="bg-white px-3 py-2.5 text-xs">
        <div className="font-semibold text-[#1e3a8a]">{data.label}</div>
        {data.method && (
          <div className="mt-1 flex items-center gap-1">
            <span className="bg-blue-500 text-white rounded px-1 py-0.5 text-[10px] font-bold">{data.method}</span>
            <span className="text-slate-500 font-mono truncate max-w-[100px]">{data.path || '/'}</span>
          </div>
        )}
        {data.subType === 'direct' && (
          <div className="mt-1 text-slate-400 font-mono">{data.path || 'direct'}</div>
        )}
      </div>
      <Handle type="source" position={Position.Right} style={handleStyle} className="!bg-blue-500 !border-white" />
    </div>
  );
}

// ─── Custom node: Transform ───────────────────────────────────────────────────
function TransformNode({ data, selected }: { data: FlowNodeData; selected: boolean }) {
  const isReq = data.role === 'request';
  return (
    <div className={`rounded-xl shadow-sm border-2 min-w-[150px] overflow-hidden transition-all ${selected ? 'border-purple-500 shadow-purple-200 shadow-md' : 'border-purple-200'}`}>
      <div className={`px-3 py-2 flex items-center gap-1.5 ${isReq ? 'bg-gradient-to-r from-purple-600 to-purple-500' : 'bg-gradient-to-r from-violet-600 to-violet-500'}`}>
        <ArrowRightLeft className="w-3.5 h-3.5 text-white" />
        <span className="text-white text-xs font-bold uppercase tracking-wide">
          {isReq ? 'Req Transform' : 'Res Transform'}
        </span>
      </div>
      <div className="bg-white px-3 py-2.5 text-xs">
        <div className="font-semibold text-[#1e3a8a]">{data.label}</div>
        <div className="mt-1 text-slate-400">{data.transformType || 'passthrough'}</div>
      </div>
      <Handle type="target" position={Position.Left} style={handleStyle} className="!bg-purple-400 !border-white" />
      <Handle type="source" position={Position.Right} style={handleStyle} className="!bg-purple-500 !border-white" />
    </div>
  );
}

// ─── Custom node: Target ──────────────────────────────────────────────────────
function TargetNode({ data, selected }: { data: FlowNodeData; selected: boolean }) {
  return (
    <div className={`rounded-xl shadow-sm border-2 min-w-[160px] overflow-hidden transition-all ${selected ? 'border-orange-500 shadow-orange-200 shadow-md' : 'border-orange-200'}`}>
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-3 py-2 flex items-center gap-1.5">
        <Globe className="w-3.5 h-3.5 text-white" />
        <span className="text-white text-xs font-bold uppercase tracking-wide">Target</span>
      </div>
      <div className="bg-white px-3 py-2.5 text-xs">
        <div className="font-semibold text-[#1e3a8a]">{data.label}</div>
        <div className="mt-1 text-slate-400 font-mono truncate max-w-[130px]">
          {data.endpointUrl || 'http://...'}
        </div>
        {data.operation && (
          <div className="text-slate-400 truncate">{data.operation}</div>
        )}
      </div>
      <Handle type="target" position={Position.Left} style={handleStyle} className="!bg-orange-400 !border-white" />
      <Handle type="source" position={Position.Right} style={handleStyle} className="!bg-orange-500 !border-white" />
    </div>
  );
}

// ─── Custom node: Interceptor ─────────────────────────────────────────────────
function InterceptorNode({ data, selected }: { data: FlowNodeData; selected: boolean }) {
  return (
    <div className={`rounded-xl shadow-sm border-2 min-w-[140px] overflow-hidden transition-all ${selected ? 'border-slate-500 shadow-slate-200 shadow-md' : 'border-slate-200'}`}>
      <div className="bg-gradient-to-r from-slate-600 to-slate-500 px-3 py-2 flex items-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-white" />
        <span className="text-white text-xs font-bold uppercase tracking-wide">Interceptor</span>
      </div>
      <div className="bg-white px-3 py-2.5 text-xs">
        <div className="font-semibold text-[#1e3a8a]">{data.label}</div>
        <div className="mt-1 text-slate-400">{data.interceptorType}</div>
      </div>
      <Handle type="target" position={Position.Left} style={handleStyle} className="!bg-slate-400 !border-white" />
      <Handle type="source" position={Position.Right} style={handleStyle} className="!bg-slate-500 !border-white" />
    </div>
  );
}

const NODE_TYPES: NodeTypes = {
  source: SourceNode as never,
  transform: TransformNode as never,
  target: TargetNode as never,
  interceptor: InterceptorNode as never,
};

// ─── Palette items ────────────────────────────────────────────────────────────
interface PaletteSpec {
  label: string;
  description: string;
  nodeType: string;
  icon: React.ReactNode;
  color: string;
  defaults: Partial<FlowNodeData>;
}

const PALETTE_GROUPS: { group: string; icon: React.ReactNode; items: PaletteSpec[] }[] = [
  {
    group: 'Sources',
    icon: <Wifi className="w-3.5 h-3.5 text-blue-500" />,
    items: [
      {
        label: 'REST Source', description: 'HTTP endpoint', nodeType: 'source', icon: <Wifi className="w-3.5 h-3.5" />, color: 'text-blue-600',
        defaults: { subType: 'rest', method: 'POST', path: '/v1/resource' },
      },
      {
        label: 'Direct Source', description: 'Camel direct:', nodeType: 'source', icon: <GitMerge className="w-3.5 h-3.5" />, color: 'text-blue-500',
        defaults: { subType: 'direct', path: 'resource.in' },
      },
    ],
  },
  {
    group: 'Transforms',
    icon: <ArrowRightLeft className="w-3.5 h-3.5 text-purple-500" />,
    items: [
      {
        label: 'Req Transform', description: 'Request mapping', nodeType: 'transform', icon: <ArrowRightLeft className="w-3.5 h-3.5" />, color: 'text-purple-600',
        defaults: { subType: 'jolt', transformType: 'jolt', role: 'request' },
      },
      {
        label: 'Res Transform', description: 'Response mapping', nodeType: 'transform', icon: <ArrowRightLeft className="w-3.5 h-3.5" />, color: 'text-violet-600',
        defaults: { subType: 'jolt', transformType: 'jolt', role: 'response' },
      },
    ],
  },
  {
    group: 'Targets',
    icon: <Globe className="w-3.5 h-3.5 text-orange-500" />,
    items: [
      {
        label: 'HTTP Target', description: 'REST/HTTP endpoint', nodeType: 'target', icon: <Globe className="w-3.5 h-3.5" />, color: 'text-orange-600',
        defaults: { subType: 'http', targetType: 'http', endpointUrl: 'http://target-service/api', timeout: 30000 },
      },
      {
        label: 'SOAP Target', description: 'SOAP/CXF service', nodeType: 'target', icon: <Globe className="w-3.5 h-3.5" />, color: 'text-amber-600',
        defaults: { subType: 'soap', targetType: 'soap', endpointUrl: 'http://service/wsdl', operation: 'doOperation', timeout: 30000 },
      },
    ],
  },
  {
    group: 'Interceptors',
    icon: <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />,
    items: [
      {
        label: 'Correlation', description: 'Adds correlationId', nodeType: 'interceptor', icon: <ShieldCheck className="w-3.5 h-3.5" />, color: 'text-slate-600',
        defaults: { subType: 'correlation', interceptorType: 'correlation' },
      },
      {
        label: 'Retry', description: 'Auto retry on failure', nodeType: 'interceptor', icon: <ShieldCheck className="w-3.5 h-3.5" />, color: 'text-slate-600',
        defaults: { subType: 'retry', interceptorType: 'retry', maxAttempts: 3 },
      },
      {
        label: 'Auth', description: 'JWT/API key auth', nodeType: 'interceptor', icon: <ShieldCheck className="w-3.5 h-3.5" />, color: 'text-slate-600',
        defaults: { subType: 'auth', interceptorType: 'auth' },
      },
    ],
  },
];

// ─── Component metadata lookup (protocol key → PaletteSpec) ──────────────────
// The backend /manage/components endpoint returns which protocols are registered.
// These maps provide the UI metadata for each known protocol.
// Unknown protocols (new adapters not yet listed here) get a generic fallback card.
// To add a new component to the palette: add an entry here + add adapter on backend.
const SOURCE_METADATA: Record<string, PaletteSpec> = {
  rest:   { label: 'REST Source',  description: 'HTTP endpoint',   nodeType: 'source', icon: <Wifi className="w-3.5 h-3.5" />,    color: 'text-blue-600',  defaults: { subType: 'rest',   method: 'POST', path: '/v1/resource' } },
  direct: { label: 'Direct Source',description: 'Camel direct:',  nodeType: 'source', icon: <GitMerge className="w-3.5 h-3.5" />, color: 'text-blue-500',  defaults: { subType: 'direct', path: 'resource.in' } },
  kafka:  { label: 'Kafka Source', description: 'Kafka consumer',  nodeType: 'source', icon: <Wifi className="w-3.5 h-3.5" />,    color: 'text-green-600', defaults: { subType: 'kafka' } },
  jms:    { label: 'JMS Source',   description: 'JMS queue/topic', nodeType: 'source', icon: <GitMerge className="w-3.5 h-3.5" />, color: 'text-teal-600',  defaults: { subType: 'jms' } },
};

const TARGET_METADATA: Record<string, PaletteSpec> = {
  http:  { label: 'HTTP Target',  description: 'REST/HTTP endpoint', nodeType: 'target', icon: <Globe className="w-3.5 h-3.5" />, color: 'text-orange-600', defaults: { subType: 'http', targetType: 'http', endpointUrl: 'http://target-service/api', timeout: 30000 } },
  soap:  { label: 'SOAP Target',  description: 'SOAP/CXF service',   nodeType: 'target', icon: <Globe className="w-3.5 h-3.5" />, color: 'text-amber-600',  defaults: { subType: 'soap', targetType: 'soap', endpointUrl: 'http://service/wsdl', operation: 'doOperation', timeout: 30000 } },
  kafka:      { label: 'Kafka Target',     description: 'Kafka producer',          nodeType: 'target', icon: <Globe className="w-3.5 h-3.5" />, color: 'text-green-600',  defaults: { subType: 'kafka',      targetType: 'kafka' } },
  jms:        { label: 'JMS Target',       description: 'JMS queue/topic',         nodeType: 'target', icon: <Globe className="w-3.5 h-3.5" />, color: 'text-teal-600',   defaults: { subType: 'jms',        targetType: 'jms' } },
  'mock-echo':    { label: 'Mock Echo',     description: 'Returns Groovy-computed body as HTTP 200', nodeType: 'target', icon: <ArrowRightLeft className="w-3.5 h-3.5" />, color: 'text-purple-500', defaults: { subType: 'mock-echo', targetType: 'mock-echo' } },
  'mock-response':{ label: 'Mock Response', description: 'Returns static JSON/XML body — no code needed', nodeType: 'target', icon: <ArrowRightLeft className="w-3.5 h-3.5" />, color: 'text-pink-500',   defaults: { subType: 'mock-response', targetType: 'mock-response', mockStatusCode: 200, mockBody: '{"status":"ok"}' } },
};

function genericPaletteItem(protocol: string, nodeType: 'source' | 'target'): PaletteSpec {
  const suffix = nodeType === 'source' ? ' Source' : ' Target';
  return {
    label: protocol.charAt(0).toUpperCase() + protocol.slice(1) + suffix,
    description: `${protocol} adapter`,
    nodeType,
    icon: <Globe className="w-3.5 h-3.5" />,
    color: 'text-slate-500',
    defaults: { subType: protocol },
  };
}

// ─── YAML generation ──────────────────────────────────────────────────────────
// ─── Reconstruct canvas from a deployed RouteSpec (for Edit flow) ────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function specToNodesAndEdges(spec: any): { nodes: FlowNode[]; edges: Edge[] } {
  const nodes: FlowNode[] = [];
  const edges: Edge[] = [];
  const eStyle = { animated: true, style: { stroke: '#2563eb', strokeWidth: 2 } };

  let x = 100;
  const Y = 220;
  const STEP = 310;

  const srcId = 'source-1';
  const reqId = 'transform-req';
  const resId = 'transform-res';
  const tgtId = 'target-1';

  if (spec.source) {
    nodes.push({
      id: srcId, type: 'source', position: { x, y: Y },
      data: {
        label: `${String(spec.source.type || 'rest').toUpperCase()} Source`,
        subType: spec.source.type || 'rest',
        method: spec.source.method,
        path: spec.source.path,
      },
    });
    x += STEP;
  }

  const reqType = spec.transform?.request?.type;
  const hasReqT = reqType && reqType !== 'passthrough';
  if (hasReqT) {
    nodes.push({
      id: reqId, type: 'transform', position: { x, y: Y - 55 },
      data: {
        label: 'Req Transform', subType: reqType, transformType: reqType, role: 'request',
        inlineSpec: spec.transform.request.inline || undefined,
      },
    });
    edges.push({ id: 'e-src-req', source: srcId, target: reqId, ...eStyle });
    x += STEP;
  }

  if (spec.target) {
    nodes.push({
      id: tgtId, type: 'target', position: { x, y: Y },
      data: {
        label: `${String(spec.target.type || 'http').toUpperCase()} Target`,
        subType: spec.target.type || 'http',
        targetType: spec.target.type || 'http',
        endpointUrl: spec.target.endpointUrl,
        method: spec.target.method,
        operation: spec.target.operation,
        timeout: spec.target.timeout?.readMs ?? 30000,
      },
    });
    edges.push({ id: hasReqT ? 'e-req-tgt' : 'e-src-tgt', source: hasReqT ? reqId : srcId, target: tgtId, ...eStyle });
  }

  const resType = spec.transform?.response?.type;
  const hasResT = resType && resType !== 'passthrough';
  if (hasResT) {
    nodes.push({
      id: resId, type: 'transform', position: { x: hasReqT ? 100 + STEP : 100, y: Y + 130 },
      data: {
        label: 'Res Transform', subType: resType, transformType: resType, role: 'response',
        inlineSpec: spec.transform.response.inline || undefined,
      },
    });
    edges.push({ id: 'e-tgt-res', source: tgtId, target: resId, ...eStyle });
  }

  return { nodes, edges };
}

function buildYaml(nodes: FlowNode[], routeName: string): string {
  const src = nodes.find(n => n.type === 'source');
  const tgt = nodes.find(n => n.type === 'target');
  const reqT = nodes.find(n => n.type === 'transform' && n.data.role === 'request');
  const resT = nodes.find(n => n.type === 'transform' && n.data.role === 'response');
  const interceptors = nodes.filter(n => n.type === 'interceptor');

  const lines: string[] = [
    `apiVersion: esb/v1`,
    `kind: Route`,
    `metadata:`,
    `  name: ${routeName || 'my-route'}`,
  ];

  if (src) {
    lines.push(`source:`);
    lines.push(`  type: ${src.data.subType || 'rest'}`);
    if (src.data.method) lines.push(`  method: ${src.data.method}`);
    if (src.data.path) lines.push(`  path: ${src.data.path}`);
  } else {
    lines.push(`source:`);
    lines.push(`  type: rest`);
    lines.push(`  method: POST`);
    lines.push(`  path: /v1/resource`);
  }

  if (tgt) {
    lines.push(`target:`);
    lines.push(`  type: ${tgt.data.subType || 'http'}`);
    if (tgt.data.subType === 'mock-response') {
      lines.push(`  mockStatusCode: ${tgt.data.mockStatusCode ?? 200}`);
      if (tgt.data.mockBody) {
        lines.push(`  mockBody: |`);
        for (const line of String(tgt.data.mockBody).split('\n')) {
          lines.push(`    ${line}`);
        }
      }
    } else {
      if (tgt.data.endpointUrl) lines.push(`  endpointUrl: ${tgt.data.endpointUrl}`);
      if (tgt.data.method)      lines.push(`  method: ${tgt.data.method}`);
      if (tgt.data.operation)   lines.push(`  operation: ${tgt.data.operation}`);
      if (tgt.data.timeout) {
        lines.push(`  timeout:`);
        lines.push(`    readMs: ${tgt.data.timeout}`);
      }
    }
  }

  if (reqT || resT) {
    lines.push(`transform:`);
    if (reqT) {
      const type = reqT.data.transformType || 'passthrough';
      lines.push(`  request:`);
      lines.push(`    type: ${type}`);
      if (reqT.data.inlineSpec) {
        const raw = String(reqT.data.inlineSpec);
        const compact = type === 'jolt' ? JSON.stringify(JSON.parse(raw)) : raw;
        lines.push(`    inline: '${compact.replace(/'/g, "''")}'`);
      }
    }
    if (resT) {
      const type = resT.data.transformType || 'passthrough';
      lines.push(`  response:`);
      lines.push(`    type: ${type}`);
      if (resT.data.inlineSpec) {
        const raw = String(resT.data.inlineSpec);
        const compact = type === 'jolt' ? JSON.stringify(JSON.parse(raw)) : raw;
        lines.push(`    inline: '${compact.replace(/'/g, "''")}'`);
      }
    }
  }

  if (interceptors.length > 0) {
    lines.push(`interceptors:`);
    for (const ic of interceptors) {
      lines.push(`  - type: ${ic.data.interceptorType}`);
      if (ic.data.interceptorType === 'retry' && ic.data.maxAttempts) {
        lines.push(`    config:`);
        lines.push(`      maxAttempts: ${ic.data.maxAttempts}`);
      }
    }
  }

  return lines.join('\n');
}

// ─── Property panel ───────────────────────────────────────────────────────────
function PropertyPanel({
  node,
  onChange,
  onClose,
  onOpenEditor,
}: {
  node: FlowNode;
  onChange: (key: string, value: unknown) => void;
  onClose: () => void;
  onOpenEditor: () => void;
}) {
  const d = node.data;

  const inputCls = 'input-field text-xs py-1.5';
  const labelCls = 'label';

  return (
    <div className="w-64 flex-shrink-0 bg-white border-l border-slate-100 overflow-y-auto flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <span className="text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">Properties</span>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-3 flex-1">
        {/* Label — all nodes */}
        <div>
          <label className={labelCls}>Label</label>
          <input className={inputCls} value={String(d.label || '')} onChange={e => onChange('label', e.target.value)} />
        </div>

        {/* Source-specific */}
        {node.type === 'source' && d.subType === 'rest' && (
          <>
            <div>
              <label className={labelCls}>HTTP Method</label>
              <select className={inputCls + ' appearance-none cursor-pointer'} value={String(d.method || 'POST')} onChange={e => onChange('method', e.target.value)}>
                {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Path</label>
              <input className={inputCls} value={String(d.path || '')} placeholder="/v1/resource" onChange={e => onChange('path', e.target.value)} />
            </div>
          </>
        )}
        {node.type === 'source' && d.subType === 'direct' && (
          <div>
            <label className={labelCls}>Channel Name</label>
            <input className={inputCls} value={String(d.path || '')} placeholder="resource.in" onChange={e => onChange('path', e.target.value)} />
          </div>
        )}

        {/* Target-specific */}
        {node.type === 'target' && d.subType === 'mock-response' && (
          <>
            <div>
              <label className={labelCls}>Status Code</label>
              <input className={inputCls} type="number" value={Number(d.mockStatusCode ?? 200)} onChange={e => onChange('mockStatusCode', parseInt(e.target.value))} />
            </div>
            <div>
              <label className={labelCls}>Response Body (JSON or XML)</label>
              <textarea
                className={inputCls + ' font-mono text-xs resize-y'}
                rows={8}
                value={String(d.mockBody || '')}
                placeholder={'{\n  "field": "value"\n}'}
                onChange={e => onChange('mockBody', e.target.value)}
              />
            </div>
          </>
        )}
        {node.type === 'target' && d.subType !== 'mock-response' && (
          <>
            {d.subType !== 'mock-echo' && (
              <div>
                <label className={labelCls}>Endpoint URL</label>
                <input className={inputCls} value={String(d.endpointUrl || '')} placeholder="http://service/api" onChange={e => onChange('endpointUrl', e.target.value)} />
              </div>
            )}
            {d.subType !== 'soap' && d.subType !== 'mock-echo' && (
              <div>
                <label className={labelCls}>HTTP Method</label>
                <select className={inputCls + ' appearance-none cursor-pointer'} value={String(d.method || 'POST')} onChange={e => onChange('method', e.target.value)}>
                  <option value="POST">POST</option>
                  <option value="GET">GET</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>
            )}
            {d.subType === 'soap' && (
              <div>
                <label className={labelCls}>Operation</label>
                <input className={inputCls} value={String(d.operation || '')} placeholder="doOperation" onChange={e => onChange('operation', e.target.value)} />
              </div>
            )}
            {d.subType !== 'mock-echo' && (
              <div>
                <label className={labelCls}>Timeout (ms)</label>
                <input className={inputCls} type="number" value={Number(d.timeout || 30000)} onChange={e => onChange('timeout', parseInt(e.target.value))} />
              </div>
            )}
          </>
        )}

        {/* Transform-specific */}
        {node.type === 'transform' && (
          <>
            <div>
              <label className={labelCls}>Role</label>
              <select className={inputCls + ' appearance-none cursor-pointer'} value={String(d.role || 'request')} onChange={e => onChange('role', e.target.value)}>
                <option value="request">Request</option>
                <option value="response">Response</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Transform Type</label>
              <select className={inputCls + ' appearance-none cursor-pointer'} value={String(d.transformType || 'passthrough')} onChange={e => {
                onChange('transformType', e.target.value);
                onChange('inlineSpec', undefined);
              }}>
                <option value="jolt">Field Mapper (JSON)</option>
                <option value="xslt">XSLT (XML→XML)</option>
                <option value="groovy">Groovy Script</option>
                <option value="passthrough">Passthrough</option>
              </select>
            </div>
            {TRANSFORM_EDITOR_CONFIG[String(d.transformType || 'passthrough')]?.editorMode !== 'none' && (
              <div>
                <Button variant="secondary" size="sm" className="w-full" onClick={onOpenEditor}>
                  {d.inlineSpec
                    ? `Edit ${TRANSFORM_EDITOR_CONFIG[String(d.transformType)]?.label}`
                    : `Open ${TRANSFORM_EDITOR_CONFIG[String(d.transformType)]?.label}`}
                </Button>
                {d.inlineSpec && (
                  <p className="text-[10px] text-green-600 mt-1">Spec saved ✓</p>
                )}
              </div>
            )}
          </>
        )}

        {/* Interceptor-specific */}
        {node.type === 'interceptor' && (
          <>
            <div>
              <label className={labelCls}>Type</label>
              <select className={inputCls + ' appearance-none cursor-pointer'} value={String(d.interceptorType || 'correlation')} onChange={e => onChange('interceptorType', e.target.value)}>
                <option value="correlation">Correlation</option>
                <option value="retry">Retry</option>
                <option value="auth">Auth</option>
                <option value="timeout">Timeout</option>
                <option value="metrics">Metrics</option>
              </select>
            </div>
            {d.interceptorType === 'retry' && (
              <div>
                <label className={labelCls}>Max Attempts</label>
                <input className={inputCls} type="number" min={1} max={10} value={Number(d.maxAttempts || 3)} onChange={e => onChange('maxAttempts', parseInt(e.target.value))} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Palette item (draggable) ─────────────────────────────────────────────────
function PaletteItem({ spec }: { spec: PaletteSpec }) {
  const onDragStart = (e: DragEvent) => {
    e.dataTransfer.setData('nodeSpec', JSON.stringify({
      nodeType: spec.nodeType,
      label: spec.label,
      defaults: spec.defaults,
    }));
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-100 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 cursor-grab active:cursor-grabbing transition-all select-none"
    >
      <span className={spec.color}>{spec.icon}</span>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-slate-700 leading-tight">{spec.label}</div>
        <div className="text-[10px] text-slate-400 leading-tight">{spec.description}</div>
      </div>
    </div>
  );
}

// ─── Builder canvas (needs ReactFlowProvider wrapping) ────────────────────────
let _nodeCounter = 0;
function nextId() { return `n${++_nodeCounter}`; }

function BuilderCanvas() {
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const location = useLocation();
  const [routeName, setRouteName] = useState('my-route');
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
  const [transformEditorTarget, setTransformEditorTarget] = useState<string | null>(null);
  const [showYaml, setShowYaml] = useState(false);
  const [validating, setValidating] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Load route for editing when navigated from Routes page (Edit button)
  useEffect(() => {
    const state = location.state as { spec?: unknown; routeName?: string } | null;
    if (!state?.spec) return;
    const { nodes: n, edges: e } = specToNodesAndEdges(state.spec);
    setNodes(n);
    setEdges(e);
    if (state.routeName) setRouteName(state.routeName);
    setSelectedNode(null);
  // Run once on mount only
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch registered components from backend and rebuild palette groups dynamically.
  // Falls back to the static PALETTE_GROUPS if the backend is offline.
  const [paletteGroups, setPaletteGroups] = useState(PALETTE_GROUPS);
  useEffect(() => {
    esbApi.getComponents()
      .then((res) => {
        const data = res.data as { sources: string[]; targets: string[] };
        setPaletteGroups(prev => [
          { ...prev[0], items: data.sources.map(k => SOURCE_METADATA[k] ?? genericPaletteItem(k, 'source')) },
          prev[1],  // Transforms — static Req/Res nodes
          { ...prev[2], items: data.targets.map(k => TARGET_METADATA[k] ?? genericPaletteItem(k, 'target')) },
          prev[3],  // Interceptors — static
        ]);
      })
      .catch(() => { /* keep static palette if backend is offline */ });
  }, []);

  const onConnect = useCallback(
    (conn: Connection) => setEdges(eds => addEdge({ ...conn, animated: true, style: { stroke: '#2563eb', strokeWidth: 2 } }, eds)),
    [setEdges]
  );

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('nodeSpec');
    if (!raw) return;
    const spec = JSON.parse(raw) as { nodeType: string; label: string; defaults: Partial<FlowNodeData> };
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const node: FlowNode = {
      id: nextId(),
      type: spec.nodeType,
      position,
      data: { label: spec.label, subType: spec.defaults.subType || '', ...spec.defaults },
    };
    setNodes(nds => [...nds, node]);
  }, [screenToFlowPosition, setNodes]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: FlowNode) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const updateNodeData = useCallback((key: string, value: unknown) => {
    if (!selectedNode) return;
    setNodes(nds => nds.map(n =>
      n.id === selectedNode.id ? { ...n, data: { ...n.data, [key]: value } } : n
    ));
    setSelectedNode(prev => prev ? { ...prev, data: { ...prev.data, [key]: value } } : null);
  }, [selectedNode, setNodes]);

  const handleReset = () => {
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
  };

  const yaml = buildYaml(nodes, routeName);

  const handleValidate = async () => {
    if (nodes.length === 0) { toast.warning('Canvas is empty', 'Add nodes to build a route first.'); return; }
    setValidating(true);
    try {
      await esbApi.validateSpec(yaml);
      toast.success('Validation passed', 'Route spec is valid.');
    } catch {
      toast.warning('Server offline', 'YAML generated — validate on the Validation page for full results.');
    } finally {
      setValidating(false);
    }
  };

  const handleSaveToDisk = async () => {
    if (nodes.length === 0) { toast.warning('Canvas is empty', 'Add nodes first.'); return; }
    setSaving(true);
    try {
      await esbApi.persistRoute(routeName, yaml);
      toast.success('Saved to disk', `"${routeName}.yaml" written to the hot-reload directory. Route survives restarts.`);
    } catch {
      toast.error('Save failed', 'Ensure the ESB runtime is running on :9090.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeploy = async () => {
    if (nodes.length === 0) { toast.warning('Canvas is empty', 'Add nodes to build a route first.'); return; }
    setDeploying(true);
    try {
      await esbApi.deployRoute(yaml);
      toast.success('Route deployed', `"${routeName}" is now active in the ESB runtime.`);
    } catch {
      toast.error('Deploy failed', 'Ensure the ESB runtime is running on :9090.');
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#f0f4ff]">
      {/* Action bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-slate-100 flex-shrink-0">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Route Name</label>
          <input
            value={routeName}
            onChange={e => setRouteName(e.target.value.replace(/\s+/g, '-').toLowerCase())}
            className="input-field text-xs py-1.5 w-48"
            placeholder="my-route"
          />
        </div>

        <div className="h-5 w-px bg-slate-200 mx-1" />

        <Button variant="ghost" size="sm" icon={<RotateCcw className="w-3.5 h-3.5" />} onClick={handleReset}>
          Reset
        </Button>
        <Button
          variant={showYaml ? 'primary' : 'secondary'}
          size="sm"
          icon={<Code2 className="w-3.5 h-3.5" />}
          onClick={() => setShowYaml(v => !v)}
        >
          YAML
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<Play className="w-3.5 h-3.5" />}
          loading={validating}
          onClick={handleValidate}
        >
          Validate
        </Button>
        <Button
          size="sm"
          icon={<Send className="w-3.5 h-3.5" />}
          loading={deploying}
          onClick={handleDeploy}
        >
          Deploy
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<Save className="w-3.5 h-3.5" />}
          loading={saving}
          onClick={handleSaveToDisk}
          title="Save YAML to hot-reload directory (survives restarts)"
        >
          Save to Disk
        </Button>
      </div>

      {/* Main area */}
      <div className="flex-1 flex min-h-0">
        {/* Component palette */}
        <div className="w-52 flex-shrink-0 bg-white border-r border-slate-100 overflow-y-auto">
          <div className="px-3 py-2.5 border-b border-slate-100">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Components</p>
            <p className="text-[10px] text-slate-300 mt-0.5">Drag onto canvas</p>
          </div>
          <div className="p-2 space-y-4">
            {paletteGroups.map(({ group, icon, items }) => (
              <div key={group}>
                <div className="flex items-center gap-1.5 px-1 mb-1.5">
                  {icon}
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{group}</span>
                </div>
                <div className="space-y-1">
                  {items.map(item => (
                    <PaletteItem key={item.label} spec={item} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* React Flow canvas */}
        <div className="flex-1 min-w-0 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={NODE_TYPES}
            fitView
            deleteKeyCode="Delete"
          >
            <Background color="#c7d2fe" gap={20} size={1} />
            <Controls className="!shadow-sm !border !border-slate-200 !rounded-xl !overflow-hidden" />

            {nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-white border-2 border-dashed border-indigo-200 flex items-center justify-center mx-auto mb-3">
                    <ChevronDown className="w-7 h-7 text-indigo-300" />
                  </div>
                  <p className="text-sm font-medium text-slate-400">Drag components from the left panel</p>
                  <p className="text-xs text-slate-300 mt-1">Connect nodes to build your route flow</p>
                </div>
              </div>
            )}
          </ReactFlow>
        </div>

        {/* Property panel */}
        {selectedNode && (
          <PropertyPanel
            node={selectedNode}
            onChange={updateNodeData}
            onClose={() => setSelectedNode(null)}
            onOpenEditor={() => setTransformEditorTarget(selectedNode.id)}
          />
        )}
      </div>

      {/* Transform editor modals */}
      {transformEditorTarget && (() => {
        const node = nodes.find(n => n.id === transformEditorTarget);
        if (!node) return null;
        const type   = String(node.data.transformType || 'passthrough');
        const config = TRANSFORM_EDITOR_CONFIG[type];
        if (!config || config.editorMode === 'none') return null;

        const handleSave = (spec: string) => {
          setNodes(nds => nds.map(n =>
            n.id === transformEditorTarget
              ? { ...n, data: { ...n.data, inlineSpec: spec } }
              : n
          ));
          setTransformEditorTarget(null);
        };

        if (config.editorMode === 'visual-mapper') {
          return (
            <JoltFieldMapperModal
              isOpen
              onClose={() => setTransformEditorTarget(null)}
              onSave={handleSave}
              initialSpec={node.data.inlineSpec as string | undefined}
              nodeLabel={String(node.data.label)}
            />
          );
        }
        return (
          <CodeEditorModal
            isOpen
            onClose={() => setTransformEditorTarget(null)}
            onSave={handleSave}
            initialSpec={node.data.inlineSpec as string | undefined}
            nodeLabel={String(node.data.label)}
            language={config.language!}
            inputFormat={config.inputFormat}
          />
        );
      })()}

      {/* YAML preview panel */}
      {showYaml && (
        <div className="flex-shrink-0 border-t border-slate-200 bg-slate-900" style={{ height: 180 }}>
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Generated YAML</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(yaml);
                toast.success('Copied', 'YAML copied to clipboard.');
              }}
              className="text-xs text-slate-400 hover:text-white transition-colors"
            >
              Copy
            </button>
          </div>
          <div className="overflow-auto h-[136px] px-4 py-3">
            <pre className="text-xs text-green-400 font-mono whitespace-pre leading-relaxed">{yaml}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page wrapper ─────────────────────────────────────────────────────────────
export default function RouteBuilderPage() {
  return (
    <div className="h-full">
      <ReactFlowProvider>
        <BuilderCanvas />
      </ReactFlowProvider>
    </div>
  );
}

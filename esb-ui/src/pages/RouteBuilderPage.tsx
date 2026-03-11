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
  Tag, FileText, Code, ArrowRight, GitBranch, Radio, Plus, Trash2, Timer,
} from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { esbApi } from '../api/esb-api';
import { Button } from '../components/ui/Button';
import { JoltFieldMapperModal } from '../components/route-builder/JoltFieldMapperModal';
import { CodeEditorModal } from '../components/route-builder/CodeEditorModal';
import { GroovySoapMapperModal } from '../components/route-builder/GroovySoapMapperModal';

// ─── Transform editor plugin config ───────────────────────────────────────────
interface TransformEditorConfig {
  editorMode: 'visual-mapper' | 'soap-mapper' | 'soap-echo-mapper' | 'code-editor' | 'none';
  language?: string;
  inputFormat: 'json' | 'xml' | 'text';
  outputFormat: 'json' | 'xml' | 'text';
  label: string;
}

const TRANSFORM_EDITOR_CONFIG: Record<string, TransformEditorConfig> = {
  jolt:           { editorMode: 'visual-mapper', inputFormat: 'json',  outputFormat: 'json',  label: 'Field Mapper (JSON)' },
  xslt:           { editorMode: 'code-editor',  language: 'xml',    inputFormat: 'xml',   outputFormat: 'xml',   label: 'XSLT Editor' },
  groovy:         { editorMode: 'code-editor',  language: 'groovy', inputFormat: 'text',  outputFormat: 'text',  label: 'Script Editor' },
  'groovy-soap':      { editorMode: 'soap-mapper',      inputFormat: 'json', outputFormat: 'xml', label: 'SOAP Field Mapper' },
  'groovy-soap-echo': { editorMode: 'soap-echo-mapper', inputFormat: 'xml',  outputFormat: 'xml', label: 'SOAP Echo Mapper' },
  passthrough:    { editorMode: 'none',          inputFormat: 'text',  outputFormat: 'text',  label: '' },
};

// ─── Node data types ──────────────────────────────────────────────────────────
interface RoutingRule {
  id: string;
  condition: string;
  conditionLang: 'simple' | 'jsonpath' | 'xpath' | 'header';
  targetType: string;
  targetUrl: string;
  targetDest: string;      // JMS destination
  mockStatusCode: number;  // mock-response: HTTP status
  mockBody: string;        // mock-response: JSON/XML body
  isDefault: boolean;
}

interface FlowNodeData extends Record<string, unknown> {
  label: string;
  subType: string;
  // source fields
  method?: string;
  path?: string;
  periodMs?: number;   // timer source: poll interval in ms
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
  // ── Phase 2: step node fields ─────────────────────────────────────────────
  stepType?: 'set-header' | 'log' | 'script' | 'route-to' | 'split' | 'wire-tap';
  headerName?: string;
  headerExpression?: string;
  expressionLanguage?: 'simple' | 'jsonpath' | 'xpath' | 'constant' | 'header';
  logMessage?: string;
  logLevel?: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  scriptInline?: string;
  destination?: string;
  splitExpression?: string;
  parallelProcessing?: boolean;
  splitTimeout?: number;
  // ── Phase 2: router node fields ───────────────────────────────────────────
  routingRules?: RoutingRule[];
}
type FlowNode = Node<FlowNodeData>;

// ─── Shared node handle styles ────────────────────────────────────────────────
const handleStyle = { width: 10, height: 10, borderRadius: 5 };

// ─── Custom node: Source ──────────────────────────────────────────────────────
function SourceNode({ data, selected }: { data: FlowNodeData; selected: boolean }) {
  return (
    <div className={`rounded-xl shadow-sm border-2 min-w-[160px] overflow-hidden transition-all ${selected ? 'border-blue-500 shadow-blue-200 shadow-md' : 'border-blue-200'}`}>
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-3 py-2 flex items-center gap-1.5">
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
        {data.subType === 'timer' && (
          <div className="mt-1 flex items-center gap-1">
            <Timer className="w-3 h-3 text-indigo-400" />
            <span className="text-slate-500">every {Number(data.periodMs ?? 5000) / 1000}s</span>
          </div>
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

// ─── Custom node: Step ────────────────────────────────────────────────────────
const STEP_ICONS: Record<string, React.ReactNode> = {
  'set-header': <Tag className="w-3.5 h-3.5 text-white" />,
  'log':        <FileText className="w-3.5 h-3.5 text-white" />,
  'script':     <Code className="w-3.5 h-3.5 text-white" />,
  'route-to':   <ArrowRight className="w-3.5 h-3.5 text-white" />,
  'split':      <GitBranch className="w-3.5 h-3.5 text-white" />,
  'wire-tap':   <Radio className="w-3.5 h-3.5 text-white" />,
};

function StepNode({ data, selected }: { data: FlowNodeData; selected: boolean }) {
  const stepType = data.stepType || 'log';
  const icon = STEP_ICONS[stepType] ?? <Tag className="w-3.5 h-3.5 text-white" />;

  let detail = '';
  if (stepType === 'set-header')        detail = data.headerName ? `${data.headerName}` : '';
  else if (stepType === 'log')          detail = data.logMessage ? String(data.logMessage).slice(0, 30) : '';
  else if (stepType === 'script')       detail = 'Groovy';
  else if (stepType === 'route-to')     detail = data.destination ? String(data.destination) : '';
  else if (stepType === 'wire-tap')     detail = data.destination ? String(data.destination) : '';
  else if (stepType === 'split')        detail = data.splitExpression ? `$.${String(data.splitExpression).replace(/^\$\./, '')}` : '';

  return (
    <div className={`rounded-xl shadow-sm border-2 min-w-[140px] overflow-hidden transition-all ${selected ? 'border-amber-500 shadow-amber-200 shadow-md' : 'border-amber-200'}`}>
      <div className="bg-gradient-to-r from-amber-500 to-yellow-400 px-3 py-2 flex items-center gap-1.5">
        {icon}
        <span className="text-white text-xs font-bold uppercase tracking-wide">{stepType}</span>
      </div>
      <div className="bg-white px-3 py-2.5 text-xs">
        <div className="font-semibold text-[#1e3a8a]">{data.label}</div>
        {detail && <div className="mt-1 text-slate-400 truncate max-w-[120px]">{detail}</div>}
      </div>
      <Handle type="target" position={Position.Left}  style={handleStyle} className="!bg-amber-400 !border-white" />
      <Handle type="source" position={Position.Right} style={handleStyle} className="!bg-amber-500 !border-white" />
    </div>
  );
}

// ─── Custom node: Router ──────────────────────────────────────────────────────
function RouterNode({ data, selected }: { data: FlowNodeData; selected: boolean }) {
  const rules = (data.routingRules as RoutingRule[]) || [];
  return (
    <div className={`rounded-xl shadow-sm border-2 min-w-[200px] overflow-hidden transition-all ${selected ? 'border-rose-500 shadow-rose-200 shadow-md' : 'border-rose-200'}`}>
      <div className="bg-gradient-to-r from-rose-600 to-pink-500 px-3 py-2 flex items-center gap-1.5">
        <GitBranch className="w-3.5 h-3.5 text-white" />
        <span className="text-white text-xs font-bold uppercase tracking-wide">Content Router</span>
      </div>
      <div className="bg-white px-3 py-2.5 text-xs">
        <div className="font-semibold text-[#1e3a8a] mb-1">{data.label}</div>
        {rules.length === 0 && <div className="text-slate-300 italic">No rules — click to edit</div>}
        {rules.map(r => (
          <div key={r.id} className="flex items-center gap-1 text-[10px] py-0.5 border-b border-slate-50 last:border-0">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${r.isDefault ? 'bg-slate-400' : 'bg-rose-400'}`} />
            <span className="text-slate-500 truncate max-w-[80px]">{r.isDefault ? 'default' : r.condition || '…'}</span>
            <span className="text-slate-300 mx-0.5">→</span>
            <span className="text-slate-600 font-medium truncate max-w-[60px]">{r.targetType}</span>
          </div>
        ))}
      </div>
      <Handle type="target" position={Position.Left}  style={handleStyle} className="!bg-rose-400 !border-white" />
      <Handle type="source" position={Position.Right} style={handleStyle} className="!bg-rose-500 !border-white" />
    </div>
  );
}

const NODE_TYPES: NodeTypes = {
  source: SourceNode as never,
  transform: TransformNode as never,
  target: TargetNode as never,
  interceptor: InterceptorNode as never,
  step: StepNode as never,
  router: RouterNode as never,
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
        label: 'Direct Source', description: 'Internal direct:', nodeType: 'source', icon: <GitMerge className="w-3.5 h-3.5" />, color: 'text-blue-500',
        defaults: { subType: 'direct', path: 'resource.in' },
      },
      {
        label: 'Timer Source', description: 'Scheduled poll trigger', nodeType: 'source', icon: <Timer className="w-3.5 h-3.5" />, color: 'text-indigo-600',
        defaults: { subType: 'timer', periodMs: 10000, name: 'poll-timer' },
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
  {
    group: 'Steps',
    icon: <Tag className="w-3.5 h-3.5 text-amber-500" />,
    items: [
      {
        label: 'Set Header',  description: 'Set a message header',   nodeType: 'step', icon: <Tag className="w-3.5 h-3.5" />,        color: 'text-amber-600',
        defaults: { subType: 'set-header', stepType: 'set-header', headerName: 'X-Header', expressionLanguage: 'simple', headerExpression: "'value'" },
      },
      {
        label: 'Log',         description: 'Log a message',          nodeType: 'step', icon: <FileText className="w-3.5 h-3.5" />,   color: 'text-amber-500',
        defaults: { subType: 'log', stepType: 'log', logMessage: 'Processing ${header.X-Correlation-ID}', logLevel: 'INFO' },
      },
      {
        label: 'Script',      description: 'Inline Groovy script',   nodeType: 'step', icon: <Code className="w-3.5 h-3.5" />,       color: 'text-yellow-600',
        defaults: { subType: 'script', stepType: 'script', scriptInline: '// headers[\'X-Modified\'] = \'true\'' },
      },
      {
        label: 'Route-To',    description: 'Forward to direct route', nodeType: 'step', icon: <ArrowRight className="w-3.5 h-3.5" />, color: 'text-amber-700',
        defaults: { subType: 'route-to', stepType: 'route-to', destination: 'direct:my-route' },
      },
      {
        label: 'Splitter',    description: 'Split array payload',    nodeType: 'step', icon: <GitBranch className="w-3.5 h-3.5" />,  color: 'text-amber-600',
        defaults: { subType: 'split', stepType: 'split', splitExpression: '$.items', parallelProcessing: false, splitTimeout: 60000, destination: 'direct:process-item' },
      },
      {
        label: 'Wire-Tap',    description: 'Async side-channel copy', nodeType: 'step', icon: <Radio className="w-3.5 h-3.5" />,     color: 'text-yellow-700',
        defaults: { subType: 'wire-tap', stepType: 'wire-tap', destination: 'direct:audit' },
      },
    ],
  },
  {
    group: 'Routers',
    icon: <GitBranch className="w-3.5 h-3.5 text-rose-500" />,
    items: [
      {
        label: 'Content Router', description: 'Route by message content', nodeType: 'router', icon: <GitBranch className="w-3.5 h-3.5" />, color: 'text-rose-600',
        defaults: {
          subType: 'content-based',
          routingRules: [
            { id: 'rule-1', condition: "${header.X-Type} == 'A'", conditionLang: 'simple', targetType: 'mock-response', targetUrl: '', targetDest: '', mockStatusCode: 200, mockBody: '{"status":"ok","branch":"A"}', isDefault: false },
            { id: 'default', condition: '', conditionLang: 'simple', targetType: 'mock-response', targetUrl: '', targetDest: '', mockStatusCode: 200, mockBody: '{"status":"ok","branch":"default"}', isDefault: true },
          ],
        },
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
  rest:   { label: 'REST Source',  description: 'HTTP endpoint',       nodeType: 'source', icon: <Wifi className="w-3.5 h-3.5" />,    color: 'text-blue-600',   defaults: { subType: 'rest',   method: 'POST', path: '/v1/resource' } },
  direct: { label: 'Direct Source',description: 'Internal direct:',   nodeType: 'source', icon: <GitMerge className="w-3.5 h-3.5" />, color: 'text-blue-500',   defaults: { subType: 'direct', path: 'resource.in' } },
  timer:  { label: 'Timer Source', description: 'Scheduled poll trigger', nodeType: 'source', icon: <Timer className="w-3.5 h-3.5" />,  color: 'text-indigo-600', defaults: { subType: 'timer',  periodMs: 10000, name: 'poll-timer' } },
  kafka:  { label: 'Kafka Source', description: 'Kafka consumer',      nodeType: 'source', icon: <Wifi className="w-3.5 h-3.5" />,    color: 'text-green-600',  defaults: { subType: 'kafka' } },
  jms:    { label: 'JMS Source',   description: 'JMS queue/topic',     nodeType: 'source', icon: <GitMerge className="w-3.5 h-3.5" />, color: 'text-teal-600',   defaults: { subType: 'jms' } },
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
  const STEP = 280;

  const srcId = 'source-1';
  const reqId = 'transform-req';
  const resId = 'transform-res';
  const tgtId = 'target-1';

  // ── Source ─────────────────────────────────────────────────────────────────
  if (spec.source) {
    nodes.push({
      id: srcId, type: 'source', position: { x, y: Y },
      data: {
        label: `${String(spec.source.type || 'rest').toUpperCase()} Source`,
        subType: spec.source.type || 'rest',
        method: spec.source.method,
        path: spec.source.path ?? spec.source.name,
        name: spec.source.name,
        periodMs: spec.source.periodMs,
      },
    });
    x += STEP;
  }

  // ── Request Transform ──────────────────────────────────────────────────────
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

  // ── Process Steps ──────────────────────────────────────────────────────────
  let lastStepId: string = hasReqT ? reqId : srcId;
  if (spec.process?.steps?.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    spec.process.steps.forEach((step: any, idx: number) => {
      const stepId = `step-${step.id || idx}`;
      nodes.push({
        id: stepId, type: 'step', position: { x, y: Y },
        data: {
          label: step.type,
          subType: step.type,
          stepType: step.type,
          // set-header
          headerName: step.name,
          expressionLanguage: step.expression?.language,
          headerExpression: step.expression?.value,
          // log
          logMessage: step.message,
          logLevel: step.level || 'INFO',
          // script
          scriptInline: step.inline,
          // route-to / wire-tap / split destination
          destination: step.destination,
          // split
          splitExpression: step.expression?.value,
          parallelProcessing: step.parallelProcessing ?? false,
          splitTimeout: step.timeout ?? 60000,
        },
      });
      edges.push({ id: `e-${lastStepId}-${stepId}`, source: lastStepId, target: stepId, ...eStyle });
      lastStepId = stepId;
      x += STEP;
    });
  }

  // ── Target (simple route — no routing block) ───────────────────────────────
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
        mockStatusCode: spec.target.mockStatusCode,
        mockBody: spec.target.mockBody,
      },
    });
    edges.push({ id: 'e-last-tgt', source: lastStepId, target: tgtId, ...eStyle });
    lastStepId = tgtId;
  }

  // ── Content-Based Router ───────────────────────────────────────────────────
  if (spec.routing) {
    const routerId = 'router-1';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rules: RoutingRule[] = (spec.routing.rules || []).map((r: any) => ({
      id: r.id || `rule-${Math.random().toString(36).slice(2)}`,
      condition: r.condition?.value || '',
      conditionLang: (r.condition?.language || 'simple') as RoutingRule['conditionLang'],
      targetType: r.target?.type || 'http',
      targetUrl: r.target?.endpointUrl || '',
      targetDest: r.target?.destination || '',
      mockStatusCode: r.target?.mockStatusCode ?? 200,
      mockBody: r.target?.mockBody || '',
      isDefault: r.default ?? false,
    }));
    nodes.push({
      id: routerId, type: 'router', position: { x, y: Y },
      data: {
        label: 'Content Router',
        subType: spec.routing.type || 'content-based',
        routingRules: rules,
      },
    });
    edges.push({ id: 'e-last-router', source: lastStepId, target: routerId, ...eStyle });
    x += STEP;
  }

  // ── Response Transform ─────────────────────────────────────────────────────
  const resType = spec.transform?.response?.type;
  const hasResT = resType && resType !== 'passthrough';
  if (hasResT) {
    nodes.push({
      id: resId, type: 'transform', position: { x: 100 + STEP, y: Y + 140 },
      data: {
        label: 'Res Transform', subType: resType, transformType: resType, role: 'response',
        inlineSpec: spec.transform.response.inline || undefined,
      },
    });
    edges.push({ id: 'e-tgt-res', source: tgtId, target: resId, ...eStyle });
  }

  return { nodes, edges };
}

function buildYaml(nodes: FlowNode[], edges: Edge[], routeName: string): string {
  const src = nodes.find(n => n.type === 'source');
  const tgt = nodes.find(n => n.type === 'target');
  const reqT = nodes.find(n => n.type === 'transform' && n.data.role === 'request');
  const resT = nodes.find(n => n.type === 'transform' && n.data.role === 'response');
  const interceptors = nodes.filter(n => n.type === 'interceptor');

  // Sort step/router nodes by walking the edge graph from source.
  // This is reliable regardless of canvas x-position (which can be misleading).
  const nextMap = new Map<string, string>(); // nodeId → next nodeId
  edges.forEach(e => nextMap.set(e.source, e.target));
  const stepAndRouterIds = new Set(
    nodes.filter(n => n.type === 'step' || n.type === 'router').map(n => n.id)
  );
  const stepNodes: FlowNode[] = [];
  let cursor: string | undefined = src?.id;
  const visited = new Set<string>();
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const nextId = nextMap.get(cursor);
    if (!nextId) break;
    if (stepAndRouterIds.has(nextId)) {
      const found = nodes.find(n => n.id === nextId);
      if (found) stepNodes.push(found);
    }
    cursor = nextId;
  }
  // Fallback: any step/router not reachable via edges (disconnected) — append by x position
  nodes.filter(n => (n.type === 'step' || n.type === 'router') && !visited.has(n.id))
    .sort((a, b) => a.position.x - b.position.x)
    .forEach(n => stepNodes.push(n));

  const routerNode = stepNodes.find(n => n.type === 'router');

  const lines: string[] = [
    `apiVersion: esb/v1`,
    `kind: Route`,
    `metadata:`,
    `  name: ${routeName || 'my-route'}`,
  ];

  if (src) {
    lines.push(`source:`);
    lines.push(`  type: ${src.data.subType || 'rest'}`);
    if (src.data.subType === 'timer') {
      lines.push(`  periodMs: ${src.data.periodMs ?? 10000}`);
      if (src.data.name) lines.push(`  name: ${src.data.name}`);
    } else if (src.data.subType === 'direct') {
      if (src.data.path) lines.push(`  name: ${src.data.path}`);
    } else {
      if (src.data.method) lines.push(`  method: ${src.data.method}`);
      if (src.data.path)   lines.push(`  path: ${src.data.path}`);
    }
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
      const uiType = String(reqT.data.transformType || 'passthrough');
      // groovy-soap is a UI-only concept; the backend adapter is plain "groovy"
      const yamlType = uiType === 'groovy-soap' || uiType === 'groovy-soap-echo' ? 'groovy' : uiType;
      lines.push(`  request:`);
      lines.push(`    type: ${yamlType}`);
      if (reqT.data.inlineSpec) {
        const raw = String(reqT.data.inlineSpec);
        const compact = yamlType === 'jolt' ? JSON.stringify(JSON.parse(raw)) : raw;
        lines.push(`    inline: '${compact.replace(/'/g, "''")}'`);
      }
    }
    if (resT) {
      const uiType = String(resT.data.transformType || 'passthrough');
      const yamlType = uiType === 'groovy-soap' || uiType === 'groovy-soap-echo' ? 'groovy' : uiType;
      lines.push(`  response:`);
      lines.push(`    type: ${yamlType}`);
      if (resT.data.inlineSpec) {
        const raw = String(resT.data.inlineSpec);
        const compact = yamlType === 'jolt' ? JSON.stringify(JSON.parse(raw)) : raw;
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

  // ── Phase 2: process steps ────────────────────────────────────────────────
  if (stepNodes.length > 0) {
    lines.push(`process:`);
    lines.push(`  steps:`);
    for (const s of stepNodes) {
      const d = s.data;
      lines.push(`    - id: ${s.id}`);
      lines.push(`      type: ${d.stepType}`);
      switch (d.stepType) {
        case 'set-header':
          lines.push(`      name: ${d.headerName || 'X-Header'}`);
          lines.push(`      expression:`);
          lines.push(`        language: ${d.expressionLanguage || 'simple'}`);
          lines.push(`        value: "${String(d.headerExpression || '').replace(/"/g, '\\"')}"`);
          break;
        case 'log':
          lines.push(`      message: "${String(d.logMessage || '').replace(/"/g, '\\"')}"`);
          lines.push(`      level: ${d.logLevel || 'INFO'}`);
          break;
        case 'script':
          lines.push(`      language: groovy`);
          lines.push(`      inline: |`);
          for (const ln of String(d.scriptInline || '').split('\n'))
            lines.push(`        ${ln}`);
          break;
        case 'route-to':
        case 'wire-tap':
          lines.push(`      destination: ${d.destination || 'direct:unknown'}`);
          break;
        case 'split':
          lines.push(`      expression:`);
          lines.push(`        language: jsonpath`);
          lines.push(`        value: "${String(d.splitExpression || '$.items').replace(/"/g, '\\"')}"`);
          lines.push(`      parallelProcessing: ${d.parallelProcessing ?? false}`);
          lines.push(`      timeout: ${d.splitTimeout ?? 60000}`);
          if (d.destination) lines.push(`      destination: ${d.destination}`);
          break;
      }
    }
  }

  // ── Phase 2: content-based routing ───────────────────────────────────────
  if (routerNode?.data.routingRules && (routerNode.data.routingRules as RoutingRule[]).length > 0) {
    const rules = routerNode.data.routingRules as RoutingRule[];
    lines.push(`routing:`);
    lines.push(`  type: ${routerNode.data.subType || 'content-based'}`);
    lines.push(`  rules:`);
    for (const rule of rules) {
      lines.push(`    - id: ${rule.id}`);
      if (!rule.isDefault) {
        lines.push(`      condition:`);
        lines.push(`        language: ${rule.conditionLang || 'simple'}`);
        lines.push(`        value: "${String(rule.condition || '').replace(/"/g, '\\"')}"`);
      }
      if (rule.isDefault) lines.push(`      default: true`);
      lines.push(`      target:`);
      lines.push(`        type: ${rule.targetType || 'http'}`);
      if (rule.targetType === 'jms' && rule.targetDest) {
        lines.push(`        destination: ${rule.targetDest}`);
      } else if (rule.targetType === 'mock-response') {
        lines.push(`        mockStatusCode: ${rule.mockStatusCode || 200}`);
        if (rule.mockBody) {
          lines.push(`        mockBody: |`);
          for (const ln of rule.mockBody.split('\n'))
            lines.push(`          ${ln}`);
        }
      } else if (rule.targetUrl) {
        lines.push(`        endpointUrl: ${rule.targetUrl}`);
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
            <p className="text-[10px] text-slate-400 mt-1">Must match the <code>destination:</code> of the route-to / split step that calls this route.</p>
          </div>
        )}
        {node.type === 'source' && d.subType === 'timer' && (
          <>
            <div>
              <label className={labelCls}>Poll Interval (ms)</label>
              <input className={inputCls} type="number" min={1000} step={1000}
                value={Number(d.periodMs ?? 10000)}
                onChange={e => onChange('periodMs', parseInt(e.target.value))} />
              <p className="text-[10px] text-slate-400 mt-1">
                {Number(d.periodMs ?? 10000) / 1000}s — fires on startup then every interval
              </p>
            </div>
            <div>
              <label className={labelCls}>Timer Name</label>
              <input className={inputCls} value={String(d.name || 'poll-timer')} placeholder="poll-timer"
                onChange={e => onChange('name', e.target.value)} />
              <p className="text-[10px] text-slate-400 mt-1">Used in logs and JMX. Keep it unique per route.</p>
            </div>
          </>
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
                <option value="jolt">Field Mapper (JSON→JSON)</option>
                <option value="groovy-soap">SOAP Field Mapper (JSON→SOAP)</option>
                <option value="groovy-soap-echo">SOAP Echo Mapper (SOAP→SOAP)</option>
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

        {/* Step-specific */}
        {node.type === 'step' && (
          <>
            <div>
              <label className={labelCls}>Step Type</label>
              <select className={inputCls + ' appearance-none cursor-pointer'} value={String(d.stepType || 'log')} onChange={e => onChange('stepType', e.target.value)}>
                <option value="set-header">Set Header</option>
                <option value="log">Log</option>
                <option value="script">Script (Groovy)</option>
                <option value="route-to">Route-To</option>
                <option value="split">Splitter</option>
                <option value="wire-tap">Wire-Tap</option>
              </select>
            </div>
            {d.stepType === 'set-header' && (
              <>
                <div>
                  <label className={labelCls}>Header Name</label>
                  <input className={inputCls} value={String(d.headerName || '')} placeholder="X-My-Header" onChange={e => onChange('headerName', e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Language</label>
                  <select className={inputCls + ' appearance-none cursor-pointer'} value={String(d.expressionLanguage || 'simple')} onChange={e => onChange('expressionLanguage', e.target.value)}>
                    <option value="simple">Simple</option>
                    <option value="constant">Constant</option>
                    <option value="header">Header</option>
                    <option value="jsonpath">JSONPath</option>
                    <option value="xpath">XPath</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Expression</label>
                  <input className={inputCls} value={String(d.headerExpression || '')} placeholder="${header.someHeader}" onChange={e => onChange('headerExpression', e.target.value)} />
                </div>
              </>
            )}
            {d.stepType === 'log' && (
              <>
                <div>
                  <label className={labelCls}>Message</label>
                  <input className={inputCls} value={String(d.logMessage || '')} placeholder="Processing ${header.X-Correlation-ID}" onChange={e => onChange('logMessage', e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Level</label>
                  <select className={inputCls + ' appearance-none cursor-pointer'} value={String(d.logLevel || 'INFO')} onChange={e => onChange('logLevel', e.target.value)}>
                    <option value="INFO">INFO</option>
                    <option value="WARN">WARN</option>
                    <option value="ERROR">ERROR</option>
                    <option value="DEBUG">DEBUG</option>
                  </select>
                </div>
              </>
            )}
            {d.stepType === 'script' && (
              <div>
                <label className={labelCls}>Groovy Script</label>
                <textarea className={inputCls + ' font-mono text-xs resize-y'} rows={5} value={String(d.scriptInline || '')} placeholder={"// headers['X-Modified'] = 'true'"} onChange={e => onChange('scriptInline', e.target.value)} />
              </div>
            )}
            {(d.stepType === 'route-to' || d.stepType === 'wire-tap') && (
              <div>
                <label className={labelCls}>Destination</label>
                <input className={inputCls} value={String(d.destination || '')} placeholder="direct:my-route" onChange={e => onChange('destination', e.target.value)} />
              </div>
            )}
            {d.stepType === 'split' && (
              <>
                <div>
                  <label className={labelCls}>JSONPath Expression</label>
                  <input className={inputCls} value={String(d.splitExpression || '')} placeholder="$.items" onChange={e => onChange('splitExpression', e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Destination Route</label>
                  <input className={inputCls} value={String(d.destination || '')} placeholder="direct:process-item" onChange={e => onChange('destination', e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="pp" checked={Boolean(d.parallelProcessing)} onChange={e => onChange('parallelProcessing', e.target.checked)} className="rounded" />
                  <label htmlFor="pp" className="text-xs text-slate-600">Parallel Processing</label>
                </div>
                <div>
                  <label className={labelCls}>Timeout (ms)</label>
                  <input className={inputCls} type="number" value={Number(d.splitTimeout || 60000)} onChange={e => onChange('splitTimeout', parseInt(e.target.value))} />
                </div>
              </>
            )}
          </>
        )}

        {/* Router-specific */}
        {node.type === 'router' && (
          <RouterRuleEditor
            rules={(d.routingRules as RoutingRule[]) || []}
            onChange={rules => onChange('routingRules', rules)}
            inputCls={inputCls}
            labelCls={labelCls}
          />
        )}
      </div>
    </div>
  );
}

// ─── Router rule editor (used inside PropertyPanel for router nodes) ──────────
function RouterRuleEditor({
  rules,
  onChange,
  inputCls,
  labelCls,
}: {
  rules: RoutingRule[];
  onChange: (rules: RoutingRule[]) => void;
  inputCls: string;
  labelCls: string;
}) {
  const update = (idx: number, key: keyof RoutingRule, val: unknown) => {
    onChange(rules.map((r, i) => i === idx ? { ...r, [key]: val } : r));
  };
  const addRule = () => {
    onChange([...rules, { id: `rule-${Date.now()}`, condition: '', conditionLang: 'simple', targetType: 'mock-response', targetUrl: '', targetDest: '', mockStatusCode: 200, mockBody: '{"status":"ok"}', isDefault: false }]);
  };
  const remove = (idx: number) => onChange(rules.filter((_, i) => i !== idx));

  return (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-[#1e3a8a]">Routing Rules</span>
        <button onClick={addRule} className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 transition-colors">
          <Plus className="w-3 h-3" /> Add Rule
        </button>
      </div>
      {rules.map((rule, idx) => (
        <div key={rule.id} className="border border-slate-100 rounded-lg p-2 space-y-1.5 bg-slate-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <input type="checkbox" checked={rule.isDefault} onChange={e => update(idx, 'isDefault', e.target.checked)} className="rounded" />
              <span className="text-[10px] text-slate-500">Default</span>
            </div>
            <button onClick={() => remove(idx)} className="text-slate-300 hover:text-red-400 transition-colors">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
          {!rule.isDefault && (
            <>
              <div>
                <label className={labelCls}>Condition</label>
                <input className={inputCls} value={rule.condition} placeholder="${header.X-Type} == 'A'" onChange={e => update(idx, 'condition', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Language</label>
                <select className={inputCls + ' appearance-none cursor-pointer'} value={rule.conditionLang} onChange={e => update(idx, 'conditionLang', e.target.value as RoutingRule['conditionLang'])}>
                  <option value="simple">Simple</option>
                  <option value="jsonpath">JSONPath</option>
                  <option value="xpath">XPath</option>
                  <option value="header">Header</option>
                </select>
              </div>
            </>
          )}
          <div>
            <label className={labelCls}>Target Type</label>
            <select className={inputCls + ' appearance-none cursor-pointer'} value={rule.targetType} onChange={e => update(idx, 'targetType', e.target.value)}>
              <option value="http">HTTP / REST</option>
              <option value="soap">SOAP</option>
              <option value="jms">JMS</option>
              <option value="mock-response">Mock Response</option>
              <option value="mock-echo">Mock Echo</option>
            </select>
          </div>
          {rule.targetType === 'jms' && (
            <div>
              <label className={labelCls}>JMS Destination</label>
              <input className={inputCls} value={rule.targetDest} placeholder="queue.my-queue" onChange={e => update(idx, 'targetDest', e.target.value)} />
            </div>
          )}
          {(rule.targetType === 'http' || rule.targetType === 'soap') && (
            <div>
              <label className={labelCls}>Endpoint URL</label>
              <input className={inputCls} value={rule.targetUrl} placeholder="http://service/api" onChange={e => update(idx, 'targetUrl', e.target.value)} />
            </div>
          )}
          {(rule.targetType === 'mock-response' || rule.targetType === 'mock-echo') && rule.targetType !== 'mock-echo' && (
            <>
              <div>
                <label className={labelCls}>Status Code</label>
                <select
                  className={inputCls + ' appearance-none cursor-pointer'}
                  value={String(rule.mockStatusCode || 200)}
                  onChange={e => update(idx, 'mockStatusCode', parseInt(e.target.value))}
                >
                  <option value="200">200 OK</option>
                  <option value="201">201 Created</option>
                  <option value="202">202 Accepted</option>
                  <option value="204">204 No Content</option>
                  <option value="400">400 Bad Request</option>
                  <option value="404">404 Not Found</option>
                  <option value="500">500 Server Error</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Response Body (JSON/XML)</label>
                <textarea
                  className={inputCls + ' font-mono resize-y'}
                  rows={4}
                  value={rule.mockBody || ''}
                  placeholder={'{\n  "status": "ok"\n}'}
                  onChange={e => update(idx, 'mockBody', e.target.value)}
                />
              </div>
            </>
          )}
        </div>
      ))}
    </>
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

  // Load route for editing when navigated from Routes page (Edit button).
  // After loading, clear location.state so navigating back doesn't reload the
  // original spec (which would resurrect nodes the user intentionally deleted).
  useEffect(() => {
    const state = location.state as { spec?: unknown; routeName?: string } | null;
    if (!state?.spec) return;
    const { nodes: n, edges: e } = specToNodesAndEdges(state.spec);
    setNodes(n);
    setEdges(e);
    if (state.routeName) setRouteName(state.routeName);
    setSelectedNode(null);
    // Replace history entry with no state — prevents stale spec reload on remount
    window.history.replaceState({}, '', window.location.pathname);
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
          prev[4],  // Steps — static (Phase 2)
          prev[5],  // Routers — static (Phase 2)
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

  const yaml = buildYaml(nodes, edges, routeName);

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
        if (config.editorMode === 'soap-mapper') {
          return (
            <GroovySoapMapperModal
              isOpen
              onClose={() => setTransformEditorTarget(null)}
              onSave={handleSave}
              initialSpec={node.data.inlineSpec as string | undefined}
              nodeLabel={String(node.data.label)}
            />
          );
        }
        if (config.editorMode === 'soap-echo-mapper') {
          return (
            <GroovySoapMapperModal
              isOpen
              onClose={() => setTransformEditorTarget(null)}
              onSave={handleSave}
              initialSpec={node.data.inlineSpec as string | undefined}
              nodeLabel={String(node.data.label)}
              sourceType="soap"
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

import { useState, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import { GripVertical, Link2Off, Plus, Trash2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useTransformPreview } from '../../hooks/useTransformPreview';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SoapConfig {
  prefix: string;   // e.g. "bank"
  uri: string;      // e.g. "http://bank.com/core"
  operation: string;// e.g. "GetAccountBalanceRequest"
}

interface SourceField {
  path: string;     // "body.accountNumber" | "header.accountId"
  preview: string;
}

interface SoapField {
  id: string;
  name: string;         // XML element name, e.g. "accountNumber"
  defaultValue: string; // Groovy Elvis fallback, e.g. "UNKNOWN"
}

interface SoapConnection {
  sourcePath: string;  // SourceField.path
  soapFieldId: string; // SoapField.id
}

// ─── Code generators ─────────────────────────────────────────────────────────

function extractSoapFields(xmlText: string): SourceField[] {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('Invalid XML');
  const all = Array.from(doc.getElementsByTagName('*'));
  const bodyEl = all.find(el => el.localName === 'Body') ?? doc.documentElement;
  const fields: SourceField[] = [];
  const seen = new Set<string>();
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      const name = child.localName;
      const text = child.children.length === 0 ? child.textContent?.trim() ?? '' : '';
      if (text !== '' && !seen.has(name)) {
        seen.add(name);
        fields.push({ path: `soap.${name}`, preview: text });
      }
      walk(child);
    }
  };
  walk(bodyEl);
  return fields;
}

function extractBodyFields(obj: unknown, prefix = ''): SourceField[] {
  if (obj === null || obj === undefined) return [];
  if (Array.isArray(obj)) {
    if (obj.length === 0) return [];
    return extractBodyFields(obj[0], prefix + '[]');
  }
  if (typeof obj !== 'object') {
    return [{ path: 'body.' + prefix, preview: String(obj) }];
  }
  const result: SourceField[] = [];
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    const childPath = prefix ? `${prefix}.${key}` : key;
    result.push(...extractBodyFields(val, childPath));
  }
  return result;
}

function sourcePathToGroovyExpr(sourcePath: string, defaultValue: string): string {
  const esc = (defaultValue || 'UNKNOWN').replace(/'/g, "\\'");
  if (sourcePath.startsWith('soap.')) {
    const name = sourcePath.substring('soap.'.length);
    return `getXmlField('${name}') ?: '${esc}'`;
  }
  if (sourcePath.startsWith('header.')) {
    const key = sourcePath.substring('header.'.length);
    return `headers['${key}'] ?: '${esc}'`;
  }
  // body.a.b.c → req.a?.b?.c ?: 'default'  (safe navigation for nested)
  const bodyPath = sourcePath.substring('body.'.length).replace(/\[\]/g, '');
  const parts = bodyPath.split('.').filter(Boolean);
  const groovyPath =
    parts.length === 1
      ? `req.${parts[0]}`
      : `req.${parts[0]}${parts.slice(1).map(p => `?.${p}`).join('')}`;
  return `${groovyPath} ?: '${esc}'`;
}

function buildGroovyScript(
  connections: SoapConnection[],
  soapConfig: SoapConfig,
  soapFields: SoapField[],
  sourceType: 'json' | 'soap' = 'json',
): string {
  if (!soapConfig.operation.trim()) return '// Set the Operation Name above to generate script';
  if (connections.length === 0)     return '// Draw connections between source and SOAP fields to generate script';

  const lines: string[] = [];

  if (sourceType === 'soap') {
    lines.push('def getXmlField = { String name ->');
    lines.push('  def m = body =~ /<[^:>]*:?${name}[^>]*>\\s*([^<]+?)\\s*</');
    lines.push('  m.find() ? m.group(1) : null');
    lines.push('}');
  } else {
    const needsBody = connections.some(c => c.sourcePath.startsWith('body.'));
    if (needsBody) {
      lines.push('import groovy.json.JsonSlurper');
      lines.push('def req = new JsonSlurper().parseText(body)');
    }
  }

  const pad = '      ';
  const mappedLines = soapFields
    .filter(f => connections.some(c => c.soapFieldId === f.id))
    .map(f => {
      const conn = connections.find(c => c.soapFieldId === f.id)!;
      const expr = sourcePathToGroovyExpr(conn.sourcePath, f.defaultValue);
      return `${pad}<${soapConfig.prefix}:${f.name}>\${${expr}}</${soapConfig.prefix}:${f.name}>`;
    });

  lines.push(
    `"""<?xml version="1.0" encoding="UTF-8"?>`,
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:${soapConfig.prefix}="${soapConfig.uri}">`,
    `  <soapenv:Header/>`,
    `  <soapenv:Body>`,
    `    <${soapConfig.prefix}:${soapConfig.operation}>`,
    ...mappedLines,
    `    </${soapConfig.prefix}:${soapConfig.operation}>`,
    `  </soapenv:Body>`,
    `</soapenv:Envelope>"""`,
  );

  return lines.join('\n');
}

// ─── ID helper ───────────────────────────────────────────────────────────────
let _idSeq = 0;
const nextId = () => `sf-${++_idSeq}`;

// ─── Component ────────────────────────────────────────────────────────────────

interface GroovySoapMapperModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (groovyScript: string) => void;
  initialSpec?: string;
  nodeLabel: string;
  sourceType?: 'json' | 'soap';
}

export function GroovySoapMapperModal({
  isOpen,
  onClose,
  onSave,
  nodeLabel,
  sourceType = 'json',
}: GroovySoapMapperModalProps) {
  // ── SOAP config ─────────────────────────────────────────────────────────────
  const [soapConfig, setSoapConfig] = useState<SoapConfig>({
    prefix: 'bank',
    uri: 'http://bank.com/core',
    operation: 'GetAccountBalanceRequest',
  });

  // ── Source: body fields ──────────────────────────────────────────────────────
  const [sourceSample, setSourceSample] = useState(
    sourceType === 'soap'
      ? `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:bank="http://bank.com/core">
  <soapenv:Header/>
  <soapenv:Body>
    <bank:GetAccountBalanceRequest>
      <bank:accountNumber>12345</bank:accountNumber>
      <bank:currency>USD</bank:currency>
      <bank:requestedBy>branch-007</bank:requestedBy>
    </bank:GetAccountBalanceRequest>
  </soapenv:Body>
</soapenv:Envelope>`
      : '{\n  "accountNumber": "12345",\n  "currency": "USD",\n  "requestedBy": "branch-007"\n}',
  );
  const [bodyFields, setBodyFields] = useState<SourceField[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  // ── Source: header fields ────────────────────────────────────────────────────
  const [headerFields, setHeaderFields] = useState<SourceField[]>(
    sourceType === 'soap' ? [] : [{ path: 'header.accountId', preview: 'path param' }],
  );
  const [newHeaderName, setNewHeaderName] = useState('');

  // ── SOAP target fields ───────────────────────────────────────────────────────
  const [soapFields, setSoapFields] = useState<SoapField[]>([
    { id: nextId(), name: 'accountNumber', defaultValue: 'UNKNOWN' },
    { id: nextId(), name: 'currency',      defaultValue: 'USD' },
  ]);
  const [newSoapName, setNewSoapName] = useState('');

  // ── Connections ──────────────────────────────────────────────────────────────
  const [connections, setConnections] = useState<SoapConnection[]>([]);
  const [dragging, setDragging] = useState<string | null>(null); // sourcePath

  // ── SVG lines ────────────────────────────────────────────────────────────────
  const sourceRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const targetRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<
    { x1: number; y1: number; x2: number; y2: number; sourcePath: string; soapFieldId: string }[]
  >([]);

  // ── Preview ──────────────────────────────────────────────────────────────────
  const { result: previewResult, loading: previewing, runPreview, clearPreview } =
    useTransformPreview();

  // ── Script ───────────────────────────────────────────────────────────────────
  const generatedScript = buildGroovyScript(connections, soapConfig, soapFields, sourceType);

  // ── Reset on open ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) { clearPreview(); return; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ── Parse source (JSON or SOAP XML) ─────────────────────────────────────────
  const parseBody = useCallback(() => {
    setParseError(null);
    try {
      if (sourceType === 'soap') {
        setBodyFields(extractSoapFields(sourceSample));
      } else {
        setBodyFields(extractBodyFields(JSON.parse(sourceSample)));
      }
      setConnections([]);
    } catch (e: unknown) {
      setParseError(e instanceof Error ? e.message : sourceType === 'soap' ? 'Invalid XML' : 'Invalid JSON');
    }
  }, [sourceSample, sourceType]);

  // ── Header field management ──────────────────────────────────────────────────
  const addHeader = () => {
    const name = newHeaderName.trim();
    if (!name) return;
    const path = `header.${name}`;
    if (headerFields.some(f => f.path === path)) return;
    setHeaderFields(prev => [...prev, { path, preview: 'header' }]);
    setNewHeaderName('');
  };

  const removeHeader = (path: string) => {
    setHeaderFields(prev => prev.filter(f => f.path !== path));
    setConnections(prev => prev.filter(c => c.sourcePath !== path));
  };

  // ── SOAP field management ────────────────────────────────────────────────────
  const addSoapField = () => {
    const name = newSoapName.trim();
    if (!name) return;
    setSoapFields(prev => [...prev, { id: nextId(), name, defaultValue: 'UNKNOWN' }]);
    setNewSoapName('');
  };

  const removeSoapField = (id: string) => {
    setSoapFields(prev => prev.filter(f => f.id !== id));
    setConnections(prev => prev.filter(c => c.soapFieldId !== id));
  };

  const updateSoapField = (id: string, key: keyof SoapField, value: string) => {
    setSoapFields(prev => prev.map(f => f.id === id ? { ...f, [key]: value } : f));
  };

  // ── Drag & drop ──────────────────────────────────────────────────────────────
  const onDrop = (soapFieldId: string) => {
    if (!dragging) return;
    setConnections(prev => {
      const filtered = prev.filter(
        c => c.soapFieldId !== soapFieldId && c.sourcePath !== dragging,
      );
      return [...filtered, { sourcePath: dragging, soapFieldId }];
    });
    setDragging(null);
  };

  const removeConnection = (sourcePath: string, soapFieldId: string) => {
    setConnections(prev =>
      prev.filter(c => !(c.sourcePath === sourcePath && c.soapFieldId === soapFieldId)),
    );
  };

  // ── SVG lines ────────────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const box = containerRef.current.getBoundingClientRect();
    const newLines = connections.flatMap(conn => {
      const srcEl = sourceRefs.current.get(conn.sourcePath);
      const tgtEl = targetRefs.current.get(conn.soapFieldId);
      if (!srcEl || !tgtEl) return [];
      const sr = srcEl.getBoundingClientRect();
      const tr = tgtEl.getBoundingClientRect();
      return [{
        x1: sr.right  - box.left,
        y1: sr.top + sr.height / 2 - box.top,
        x2: tr.left   - box.left,
        y2: tr.top + tr.height / 2 - box.top,
        sourcePath: conn.sourcePath,
        soapFieldId: conn.soapFieldId,
      }];
    });
    setLines(prev =>
      prev.length === newLines.length &&
      prev.every((l, i) => l.x1 === newLines[i].x1 && l.y1 === newLines[i].y1 &&
                           l.x2 === newLines[i].x2 && l.y2 === newLines[i].y2)
        ? prev : newLines,
    );
  });

  // ── Preview + Save ────────────────────────────────────────────────────────────
  const handlePreview = async () => {
    const headers: Record<string, string> = {};
    headerFields.forEach(f => {
      headers[f.path.substring('header.'.length)] = f.preview || 'sample';
    });
    await runPreview('groovy', generatedScript, sourceSample, headers);
  };

  const handleSave = () => {
    onSave(generatedScript);
  };

  // ── All source fields (body + header) for canvas ──────────────────────────────
  const allSourceFields: SourceField[] = [
    ...bodyFields,
    ...headerFields,
  ];

  const footer = (
    <>
      <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
      <Button variant="secondary" size="sm" loading={previewing} onClick={handlePreview}
        disabled={connections.length === 0}>
        Preview Output
      </Button>
      <Button size="sm" onClick={handleSave} disabled={connections.length === 0}>
        Save
      </Button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={sourceType === 'soap' ? `SOAP Echo Mapper — ${nodeLabel}` : `SOAP Field Mapper — ${nodeLabel}`} size="xl" footer={footer}>

      {/* ── Row 1: SOAP Config ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
        <div>
          <label className="label mb-1">Namespace Prefix</label>
          <input
            className="input-field text-xs font-mono"
            value={soapConfig.prefix}
            onChange={e => setSoapConfig(s => ({ ...s, prefix: e.target.value }))}
            placeholder="bank"
          />
        </div>
        <div>
          <label className="label mb-1">Namespace URI</label>
          <input
            className="input-field text-xs font-mono"
            value={soapConfig.uri}
            onChange={e => setSoapConfig(s => ({ ...s, uri: e.target.value }))}
            placeholder="http://example.com/service"
          />
        </div>
        <div>
          <label className="label mb-1">Operation Name</label>
          <input
            className="input-field text-xs font-mono"
            value={soapConfig.operation}
            onChange={e => setSoapConfig(s => ({ ...s, operation: e.target.value }))}
            placeholder="GetAccountBalanceRequest"
          />
        </div>
      </div>

      {/* ── Row 2: Schema setup (body sample | SOAP fields) ───────────────── */}
      <div className="grid grid-cols-2 gap-3 mb-4">

        {/* Left — body sample + header fields */}
        <div className="space-y-2">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label">{sourceType === 'soap' ? 'SOAP XML Sample' : 'JSON Body Sample'}</label>
              <Button variant="secondary" size="sm" onClick={parseBody}>Parse Fields</Button>
            </div>
            <textarea
              className="input-field font-mono text-xs h-20 resize-y"
              value={sourceSample}
              onChange={e => setSourceSample(e.target.value)}
              spellCheck={false}
            />
            {parseError && <p className="text-xs text-red-500 mt-1">{parseError}</p>}
          </div>

          {/* Header fields — hidden in soap-echo mode */}
          {sourceType !== 'soap' && (
          <div>
            <label className="label mb-1">
              Header / Path Params
              <span className="text-slate-400 font-normal normal-case ml-1">(e.g. accountId)</span>
            </label>
            <div className="space-y-1 mb-1.5">
              {headerFields.map(f => (
                <div key={f.path} className="flex items-center gap-1.5">
                  <span className="flex-1 text-xs font-mono text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-2 py-1 truncate">
                    {f.path.substring('header.'.length)}
                  </span>
                  <button
                    onClick={() => removeHeader(f.path)}
                    className="text-slate-300 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input
                className="input-field text-xs flex-1"
                placeholder="headerName"
                value={newHeaderName}
                onChange={e => setNewHeaderName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addHeader()}
              />
              <Button variant="secondary" size="sm" onClick={addHeader}>
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          </div>
          )}
        </div>

        {/* Right — SOAP fields */}
        <div>
          <label className="label mb-1">
            SOAP XML Elements
            <span className="text-slate-400 font-normal normal-case ml-1">(drop targets)</span>
          </label>
          <div className="space-y-1 mb-1.5 max-h-40 overflow-y-auto">
            {soapFields.map(f => (
              <div key={f.id} className="flex items-center gap-1.5">
                <input
                  className="input-field text-xs font-mono flex-[2]"
                  value={f.name}
                  onChange={e => updateSoapField(f.id, 'name', e.target.value)}
                  placeholder="elementName"
                  title="XML element name"
                />
                <input
                  className="input-field text-xs flex-1"
                  value={f.defaultValue}
                  onChange={e => updateSoapField(f.id, 'defaultValue', e.target.value)}
                  placeholder="default"
                  title="Fallback value (Elvis ?: operator)"
                />
                <button
                  onClick={() => removeSoapField(f.id)}
                  className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              className="input-field text-xs flex-1"
              placeholder="elementName"
              value={newSoapName}
              onChange={e => setNewSoapName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSoapField()}
            />
            <Button variant="secondary" size="sm" onClick={addSoapField}>
              <Plus className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Row 3: Visual mapper canvas ────────────────────────────────────── */}
      <div
        className="relative border border-slate-200 rounded-xl overflow-hidden"
        ref={containerRef}
        style={{ minHeight: 220 }}
      >
        {/* SVG connection lines */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 10 }}>
          {lines.map((ln, i) => {
            const cx = (ln.x2 - ln.x1) / 2;
            const d = `M ${ln.x1} ${ln.y1} C ${ln.x1 + cx} ${ln.y1}, ${ln.x2 - cx} ${ln.y2}, ${ln.x2} ${ln.y2}`;
            return (
              <path
                key={i}
                d={d}
                fill="none"
                stroke="#f59e0b"
                strokeWidth={2}
                style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                onClick={() => removeConnection(ln.sourcePath, ln.soapFieldId)}
              />
            );
          })}
        </svg>

        <div className="flex" style={{ minHeight: 220 }}>

          {/* Left — source fields */}
          <div className="w-[38%] border-r border-slate-200 p-3 space-y-1.5 bg-slate-50">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              {sourceType === 'soap' ? 'SOAP Request Fields' : 'Source Fields'}
            </p>
            {allSourceFields.length === 0 && (
              <p className="text-xs text-slate-300 italic">
                {sourceType === 'soap'
                  ? <>Paste SOAP XML above → Parse Fields</>
                  : <>Paste JSON above → Parse Fields<br />or add header fields</>
                }
              </p>
            )}
            {allSourceFields.map(field => {
              const isConnected = connections.some(c => c.sourcePath === field.path);
              const isHeader = field.path.startsWith('header.');
              const isSoap = field.path.startsWith('soap.');
              return (
                <div
                  key={field.path}
                  ref={el => {
                    if (el) sourceRefs.current.set(field.path, el);
                    else sourceRefs.current.delete(field.path);
                  }}
                  draggable
                  onDragStart={() => setDragging(field.path)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border cursor-grab active:cursor-grabbing select-none transition-colors ${
                    isConnected
                      ? 'border-amber-300 bg-amber-50'
                      : 'bg-white border-slate-200 hover:border-amber-300'
                  }`}
                >
                  <GripVertical className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className={`text-xs font-mono truncate ${isSoap ? 'text-orange-700' : isHeader ? 'text-violet-700' : 'text-indigo-700'}`}>
                      {field.path}
                    </div>
                    {field.preview && (
                      <div className="text-[10px] text-slate-400 truncate">{field.preview}</div>
                    )}
                  </div>
                  <span className={`text-[9px] px-1 rounded flex-shrink-0 ${isSoap ? 'bg-orange-100 text-orange-500' : isHeader ? 'bg-violet-100 text-violet-500' : 'bg-blue-100 text-blue-500'}`}>
                    {isSoap ? 'xml' : isHeader ? 'hdr' : 'body'}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Center */}
          <div className="w-[24%] bg-white flex items-center justify-center">
            {connections.length === 0 && allSourceFields.length > 0 && soapFields.length > 0 && (
              <p className="text-[10px] text-slate-300 italic text-center px-2 leading-relaxed">
                Drag a source field<br />onto a SOAP element
              </p>
            )}
            {connections.length > 0 && (
              <p className="text-[10px] text-amber-400 text-center px-2">
                Click a line<br />to remove
              </p>
            )}
          </div>

          {/* Right — SOAP element drop targets */}
          <div className="w-[38%] border-l border-slate-200 p-3 space-y-1.5 bg-slate-50">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              SOAP Elements
            </p>
            {soapFields.length === 0 && (
              <p className="text-xs text-slate-300 italic">Add SOAP elements above</p>
            )}
            {soapFields.map(field => {
              const conn = connections.find(c => c.soapFieldId === field.id);
              return (
                <div
                  key={field.id}
                  ref={el => {
                    if (el) targetRefs.current.set(field.id, el);
                    else targetRefs.current.delete(field.id);
                  }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => onDrop(field.id)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-colors ${
                    conn
                      ? 'border-amber-300 bg-amber-50'
                      : 'border-dashed border-slate-200 bg-white hover:border-amber-200'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-mono text-emerald-700 truncate">
                      {soapConfig.prefix}:{field.name}
                    </div>
                    {conn && (
                      <div className="text-[10px] text-amber-500 truncate">← {conn.sourcePath}</div>
                    )}
                    {!conn && field.defaultValue && (
                      <div className="text-[10px] text-slate-400 truncate">default: {field.defaultValue}</div>
                    )}
                  </div>
                  {conn && (
                    <button
                      onClick={() => removeConnection(conn.sourcePath, conn.soapFieldId)}
                      className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0"
                      title="Remove mapping"
                    >
                      <Link2Off className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Row 4: Generated Groovy script ─────────────────────────────────── */}
      <div className="mt-3">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
          Generated Groovy Script
        </p>
        <pre className="bg-slate-900 rounded-lg px-3 py-2 text-xs text-green-400 font-mono overflow-auto max-h-36 whitespace-pre-wrap">
          {generatedScript}
        </pre>
      </div>

      {/* ── Preview output ──────────────────────────────────────────────────── */}
      {(previewResult || previewing) && (
        <div className="mt-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Preview Output (SOAP XML)
          </p>
          {previewing && <p className="text-xs text-slate-400">Running…</p>}
          {previewResult?.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <p className="text-xs text-red-600 font-mono whitespace-pre-wrap">{previewResult.error}</p>
            </div>
          )}
          {previewResult?.output && (
            <pre className="bg-slate-900 rounded-lg px-3 py-2 text-xs text-green-400 font-mono overflow-auto max-h-32 whitespace-pre-wrap">
              {previewResult.output}
            </pre>
          )}
        </div>
      )}

    </Modal>
  );
}

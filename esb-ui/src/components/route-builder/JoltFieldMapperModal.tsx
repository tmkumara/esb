import { useState, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import { GripVertical, Link2Off } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useTransformPreview } from '../../hooks/useTransformPreview';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SchemaField {
  path: string;    // dot+bracket notation: e.g. "orders[].item.price"
  preview: string; // value preview from sample
}

interface Connection {
  inputPath: string;
  outputPath: string;
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Recursively extract leaf paths from a parsed JSON value.
 * Arrays are represented with [] notation: "orders[].item.name"
 */
function extractLeafPaths(obj: unknown, prefix = ''): SchemaField[] {
  if (obj === null || obj === undefined) {
    return prefix ? [{ path: prefix, preview: 'null' }] : [];
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) return [{ path: prefix + '[]', preview: 'array (empty)' }];
    // Recurse into first element to capture nested structure
    return extractLeafPaths(obj[0], prefix + '[]');
  }
  if (typeof obj !== 'object') {
    return [{ path: prefix, preview: String(obj) }];
  }
  const result: SchemaField[] = [];
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    const childPath = prefix ? `${prefix}.${key}` : key;
    result.push(...extractLeafPaths(val, childPath));
  }
  return result;
}

/**
 * Convert a dot+bracket output path to Jolt &N references.
 * Each [] in the output path (from right to left) gets replaced with [&(2k-1)].
 *
 * Example: "lines[].products[].cost" → "lines[&3].products[&1].cost"
 *
 * Why: Jolt's &N = Nth level up in the spec tree from where the value sits.
 * For input path a[].b[].c → spec is { a: { '*': { b: { '*': { c: OUTPUT } } } } }
 * From OUTPUT's position: &1 = inner *, &3 = outer *.
 */
function toJoltOutputPath(outputPath: string): string {
  let result = outputPath;
  let k = 1;
  let idx = result.lastIndexOf('[]');
  while (idx !== -1) {
    result = result.substring(0, idx) + `[&${2 * k - 1}]` + result.substring(idx + 2);
    k++;
    idx = result.lastIndexOf('[]');
  }
  return result;
}

/**
 * Build a nested Jolt shift spec object from one input path + output path.
 * "orders[].price" → nested: { orders: { '*': { price: OUTPUT } } }
 */
function setNestedJoltPath(
  spec: Record<string, unknown>,
  inputPath: string,
  joltOutput: string,
) {
  // "orders[].items[].name" → ["orders", "[]", "items", "[]", "name"]
  const segments = inputPath.replace(/\[\]/g, '.[]').split('.').filter(Boolean);

  let current = spec;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i] === '[]' ? '*' : segments[i];
    if (typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  const last = segments[segments.length - 1];
  current[last === '[]' ? '*' : last] = joltOutput;
}

/** Build complete Jolt shift spec JSON from all connections */
function buildJoltSpec(connections: Connection[]): string {
  const spec: Record<string, unknown> = {};
  for (const { inputPath, outputPath } of connections) {
    setNestedJoltPath(spec, inputPath, toJoltOutputPath(outputPath));
  }
  return JSON.stringify([{ operation: 'shift', spec }], null, 2);
}

/**
 * Best-effort: flatten a simple (non-nested) shift spec back to connections.
 * Complex/array specs are not fully reversible — shows what it can.
 */
function flattenShiftSpec(specObj: unknown): Connection[] {
  try {
    const arr = specObj as Array<{ operation: string; spec: Record<string, unknown> }>;
    const shiftOp = arr.find(op => op.operation === 'shift');
    if (!shiftOp?.spec) return [];
    const result: Connection[] = [];
    for (const [k, v] of Object.entries(shiftOp.spec)) {
      if (typeof v === 'string') {
        // Reverse &N notation back to [] for display
        const outputPath = v.replace(/\[&\d+\]/g, '[]');
        result.push({ inputPath: k, outputPath });
      }
    }
    return result;
  } catch {
    return [];
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface JoltFieldMapperModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (inlineSpec: string) => void;
  initialSpec?: string;
  nodeLabel: string;
}

export function JoltFieldMapperModal({
  isOpen,
  onClose,
  onSave,
  initialSpec,
  nodeLabel,
}: JoltFieldMapperModalProps) {
  // Schema samples
  const [sourceSample, setSourceSample] = useState(
    '{\n  "id": 1,\n  "name": "Alice",\n  "address": {\n    "city": "New York"\n  }\n}',
  );
  const [targetSample, setTargetSample] = useState(
    '{\n  "CustomerID": "",\n  "CustomerName": "",\n  "City": ""\n}',
  );

  // Parsed fields
  const [sourceFields, setSourceFields] = useState<SchemaField[]>([]);
  const [targetFields, setTargetFields] = useState<SchemaField[]>([]);

  // Connections and errors
  const [connections, setConnections] = useState<Connection[]>([]);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [targetError, setTargetError] = useState<string | null>(null);

  // Drag state
  const [draggingInput, setDraggingInput] = useState<string | null>(null);

  // Refs for SVG line anchors
  const sourceRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const targetRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  // SVG bezier line data
  const [lines, setLines] = useState<
    { x1: number; y1: number; x2: number; y2: number; inputPath: string; outputPath: string }[]
  >([]);

  const { result: previewResult, loading: previewing, runPreview, clearPreview } =
    useTransformPreview();

  // ── Restore from existing spec ──────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !initialSpec) return;
    try {
      const parsed = JSON.parse(initialSpec);
      const conns = flattenShiftSpec(parsed);
      if (conns.length > 0) {
        setConnections(conns);
        setSourceFields(conns.map(c => ({ path: c.inputPath, preview: '' })));
        setTargetFields(conns.map(c => ({ path: c.outputPath, preview: '' })));
      }
    } catch {
      // ignore malformed spec
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) clearPreview();
  }, [isOpen, clearPreview]);

  // ── Parse handlers ───────────────────────────────────────────────────────────
  const parseSource = useCallback(() => {
    setSourceError(null);
    try {
      setSourceFields(extractLeafPaths(JSON.parse(sourceSample)));
      setConnections([]);
    } catch (e: unknown) {
      setSourceError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  }, [sourceSample]);

  const parseTarget = useCallback(() => {
    setTargetError(null);
    try {
      setTargetFields(extractLeafPaths(JSON.parse(targetSample)));
      setConnections([]);
    } catch (e: unknown) {
      setTargetError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  }, [targetSample]);

  // ── Drag & drop ──────────────────────────────────────────────────────────────
  const onSourceDragStart = (path: string) => setDraggingInput(path);

  const onTargetDrop = (outputPath: string) => {
    if (!draggingInput) return;
    setConnections(prev => {
      // Each target slot accepts one connection; each source can only map once
      const filtered = prev.filter(
        c => c.outputPath !== outputPath && c.inputPath !== draggingInput,
      );
      return [...filtered, { inputPath: draggingInput, outputPath }];
    });
    setDraggingInput(null);
  };

  const removeConnection = (inputPath: string, outputPath: string) => {
    setConnections(prev =>
      prev.filter(c => !(c.inputPath === inputPath && c.outputPath === outputPath)),
    );
  };

  // ── SVG line recalculation ───────────────────────────────────────────────────
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current.getBoundingClientRect();
    const newLines = connections.flatMap(conn => {
      const srcEl = sourceRefs.current.get(conn.inputPath);
      const tgtEl = targetRefs.current.get(conn.outputPath);
      if (!srcEl || !tgtEl) return [];
      const sr = srcEl.getBoundingClientRect();
      const tr = tgtEl.getBoundingClientRect();
      return [
        {
          x1: sr.right - container.left,
          y1: sr.top + sr.height / 2 - container.top,
          x2: tr.left - container.left,
          y2: tr.top + tr.height / 2 - container.top,
          inputPath: conn.inputPath,
          outputPath: conn.outputPath,
        },
      ];
    });
    // Only update state when values actually changed — prevents infinite loop
    // (useLayoutEffect with no deps runs after every render; a new array reference
    //  would always trigger another render without this guard)
    setLines(prev =>
      prev.length === newLines.length &&
      prev.every(
        (l, i) =>
          l.x1 === newLines[i].x1 &&
          l.y1 === newLines[i].y1 &&
          l.x2 === newLines[i].x2 &&
          l.y2 === newLines[i].y2,
      )
        ? prev
        : newLines,
    );
  });

  // ── Actions ──────────────────────────────────────────────────────────────────
  const handlePreview = async () => {
    await runPreview('jolt', buildJoltSpec(connections), sourceSample);
  };

  const handleSave = () => {
    onSave(buildJoltSpec(connections));
  };

  const footer = (
    <>
      <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
      <Button variant="secondary" size="sm" loading={previewing} onClick={handlePreview}>
        Preview Output
      </Button>
      <Button size="sm" onClick={handleSave}>Save</Button>
    </>
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Field Mapper — ${nodeLabel}`} size="xl" footer={footer}>

      {/* ── Schema inputs (side by side) ── */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="label">Source Schema (sample JSON)</label>
            <Button variant="secondary" size="sm" onClick={parseSource}>Parse</Button>
          </div>
          <textarea
            className="input-field font-mono text-xs h-24 resize-y"
            value={sourceSample}
            onChange={e => setSourceSample(e.target.value)}
            spellCheck={false}
          />
          {sourceError && <p className="text-xs text-red-500 mt-1">{sourceError}</p>}
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="label">Target Schema (sample JSON)</label>
            <Button variant="secondary" size="sm" onClick={parseTarget}>Parse</Button>
          </div>
          <textarea
            className="input-field font-mono text-xs h-24 resize-y"
            value={targetSample}
            onChange={e => setTargetSample(e.target.value)}
            spellCheck={false}
          />
          {targetError && <p className="text-xs text-red-500 mt-1">{targetError}</p>}
        </div>
      </div>

      {/* ── Mapper canvas ── */}
      <div
        className="relative border border-slate-200 rounded-xl overflow-hidden"
        ref={containerRef}
        style={{ minHeight: 240 }}
      >
        {/* SVG bezier connection lines */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 10 }}
        >
          {lines.map((ln, i) => {
            const cx = (ln.x2 - ln.x1) / 2;
            const d = `M ${ln.x1} ${ln.y1} C ${ln.x1 + cx} ${ln.y1}, ${ln.x2 - cx} ${ln.y2}, ${ln.x2} ${ln.y2}`;
            return (
              <path
                key={i}
                d={d}
                fill="none"
                stroke="#6366f1"
                strokeWidth={2}
                style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                onClick={() => removeConnection(ln.inputPath, ln.outputPath)}
              />
            );
          })}
        </svg>

        <div className="flex" style={{ minHeight: 240 }}>

          {/* Left — source fields */}
          <div className="w-[38%] border-r border-slate-200 p-3 space-y-1.5 bg-slate-50">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Source Fields
            </p>
            {sourceFields.length === 0 && (
              <p className="text-xs text-slate-300 italic">Paste source JSON above → click Parse</p>
            )}
            {sourceFields.map(field => {
              const isConnected = connections.some(c => c.inputPath === field.path);
              return (
                <div
                  key={field.path}
                  ref={el => {
                    if (el) sourceRefs.current.set(field.path, el);
                    else sourceRefs.current.delete(field.path);
                  }}
                  draggable
                  onDragStart={() => onSourceDragStart(field.path)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border cursor-grab active:cursor-grabbing select-none transition-colors ${
                    isConnected
                      ? 'border-indigo-300 bg-indigo-50'
                      : 'bg-white border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  <GripVertical className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-mono text-indigo-700 truncate">{field.path}</div>
                    {field.preview && (
                      <div className="text-[10px] text-slate-400 truncate">{field.preview}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Center — hint text, SVG floats above */}
          <div className="w-[24%] bg-white flex items-center justify-center">
            {connections.length === 0 && sourceFields.length > 0 && targetFields.length > 0 && (
              <p className="text-[10px] text-slate-300 italic text-center px-2 leading-relaxed">
                Drag a source field<br />onto a target field
              </p>
            )}
          </div>

          {/* Right — target fields */}
          <div className="w-[38%] border-l border-slate-200 p-3 space-y-1.5 bg-slate-50">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Target Fields
            </p>
            {targetFields.length === 0 && (
              <p className="text-xs text-slate-300 italic">Paste target JSON above → click Parse</p>
            )}
            {targetFields.map(field => {
              const conn = connections.find(c => c.outputPath === field.path);
              return (
                <div
                  key={field.path}
                  ref={el => {
                    if (el) targetRefs.current.set(field.path, el);
                    else targetRefs.current.delete(field.path);
                  }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => onTargetDrop(field.path)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-colors ${
                    conn
                      ? 'border-indigo-300 bg-indigo-50'
                      : 'border-dashed border-slate-200 bg-white hover:border-indigo-200'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-mono text-emerald-700 truncate">{field.path}</div>
                    {conn && (
                      <div className="text-[10px] text-indigo-400 truncate">
                        ← {conn.inputPath}
                      </div>
                    )}
                  </div>
                  {conn && (
                    <button
                      onClick={() => removeConnection(conn.inputPath, conn.outputPath)}
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

      {/* ── Active mappings summary ── */}
      {connections.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">
            Active Mappings ({connections.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {connections.map((c, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-mono rounded px-1.5 py-0.5"
              >
                {c.inputPath} → {c.outputPath}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Preview output ── */}
      {(previewResult || previewing) && (
        <div className="mt-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Preview Output
          </p>
          {previewing && <p className="text-xs text-slate-400">Running…</p>}
          {previewResult?.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <p className="text-xs text-red-600 font-mono">{previewResult.error}</p>
            </div>
          )}
          {previewResult?.output && (
            <pre className="bg-slate-900 rounded-lg px-3 py-2 text-xs text-green-400 font-mono overflow-auto max-h-40 whitespace-pre-wrap">
              {previewResult.output}
            </pre>
          )}
        </div>
      )}

    </Modal>
  );
}

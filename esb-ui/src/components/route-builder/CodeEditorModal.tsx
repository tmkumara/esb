import { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useTransformPreview } from '../../hooks/useTransformPreview';

const DEFAULT_TEMPLATES: Record<string, string> = {
  xml: `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="xml" indent="yes"/>
  <xsl:template match="/">
    <!-- Transform here -->
  </xsl:template>
</xsl:stylesheet>`,
  groovy: `// Runtime variables:
//   body    — String — the raw message body
//   headers — Map    — Camel headers (path params, HTTP headers, etc.)
//             e.g. headers['accountId'], headers['Content-Type']
// Return value becomes the new message body.
body`,
};

export interface CodeEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (spec: string) => void;
  initialSpec?: string;
  nodeLabel: string;
  language: string;       // 'xml' | 'groovy' | etc.
  inputFormat: 'json' | 'xml' | 'text';
  defaultTemplate?: string;
}

// Derive transform type from language (used for preview API)
function langToType(language: string): string {
  if (language === 'xml') return 'xslt';
  if (language === 'groovy') return 'groovy';
  return language;
}

function defaultSampleInput(inputFormat: 'json' | 'xml' | 'text'): string {
  if (inputFormat === 'json') return '{\n  "id": 1,\n  "name": "Alice"\n}';
  if (inputFormat === 'xml') return '<root>\n  <id>1</id>\n  <name>Alice</name>\n</root>';
  return 'Hello World';
}

export function CodeEditorModal({
  isOpen,
  onClose,
  onSave,
  initialSpec,
  nodeLabel,
  language,
  inputFormat,
  defaultTemplate,
}: CodeEditorModalProps) {
  const template = defaultTemplate ?? DEFAULT_TEMPLATES[language] ?? '';
  const [editorContent, setEditorContent] = useState(initialSpec || template);
  const [sampleInput, setSampleInput] = useState(defaultSampleInput(inputFormat));
  const [sampleHeaders, setSampleHeaders] = useState('{\n  "accountId": "12345"\n}');

  const { result: previewResult, loading: previewing, runPreview, clearPreview } = useTransformPreview();

  // Reset content when modal opens with new initialSpec
  useEffect(() => {
    if (isOpen) {
      setEditorContent(initialSpec || template);
      setSampleInput(defaultSampleInput(inputFormat));
      clearPreview();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handlePreview = async () => {
    let headers: Record<string, string> | undefined;
    if (language === 'groovy') {
      try { headers = JSON.parse(sampleHeaders); } catch { headers = {}; }
    }
    await runPreview(langToType(language), editorContent, sampleInput, headers);
  };

  const handleSave = () => {
    onSave(editorContent);
  };

  const footer = (
    <>
      <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
      <Button variant="secondary" size="sm" loading={previewing} onClick={handlePreview}>Preview Output</Button>
      <Button size="sm" onClick={handleSave}>Save</Button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${language.toUpperCase()} Editor — ${nodeLabel}`} size="xl" footer={footer}>
      <div className="flex gap-4" style={{ height: 480 }}>
        {/* Left — Monaco editor */}
        <div className="flex-[3] min-w-0 rounded-xl overflow-hidden border border-slate-200">
          <Editor
            height="100%"
            language={language}
            value={editorContent}
            onChange={v => setEditorContent(v ?? '')}
            theme="vs-dark"
            options={{
              fontSize: 12,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              tabSize: 2,
            }}
          />
        </div>

        {/* Right — sample input + preview */}
        <div className="flex-[2] min-w-0 flex flex-col gap-3">
          <div className={language === 'groovy' ? '' : 'flex-1'} style={language === 'groovy' ? {} : {}}>
            <label className="label mb-1">Sample Input (body)</label>
            <textarea
              className="input-field font-mono text-xs resize-none"
              value={sampleInput}
              onChange={e => setSampleInput(e.target.value)}
              spellCheck={false}
              style={{ minHeight: 80 }}
            />
          </div>
          {language === 'groovy' && (
            <div>
              <label className="label mb-1">
                Sample Headers <span className="text-slate-400 font-normal normal-case">(JSON — path params go here)</span>
              </label>
              <textarea
                className="input-field font-mono text-xs resize-none"
                value={sampleHeaders}
                onChange={e => setSampleHeaders(e.target.value)}
                spellCheck={false}
                style={{ minHeight: 72 }}
                placeholder={'{\n  "accountId": "12345"\n}'}
              />
            </div>
          )}

          <div className="flex-1 flex flex-col">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Preview Output</p>
            {previewing && <p className="text-xs text-slate-400">Running...</p>}
            {!previewing && !previewResult && (
              <div className="flex-1 rounded-xl bg-slate-50 border border-dashed border-slate-200 flex items-center justify-center">
                <p className="text-xs text-slate-300">Click "Preview Output" to test</p>
              </div>
            )}
            {previewResult?.error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <p className="text-xs text-red-600 font-mono whitespace-pre-wrap">{previewResult.error}</p>
              </div>
            )}
            {previewResult?.output && (
              <pre className="flex-1 bg-slate-900 rounded-lg px-3 py-2 text-xs text-green-400 font-mono overflow-auto whitespace-pre-wrap">
                {previewResult.output}
              </pre>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

import { useState, useCallback } from 'react';
import { esbApi } from '../api/esb-api';

interface PreviewResult {
  output?: string;
  error?: string;
}

interface UseTransformPreviewReturn {
  result: PreviewResult | null;
  loading: boolean;
  runPreview: (type: string, spec: string, input: string, headers?: Record<string, string>) => Promise<void>;
  clearPreview: () => void;
}

export function useTransformPreview(): UseTransformPreviewReturn {
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);

  const runPreview = useCallback(async (type: string, spec: string, input: string, headers?: Record<string, string>) => {
    setLoading(true);
    setResult(null);
    try {
      const res = await esbApi.previewTransform({ type, spec, input, headers });
      const data = res.data;
      if (data.success) {
        setResult({ output: data.output });
      } else {
        setResult({ error: data.error });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Preview request failed';
      setResult({ error: msg });
    } finally {
      setLoading(false);
    }
  }, []);

  const clearPreview = useCallback(() => setResult(null), []);

  return { result, loading, runPreview, clearPreview };
}

import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import type { Toast as ToastType } from '../../types';

function ToastItem({ toast, onRemove }: { toast: ToastType; onRemove: (id: string) => void }) {
  const config = {
    success: {
      icon: CheckCircle,
      bg: 'bg-white border-l-4 border-l-green-500',
      iconColor: 'text-green-500',
      titleColor: 'text-green-800',
    },
    error: {
      icon: XCircle,
      bg: 'bg-white border-l-4 border-l-red-500',
      iconColor: 'text-red-500',
      titleColor: 'text-red-800',
    },
    warning: {
      icon: AlertTriangle,
      bg: 'bg-white border-l-4 border-l-amber-500',
      iconColor: 'text-amber-500',
      titleColor: 'text-amber-800',
    },
    info: {
      icon: Info,
      bg: 'bg-white border-l-4 border-l-blue-500',
      iconColor: 'text-blue-500',
      titleColor: 'text-blue-800',
    },
  };

  const { icon: Icon, bg, iconColor, titleColor } = config[toast.type];

  return (
    <div
      className={`${bg} rounded-lg shadow-lg px-4 py-3 flex items-start gap-3 min-w-[300px] max-w-[420px] toast-enter`}
    >
      <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${iconColor}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${titleColor}`}>{toast.title}</p>
        {toast.message && (
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{toast.message}</p>
        )}
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        className="flex-shrink-0 p-0.5 text-slate-400 hover:text-slate-600 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  );
}

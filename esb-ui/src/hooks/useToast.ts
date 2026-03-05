import { createContext, useContext, useState, useCallback, createElement, type ReactNode } from 'react';
import type { Toast, ToastType } from '../types';

interface ToastContextValue {
  toasts: Toast[];
  addToast: (type: ToastType, title: string, message?: string) => void;
  removeToast: (id: string) => void;
}

export const ToastContext = createContext<ToastContextValue>({
  toasts: [],
  addToast: () => {},
  removeToast: () => {},
});

let toastIdCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastType, title: string, message?: string) => {
      const id = `toast-${++toastIdCounter}-${Date.now()}`;
      const toast: Toast = { id, type, title, message };
      setToasts((prev) => [...prev, toast]);

      // Auto-remove after 4 seconds
      setTimeout(() => {
        removeToast(id);
      }, 4000);
    },
    [removeToast]
  );

  return createElement(
    ToastContext.Provider,
    { value: { toasts, addToast, removeToast } },
    children
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  return {
    toasts: ctx.toasts,
    toast: {
      success: (title: string, message?: string) => ctx.addToast('success', title, message),
      error: (title: string, message?: string) => ctx.addToast('error', title, message),
      warning: (title: string, message?: string) => ctx.addToast('warning', title, message),
      info: (title: string, message?: string) => ctx.addToast('info', title, message),
    },
    removeToast: ctx.removeToast,
  };
}

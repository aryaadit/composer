"use client";

// Single-slot toast with optional action (e.g. Undo). Auto-dismisses.
// Wrap the app in <ToastProvider>, consume via useToast().show({...}).

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";

interface ToastInput {
  message: string;
  durationMs?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  show: (toast: ToastInput) => void;
  dismiss: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

interface ActiveToast extends ToastInput {
  id: number;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ActiveToast | null>(null);
  const timerRef = useRef<number | null>(null);
  const idRef = useRef(0);

  const dismiss = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setToast(null);
  }, []);

  const show = useCallback(
    (input: ToastInput) => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      const id = ++idRef.current;
      setToast({ ...input, id });
      const ms = input.durationMs ?? 3000;
      timerRef.current = window.setTimeout(() => {
        setToast((cur) => (cur?.id === id ? null : cur));
        timerRef.current = null;
      }, ms);
    },
    []
  );

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-charcoal text-cream px-4 py-2.5 rounded-full shadow-lg font-sans text-sm"
          >
            <span>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick();
                  dismiss();
                }}
                className="font-medium text-cream/80 hover:text-cream transition-colors"
              >
                {toast.action.label}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </ToastContext.Provider>
  );
}

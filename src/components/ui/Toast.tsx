"use client";

// Single-slot toast. Shows one message at a time with an optional action
// button (supports Undo). Auto-dismisses after `durationMs`.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "motion/react";

interface ToastInput {
  message: string;
  durationMs?: number;
  action?: { label: string; onClick: () => void };
  onTimeout?: () => void;
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

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ActiveToast | null>(null);
  const timerRef = useRef<number | null>(null);
  const nextId = useRef(1);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const dismiss = useCallback(() => {
    clearTimer();
    setToast(null);
  }, []);

  const show = useCallback((input: ToastInput) => {
    clearTimer();
    const id = nextId.current++;
    setToast({ ...input, id });
    const ms = input.durationMs ?? 5000;
    timerRef.current = window.setTimeout(() => {
      setToast((cur) => {
        if (cur?.id === id) {
          input.onTimeout?.();
          return null;
        }
        return cur;
      });
      timerRef.current = null;
    }, ms);
  }, []);

  useEffect(() => () => clearTimer(), []);

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              className="pointer-events-auto w-full max-w-sm rounded-full bg-charcoal text-cream px-5 py-3 shadow-lg flex items-center justify-between gap-4"
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
            >
              <span className="font-sans text-sm">{toast.message}</span>
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action!.onClick();
                    dismiss();
                  }}
                  className="font-sans text-sm font-medium text-cream underline underline-offset-2 hover:text-cream/80 transition-colors"
                >
                  {toast.action.label}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

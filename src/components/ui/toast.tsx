"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import * as React from "react";

type ToastTone = "success" | "error" | "info";
type Toast = { id: number; tone: ToastTone; title: string; detail?: string };

type ToastApi = {
  success: (title: string, detail?: string) => void;
  error: (title: string, detail?: string) => void;
  info: (title: string, detail?: string) => void;
};

const ToastContext = React.createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = React.useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}

const TONES: Record<
  ToastTone,
  { color: string; Icon: typeof CheckCircle2; ttl: number }
> = {
  success: { color: "var(--good)", Icon: CheckCircle2, ttl: 3500 },
  // Errors stay long enough to actually read the provider's message.
  error: { color: "var(--critical)", Icon: AlertTriangle, ttl: 9000 },
  info: { color: "var(--series-1)", Icon: Info, ttl: 4500 },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const nextId = React.useRef(0);

  const dismiss = React.useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = React.useCallback(
    (tone: ToastTone, title: string, detail?: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-3), { id, tone, title, detail }]);
      setTimeout(() => dismiss(id), TONES[tone].ttl);
    },
    [dismiss],
  );

  const api = React.useMemo<ToastApi>(
    () => ({
      success: (title, detail) => push("success", title, detail),
      error: (title, detail) => push("error", title, detail),
      info: (title, detail) => push("info", title, detail),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed right-4 bottom-4 z-100 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
        role="region"
        aria-live="polite"
        aria-label="Notifications"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const { color, Icon } = TONES[toast.tone];
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                className="card pointer-events-auto flex items-start gap-3 p-3.5"
              >
                <Icon className="mt-px size-4 shrink-0" style={{ color }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{toast.title}</p>
                  {toast.detail ? (
                    <p className="mt-0.5 text-xs leading-relaxed break-words text-ink-muted">
                      {toast.detail}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  className="-mt-0.5 -mr-0.5 cursor-pointer rounded p-1 text-ink-muted transition-colors hover:text-ink"
                  aria-label="Dismiss"
                >
                  <X className="size-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

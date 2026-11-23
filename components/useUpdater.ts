"use client";

/**
 * React hook over the Electron updater bridge (electron/preload.cjs).
 * In a plain browser (dev) it stays in the "unavailable" state — the UI shows
 * the web-build note instead of updater controls.
 */
import { useEffect, useState } from "react";

export type UpdateState = {
  status: "unavailable" | "idle" | "checking" | "downloading" | "ready" | "uptodate" | "error";
  version: string | null;
  progress: { percent: number; transferred: number; total: number; bytesPerSecond: number } | null;
  error: string | null;
};

declare global {
  interface Window {
    sunUpdates?: {
      check: () => Promise<unknown>;
      install: () => void;
      getState: () => Promise<UpdateState>;
      onState: (cb: (s: UpdateState) => void) => void;
    };
  }
}

export function useUpdater() {
  const [state, setState] = useState<UpdateState>({ status: "unavailable", version: null, progress: null, error: null });
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!window.sunUpdates) return;
    setAvailable(true);
    window.sunUpdates.getState().then(setState).catch(() => {});
    window.sunUpdates.onState((s) => setState(s));
  }, []);

  const check = () => window.sunUpdates?.check();
  const install = () => window.sunUpdates?.install();

  return { state, check, install, available };
}

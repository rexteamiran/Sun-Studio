"use client";

/**
 * Custom dark title bar for the frameless Electron window (Windows).
 * In a plain browser (dev mode) it stays invisible — drag + caption buttons
 * only activate when the preload bridge (`window.sunWindow`) is present.
 */
import Logo from "./Logo";

declare global {
  interface Window {
    sunWindow?: { minimize: () => void; toggleMaximize: () => void; close: () => void };
  }
}

const inShell = typeof window !== "undefined" && !!window.sunWindow;

export default function TitleBar({ version }: { version?: string }) {
  return (
    <div
      className="title-bar select-none shrink-0"
      style={{ background: "var(--chrome)", borderColor: "var(--line)" }}
    >
      <div className="max-w-full h-10 flex items-center pl-4 pr-0">
        <div className="flex items-center gap-2.5 flex-1 app-drag">
          <Logo size={16} />
          <span className="font-bold tracking-[0.2em] text-[11px] opacity-90">SUN STUDIO</span>
          {version && <span className="mono-value text-[10px] opacity-40 ml-1">v{version}</span>}
        </div>
        {!inShell ? (
          <div className="app-drag h-10 w-20" aria-hidden="true" />
        ) : (
          <div className="flex app-no-drag">
            <button
              className="caption-btn"
              aria-label="Minimize"
              title="Minimize"
              onClick={() => window.sunWindow?.minimize()}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <rect x="1" y="4.5" width="8" height="1" fill="currentColor" />
              </svg>
            </button>
            <button
              className="caption-btn"
              aria-label="Maximize"
              title="Maximize"
              onClick={() => window.sunWindow?.toggleMaximize()}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
              </svg>
            </button>
            <button
              className="caption-btn caption-close"
              aria-label="Close"
              title="Close"
              onClick={() => window.sunWindow?.close()}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <path d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5" stroke="currentColor" strokeWidth="1" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

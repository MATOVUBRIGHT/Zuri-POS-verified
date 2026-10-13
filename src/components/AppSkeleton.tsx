import React from "react";

export function AppSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading page content"
      className="w-full space-y-6 animate-pulse"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-40 rounded-md bg-muted" />
          <div className="h-4 w-56 rounded bg-muted/80" />
        </div>
        <div className="h-10 w-28 rounded-md bg-muted" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="h-4 w-20 rounded bg-muted" />
            <div className="mt-4 h-8 w-16 rounded bg-muted/80" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_0.9fr]">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="h-6 w-32 rounded bg-muted" />
          <div className="mt-4 h-52 w-full rounded-lg bg-muted/80" />
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="h-6 w-24 rounded bg-muted" />
          <div className="mt-4 space-y-3">
            {[1, 2, 3].map((row) => (
              <div key={row} className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted" />
                <div className="h-4 flex-1 rounded bg-muted/80" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="h-6 w-36 rounded bg-muted" />
        <div className="mt-4 space-y-3">
          {[1, 2, 3, 4].map((row) => (
            <div key={row} className="flex gap-3">
              <div className="h-10 flex-1 rounded bg-muted/80" />
              <div className="h-10 w-24 rounded bg-muted" />
              <div className="h-10 w-20 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function QuickAppSkeleton() {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background">
      <div className="text-center space-y-4">
        <div className="relative mx-auto">
          <div className="loader zuri-loader" style={{ "--size": "1px" } as React.CSSProperties}></div>
        </div>
        <p className="text-lg font-medium text-slate-700">Starting POS System</p>
        <p className="text-sm text-slate-500">Initializing your workspace...</p>
      </div>
    </div>
  );
}

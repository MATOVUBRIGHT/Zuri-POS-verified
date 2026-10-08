import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

// Anchors the loader to mount, so a page always shows one on open instead of
// appearing pre-loaded with no feedback. It stays up while `isLoading` is true
// and otherwise holds for at least `minMs`, so a cache hit reads as a
// deliberate load rather than a one-frame flash.
export function useMinimumLoading(isLoading: boolean, minMs = 350): boolean {
  const mountedAt = useRef<number>(Date.now());
  const [show, setShow] = useState(true);

  useEffect(() => {
    if (isLoading) return;
    const remaining = minMs - (Date.now() - mountedAt.current);
    if (remaining <= 0) {
      setShow(false);
      return;
    }
    const timer = setTimeout(() => setShow(false), remaining);
    return () => clearTimeout(timer);
  }, [isLoading, minMs]);

  return show;
}

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg" | "xl";
  text?: string;
  className?: string;
  fullScreen?: boolean;
}

// The mark scales entirely off --size (48 x --size across), so each preset is
// just a different value for it.
const markScale = {
  sm: "0.4px",
  md: "0.6px",
  lg: "0.85px",
  xl: "1.1px",
} as const;

/** The shared Zuri loading mark used for full-page and page-region loading. */
export function LoadingMark({ size = "md" }: { size?: "sm" | "md" | "lg" | "xl" }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="grid place-items-center"
      style={{ "--size": markScale[size] } as CSSProperties}
    >
      <span className="zuri-loader" />
    </div>
  );
}

export function LoadingSpinner({ 
  size = "md", 
  text, 
  className,
  fullScreen = false 
}: LoadingSpinnerProps) {
  const content = (
    <div className={cn(
      "flex flex-col items-center justify-center gap-3",
      fullScreen ? "min-h-screen bg-slate-50 text-slate-900" : "py-12",
      className
    )}>
      <LoadingMark size={size} />
      {text && (
        <p className="text-sm text-muted-foreground">{text}</p>
      )}
    </div>
  );

  return content;
}

// Centered loader for a full page region. Matches the executive page loaders:
// spinner + short label, centered in the available height, no layout shift.
export function PageLoader({
  text = "Loading...",
  className,
}: {
  text?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[60vh] w-full flex-col items-center justify-center gap-3 bg-slate-50 text-slate-900",
        className
      )}
    >
      <LoadingMark size="lg" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

// Inline loading spinner for buttons
export function InlineSpinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("inline-flex shrink-0", className)}
      style={{ "--size": "0.25px" } as CSSProperties}
    >
      <span className="zuri-loader" />
    </span>
  );
}

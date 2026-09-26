import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
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

const markSizeClasses = {
  sm: "h-10 w-10",
  md: "h-14 w-14",
  lg: "h-16 w-16",
  xl: "h-20 w-20",
};

/** The shared Zuri loading mark used for full-page and page-region loading. */
export function LoadingMark({ size = "md" }: { size?: "sm" | "md" | "lg" | "xl" }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        "grid place-items-center rounded-md border border-slate-200 bg-white shadow-sm",
        markSizeClasses[size]
      )}
    >
      <div className="grid rotate-[-5deg] grid-cols-2 gap-1.5 rounded-sm border border-emerald-200/70 p-2">
        <span className="h-3 w-3 animate-pulse rounded-[1px] bg-emerald-600 [animation-delay:0ms]" />
        <span className="h-3 w-3 animate-pulse rounded-[1px] bg-slate-300 [animation-delay:180ms]" />
        <span className="h-3 w-3 animate-pulse rounded-[1px] bg-slate-400 [animation-delay:360ms]" />
        <span className="h-3 w-3 animate-pulse rounded-[1px] bg-emerald-500 [animation-delay:540ms]" />
      </div>
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
    <Loader2 className={cn("h-4 w-4 animate-spin", className)} />
  );
}

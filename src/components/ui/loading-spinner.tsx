import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

// Keeps short-lived loads visible long enough to avoid a one-frame flash.
export function useMinimumLoading(isLoading: boolean, minMs = 350): boolean {
  // Do not hold the whole page behind a spinner for hundreds of milliseconds.
  // A short floor prevents a flash while keeping navigation responsive.
  const effectiveMinMs = Math.min(minMs, 180);
  const mountedAt = useRef<number>(Date.now());
  const [show, setShow] = useState(true);

  useEffect(() => {
    if (isLoading) return;
    const remaining = effectiveMinMs - (Date.now() - mountedAt.current);
    if (remaining <= 0) {
      setShow(false);
      return;
    }
    const timer = setTimeout(() => setShow(false), remaining);
    return () => clearTimeout(timer);
  }, [isLoading, effectiveMinMs]);

  return show;
}

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg" | "xl";
  text?: string;
  className?: string;
  fullScreen?: boolean;
  color1?: string;
  color2?: string;
}

// The mark scales entirely off --size (32 x --size across), so each preset is
// just a different value for it - reduced from 48x for better balance
const markScale = {
  sm: "0.25px",
  md: "0.38px", 
  lg: "0.55px",
  xl: "0.72px",
} as const;

export function LoadingMark({ 
  size = "md",
  color1,
  color2,
  className 
}: { 
  size?: "sm" | "md" | "lg" | "xl"; 
  color1?: string;
  color2?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn("inline-flex items-center justify-center", className)}
      style={{
        "--size": markScale[size],
        ...(color1 ? { "--c1": color1 } : {}),
        ...(color2 ? { "--c2": color2 } : {}),
      } as CSSProperties}
    >
      <span className="loader zuri-loader" />
    </div>
  );
}

export function LoadingSpinner({ 
  size = "md", 
  text, 
  className,
  fullScreen = false,
  color1,
  color2
}: LoadingSpinnerProps) {
  const content = (
    <div className={cn(
      "flex w-full flex-col items-center justify-center",
      fullScreen 
        ? "fixed inset-0 z-50 bg-slate-50 text-slate-900" 
        : "min-h-[60vh]",
      className
    )}>
      <div
        className="flex flex-col items-center justify-center gap-4"
        style={{
          "--size": markScale[size],
          ...(color1 ? { "--c1": color1 } : {}),
          ...(color2 ? { "--c2": color2 } : {}),
        } as CSSProperties}
      >
        <span className="loader zuri-loader" />
        {text && (
          <p className="text-sm text-muted-foreground text-center max-w-xs">{text}</p>
        )}
      </div>
    </div>
  );

  return content;
}

// Centered loader for a full page region. Always appears at center immediately.
export function PageLoader({
  text = "Loading...",
  className,
  color1,
  color2,
}: {
  text?: string;
  className?: string;
  color1?: string;
  color2?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[60vh] w-full flex-col items-center justify-center bg-slate-50 text-slate-900",
        className
      )}
    >
      <div
        className="flex flex-col items-center justify-center gap-4"
        style={{
          "--size": markScale.lg,
          ...(color1 ? { "--c1": color1 } : {}),
          ...(color2 ? { "--c2": color2 } : {}),
        } as CSSProperties}
      >
        <span className="loader zuri-loader" />
        <p className="text-sm text-muted-foreground text-center max-w-xs">{text}</p>
      </div>
    </div>
  );
}

// Inline loading spinner for buttons
export function InlineSpinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      style={{ "--size": "0.25px", "--c1": "currentColor" } as CSSProperties}
    >
      <span className="loader zuri-loader" />
    </span>
  );
}

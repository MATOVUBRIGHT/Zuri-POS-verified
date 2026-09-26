import React from "react";
import { Button } from "@/components/ui/button";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  error?: Error;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Keep this as console.error in dev so we can diagnose white screens.
    // In production builds, console.* is stripped by terser per vite config.
    console.error("App crashed:", error);
    console.error("Component stack:", info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-background text-foreground">
        <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-12 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Something went wrong
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            The app hit an unexpected error. Reloading usually fixes a temporary
            cache or network issue.
          </p>

          {import.meta.env.DEV && this.state.error?.message ? (
            <pre className="mt-6 w-full overflow-auto rounded-md border bg-muted p-4 text-left text-xs">
              {this.state.error.message}
            </pre>
          ) : null}

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button onClick={this.handleReload}>Reload</Button>
            <Button variant="secondary" onClick={this.handleReset}>
              Try again
            </Button>
          </div>
        </main>
      </div>
    );
  }
}

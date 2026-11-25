import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'An unexpected rendering issue occurred.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center p-6">
          <div className="vs-surface-card max-w-md p-6 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--vs-warning-soft)] text-[var(--vs-warning)]">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h2 className="font-display text-lg font-semibold text-[var(--vs-text)]">
              Unable to display this view
            </h2>
            <p className="mt-1.5 text-sm text-[var(--vs-text-secondary)]">{this.state.message}</p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="vs-btn-primary mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
            >
              <RotateCcw className="h-4 w-4" />
              Reload View
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

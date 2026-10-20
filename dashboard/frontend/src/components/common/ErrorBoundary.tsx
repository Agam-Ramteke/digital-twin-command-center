import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 'var(--space-xl, 32px)',
            maxWidth: 640,
            margin: '40px auto',
            background: 'var(--bg-surface-alt, #1a1a24)',
            border: '1px solid var(--status-error, #b85c4a)',
            borderRadius: 'var(--radius-md, 8px)',
            textAlign: 'center',
            color: 'var(--text-primary, #ffffff)',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              padding: 12,
              background: 'rgba(184, 92, 74, 0.15)',
              borderRadius: '50%',
              marginBottom: 16,
            }}
          >
            <AlertTriangle size={32} color="var(--status-error, #b85c4a)" />
          </div>
          <h3 style={{ margin: '0 0 8px 0', fontSize: 18, fontWeight: 700 }}>
            {this.props.fallbackTitle || 'Component Rendering Error'}
          </h3>
          <p
            style={{
              fontSize: 12,
              color: 'var(--text-secondary, #94a3b8)',
              margin: '0 0 16px 0',
              lineHeight: 1.5,
            }}
          >
            A client-side runtime exception occurred while rendering this view.
          </p>
          {this.state.error && (
            <pre
              style={{
                textAlign: 'left',
                padding: '12px',
                background: 'rgba(0, 0, 0, 0.4)',
                borderRadius: 4,
                fontSize: 11,
                fontFamily: 'var(--font-mono, monospace)',
                color: 'var(--status-error, #ff8080)',
                overflowX: 'auto',
                marginBottom: 20,
              }}
            >
              {this.state.error.message || String(this.state.error)}
            </pre>
          )}
          <button
            onClick={this.handleReset}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              background: 'var(--accent-blue, #3182ce)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <RotateCcw size={15} /> Reload View
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

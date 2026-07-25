import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Global error boundary to prevent blank-screen crashes.
 * Catches unhandled errors in any child component tree.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#e2e8f0',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
          padding: '2rem',
          textAlign: 'center',
        }}>
          <div style={{
            background: 'rgba(30, 41, 59, 0.8)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(148, 163, 184, 0.15)',
            borderRadius: '16px',
            padding: '3rem 2.5rem',
            maxWidth: '480px',
            width: '100%',
            boxShadow: '0 25px 50px rgba(0,0,0,0.3)',
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
            <h1 style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              marginBottom: '0.75rem',
              color: '#f8fafc',
            }}>
              Something went wrong
            </h1>
            <p style={{
              color: '#94a3b8',
              fontSize: '0.95rem',
              lineHeight: 1.6,
              marginBottom: '1.5rem',
            }}>
              An unexpected error occurred. This has been logged and will be looked into.
            </p>

            {this.state.error && (
              <details style={{
                marginBottom: '1.5rem',
                textAlign: 'left',
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(148, 163, 184, 0.1)',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
              }}>
                <summary style={{
                  cursor: 'pointer',
                  color: '#64748b',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                }}>
                  Error details
                </summary>
                <pre style={{
                  marginTop: '0.5rem',
                  fontSize: '0.75rem',
                  color: '#ef4444',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {this.state.error.message}
                </pre>
              </details>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                onClick={this.handleReload}
                style={{
                  padding: '0.6rem 1.5rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                  color: '#fff',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'opacity 0.15s',
                }}
                onMouseOver={e => (e.currentTarget.style.opacity = '0.85')}
                onMouseOut={e => (e.currentTarget.style.opacity = '1')}
              >
                Reload Page
              </button>
              <button
                onClick={this.handleGoHome}
                style={{
                  padding: '0.6rem 1.5rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  background: 'transparent',
                  color: '#94a3b8',
                  fontSize: '0.9rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'opacity 0.15s',
                }}
                onMouseOver={e => (e.currentTarget.style.opacity = '0.85')}
                onMouseOut={e => (e.currentTarget.style.opacity = '1')}
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

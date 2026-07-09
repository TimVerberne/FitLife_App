import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100dvh',
            display: 'grid',
            placeItems: 'center',
            padding: 24,
            background: '#0a0a0a',
            color: '#f4f4f2',
            fontFamily: 'system-ui, sans-serif',
            textAlign: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Something went wrong</div>
            <div style={{ fontSize: 13, color: '#9aa4b2', marginBottom: 16, maxWidth: 320 }}>
              FitFlow hit an error and couldn't load. Reloading may help.
            </div>
            <pre
              style={{
                fontSize: 11,
                color: '#7c8087',
                maxWidth: 320,
                overflowX: 'auto',
                textAlign: 'left',
                background: '#101113',
                padding: 12,
                borderRadius: 8,
              }}
            >
              {this.state.error.message}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

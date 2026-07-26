import { Component, type ReactNode } from 'react';

/**
 * Last-resort error boundary. Without one, a render throw leaves a permanently
 * blank screen — the worst possible failure for an offline festival tool.
 * Plain inline styles: theme utilities may be part of what broke.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; copied: boolean }
> {
  state = { error: null as Error | null, copied: false };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        style={{
          minHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: 24,
          textAlign: 'center',
          background: '#05193a',
          color: '#f4f8ff',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ fontSize: 40 }} aria-hidden>
          🤘
        </div>
        <h1 style={{ fontSize: 18, margin: 0 }}>Something hit a wrong note</h1>
        <p style={{ fontSize: 14, margin: 0, color: '#b9c9e6', maxWidth: 320 }}>
          Your picks and set times are safe on this device. Reload to get back
          to your plan.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: 8,
            minHeight: 44,
            padding: '10px 24px',
            borderRadius: 12,
            border: 'none',
            background: '#ffd21e',
            color: '#0a0f1c',
            fontSize: 15,
            fontWeight: 700,
          }}
        >
          Reload app
        </button>
        {/* If the throw is deterministic, reloading just reproduces it — so
            offer something actionable instead of a loop. The menu can't be
            suggested here: it lives inside the tree that just crashed. */}
        <button
          type="button"
          onClick={() => {
            const detail = `${this.state.error?.message ?? 'unknown error'}\n\n${this.state.error?.stack ?? ''}`;
            void navigator.clipboard
              ?.writeText(detail)
              .then(() => this.setState({ copied: true }))
              .catch(() => undefined);
          }}
          style={{
            minHeight: 44,
            padding: '10px 20px',
            borderRadius: 12,
            border: '1px solid #2d4f86',
            background: 'transparent',
            color: '#f4f8ff',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {this.state.copied ? 'Copied' : 'Copy error details'}
        </button>
        <p style={{ fontSize: 11, color: '#8ea6cf', maxWidth: 320 }}>
          If reloading lands you back here, copy the details and text them to yourself. Your set
          times stay on the phone either way.
        </p>
      </div>
    );
  }
}

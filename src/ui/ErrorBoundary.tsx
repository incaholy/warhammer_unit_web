import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

/** Catches render/lifecycle errors in the tree below it and shows a fallback
 * instead of a blank white screen. Wrapped near the app root. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown): void {
    console.error('Muster hit an unexpected error:', error)
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 48, textAlign: 'center' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 40, color: 'var(--muted)' }}>
            Something went wrong
          </div>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
              color: 'var(--faint)',
              marginTop: 12,
            }}
          >
            An unexpected error occurred
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 26,
              background: 'var(--ink)',
              color: 'var(--paper)',
              border: 'none',
              padding: '13px 24px',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '.16em',
              textTransform: 'uppercase',
            }}
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}

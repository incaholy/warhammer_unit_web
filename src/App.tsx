/* Placeholder app shell for the scaffold step. The real route table, auth gate,
 * and header land in later roadmap steps (see SPEC.md → "Routing & views"). */

const mono: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  textTransform: 'uppercase',
}

export default function App() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{ ...mono, fontSize: 18, letterSpacing: '.32em' }}>Muster</span>
        <span style={{ width: 1, height: 15, background: 'var(--rule)' }} />
        <span style={{ ...mono, fontSize: 10, letterSpacing: '.22em', color: 'var(--muted)' }}>
          Collection Index
        </span>
      </div>
    </main>
  )
}

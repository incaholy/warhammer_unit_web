/* The `/login` screen: a Log In / Sign Up segmented toggle over a single form.
 * Login collects email + password; Sign Up adds name + confirm. Errors run
 * through `messageForError`, shown inline. See SPEC.md → "AuthView". */

import { useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, Eyebrow, Field, SegmentedToggle } from '../ui'
import { fieldErrors, messageForError } from '../lib/errors'
import { redirectTarget } from '../lib/redirect'
import { useAuth } from '../auth/AuthContext'
import styles from './AuthView.module.css'

type Mode = 'login' | 'signup'

const MODE_OPTIONS = [
  { label: 'Log In', value: 'login' as const },
  { label: 'Sign Up', value: 'signup' as const },
]

export function AuthView() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, register } = useAuth()

  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Per-field messages, keyed by backend field name (username/email/password),
  // so a sign-up shows every bad field at once (ROADMAP R9/C).
  const [fieldErrs, setFieldErrs] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  function switchMode(next: Mode) {
    // Ignore mode changes while a request is pending so the form can't be
    // re-shaped out from under an in-flight submit.
    if (submitting) return
    setMode(next)
    setError(null)
    setFieldErrs({})
  }

  const submitLabel = mode === 'login' ? 'Log In' : 'Sign Up'
  const pendingLabel = mode === 'login' ? 'Logging in…' : 'Signing up…'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Guard against double-submit (Enter + click, or repeated Enter) while a
    // request is already in flight.
    if (submitting) return
    setError(null)
    setFieldErrs({})

    if (mode === 'signup' && password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setSubmitting(true)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await register(name, email, password)
      }
      navigate(redirectTarget((location.state as { from?: unknown } | null)?.from))
    } catch (err) {
      // Attach per-field messages where the backend gave them; fall back to a
      // single banner only when there are none (e.g. a 401 on login).
      const perField = fieldErrors(err)
      setFieldErrs(perField)
      setError(Object.keys(perField).length ? null : messageForError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <div className={styles.head}>
          <Eyebrow>Muster</Eyebrow>
          <h1 className={styles.title}>
            {mode === 'login' ? 'Welcome back' : 'Enlist'}
          </h1>
        </div>

        <SegmentedToggle
          className={styles.toggle}
          aria-label="Log In or Sign Up"
          options={MODE_OPTIONS}
          value={mode}
          onChange={switchMode}
        />

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          {mode === 'signup' && (
            <Field
              label="Name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={fieldErrs.username}
              required
            />
          )}

          <Field
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrs.email}
            required
          />

          <Field
            label="Password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrs.password}
            required
          />

          {mode === 'signup' && (
            <Field
              label="Confirm Password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          )}

          {error && (
            <p className={styles.error} role="alert" aria-live="assertive">
              {error}
            </p>
          )}

          <Button
            className={styles.submit}
            type="submit"
            variant="primary"
            disabled={submitting}
            aria-busy={submitting}
          >
            {submitting ? pendingLabel : submitLabel}
          </Button>
        </form>
      </div>
    </div>
  )
}

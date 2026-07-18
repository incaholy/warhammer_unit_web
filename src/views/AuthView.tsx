/* The `/login` screen: a Log In / Sign Up segmented toggle over a single form.
 * Login collects email + password; Sign Up adds name + confirm. Errors are the
 * thrown `ApiError.message`, shown inline. See SPEC.md → "AuthView". */

import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Eyebrow, Field, SegmentedToggle } from '../ui'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import styles from './AuthView.module.css'

type Mode = 'login' | 'signup'

const MODE_OPTIONS = [
  { label: 'Log In', value: 'login' as const },
  { label: 'Sign Up', value: 'signup' as const },
]

export function AuthView() {
  const navigate = useNavigate()
  const { login, register } = useAuth()

  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

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
      navigate('/')
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'
      setError(message)
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
              required
            />
          )}

          <Field
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <Field
            label="Password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <Button
            className={styles.submit}
            type="submit"
            variant="primary"
            disabled={submitting}
          >
            {mode === 'login' ? 'Log In' : 'Sign Up'}
          </Button>
        </form>
      </div>
    </div>
  )
}

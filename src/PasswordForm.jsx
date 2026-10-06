// Set-password form, shown after a member opens an invite or password-reset email link.
// The link already signed them in, so updateUser can save the new password.
import { useState } from 'react'
import { supabase } from './supabase.js'
import { friendlyError } from './errors.js'

// ---------- Component ----------
// onDone: the password was saved, so App can show the member's pages.
export default function PasswordForm({ onDone }) {
  // ---------- State ----------
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // ---------- Save ----------
  // Supabase Auth enforces the length and strength rules and explains any it rejects.
  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage('')
    if (password !== confirm) {
      setErrorMessage('The passwords don\'t match.')
      return
    }

    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setErrorMessage(friendlyError(error))
    else onDone()
  }

  // ---------- Render ----------
  return (
    <section className="login-card" aria-labelledby="password-heading">
      <h2 id="password-heading">Set your password</h2>
      <p>Choose the password you'll use to log in to DeltaConnect.</p>
      <form onSubmit={handleSubmit}>
        <label>
          New password
          <input type="password" autoComplete="new-password" required value={password}
            onChange={(event) => setPassword(event.target.value)} />
        </label>
        <label>
          Confirm password
          <input type="password" autoComplete="new-password" required value={confirm}
            onChange={(event) => setConfirm(event.target.value)} />
        </label>
        {errorMessage && <p role="alert">{errorMessage}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save password'}</button>
      </form>
    </section>
  )
}

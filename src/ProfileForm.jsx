// Member form to create or edit their profile (name and major). RLS still decides if a save is allowed.
import { useState } from 'react'
import { supabase } from './supabase.js'

// ---------- Component ----------
// userId: the member's id. profile: their current row, or null before the first save.
// onSaved: saved, so the home page can reload.
export default function ProfileForm({ userId, profile, onSaved }) {
  // ---------- State ----------
  const [firstName, setFirstName] = useState(profile?.first_name ?? '')
  const [lastName, setLastName] = useState(profile?.last_name ?? '')
  const [major, setMajor] = useState(profile?.major ?? '')
  const [busy, setBusy] = useState(false)
  // message is { text, isError } or null.
  const [message, setMessage] = useState(null)

  // ---------- Save ----------
  async function handleSubmit(event) {
    event.preventDefault()
    setMessage(null)

    // Clean input: trim text, which the database requires.
    const fields = { first_name: firstName.trim(), last_name: lastName.trim(), major: major.trim() }
    if (!fields.first_name || !fields.last_name || !fields.major) {
      setMessage({ text: 'First name, last name, and major are required.', isError: true })
      return
    }

    // The first save creates the row; later saves update it.
    setBusy(true)
    const { error } = profile
      ? await supabase.from('profile').update(fields).eq('user_id', userId)
      : await supabase.from('profile').insert({ ...fields, user_id: userId })
    setBusy(false)

    if (error) setMessage({ text: error.message, isError: true })
    else {
      setMessage({ text: 'Profile saved.', isError: false })
      onSaved()
    }
  }

  // ---------- Render ----------
  return (
    <form className="account-form" onSubmit={handleSubmit} aria-label="Profile">
      <h3>Profile</h3>
      <p className="meta">Your name and major appear with your resume in the public directory.</p>
      <label>
        First name
        <input required value={firstName} onChange={(event) => setFirstName(event.target.value)} />
      </label>
      <label>
        Last name
        <input required value={lastName} onChange={(event) => setLastName(event.target.value)} />
      </label>
      <label>
        Major
        <input required value={major} onChange={(event) => setMajor(event.target.value)} />
      </label>

      {message && <p role={message.isError ? 'alert' : 'status'}>{message.text}</p>}

      <div className="form-actions">
        <button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
      </div>
    </form>
  )
}

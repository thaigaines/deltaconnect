// Member form to create or edit their profile (name, major, graduation, LinkedIn).
// RLS still decides if a save is allowed.
import { useState } from 'react'
import { supabase } from './supabase.js'
import { friendlyError } from './errors.js'

// ---------- Helpers ----------
// Graduation terms. value matches the database.
const graduationTerms = [
  { value: 'spring', label: 'Spring' },
  { value: 'summer', label: 'Summer' },
  { value: 'fall', label: 'Fall' },
]

// Shared with Resumes.jsx. { graduation_term: 'fall', graduation_year: 2027 } -> 'Fall 2027'.
// Profiles saved before graduation was added have neither, giving ''.
export function graduationLabel(profile) {
  const term = graduationTerms.find((option) => option.value === profile.graduation_term)
  return term ? `${term.label} ${profile.graduation_year}` : ''
}

// Same pattern as the database's check: a linkedin.com/in/ profile address.
const linkedInPattern = /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[^/?#\s]+\/?$/i

// 'linkedin.com/in/jane-doe?utm_source=share' -> 'https://linkedin.com/in/jane-doe'; blank -> null.
// Shared links often carry tracking text after ? or #, which isn't part of the profile address.
function cleanLinkedIn(text) {
  const address = text.trim().split(/[?#]/)[0]
  if (!address) return null
  return `https://${address.replace(/^https?:\/\//i, '')}`
}

// ---------- Component ----------
// userId: the member's id. profile: their current row, or null before the first save.
// onSaved: saved, so the home page can reload.
export default function ProfileForm({ userId, profile, onSaved }) {
  // ---------- State ----------
  const [firstName, setFirstName] = useState(profile?.first_name ?? '')
  const [lastName, setLastName] = useState(profile?.last_name ?? '')
  const [major, setMajor] = useState(profile?.major ?? '')
  const [graduationTerm, setGraduationTerm] = useState(profile?.graduation_term ?? '')
  // Number inputs still give text, so the year is kept as a string until saving.
  const [graduationYear, setGraduationYear] = useState(String(profile?.graduation_year ?? ''))
  const [linkedIn, setLinkedIn] = useState(profile?.linkedin_url ?? '')
  const [busy, setBusy] = useState(false)
  // message is { text, isError } or null.
  const [message, setMessage] = useState(null)

  // ---------- Save ----------
  async function handleSubmit(event) {
    event.preventDefault()
    setMessage(null)

    // Clean input: trim text, which the database requires; turn the year into a number.
    const fields = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      major: major.trim(),
      graduation_term: graduationTerm,
      graduation_year: Number(graduationYear),
      linkedin_url: cleanLinkedIn(linkedIn),
    }
    if (!fields.first_name || !fields.last_name || !fields.major || !fields.graduation_term) {
      setMessage({ text: 'First name, last name, major, and graduation term are required.', isError: true })
      return
    }
    if (!Number.isInteger(fields.graduation_year) || fields.graduation_year < 2000 || fields.graduation_year > 2100) {
      setMessage({ text: 'Enter your graduation year as four digits, like 2027.', isError: true })
      return
    }
    if (fields.linkedin_url && !linkedInPattern.test(fields.linkedin_url)) {
      setMessage({ text: 'Use your LinkedIn profile link, like https://www.linkedin.com/in/your-name, or leave it blank.', isError: true })
      return
    }

    // The first save creates the row; later saves update it.
    setBusy(true)
    const { error } = profile
      ? await supabase.from('profile').update(fields).eq('user_id', userId).select('user_id').single()
      : await supabase.from('profile').insert({ ...fields, user_id: userId })
    setBusy(false)

    if (error) setMessage({ text: friendlyError(error), isError: true })
    else {
      setMessage({ text: 'Profile saved.', isError: false })
      onSaved()
    }
  }

  // ---------- Render ----------
  return (
    <form className="account-form" onSubmit={handleSubmit} aria-label="Profile">
      <h3>Profile</h3>
      <p className="meta">Your name, major, graduation, and LinkedIn appear with your resume in the public directory.</p>
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
      <label>
        Graduation term
        <select required value={graduationTerm} onChange={(event) => setGraduationTerm(event.target.value)}>
          <option value="" disabled>Choose a term</option>
          {graduationTerms.map((term) => <option key={term.value} value={term.value}>{term.label}</option>)}
        </select>
      </label>
      <label>
        Graduation year
        <input type="number" required min={2000} max={2100} step={1} value={graduationYear}
          onChange={(event) => setGraduationYear(event.target.value)} placeholder="2027" />
      </label>
      <label>
        LinkedIn profile (optional)
        {/* Plain text, not type="url": the browser would reject 'linkedin.com/in/...' before cleanLinkedIn adds https://. */}
        <input inputMode="url" value={linkedIn} onChange={(event) => setLinkedIn(event.target.value)}
          placeholder="https://www.linkedin.com/in/your-name" />
      </label>

      {message && <p role={message.isError ? 'alert' : 'status'}>{message.text}</p>}

      <div className="form-actions">
        <button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
      </div>
    </form>
  )
}

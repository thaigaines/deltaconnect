// Member form to create or edit their profile (name, major, graduation, LinkedIn), private phone
// number, and what the public directory shows. RLS still decides if a save is allowed.
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

// Shared with Directory.jsx. { graduation_term: 'fall', graduation_year: 2027 } -> 'Fall 2027'.
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

// Same pattern as the database's check: a US number stored as +1 and 10 digits.
// Area codes and exchanges can't start with 0 or 1.
const phonePattern = /^\+1[2-9]\d{2}[2-9]\d{6}$/

// '(555) 234-5678', '555.234.5678', or '+1 555 234 5678' -> '+15552345678'; blank -> null.
function cleanPhone(text) {
  const digits = text.replace(/\D/g, '')
  if (!digits) return null
  // A leading 1 is the US country code, already covered by +1.
  return `+1${digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits}`
}

// Shared with Directory.jsx. '+15552345678' -> '(555) 234-5678'.
export function formatPhone(phone) {
  return `(${phone.slice(2, 5)}) ${phone.slice(5, 8)}-${phone.slice(8)}`
}

// ---------- Component ----------
// userId and email: the member's id and login email. profile: their current row with its
// profile_contact row nested (either may be null before the first save).
// onSaved: saved, so the home page can reload.
export default function ProfileForm({ userId, email, profile, onSaved }) {
  // ---------- State ----------
  const contact = profile?.profile_contact
  const [firstName, setFirstName] = useState(profile?.first_name ?? '')
  const [lastName, setLastName] = useState(profile?.last_name ?? '')
  const [major, setMajor] = useState(profile?.major ?? '')
  const [graduationTerm, setGraduationTerm] = useState(profile?.graduation_term ?? '')
  // Number inputs still give text, so the year is kept as a string until saving.
  const [graduationYear, setGraduationYear] = useState(String(profile?.graduation_year ?? ''))
  const [linkedIn, setLinkedIn] = useState(profile?.linkedin_url ?? '')
  const [phone, setPhone] = useState(contact?.phone ? formatPhone(contact.phone) : '')
  // Directory choices start off (unchecked) until the member opts in.
  const [showInDirectory, setShowInDirectory] = useState(contact?.show_in_directory ?? false)
  const [showEmail, setShowEmail] = useState(contact?.show_email ?? false)
  const [showPhone, setShowPhone] = useState(contact?.show_phone ?? false)
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
    const contactFields = {
      phone: cleanPhone(phone),
      show_in_directory: showInDirectory,
      show_email: showEmail,
      show_phone: showPhone,
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
    if (contactFields.phone && !phonePattern.test(contactFields.phone)) {
      setMessage({ text: 'Enter a 10-digit US phone number, like (555) 234-5678, or leave it blank.', isError: true })
      return
    }
    if (contactFields.show_phone && !contactFields.phone) {
      setMessage({ text: 'Add a phone number to show it in the directory.', isError: true })
      return
    }

    // The first save creates each row; later saves update them (an upsert would also try to update
    // user_id, which members can't change). The profile goes first because the
    // contact row points to it. If the contact save fails, the directory keeps treating the member
    // as hidden (no row) or keeps their previous choices, and saving again finishes the job.
    setBusy(true)
    const { error: profileError } = profile
      ? await supabase.from('profile').update(fields).eq('user_id', userId).select('user_id').single()
      : await supabase.from('profile').insert({ ...fields, user_id: userId })
    const { error } = profileError ? { error: profileError } : contact
      ? await supabase.from('profile_contact').update(contactFields).eq('user_id', userId).select('user_id').single()
      : await supabase.from('profile_contact').insert({ ...contactFields, user_id: userId })
    setBusy(false)

    if (profileError) setMessage({ text: friendlyError(profileError), isError: true })
    else if (error) setMessage({ text: `Profile saved, but your phone and directory choices weren't: ${friendlyError(error)}`, isError: true })
    else setMessage({ text: 'Profile saved.', isError: false })
    // Reload whenever the profile saved, even if the contact save failed, so the next save
    // updates the new profile instead of inserting it again.
    if (!profileError) onSaved()
  }

  // ---------- Render ----------
  return (
    <form className="account-form" onSubmit={handleSubmit} aria-label="Profile">
      <h3>Profile</h3>
      <p className="meta">If you join the directory, anyone can see your name, major, graduation, LinkedIn, and resume, plus your email and phone if you choose.</p>
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
      <label>
        Phone (optional, US)
        <input type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)}
          placeholder="(555) 234-5678" />
      </label>

      {/* ----- Directory choices ----- */}
      <label className="checkbox">
        <input type="checkbox" checked={showInDirectory} onChange={(event) => setShowInDirectory(event.target.checked)} />
        Show my profile in the public directory
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={showEmail} onChange={(event) => setShowEmail(event.target.checked)} />
        Show my email ({email})
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={showPhone} onChange={(event) => setShowPhone(event.target.checked)} />
        Show my phone number
      </label>

      {message && <p role={message.isError ? 'alert' : 'status'}>{message.text}</p>}

      <div className="form-actions">
        <button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
      </div>
    </form>
  )
}

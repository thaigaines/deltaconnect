// Member form to suggest an internship for editors to review. RLS still decides if a save is allowed.
import { useState } from 'react'
import { supabase } from './supabase.js'
import { friendlyError } from './errors.js'

// ---------- Component ----------
// onClose: Cancel clicked. onSaved: sent, so the page can thank the member.
export default function SuggestionForm({ onClose, onSaved }) {
  // ---------- State ----------
  const [title, setTitle] = useState('')
  const [company, setCompany] = useState('')
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // ---------- Save ----------
  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage('')

    // Clean input: trim text; a blank note becomes null. user_id comes from the database default.
    const fields = {
      title: title.trim(),
      company: company.trim(),
      application_url: url.trim(),
      note: note.trim() || null,
    }
    if (!fields.title || !fields.company) {
      setErrorMessage('Title and company are required.')
      return
    }

    setBusy(true)
    const { error } = await supabase.from('internship_suggestion').insert(fields)
    setBusy(false)
    if (error) setErrorMessage(friendlyError(error))
    else onSaved()
  }

  // ---------- Render ----------
  return (
    <form className="listing-form" onSubmit={handleSubmit} aria-label="Suggest an internship">
      <h3>Suggest an internship</h3>
      <p className="meta">Editors review suggestions before they appear in the list.</p>
      <label>
        Title
        <input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        Company
        <input required maxLength={200} value={company} onChange={(event) => setCompany(event.target.value)} />
      </label>
      <label>
        Application URL
        <input type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" />
      </label>
      <label>
        Note for editors (optional)
        <textarea maxLength={1000} rows={3} value={note} onChange={(event) => setNote(event.target.value)}
          placeholder="Deadline, location, or anything else you know" />
      </label>

      {errorMessage && <p role="alert">{errorMessage}</p>}

      <div className="form-actions">
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="submit" disabled={busy}>{busy ? 'Sending...' : 'Send suggestion'}</button>
      </div>
    </form>
  )
}

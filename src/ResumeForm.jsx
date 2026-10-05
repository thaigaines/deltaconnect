// Member form to add a resume (no resume prop) or edit one; a new PDF is optional when editing.
// RLS still decides if each write is allowed.
import { useState } from 'react'
import { supabase, resumeBucket } from './supabase.js'

// ---------- Component ----------
// userId: the member's id. resume: their current row, or null.
// onClose: Cancel clicked. onSaved: saved, so the directory can reload.
export default function ResumeForm({ userId, resume, onClose, onSaved }) {
  const isNew = !resume

  // ---------- State ----------
  // The picked File, or null. Browsers don't let code set a file input, so it's read in onChange only.
  const [file, setFile] = useState(null)
  const [firstName, setFirstName] = useState(resume?.first_name ?? '')
  const [lastName, setLastName] = useState(resume?.last_name ?? '')
  const [major, setMajor] = useState(resume?.major ?? '')
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // ---------- Save ----------
  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage('')

    // Matches the bucket's limits. No file while editing keeps the current one.
    const filename = file?.name.trim()
    if (isNew && !file) {
      setErrorMessage('Choose a PDF file.')
      return
    }
    if (file && (file.type !== 'application/pdf' || !filename || file.size > 500000)) {
      setErrorMessage('Choose a PDF file of 500 KB or smaller.')
      return
    }
    const details = { first_name: firstName.trim(), last_name: lastName.trim(), major: major.trim() }
    if (!details.first_name || !details.last_name || !details.major) {
      setErrorMessage('First name, last name, and major are required.')
      return
    }

    // Every upload gets a new path. Supabase advises against overwriting a file because
    // its CDN can keep serving the old copy for a while.
    const path = `${userId}/${crypto.randomUUID()}.pdf`
    const storage = supabase.storage.from(resumeBucket)
    // Holds the first failure; later steps run only while it's null.
    let error = null
    setBusy(true)

    // Upload first, so the details never point to a missing file.
    if (file) {
      const upload = await storage.upload(path, file, { contentType: 'application/pdf' })
      error = upload.error
    }

    // Then save the details (the database stamps uploaded_at).
    if (!error) {
      const fields = file ? { ...details, object_path: path, original_filename: filename } : details
      const result = isNew
        ? await supabase.from('resume').insert({ ...fields, user_id: userId })
        : await supabase.from('resume').update(fields).eq('user_id', userId)
      error = result.error

      // Clean up whichever file is no longer used: the new one if saving failed,
      // or the old one if a replacement saved.
      const unused = error ? path : resume?.object_path
      if (file && unused) {
        const cleanup = await storage.remove([unused])
        if (cleanup.error) {
          error = { message: error ? `${error.message} The uploaded file could not be removed.` : 'Saved, but the old file could not be removed.' }
        }
      }
    }
    setBusy(false)

    if (error) setErrorMessage(error.message)
    else onSaved()
  }

  // ---------- Render ----------
  return (
    <form className="resume-form" onSubmit={handleSubmit} aria-label={isNew ? 'Add resume' : 'Edit resume'}>
      <h3>{isNew ? 'Add resume' : 'Edit resume'}</h3>

      {!isNew && <p className="meta">Current file: {resume.original_filename}</p>}

      {/* accept only filters the file picker; handleSubmit does the real check. */}
      <label>
        {isNew ? 'PDF file (500 KB max)' : 'Replace PDF (optional, 500 KB max)'}
        <input type="file" accept="application/pdf" required={isNew}
          onChange={(event) => setFile(event.target.files[0] ?? null)} />
      </label>

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

      {errorMessage && <p role="alert">{errorMessage}</p>}

      <div className="form-actions">
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
      </div>
    </form>
  )
}

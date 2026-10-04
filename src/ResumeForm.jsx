// Add/edit resume form for members, shown in a panel above the resume directory.
// With no resume prop it adds the member's first resume; with a resume it edits the details
// and, if a new PDF is chosen, replaces the file.
// The database and Storage access rules (RLS) still decide whether each write is allowed.
import { useState } from 'react'
import { supabase, resumeBucket, resumePath } from './supabase.js'

// ============================================================
// Component
// userId: the signed-in member's id; their file always lives at resumePath(userId).
// resume: the member's current resume row, or null if they haven't uploaded one.
// onClose: called when the member clicks Cancel.
// onSaved: called after a successful save so the directory can reload.
// ============================================================
export default function ResumeForm({ userId, resume, onClose, onSaved }) {
  const isNew = !resume

  // ---------- State ----------
  // file: the File object the member picked, or null before they pick one.
  // A file input can't be "controlled" like a text input (browsers don't let code set
  // its value), so we only read from it in onChange.
  const [file, setFile] = useState(null)
  // Text fields start from the current resume when editing, or empty when adding.
  const [firstName, setFirstName] = useState(resume?.first_name ?? '')
  const [lastName, setLastName] = useState(resume?.last_name ?? '')
  const [major, setMajor] = useState(resume?.major ?? '')
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // ---------- Save ----------
  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage('')

    // Validate before writing; these match the bucket's limits and the table's filename rule.
    // A file is required when adding. When editing, no file means "keep the current one".
    const filename = file?.name.trim()
    if (isNew && !file) {
      setErrorMessage('Choose a PDF file.')
      return
    }
    if (file && (file.type !== 'application/pdf' || !filename || file.size > 500000)) {
      setErrorMessage('Choose a PDF file of 500 KB or smaller.')
      return
    }
    // Clean input before writing: trim the text fields, which the table requires to be non-blank.
    const details = { first_name: firstName.trim(), last_name: lastName.trim(), major: major.trim() }
    if (!details.first_name || !details.last_name || !details.major) {
      setErrorMessage('First name, last name, and major are required.')
      return
    }

    const path = resumePath(userId)
    const storage = supabase.storage.from(resumeBucket)
    // error holds the first failure; each step below runs only if nothing has failed yet.
    let error = null
    setBusy(true)

    // Upload first (only if a file was chosen). upsert: true overwrites the member's existing
    // file at the same path, so a replacement never leaves a gap with no resume.
    if (file) {
      const upload = await storage.upload(path, file, { upsert: true, contentType: 'application/pdf' })
      error = upload.error
    }

    // Then save the details; a new file also records its filename.
    // The database sets uploaded_at on every insert and update.
    if (!error) {
      const fields = file ? { ...details, object_path: path, original_filename: filename } : details
      const result = isNew
        ? await supabase.from('resume').insert({ ...fields, user_id: userId })
        : await supabase.from('resume').update(fields).eq('user_id', userId)
      error = result.error

      // A failed first save would leave a file with no directory entry, so remove it.
      // Skip this for 23505 (row already exists, e.g. added in another tab): that file is live.
      if (error && isNew && error.code !== '23505') {
        const cleanup = await storage.remove([path])
        if (cleanup.error) error = { message: `${error.message} The uploaded file could not be removed; please try again.` }
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

      {/* ----- Edit only: show which file is currently published ----- */}
      {!isNew && <p className="meta">Current file: {resume.original_filename}</p>}

      {/* accept filters the file picker to PDFs; it's a convenience, not validation. */}
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

      {/* ----- Actions ----- */}
      <div className="form-actions">
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
      </div>
    </form>
  )
}

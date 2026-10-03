// Add/edit resume form for members, shown in a panel above the resume directory.
// With no resume prop it adds the member's first resume; with a resume it replaces it.
// The database and Storage access rules (RLS) still decide whether each write is allowed.
import { useState } from 'react'
import { supabase } from './supabase.js'

// ============================================================
// Component
// userId: the signed-in member's id; their file always lives at `${userId}/resume.pdf`.
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
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // ---------- Save ----------
  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage('')

    // Validate before writing; these match the bucket's limits and the table's filename rule.
    const filename = file?.name.trim()
    if (!file || file.type !== 'application/pdf' || !filename) {
      setErrorMessage('Choose a PDF file.')
      return
    }
    if (file.size > 500000) {
      setErrorMessage('The PDF must be 500 KB or smaller.')
      return
    }

    // Every member has one file at a fixed path. upsert: true overwrites an existing
    // file there, so a replacement never leaves a gap with no resume.
    const path = `${userId}/resume.pdf`
    const storage = supabase.storage.from('dsp-public-resumes')
    setBusy(true)
    const upload = await storage.upload(path, file, { upsert: true, contentType: 'application/pdf' })
    if (upload.error) {
      setBusy(false)
      setErrorMessage(upload.error.message)
      return
    }

    // Upload first, then save the details. The database sets uploaded_at on insert and update.
    const fields = { object_path: path, original_filename: filename }
    const { error } = isNew
      ? await supabase.from('resume').insert({ ...fields, user_id: userId })
      : await supabase.from('resume').update(fields).eq('user_id', userId)

    // A failed first upload would leave a file with no directory entry, so remove it.
    // Skip this for 23505 (row already exists, e.g. added in another tab): that file is live.
    if (error && isNew && error.code !== '23505') {
      const cleanup = await storage.remove([path])
      if (cleanup.error) {
        setBusy(false)
        setErrorMessage(`${error.message} The uploaded file could not be removed; please try again.`)
        return
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
        PDF file (500 KB max)
        <input type="file" accept="application/pdf" required
          onChange={(event) => setFile(event.target.files[0] ?? null)} />
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

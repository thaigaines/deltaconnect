// Member form to upload a resume PDF, or replace the current one. RLS still decides if each write is allowed.
import { useState } from 'react'
import { supabase, resumeBucket } from './supabase.js'

// ---------- Component ----------
// userId: the member's id. resume: their current row ({ object_path, original_filename }), or null.
// onSaved: saved, so the home page can reload and retain any cleanup warning.
export default function ResumeForm({ userId, resume, onSaved }) {
  // ---------- State ----------
  // The picked File, or null. Browsers don't let code set a file input, so it's read in onChange only.
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // ---------- Save ----------
  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage('')

    // Matches the bucket's limits.
    const filename = file?.name.trim()
    if (!file || file.type !== 'application/pdf' || !filename || file.size > 500000) {
      setErrorMessage('Choose a PDF file of 500 KB or smaller.')
      return
    }

    // Every upload gets a new path. Supabase advises against overwriting a file because
    // its CDN can keep serving the old copy for a while.
    const path = `${userId}/${crypto.randomUUID()}.pdf`
    const storage = supabase.storage.from(resumeBucket)
    setBusy(true)

    // Upload first, so the row never points to a missing file.
    let { error } = await storage.upload(path, file, { contentType: 'application/pdf' })
    let warning = ''

    // Then save the row (the database stamps uploaded_at).
    if (!error) {
      const fields = { object_path: path, original_filename: filename }
      const result = resume
        ? await supabase.from('resume').update(fields).eq('user_id', userId).select('object_path').single()
        : await supabase.from('resume').insert({ ...fields, user_id: userId })
      error = result.error

      // Clean up whichever file is no longer used: the new one if saving failed,
      // or the old one if a replacement saved.
      const unused = error ? path : resume?.object_path
      if (unused) {
        const cleanup = await storage.remove([unused])
        if (cleanup.error) {
          if (error) error = { message: `${error.message} The uploaded file could not be removed.` }
          else warning = 'Resume saved, but the old file could not be removed.'
        }
      }
    }
    if (error) {
      setBusy(false)
      setErrorMessage(error.message)
    } else {
      // Stay disabled until Home reloads the committed path and remounts this form.
      onSaved(warning)
    }
  }

  // ---------- Render ----------
  return (
    <form className="account-form" onSubmit={handleSubmit} aria-label="Resume">
      <h3>Resume</h3>
      {/* getPublicUrl builds the link only; nothing is downloaded here. */}
      {resume ? (
        <p className="meta">
          Current file: <a href={supabase.storage.from(resumeBucket).getPublicUrl(resume.object_path).data.publicUrl}
            target="_blank" rel="noopener noreferrer">{resume.original_filename}</a>
        </p>
      ) : <p className="meta">Share a PDF in the public resume directory.</p>}

      {/* accept only filters the file picker; handleSubmit does the real check. */}
      <label>
        {resume ? 'Replace PDF (500 KB max)' : 'PDF file (500 KB max)'}
        <input type="file" accept="application/pdf" required onChange={(event) => setFile(event.target.files[0] ?? null)} />
      </label>

      {errorMessage && <p role="alert">{errorMessage}</p>}

      <div className="form-actions">
        <button type="submit" disabled={busy}>{busy ? 'Uploading...' : 'Upload'}</button>
      </div>
    </form>
  )
}

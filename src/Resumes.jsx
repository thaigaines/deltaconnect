// Public resume directory (no login needed). Members can also add or edit their own resume.
import { useEffect, useState } from 'react'
import { supabase, resumeBucket } from './supabase.js'
import ResumeForm from './ResumeForm.jsx'
import { loadRows } from './loadRows.js'

// ---------- Component ----------
// userId: signed-in user's id, or undefined. isMember: may add or edit their own resume.
export default function Resumes({ userId, isMember }) {
  // ---------- State ----------
  const [resumes, setResumes] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  // Bumping refresh reruns the load effect.
  const [refresh, setRefresh] = useState(0)
  const [formOpen, setFormOpen] = useState(false)

  // ---------- Load resumes ----------
  useEffect(() => {
    // Ignores an outdated response if a newer load starts or the page is left.
    let cancelled = false

    async function loadResumes() {
      setLoading(true)
      setErrorMessage('')

      // Logged-out visitors may read only these columns. Newest first; object_path breaks ties.
      const { data, error } = await loadRows((options) => supabase
        .from('resume')
        .select('object_path,original_filename,uploaded_at,first_name,last_name,major', options)
        .order('uploaded_at', { ascending: false })
        .order('object_path'), 'object_path', () => cancelled)

      if (cancelled) return
      if (error) setErrorMessage(error.message)
      else setResumes(data)
      setLoading(false)
    }

    loadResumes()
    return () => { cancelled = true }
  }, [refresh])

  // ---------- Derived values ----------
  // The member's own row, found by their folder in the path; undefined if they have none.
  const myResume = resumes.find((resume) => resume.object_path.startsWith(`${userId}/`))

  // ---------- Event handlers ----------
  function handleSaved() {
    setFormOpen(false)
    setRefresh((value) => value + 1)
  }

  // ---------- Render ----------
  return (
    <section aria-labelledby="resumes-heading">
      {/* ----- Heading and actions ----- */}
      <div className="section-head">
        <h2 id="resumes-heading">Public resumes</h2>
        <div className="actions">
          {/* Only complete results can determine whether the member already has a resume. */}
          {isMember && (
            <button type="button" disabled={loading || Boolean(errorMessage)} onClick={() => setFormOpen(true)}>
              {myResume ? 'Edit resume' : 'Add resume'}
            </button>
          )}
          <button type="button" disabled={loading || formOpen} onClick={() => setRefresh((value) => value + 1)}>Refresh resumes</button>
        </div>
      </div>
      <p className="meta">Browse chapter resumes.</p>

      {/* ----- Add/edit form (?? turns undefined into null, meaning "add") ----- */}
      {formOpen && !loading && !errorMessage && (
        <div className="panel">
          <ResumeForm userId={userId} resume={myResume ?? null} onClose={() => setFormOpen(false)} onSaved={handleSaved} />
        </div>
      )}

      {/* ----- Results: loading, error, empty, or the cards ----- */}
      {loading ? (
        <p role="status">Loading resumes...</p>
      ) : errorMessage ? (
        <p role="alert">Could not load resumes: {errorMessage}</p>
      ) : resumes.length === 0 ? (
        <p>No resumes have been shared yet.</p>
      ) : (
        <ul className="results">
          {resumes.map((resume) => {
            // Builds the URL only; nothing is downloaded here.
            const { data } = supabase.storage.from(resumeBucket).getPublicUrl(resume.object_path)
            const name = `${resume.first_name} ${resume.last_name}`
            return (
              <li key={resume.object_path} className="resume-card">
                {/* Browser PDF preview (#settings: fit page, no toolbar), skipped by Tab and screen readers.
                    The link covers it, so a click anywhere opens the PDF in a new tab. */}
                <div className="resume-preview">
                  <iframe loading="lazy" src={`${data.publicUrl}#toolbar=0&navpanes=0&view=Fit`} title={`${name} resume preview`} tabIndex={-1} aria-hidden="true" />
                  <a href={data.publicUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${name}'s resume (PDF)`} />
                </div>
                <h3>{name}</h3>
                <p className="meta">{resume.major}</p>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

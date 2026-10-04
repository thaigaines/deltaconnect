// Public resume directory: anyone can view it, no login needed.
// Loads resume details and shows each PDF as a preview that opens the full file when clicked.
// Signed-in members also get an Add/Edit resume button for their own resume.
import { useEffect, useState } from 'react'
import { supabase, resumeBucket, resumePath } from './supabase.js'
import ResumeForm from './ResumeForm.jsx'

// ============================================================
// Component
// userId: the signed-in user's id, or undefined when signed out.
// isMember: true only for approved members, who may add or edit their own resume.
// ============================================================
export default function Resumes({ userId, isMember }) {
  // ---------- State ----------
  const [resumes, setResumes] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  // A counter whose only job is to change; changing it reruns the load effect below.
  const [refresh, setRefresh] = useState(0)
  // Whether the add/edit form is open.
  const [formOpen, setFormOpen] = useState(false)

  // ---------- Load resumes ----------
  // Runs when the page first appears and again whenever refresh changes.
  useEffect(() => {
    // If a newer load starts or the page is left before this request finishes,
    // the cleanup sets cancelled so the outdated response is ignored.
    let cancelled = false

    async function loadResumes() {
      setLoading(true)
      setErrorMessage('')

      // Visitors who aren't logged in may read only these columns (not user_id).
      // Newest uploads first; object_path breaks ties so the order is stable.
      const { data, error } = await supabase
        .from('resume')
        .select('object_path,original_filename,uploaded_at,first_name,last_name,major')
        .order('uploaded_at', { ascending: false })
        .order('object_path')

      if (cancelled) return
      if (error) setErrorMessage(error.message)
      else setResumes(data)
      setLoading(false)
    }

    loadResumes()
    return () => { cancelled = true }
  }, [refresh])

  // ---------- Derived values ----------
  // Every member's file has a fixed path, so the member's own row can be found
  // in the list already loaded. undefined means they haven't uploaded one yet.
  const myResume = resumes.find((resume) => resume.object_path === resumePath(userId))

  // ---------- Event handlers ----------
  // After a save: close the form and reload the list so the change shows.
  function handleSaved() {
    setFormOpen(false)
    setRefresh((value) => value + 1)
  }

  // ---------- Render ----------
  return (
    <section aria-labelledby="resumes-heading">
      {/* ----- Heading, add/edit (members only), and refresh ----- */}
      {/* The add/edit button waits for loading so it never says "Add" for a member who already has one. */}
      <div className="section-head">
        <h2 id="resumes-heading">Public resumes</h2>
        <div className="actions">
          {isMember && (
            <button type="button" disabled={loading} onClick={() => setFormOpen(true)}>
              {myResume ? 'Edit resume' : 'Add resume'}
            </button>
          )}
          <button type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Refresh resumes</button>
        </div>
      </div>
      <p className="meta">Browse chapter resumes without logging in.</p>

      {/* ----- Add/edit form: drops down here while open ----- */}
      {/* ?? turns undefined (no resume yet) into null, which ResumeForm treats as "add". */}
      {formOpen && (
        <div className="panel">
          <ResumeForm userId={userId} resume={myResume ?? null} onClose={() => setFormOpen(false)} onSaved={handleSaved} />
        </div>
      )}

      {/* ----- Results ----- */}
      {/* The ternary chain picks one: loading message, error, empty message, or the list. */}
      {loading ? (
        <p role="status">Loading resumes...</p>
      ) : errorMessage ? (
        <p role="alert">Could not load resumes: {errorMessage}</p>
      ) : resumes.length === 0 ? (
        <p>No resumes have been shared yet.</p>
      ) : (
        <ul className="results">
          {resumes.map((resume) => {
            // getPublicUrl only builds the URL; it doesn't download or check the PDF.
            const { data } = supabase.storage.from(resumeBucket).getPublicUrl(resume.object_path)
            const name = `${resume.first_name} ${resume.last_name}`
            return (
              <li key={resume.object_path}>
                {/* The browser's PDF viewer draws the preview; the #settings ask it to fit the page
                    with no toolbar. The link sits on top of the preview, so a click anywhere opens the
                    PDF in a new tab. The preview itself is skipped by Tab and screen readers. */}
                <div className="resume-preview">
                  <iframe src={`${data.publicUrl}#toolbar=0&navpanes=0&view=Fit`} title={`${name} resume preview`} tabIndex={-1} aria-hidden="true" />
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

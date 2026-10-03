// Public resume directory: anyone can view it, no login needed.
// Loads resume details from the database and links each one to its PDF in Supabase Storage.
import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

export default function Resumes() {
  // ---------- State ----------
  // useState returns [current value, setter]. Calling a setter re-renders the component.
  const [resumes, setResumes] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  // A counter whose only job is to change; changing it reruns the load effect below.
  const [refresh, setRefresh] = useState(0)

  // ---------- Load resumes ----------
  // Runs when the page first appears and again whenever refresh changes.
  useEffect(() => {
    // If a newer load starts or the page is left before this request finishes,
    // the cleanup sets cancelled so the outdated response is ignored.
    let cancelled = false

    async function loadResumes() {
      setLoading(true)
      setErrorMessage('')

      // Visitors who aren't logged in may read only these three columns (not user_id).
      // Newest uploads first; object_path breaks ties so the order is stable.
      const { data, error } = await supabase
        .from('resume')
        .select('object_path,original_filename,uploaded_at')
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

  // ---------- Render ----------
  return (
    <section aria-labelledby="resumes-heading">
      {/* ----- Heading and refresh ----- */}
      <div className="section-head">
        <h2 id="resumes-heading">Public resumes</h2>
        <button type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Refresh resumes</button>
      </div>
      <p className="meta">Browse chapter resumes without logging in.</p>

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
            // getPublicUrl only builds the link text; it doesn't download or check the PDF.
            const { data } = supabase.storage.from('dsp-public-resumes').getPublicUrl(resume.object_path)
            return (
              <li key={resume.object_path}>
                <a href={data.publicUrl} target="_blank" rel="noopener noreferrer">{resume.original_filename} (PDF)</a>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

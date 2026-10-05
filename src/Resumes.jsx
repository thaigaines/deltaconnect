// Public resume directory (no login needed). Members manage their own resume on the home page.
import { useEffect, useState } from 'react'
import { supabase, resumeBucket } from './supabase.js'
import { loadRows } from './loadRows.js'

// ---------- Component ----------
export default function Resumes() {
  // ---------- State ----------
  const [resumes, setResumes] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  // Bumping refresh reruns the load effect.
  const [refresh, setRefresh] = useState(0)
  // Search text ('' = show all). Controlled input, like the internships search.
  const [search, setSearch] = useState('')

  // ---------- Load resumes ----------
  useEffect(() => {
    // Ignores an outdated response if a newer load starts or the page is left.
    let cancelled = false

    async function loadResumes() {
      setLoading(true)
      setErrorMessage('')

      // Each resume with its owner's profile (name and major). Newest first; object_path breaks ties.
      const { data, error } = await loadRows((options) => supabase
        .from('resume')
        .select('object_path,profile(first_name,last_name,major)', options)
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
  // Search matches the full name or major, ignoring case.
  const query = search.trim().toLowerCase()
  const visible = resumes.filter(({ profile }) =>
    [`${profile.first_name} ${profile.last_name}`, profile.major].some((value) => value.toLowerCase().includes(query)))

  // ---------- Render ----------
  return (
    <section aria-labelledby="resumes-heading">
      {/* ----- Heading and actions ----- */}
      <div className="section-head">
        <h2 id="resumes-heading">Public resumes</h2>
        <div className="actions">
          <button type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Refresh resumes</button>
        </div>
      </div>
      <p className="meta">Browse chapter resumes.</p>

      {/* ----- Search ----- */}
      <div className="filters">
        <label>
          Search
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or major" />
        </label>
      </div>

      {/* ----- Results: loading, error, empty, or the cards ----- */}
      {loading ? (
        <p role="status">Loading resumes...</p>
      ) : errorMessage ? (
        <p role="alert">Could not load resumes: {errorMessage}</p>
      ) : visible.length === 0 ? (
        <p>{resumes.length === 0 ? 'No resumes have been shared yet.' : 'No resumes match your search.'}</p>
      ) : (
        <ul className="results">
          {visible.map((resume) => {
            // Builds the URL only; nothing is downloaded here.
            const { data } = supabase.storage.from(resumeBucket).getPublicUrl(resume.object_path)
            const name = `${resume.profile.first_name} ${resume.profile.last_name}`
            return (
              <li key={resume.object_path} className="resume-card">
                {/* Browser PDF preview (#settings: fit page, no toolbar), skipped by Tab and screen readers.
                    The link covers it, so a click anywhere opens the PDF in a new tab. */}
                <div className="resume-preview">
                  <iframe loading="lazy" src={`${data.publicUrl}#toolbar=0&navpanes=0&view=Fit`} title={`${name} resume preview`} tabIndex={-1} aria-hidden="true" />
                  <a href={data.publicUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${name}'s resume (PDF)`} />
                </div>
                <h3>{name}</h3>
                <p className="meta">{resume.profile.major}</p>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

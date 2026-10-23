// Public member directory (no login needed). Lists members who chose to appear, with only the
// details they chose to share. Members make those choices on the home page.
import { useEffect, useState } from 'react'
import { supabase, resumeBucket } from './supabase.js'
import { loadRows } from './loadRows.js'
import { friendlyError } from './errors.js'
import { formatPhone, graduationLabel } from './ProfileForm.jsx'

// ---------- Component ----------
export default function Directory() {
  // ---------- State ----------
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  // Bumping refresh reruns the load effect.
  const [refresh, setRefresh] = useState(0)
  // Search text ('' = show all). Controlled input, like the internships search.
  const [search, setSearch] = useState('')

  // ---------- Load members ----------
  useEffect(() => {
    // Ignores an outdated response if a newer load starts or the page is left.
    let cancelled = false

    async function loadMembers() {
      setLoading(true)
      setErrorMessage('')

      // list_directory() returns only members who opted in, and leaves email and phone null unless
      // the member chose to show them. Sorted by name; user_id breaks ties.
      const { data, error } = await loadRows((options) => supabase
        .rpc('list_directory', undefined, options)
        .order('last_name')
        .order('first_name')
        .order('user_id'), 'user_id', () => cancelled)

      if (cancelled) return
      if (error) setErrorMessage(friendlyError(error))
      else setMembers(data)
      setLoading(false)
    }

    loadMembers()
    return () => { cancelled = true }
  }, [refresh])

  // ---------- Derived values ----------
  // Search matches the full name or major, ignoring case.
  const query = search.trim().toLowerCase()
  const visible = members.filter((member) =>
    [`${member.first_name} ${member.last_name}`, member.major].some((value) => value.toLowerCase().includes(query)))

  // ---------- Render ----------
  return (
    <section aria-labelledby="directory-heading">
      {/* ----- Heading and actions ----- */}
      <div className="section-head">
        <h2 id="directory-heading">Member directory</h2>
        <div className="actions">
          <button type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Refresh directory</button>
        </div>
      </div>
      <p className="meta">Browse chapter members, their resumes, and how to reach them.</p>

      {/* ----- Search ----- */}
      <div className="filters">
        <label>
          Search
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or major" />
        </label>
      </div>

      {/* ----- Results: loading, error, empty, or the cards ----- */}
      {loading ? (
        <p role="status">Loading directory...</p>
      ) : errorMessage ? (
        <p role="alert">Could not load the directory: {errorMessage}</p>
      ) : visible.length === 0 ? (
        <p>{members.length === 0 ? 'No members are listed yet.' : 'No members match your search.'}</p>
      ) : (
        <ul className="results">
          {visible.map((member) => {
            const name = `${member.first_name} ${member.last_name}`
            const graduation = graduationLabel(member)
            // Builds the URL only; nothing is downloaded here. Members without a resume have no path.
            const resumeUrl = member.object_path && supabase.storage.from(resumeBucket).getPublicUrl(member.object_path).data.publicUrl
            return (
              <li key={member.user_id} className="resume-card">
                {/* Browser PDF preview (#settings: fit page, no toolbar), skipped by Tab and screen readers.
                    The link covers it, so a click anywhere opens the PDF in a new tab. */}
                {resumeUrl && (
                  <div className="resume-preview">
                    <iframe loading="lazy" src={`${resumeUrl}#toolbar=0&navpanes=0&view=Fit`} title={`${name} resume preview`} tabIndex={-1} aria-hidden="true" />
                    <a href={resumeUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${name}'s resume (PDF)`} />
                  </div>
                )}
                <h3>{name}</h3>
                <p className="meta">{member.major}{graduation && ` · ${graduation}`}</p>
                {member.email && <a href={`mailto:${member.email}`}>{member.email}</a>}
                {member.phone && <a href={`tel:${member.phone}`}>{formatPhone(member.phone)}</a>}
                {member.linkedin_url && (
                  <a href={member.linkedin_url} target="_blank" rel="noopener noreferrer">LinkedIn</a>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// Lists shared resumes and links to their public PDFs without requiring login.
import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

export default function Resumes() {
  // React: state stores the fetched rows and determines which message is displayed.
  const [resumes, setResumes] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [refresh, setRefresh] = useState(0)

  // React: this effect fetches on mount or refresh; async/await inside it is JavaScript.
  useEffect(() => {
    let cancelled = false

    async function loadResumes() {
      setLoading(true)
      setErrorMessage('')
      // Anonymous visitors can read these columns, but not the user_id column.
      const { data, error } = await supabase
        .from('resume')
        .select('object_path,original_filename,uploaded_at')
        .order('uploaded_at', { ascending: false })
        .order('object_path')

      // Ignore a late response after navigation or a newer refresh.
      if (cancelled) return
      // If the query fails, store its error; otherwise replace the resume list.
      if (error) setErrorMessage(error.message)
      else setResumes(data)
      setLoading(false)
    }

    loadResumes()
    // Cleanup makes the cancelled check ignore responses from this older effect.
    return () => { cancelled = true }
  }, [refresh])

  // React: JSX describes the page; the conditional branches and map use JavaScript.
  return (
    <section aria-labelledby="resumes-heading">
      <h2 id="resumes-heading">Public resumes</h2>
      <p>Browse chapter resumes without logging in.</p>
      <button type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Refresh resumes</button>
      {/* Show loading first, then an error or an empty message; otherwise render the links. */}
      {loading ? (
        <p role="status">Loading resumes...</p>
      ) : errorMessage ? (
        <p role="alert">Could not load resumes: {errorMessage}</p>
      ) : resumes.length === 0 ? (
        <p>No resumes have been shared yet.</p>
      ) : (
        <ul className="results">
          {resumes.map((resume) => {
            // This builds the public URL; it doesn't fetch or check the PDF.
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

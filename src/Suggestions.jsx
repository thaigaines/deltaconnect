// Editors' review list of member internship suggestions, shown on the internships page.
// Editors add a suggestion as a listing (prefilled form) or dismiss it, which deletes it.
import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { loadRows } from './loadRows.js'
import { friendlyError } from './errors.js'

// ---------- Component ----------
// onAdd(suggestion): open the add-listing form prefilled from this suggestion.
// The internships page gives this a new key on refresh, which remounts it and reloads the list.
export default function Suggestions({ onAdd }) {
  // ---------- State ----------
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  // Bumping refresh reruns the load effect.
  const [refresh, setRefresh] = useState(0)
  const [busy, setBusy] = useState(false)

  // ---------- Load suggestions ----------
  useEffect(() => {
    // Ignores an outdated response if a newer load starts or the page is left.
    let cancelled = false

    async function loadSuggestions() {
      setErrorMessage('')

      // Oldest first, so the longest-waiting suggestion is reviewed next; id breaks ties.
      const { data, error } = await loadRows((options) => supabase
        .from('internship_suggestion')
        .select('id,title,company,application_url,note', options)
        .order('created_at', { ascending: true })
        .order('id'), 'id', () => cancelled)

      if (cancelled) return
      if (error) setErrorMessage(friendlyError(error))
      else setSuggestions(data)
      setLoading(false)
    }

    loadSuggestions()
    return () => { cancelled = true }
  }, [refresh])

  // ---------- Event handlers ----------
  async function handleDismiss(suggestion) {
    if (!window.confirm(`Dismiss the suggestion "${suggestion.title}" at ${suggestion.company}?`)) return
    setErrorMessage('')
    setBusy(true)
    const { error } = await supabase.from('internship_suggestion').delete().eq('id', suggestion.id).select('id').single()
    setBusy(false)
    if (error) setErrorMessage(friendlyError(error))
    else setRefresh((value) => value + 1)
  }

  // ---------- Render ----------
  // Nothing to review: show nothing, so the page looks the same as before suggestions existed.
  if (loading || (!errorMessage && suggestions.length === 0)) return null

  return (
    <div className="panel">
      <h3 className="panel-heading">Suggestions from members ({suggestions.length})</h3>
      {errorMessage && <p role="alert">{errorMessage}</p>}
      <ul className="forum-list">
        {suggestions.map((suggestion) => (
          <li key={suggestion.id}>
            <span className="company">{suggestion.company}</span>
            <h3>{suggestion.title}</h3>
            <a href={suggestion.application_url} target="_blank" rel="noopener noreferrer">{suggestion.application_url}</a>
            {suggestion.note && <p className="forum-body meta">{suggestion.note}</p>}
            <div className="actions">
              <button type="button" disabled={busy} onClick={() => onAdd(suggestion)}>Add as listing</button>
              <button type="button" disabled={busy} onClick={() => handleDismiss(suggestion)}>Dismiss</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

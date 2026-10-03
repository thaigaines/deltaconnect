// Add/edit form for editors, shown inline: above the list when adding, inside the card when editing.
// With no listing prop it adds a new listing; with a listing it edits that one.
// The database's access rules (RLS) still decide whether the save is allowed.
import { useState } from 'react'
import { supabase } from './supabase.js'

// ============================================================
// Helpers: plain JavaScript functions, no React involved.
// ============================================================

// Turns the locations text into rows for the database.
// 'Boston, ma; New York, NY' -> [{ city: 'Boston', state: 'MA' }, { city: 'New York', state: 'NY' }]
// Empty entries (e.g. a trailing ';') are skipped. A missing city or state becomes '',
// which handleSubmit catches before saving.
function parseLocations(text) {
  return text.split(';')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
    .map((entry) => {
      const [city = '', state = ''] = entry.split(',').map((part) => part.trim())
      return { city, state: state.toUpperCase() }
    })
}

// Calls the create_listing() database function, which saves the listing and its
// locations together: if any part fails, nothing is saved. Returns the error, or null.
async function createListing(fields, locations, allowDuplicate) {
  const { error } = await supabase.rpc('create_listing', {
    p_title: fields.title,
    p_company: fields.company,
    p_application_url: fields.application_url,
    p_work_arrangement: fields.work_arrangement,
    p_deadline: fields.deadline,
    p_locations: locations,
    p_allow_duplicate: allowDuplicate,
  })
  return error
}

// ============================================================
// Component
// listing: the listing to edit, or null to add a new one.
// onClose: called when the editor clicks Cancel.
// onSaved: called after a successful save so the list can reload.
// ============================================================
export default function ListingForm({ listing, onClose, onSaved }) {
  const isNew = !listing

  // ---------- State ----------
  // Starting values: the listing's current values when editing, blanks when adding.
  // ?. returns undefined instead of crashing when listing is null; ?? then supplies the blank.
  const [title, setTitle] = useState(listing?.title ?? '')
  const [company, setCompany] = useState(listing?.company ?? '')
  const [url, setUrl] = useState(listing?.application_url ?? '')
  const [workArrangement, setWorkArrangement] = useState(listing?.work_arrangement ?? 'in-person')
  const [deadline, setDeadline] = useState(listing?.deadline ?? '')
  const [locations, setLocations] = useState('') // adding only
  const [isArchived, setIsArchived] = useState(listing?.is_archived ?? false) // editing only
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // ---------- Save ----------
  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage('')

    // Clean input before writing: trim text and turn a blank deadline into null (no deadline).
    const fields = {
      title: title.trim(),
      company: company.trim(),
      application_url: url.trim(),
      work_arrangement: workArrangement,
      deadline: deadline || null,
    }
    if (!fields.title || !fields.company) {
      setErrorMessage('Title and company are required.')
      return
    }

    let error
    setBusy(true)
    if (isNew) {
      const parsed = parseLocations(locations)
      if (parsed.some((location) => !location.city || !location.state)) {
        setBusy(false)
        setErrorMessage('Write each location as City, ST and separate them with semicolons.')
        return
      }
      // 23505 is the database's "duplicate" error code. Ask the editor, then retry
      // with the duplicate override if they confirm.
      error = await createListing(fields, parsed, false)
      if (error?.code === '23505' && window.confirm('A listing with this application URL already exists. Add it anyway?')) {
        error = await createListing(fields, parsed, true)
      }
    } else {
      // Editing changes only this listing's own row, so one update saves everything at once.
      const result = await supabase
        .from('internship')
        .update({ ...fields, is_archived: isArchived })
        .eq('id', listing.id)
      error = result.error
    }
    setBusy(false)

    if (error) setErrorMessage(error.message)
    else onSaved()
  }

  // ---------- Render ----------
  // aria-label names the form for screen readers; the parent decides where it appears.
  return (
    <form className="listing-form" onSubmit={handleSubmit} aria-label={isNew ? 'Add listing' : 'Edit listing'}>
      <h3>{isNew ? 'Add listing' : 'Edit listing'}</h3>
      {/* ----- Fields shared by add and edit ----- */}
      <label>
        Title
        <input required value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        Company
        <input required value={company} onChange={(event) => setCompany(event.target.value)} />
      </label>
      <label>
        Application URL
        <input type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" />
      </label>
      <label>
        Work arrangement
        <select value={workArrangement} onChange={(event) => setWorkArrangement(event.target.value)}>
          <option value="in-person">In person</option>
          <option value="hybrid">Hybrid</option>
          <option value="remote">Remote</option>
        </select>
      </label>
      <label>
        Deadline (leave blank if there is none)
        <input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
      </label>

      {/* ----- Add only: locations are saved together with a new listing ----- */}
      {isNew && (
        <label>
          Locations (City, ST; City, ST), or blank if none
          <input value={locations} onChange={(event) => setLocations(event.target.value)} placeholder="Boston, MA; New York, NY" />
        </label>
      )}

      {/* ----- Edit only: archiving hides the listing from members ("remove") ----- */}
      {!isNew && (
        <label className="checkbox">
          <input type="checkbox" checked={isArchived} onChange={(event) => setIsArchived(event.target.checked)} />
          Archived (hidden from members)
        </label>
      )}

      {errorMessage && <p role="alert">{errorMessage}</p>}

      {/* ----- Actions ----- */}
      <div className="form-actions">
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
      </div>
    </form>
  )
}

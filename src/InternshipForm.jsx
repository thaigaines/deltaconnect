// Editor form to add a listing (no listing prop) or edit one. RLS still decides if a save is allowed.
import { useState } from 'react'
import { supabase } from './supabase.js'
import { friendlyError } from './errors.js'

// ---------- Helpers ----------

// US state and territory codes the database accepts (same list as the migration).
const stateCodes = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM',
  'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
  'WV', 'WI', 'WY', 'AS', 'GU', 'MP', 'PR', 'VI',
]

// 'Boston, ma; New York, NY' -> [{ city: 'Boston', state: 'MA' }, { city: 'New York', state: 'NY' }]
// Blank entries and repeats are skipped; a missing city or state becomes '' for handleSubmit to reject.
function parseLocations(text) {
  return text.split(';')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
    .map((entry) => {
      const [city = '', state = ''] = entry.split(',').map((part) => part.trim())
      return { city, state: state.toUpperCase() }
    })
    // Keep only the first copy, since the database rejects a repeated location.
    .filter((location, index, all) =>
      all.findIndex((other) => other.city === location.city && other.state === location.state) === index)
}

// Saves a listing and its locations together (all or nothing). Returns the error, or null.
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

// ---------- Component ----------
// listing: the listing to edit, or null to add one. suggestion: a member's suggestion that
// prefills a new listing (optional). onClose: Cancel clicked. onSaved: saved, so the list can reload.
export default function InternshipForm({ listing, suggestion, onClose, onSaved }) {
  const isNew = !listing

  // ---------- State ----------
  // Start from the listing's values, a suggestion's, or blanks (?. and ?? handle the missing ones).
  const [title, setTitle] = useState(listing?.title ?? suggestion?.title ?? '')
  const [company, setCompany] = useState(listing?.company ?? suggestion?.company ?? '')
  const [url, setUrl] = useState(listing?.application_url ?? suggestion?.application_url ?? '')
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

    // Clean input: trim text; a blank deadline becomes null.
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
    const parsed = isNew ? parseLocations(locations) : []
    if (parsed.some((location) => !location.city || !location.state)) {
      setErrorMessage('Write each location as City, ST and separate them with semicolons.')
      return
    }
    const badState = parsed.find((location) => !stateCodes.includes(location.state))
    if (badState) {
      setErrorMessage(`"${badState.state}" is not a US state or territory code. Use two letters, like MA.`)
      return
    }

    let error
    setBusy(true)
    if (isNew) {
      // 23505 means duplicate URL: ask, then retry with the override or stop.
      error = await createListing(fields, parsed, false)
      if (error?.code === '23505') {
        error = window.confirm('A listing with this application URL already exists. Add it anyway?')
          ? await createListing(fields, parsed, true)
          : { message: 'Not added: a listing with this application URL already exists.' }
      }
    } else {
      const result = await supabase
        .from('internship')
        .update({ ...fields, is_archived: isArchived })
        .eq('id', listing.id)
        .select('id').single()
      error = result.error
    }
    setBusy(false)

    if (error) setErrorMessage(friendlyError(error))
    else onSaved()
  }

  // ---------- Render ----------
  return (
    <form className="listing-form" onSubmit={handleSubmit} aria-label={isNew ? 'Add listing' : 'Edit listing'}>
      <h3>{isNew ? 'Add listing' : 'Edit listing'}</h3>
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
          <option value="in-person">In-person</option>
          <option value="hybrid">Hybrid</option>
          <option value="remote">Remote</option>
        </select>
      </label>
      <label>
        Deadline (leave blank if there is none)
        <input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
      </label>

      {/* Locations are saved with a new listing only. */}
      {isNew && (
        <label>
          Locations (City, ST; City, ST), or blank if none
          <input value={locations} onChange={(event) => setLocations(event.target.value)} placeholder="Boston, MA; New York, NY" />
        </label>
      )}

      {/* Archiving hides a listing from members. */}
      {!isNew && (
        <label className="checkbox">
          <input type="checkbox" checked={isArchived} onChange={(event) => setIsArchived(event.target.checked)} />
          Archived (hidden from members)
        </label>
      )}

      {errorMessage && <p role="alert">{errorMessage}</p>}

      <div className="form-actions">
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
      </div>
    </form>
  )
}

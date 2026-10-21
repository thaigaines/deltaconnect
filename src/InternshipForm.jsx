// Form to add a listing (no listing prop) or, for editors, edit one. Members' new listings are
// requests that wait for an editor. RLS and the database functions still decide if a save is allowed.
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
// Blank entries and repeats are skipped; null means an entry isn't City, ST.
function parseLocations(text) {
  const entries = text.split(';')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
  if (entries.some((entry) => entry.split(',').length !== 2)) return null
  return entries
    .map((entry) => {
      const [city = '', state = ''] = entry.split(',').map((part) => part.trim())
      return { city, state: state.toUpperCase() }
    })
    // Keep only the first copy, since the database rejects a repeated location.
    .filter((location, index, all) =>
      all.findIndex((other) => other.city === location.city && other.state === location.state) === index)
}

// The reverse of parseLocations, to prefill the edit form: [{ city: 'Boston', state: 'MA' }] -> 'Boston, MA'.
function locationsText(listing) {
  return listing.internship_location.map(({ city, state }) => `${city}, ${state}`).join('; ')
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
// listing: the listing to edit, or null to add one. isEditor: editors publish new listings
// directly; members send them as requests. onClose: Cancel clicked. onSaved: saved, so the list can reload.
export default function InternshipForm({ listing, isEditor, onClose, onSaved }) {
  const isNew = !listing
  const isRequest = isNew && !isEditor

  // ---------- State ----------
  // Start from the listing's values, or blanks when adding (?. and ?? handle the missing listing).
  const [title, setTitle] = useState(listing?.title ?? '')
  const [company, setCompany] = useState(listing?.company ?? '')
  const [url, setUrl] = useState(listing?.application_url ?? '')
  const [workArrangement, setWorkArrangement] = useState(listing?.work_arrangement ?? 'in-person')
  const [deadline, setDeadline] = useState(listing?.deadline ?? '')
  const [locations, setLocations] = useState(listing ? locationsText(listing) : '')
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
    const parsed = parseLocations(locations)
    if (!parsed || parsed.some((location) => !location.city || !location.state)) {
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
      // 23505 means duplicate URL (a listing or a pending request): ask, then retry with the override or stop.
      error = await createListing(fields, parsed, false)
      if (error?.code === '23505') {
        error = window.confirm('A listing or request with this application URL already exists. Submit it anyway?')
          ? await createListing(fields, parsed, true)
          : { message: 'Not submitted: a listing or request with this application URL already exists.' }
      }
    } else {
      // Details and locations save together (all or nothing).
      const result = await supabase.rpc('update_listing', {
        p_listing_id: listing.id,
        p_title: fields.title,
        p_company: fields.company,
        p_application_url: fields.application_url,
        p_work_arrangement: fields.work_arrangement,
        p_deadline: fields.deadline,
        p_is_archived: isArchived,
        p_locations: parsed,
      })
      error = result.error
    }
    setBusy(false)

    if (error) setErrorMessage(friendlyError(error))
    else onSaved()
  }

  // ---------- Render ----------
  const heading = isRequest ? 'Request an internship' : isNew ? 'Add listing' : 'Edit listing'
  return (
    <form className="listing-form" onSubmit={handleSubmit} aria-label={heading}>
      <h3>{heading}</h3>
      {isRequest && <p className="meta">Editors review requests before they appear in the list.</p>}
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
      <label>
        Locations (City, ST; City, ST), or blank if none
        <input value={locations} onChange={(event) => setLocations(event.target.value)} placeholder="Boston, MA; New York, NY" />
      </label>

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
        <button type="submit" disabled={busy}>
          {busy ? 'Saving...' : isRequest ? 'Send request' : 'Save'}
        </button>
      </div>
    </form>
  )
}

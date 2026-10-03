// Internships page (members only).
// Loads the listings this account may see, then lets the member search and filter them.
// Supabase's row-level security (RLS) decides which rows come back: members get active
// listings, editors get everything, including archived and expired ones.
import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import ListingForm from './ListingForm.jsx'

// ============================================================
// Helpers: plain JavaScript functions, no React involved.
// They sit outside the component so they aren't recreated on every render.
// ============================================================

// Work arrangement filter options. value matches the database; label is what the button shows.
// An empty value means "no filter".
const arrangementOptions = [
  { value: '', label: 'All' },
  { value: 'in-person', label: 'In person' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'remote', label: 'Remote' },
]

// Turns a listing's location rows into labels, e.g. [{ city: 'Boston', state: 'MA' }] -> ['Boston, MA'].
// A listing can have zero, one, or many locations.
function locationLabels(listing) {
  return listing.internship_location.map(({ city, state }) => `${city}, ${state}`)
}

// Today's date in Eastern time as 'YYYY-MM-DD', the same format as listing.deadline.
// The database decides "expired" using Eastern time, so the page does too,
// no matter which timezone the visitor's computer is set to.
function easternToday() {
  // formatToParts splits a formatted date into pieces: [{ type: 'month', value: '10' }, ...]
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  // Small helper: find the piece with the given type and return its value.
  const part = (type) => parts.find((value) => value.type === type).value
  return `${part('year')}-${part('month')}-${part('day')}`
}

// Number of days from today (Eastern) until the deadline.
// Today -> 0, tomorrow -> 1, already passed -> negative (only editors see those listings).
// Callers must check that a deadline exists first; this function expects a 'YYYY-MM-DD' string.
function daysLeft(deadline) {
  // Both dates become midnight UTC. Using UTC for both means daylight-saving changes
  // can't make a "day" 23 or 25 hours long, so the division below is always a whole number.
  const end = new Date(`${deadline}T00:00:00Z`)
  const today = new Date(`${easternToday()}T00:00:00Z`)
  // Subtracting two Dates gives milliseconds; divide by the milliseconds in one day.
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.round((end - today) / msPerDay)
}

// Chip text for a listing that closes soon, e.g. 0 -> 'Closes today', 3 -> '3 days left'.
function urgencyLabel(days) {
  if (days === 0) return 'Closes today'
  if (days === 1) return '1 day left'
  return `${days} days left`
}

// Formats a deadline for display, e.g. '2026-10-24' -> 'Oct 24, 2026'.
function deadlineLabel(deadline) {
  if (!deadline) return 'No deadline provided'
  // timeZone 'UTC' matches the UTC midnight below, so the date can't shift back a day.
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${deadline}T00:00:00Z`))
}

// ============================================================
// Component
// isEditor is a prop passed in from App.jsx. Editors see extra status chips.
// ============================================================
export default function Listings({ isEditor }) {
  // ---------- State ----------
  // useState returns [current value, setter]. Calling a setter re-renders the component.

  // Data from Supabase and the request status.
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  // A counter whose only job is to change; changing it reruns the load effect below.
  const [refresh, setRefresh] = useState(0)

  // Filter controls. These are "controlled inputs": the input shows the state value,
  // and typing updates the state. An empty string means "no filter".
  const [search, setSearch] = useState('')
  const [location, setLocation] = useState('')
  const [arrangement, setArrangement] = useState('')

  // Editor form: null when closed, { listing: null } when adding,
  // { listing } when editing that listing.
  const [form, setForm] = useState(null)

  // ---------- Load listings ----------
  // useEffect runs after the component appears on screen, and again whenever a value
  // in its dependency list ([refresh]) changes.
  useEffect(() => {
    // If this effect is replaced (refresh clicked again, or the page is left) before the
    // request finishes, the cleanup sets cancelled so the old response is ignored.
    let cancelled = false

    async function loadListings() {
      setLoading(true)
      setErrorMessage('')

      // Ask for listings plus their locations in one request. Ordering: nearest deadline
      // first, listings with no deadline last, and id as a tie-breaker so order is stable.
      const { data, error } = await supabase
        .from('internship')
        .select('id,title,company,application_url,work_arrangement,deadline,is_archived,internship_location(city,state)')
        .order('deadline', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true })

      if (cancelled) return
      setListings(error ? [] : data)
      setErrorMessage(error ? error.message : '')
      setLoading(false)
    }

    loadListings()
    return () => { cancelled = true }
  }, [refresh])

  // ---------- Derived values ----------
  // These are recalculated on every render from state; they don't need their own useState.

  // Location dropdown options: every label from every listing, duplicates removed (Set), sorted.
  const locations = [...new Set(listings.flatMap(locationLabels))].sort()

  // Listings that pass all three filters. Search matches title, company, or any location,
  // ignoring case. An empty filter (!location, !arrangement) lets every listing through.
  const query = search.trim().toLowerCase()
  const visible = listings.filter((listing) => {
    const labels = locationLabels(listing)
    return [listing.title, listing.company, ...labels].some((value) => value.toLowerCase().includes(query))
      && (!location || labels.includes(location))
      && (!arrangement || listing.work_arrangement === arrangement)
  })
  // ---------- Event handlers ----------
  // After a save: close the form and reload the list so the change shows.
  function handleSaved() {
    setForm(null)
    setRefresh((value) => value + 1)
  }

  // ---------- Render ----------
  return (
    <section aria-labelledby="internships-heading">
      {/* ----- Heading, add (editors only), and refresh ----- */}
      <div className="section-head">
        <h2 id="internships-heading">Internships</h2>
        <div className="actions">
          {isEditor && <button type="button" onClick={() => setForm({ listing: null })}>Add listing</button>}
          <button type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>
            Refresh listings
          </button>
        </div>
      </div>

      {/* ----- Add form: drops down here while adding (form.listing is null) ----- */}
      {form && !form.listing && (
        <div className="panel">
          <ListingForm listing={null} onClose={() => setForm(null)} onSaved={handleSaved} />
        </div>
      )}

      {/* ----- Filters ----- */}
      {/* Each control reads its state value and writes changes back with its setter. */}
      <div className="filters">
        <label>
          Search
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Title, company, or location" />
        </label>
        <label>
          Location
          <select value={location} onChange={(event) => setLocation(event.target.value)}>
            <option value="">All locations</option>
            {locations.map((label) => <option key={label} value={label}>{label}</option>)}
          </select>
        </label>
        {/* Button group: one button per option. Clicking a button stores its value in
            arrangement state; aria-pressed marks the selected button for screen readers
            and for the CSS highlight. */}
        <div className="filter-group">
          <span id="arrangement-label">Work arrangement</span>
          <div className="button-group" role="group" aria-labelledby="arrangement-label">
            {arrangementOptions.map((option) => (
              <button key={option.value} type="button" aria-pressed={arrangement === option.value}
                onClick={() => setArrangement(option.value)}>
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ----- Results ----- */}
      {/* A chain of ternaries (a ? b : c ? d : e) picks exactly one thing to show:
          loading message, error, empty message, or the list of cards. */}
      {loading ? <p role="status">Loading internships...</p> : errorMessage ? (
        <p role="alert">Could not load internships: {errorMessage}</p>
      ) : visible.length === 0 ? (
        <p>{listings.length === 0 ? 'No internships available.' : 'No internships match your filters.'}</p>
      ) : (
        <ul className="results">
          {visible.map((listing) => {
            // Only call daysLeft when there is a deadline; then a listing is urgent
            // if it closes today or within the next 7 days.
            const days = listing.deadline ? daysLeft(listing.deadline) : null
            const urgent = days !== null && days >= 0 && days <= 7

            // While this listing is being edited, its card shows the edit form instead.
            // key lets React match each card to its listing between renders.
            if (form?.listing?.id === listing.id) {
              return (
                <li key={listing.id}>
                  <ListingForm listing={listing} onClose={() => setForm(null)} onSaved={handleSaved} />
                </li>
              )
            }
            return (
              <li key={listing.id}>
                {/* Card top: company and deadline chip (purple countdown when urgent). */}
                <div className="card-top">
                  <span className="company">{listing.company}</span>
                  <span className={urgent ? 'chip urgent' : 'chip'}>
                    {urgent ? urgencyLabel(days) : deadlineLabel(listing.deadline)}
                  </span>
                </div>

                {/* Card body: title, then locations and work arrangement. */}
                <h3>{listing.title}</h3>
                <p className="meta">
                  {locationLabels(listing).join(' · ') || 'No city/state provided'} · {listing.work_arrangement}
                </p>

                {/* Card footer: editor-only status chips, the application link, and
                    an Edit button for editors. a && b renders b only when a is true. */}
                <div className="card-footer">
                  <div className="chips">
                    {isEditor && listing.is_archived && <span className="chip">Archived</span>}
                    {/* Expired: deadline already passed (days < 0). With no deadline days is null,
                        and null < 0 is false, so no chip. */}
                    {isEditor && days < 0 && <span className="chip">Expired</span>}
                  </div>
                  {/* noopener noreferrer stops the new tab from controlling this page. */}
                  <a className="apply" href={listing.application_url} target="_blank" rel="noopener noreferrer">Apply</a>
                  {isEditor && <button type="button" onClick={() => setForm({ listing })}>Edit</button>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

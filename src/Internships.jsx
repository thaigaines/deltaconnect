// Internships page (members only): loads listings, then search and filters. Members request
// internships; editors add listings and review pending requests (edit, publish, or trash).
// RLS decides which rows come back: members get active listings, editors get all of them.
import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import InternshipForm from './InternshipForm.jsx'
import { loadRows } from './loadRows.js'
import { friendlyError } from './errors.js'

// ---------- Helpers ----------
// Plain functions outside the component, so they aren't recreated on every render.

// Work arrangement buttons. value matches the database; '' means no filter.
const arrangementOptions = [
  { value: '', label: 'All' },
  { value: 'in-person', label: 'In-person' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'remote', label: 'Remote' },
]

// [{ city: 'Boston', state: 'MA' }] -> ['Boston, MA']. A listing may have no locations.
function locationLabels(listing) {
  return listing.internship_location.map(({ city, state }) => `${city}, ${state}`)
}

// Today in Eastern time as 'YYYY-MM-DD', matching how the database decides "expired".
function easternToday() {
  // formatToParts splits the date into pieces: [{ type: 'month', value: '10' }, ...]
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const part = (type) => parts.find((value) => value.type === type).value
  return `${part('year')}-${part('month')}-${part('day')}`
}

// Days from today to a deadline ('YYYY-MM-DD'): today 0, tomorrow 1, passed negative.
function daysLeft(deadline, today) {
  // UTC midnights avoid daylight-saving days of 23 or 25 hours.
  const end = new Date(`${deadline}T00:00:00Z`)
  const start = new Date(`${today}T00:00:00Z`)
  // Subtracting Dates gives milliseconds.
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.round((end - start) / msPerDay)
}

// 0 -> 'Closes today', 3 -> '3 days left'.
function urgencyLabel(days) {
  if (days === 0) return 'Closes today'
  if (days === 1) return '1 day left'
  return `${days} days left`
}

// '2026-10-24' -> 'Oct 24, 2026'.
function deadlineLabel(deadline) {
  if (!deadline) return 'No deadline provided'
  // Formatting in UTC keeps the date from shifting back a day.
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${deadline}T00:00:00Z`))
}

// ---------- Component ----------
// isEditor: editors can add and edit listings, review pending requests, and see status chips.
export default function Internships({ isEditor }) {
  // ---------- State ----------
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  // Bumping refresh reruns the load effect.
  const [refresh, setRefresh] = useState(0)

  // Filters ('' = no filter). Controlled inputs: each shows its state and updates it on change.
  const [search, setSearch] = useState('')
  const [location, setLocation] = useState('')
  const [arrangement, setArrangement] = useState('')

  // Form: null = closed, { listing: null } = adding (or requesting), { listing } = editing it.
  const [form, setForm] = useState(null)
  // message is { text, isError } or null: a thank-you after requesting, or a publish/trash error.
  const [message, setMessage] = useState(null)
  // True while a publish or trash is saving, so its buttons can't be clicked twice.
  const [busy, setBusy] = useState(false)

  // ---------- Load listings ----------
  useEffect(() => {
    // Ignores an outdated response if refresh is clicked again or the page is left.
    let cancelled = false

    async function loadListings() {
      setLoading(true)
      setErrorMessage('')

      // Listings with their locations; nearest deadline first, undated last, id breaks ties.
      const { data, error } = await loadRows((options) => supabase
        .from('internship')
        .select('id,title,company,application_url,work_arrangement,deadline,is_archived,is_pending,internship_location(city,state)', options)
        .order('deadline', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true }), 'id', () => cancelled)

      if (cancelled) return
      if (error) setErrorMessage(friendlyError(error))
      else setListings(data)
      setLoading(false)
    }

    loadListings()
    return () => { cancelled = true }
  }, [refresh])

  // ---------- Derived values ----------
  // Recalculated from state on every render, so they don't need useState.

  // Only editors receive pending requests; they're reviewed apart from the filtered list.
  const pending = listings.filter((listing) => listing.is_pending)
  const published = listings.filter((listing) => !listing.is_pending)

  // Every location label, without duplicates (Set), sorted.
  const locations = [...new Set(published.flatMap(locationLabels))].sort()

  // Search matches title, company, or a location, ignoring case.
  const query = search.trim().toLowerCase()
  const visible = published.filter((listing) => {
    const labels = locationLabels(listing)
    return [listing.title, listing.company, ...labels].some((value) => value.toLowerCase().includes(query))
      && (!location || labels.includes(location))
      && (!arrangement || listing.work_arrangement === arrangement)
  })

  // Worked out once so every card uses the same day.
  const today = easternToday()

  // ---------- Event handlers ----------
  function handleSaved() {
    setForm(null)
    // Members' new listings are requests they can't see, so confirm that it was sent.
    setMessage(isEditor ? null : { text: 'Thanks! Editors will review your request.', isError: false })
    setRefresh((value) => value + 1)
  }

  function openAddForm() {
    setForm({ listing: null })
    setMessage(null)
  }

  // Publishing makes a request visible to members.
  async function handlePublish(listing) {
    setMessage(null)
    setBusy(true)
    const { error } = await supabase.from('internship').update({ is_pending: false }).eq('id', listing.id).select('id').single()
    setBusy(false)
    if (error) setMessage({ text: friendlyError(error), isError: true })
    else setRefresh((value) => value + 1)
  }

  // Trashing deletes the request and its locations. The database only allows this for pending rows.
  async function handleTrash(listing) {
    if (!window.confirm(`Trash the request "${listing.title}" at ${listing.company}?`)) return
    setMessage(null)
    setBusy(true)
    const { error } = await supabase.from('internship').delete().eq('id', listing.id).select('id').single()
    setBusy(false)
    if (error) setMessage({ text: friendlyError(error), isError: true })
    else setRefresh((value) => value + 1)
  }

  // ---------- Render ----------
  // One card, shared by the pending and published lists. The card being edited shows the form
  // instead. key matches cards to listings.
  function renderCard(listing) {
    if (form?.listing?.id === listing.id) {
      return (
        <li key={listing.id}>
          <InternshipForm listing={listing} isEditor={isEditor} onClose={() => setForm(null)} onSaved={handleSaved} />
        </li>
      )
    }

    // Urgent: closes within the next 7 days.
    const days = listing.deadline ? daysLeft(listing.deadline, today) : null
    const urgent = days !== null && days >= 0 && days <= 7

    return (
      <li key={listing.id}>
        <div className="card-top">
          <span className="company">{listing.company}</span>
          <span className={urgent ? 'chip urgent' : 'chip'}>
            {urgent ? urgencyLabel(days) : deadlineLabel(listing.deadline)}
          </span>
        </div>

        <h3>{listing.title}</h3>
        <p className="meta">
          {locationLabels(listing).join(' · ') || 'No city/state provided'} · {listing.work_arrangement}
        </p>

        <div className="card-footer">
          <div className="chips">
            {isEditor && listing.is_archived && <span className="chip">Archived</span>}
            {/* null < 0 is false, so undated listings never show Expired. */}
            {isEditor && days < 0 && <span className="chip">Expired</span>}
          </div>
          {/* Pending requests get review buttons instead of Apply; .actions keeps them together on the right. */}
          {listing.is_pending ? (
            <div className="actions">
              <button type="button" onClick={() => setForm({ listing })}>Edit</button>
              <button type="button" disabled={busy} onClick={() => handlePublish(listing)}>Publish</button>
              <button type="button" disabled={busy} onClick={() => handleTrash(listing)}>Trash</button>
            </div>
          ) : (
            <>
              {/* noopener noreferrer stops the new tab from controlling this page. */}
              <a className="apply" href={listing.application_url} target="_blank" rel="noopener noreferrer">Apply</a>
              {isEditor && <button type="button" onClick={() => setForm({ listing })}>Edit</button>}
            </>
          )}
        </div>
      </li>
    )
  }

  return (
    <section aria-labelledby="internships-heading">
      {/* ----- Heading and actions ----- */}
      <div className="section-head">
        <h2 id="internships-heading">Internships</h2>
        <div className="actions">
          <button type="button" onClick={openAddForm}>{isEditor ? 'Add listing' : 'Request an internship'}</button>
          <button type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>
            Refresh listings
          </button>
        </div>
      </div>

      {/* ----- Add or request form ----- */}
      {form && !form.listing && (
        <div className="panel">
          <InternshipForm listing={null} isEditor={isEditor} onClose={() => setForm(null)} onSaved={handleSaved} />
        </div>
      )}

      {message && <p role={message.isError ? 'alert' : 'status'}>{message.text}</p>}

      {/* ----- Pending requests follow the published list's loading/error state ----- */}
      {!loading && !errorMessage && pending.length > 0 && (
        <div className="pending">
          <h3 className="panel-heading">Pending requests ({pending.length})</h3>
          <ul className="results">{pending.map(renderCard)}</ul>
        </div>
      )}

      {/* ----- Filters ----- */}
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
        {/* aria-pressed marks the selected button for screen readers and the CSS highlight. */}
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

      {/* ----- Results: loading, error, empty, or the cards ----- */}
      {loading ? <p role="status">Loading internships...</p> : errorMessage ? (
        <p role="alert">Could not load internships: {errorMessage}</p>
      ) : visible.length === 0 ? (
        <p>{published.length === 0 ? 'No internships available.' : 'No internships match your filters.'}</p>
      ) : (
        <ul className="results">{visible.map(renderCard)}</ul>
      )}
    </section>
  )
}

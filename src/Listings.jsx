// Loads permitted internships and lets members search and filter them.
import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

// JavaScript: these helpers use ordinary functions, arrays, dates, and strings.
function locationLabels(listing) {
  // map turns each city/state row into a label while preserving every location.
  return listing.internship_location.map(({ city, state }) => `${city}, ${state}`)
}

function easternToday() {
  // Match the database's Eastern date instead of the visitor's local timezone.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const part = (type) => parts.find((value) => value.type === type).value
  return `${part('year')}-${part('month')}-${part('day')}`
}

function deadlineLabel(deadline) {
  // If deadline is null, return the fallback; otherwise format the calendar date below.
  if (!deadline) return 'No deadline provided'
  // A deadline is a calendar date; UTC keeps formatting from shifting it a day.
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${deadline}T00:00:00Z`))
}

export default function Listings({ isEditor }) {
  // React: isEditor is a prop from App; useState stores this component's current values.
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [search, setSearch] = useState('')
  const [location, setLocation] = useState('')
  const [arrangement, setArrangement] = useState('')

  // React: useEffect loads data on mount and again when refresh changes.
  useEffect(() => {
    let cancelled = false

    async function loadListings() {
      setLoading(true)
      setErrorMessage('')
      // RLS decides which rows this account can read; undated listings sort last.
      const { data, error } = await supabase
        .from('internship')
        .select('id,title,company,application_url,work_arrangement,deadline,is_archived,internship_location(city,state)')
        .order('deadline', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true })

      // Ignore a late response after leaving this page or switching accounts.
      if (cancelled) return
      // error ? first : second clears results on failure or stores the returned rows.
      setListings(error ? [] : data)
      setErrorMessage(error ? error.message : '')
      setLoading(false)
    }

    loadListings()
    return () => { cancelled = true }
  }, [refresh])

  // JavaScript: flatMap collects labels; Set removes duplicates; sort orders the dropdown.
  const locations = [...new Set(listings.flatMap(locationLabels))].sort()
  const query = search.trim().toLowerCase()
  const visible = listings.filter((listing) => {
    const labels = locationLabels(listing)
    // some passes if any searchable field matches. && requires both filters to pass too.
    // !location and !arrangement let an empty selection mean "all"; || accepts a match.
    return [listing.title, listing.company, ...labels].some((value) => value.toLowerCase().includes(query))
      && (!location || labels.includes(location))
      && (!arrangement || listing.work_arrangement === arrangement)
  })
  const today = easternToday()

  // React: JSX renders the controls and results; map and the conditionals are JavaScript.
  return (
    <section aria-labelledby="internships-heading">
      <h2 id="internships-heading">Internships</h2>
      <button type="button" disabled={loading} onClick={() => setRefresh(refresh + 1)}>
        Refresh listings
      </button>

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
        <label>
          Work arrangement
          <select value={arrangement} onChange={(event) => setArrangement(event.target.value)}>
            <option value="">All arrangements</option>
            <option value="in-person">In person</option>
            <option value="hybrid">Hybrid</option>
            <option value="remote">Remote</option>
          </select>
        </label>
      </div>

      {/* Check loading, error, and empty results in order; otherwise map rows into cards. */}
      {loading ? <p role="status">Loading internships...</p> : errorMessage ? (
        <p role="alert">Could not load internships: {errorMessage}</p>
      ) : visible.length === 0 ? (
        <p>{listings.length === 0 ? 'No internships available.' : 'No internships match your filters.'}</p>
      ) : (
        <ul className="results">
          {visible.map((listing) => (
            <li key={listing.id}>
              <h3>{listing.title}</h3>
              <p>{listing.company}</p>
              <p>{locationLabels(listing).join(' · ') || 'No city/state provided'} · {listing.work_arrangement}</p>
              <p>Deadline: {deadlineLabel(listing.deadline)}</p>
              {/* && shows these labels only for editors when the corresponding condition holds. */}
              {isEditor && listing.is_archived && <p>Archived</p>}
              {isEditor && listing.deadline && listing.deadline < today && <p>Expired</p>}
              <a href={listing.application_url} target="_blank" rel="noopener noreferrer">Apply</a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

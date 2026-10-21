// Members page (administrators only): every approved member's email, name, role, and whether
// they're still invited (never signed in), with
// buttons to grant or remove the moderator role. The database functions list_members() and
// set_moderator() check administrator approval themselves; hiding this page is only for convenience.
import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { loadRows } from './loadRows.js'
import { friendlyError } from './errors.js'

// ---------- Helpers ----------
// Database role -> label shown on the card.
const roleLabels = { member: 'Member', moderator: 'Moderator', administrator: 'Administrator' }

// Members without a profile have no name yet.
function memberName(member) {
  return member.first_name ? `${member.first_name} ${member.last_name}` : 'No profile'
}

// ---------- Component ----------
export default function Members() {
  // ---------- State ----------
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  // Bumping refresh reruns the load effect.
  const [refresh, setRefresh] = useState(0)
  // Search text ('' = show all).
  const [search, setSearch] = useState('')
  // actionError: a role change failed; the list stays up. busy blocks double clicks while it saves.
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)

  // ---------- Load members ----------
  useEffect(() => {
    // Ignores an outdated response if a newer load starts or the page is left.
    let cancelled = false

    async function loadMembers() {
      setLoading(true)
      setErrorMessage('')

      // An RPC that returns rows can be ordered and paged like a table. user_id breaks ties.
      const { data, error } = await loadRows((options) => supabase
        .rpc('list_members', undefined, options)
        .order('email')
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
  // Search matches the email or name, ignoring case.
  const query = search.trim().toLowerCase()
  const visible = members.filter((member) =>
    [member.email ?? '', memberName(member)].some((value) => value.toLowerCase().includes(query)))

  // ---------- Event handlers ----------
  // isModerator: true grants the role, false removes it. Reloads so the card shows the saved role.
  async function handleSetModerator(member, isModerator) {
    setActionError('')
    setBusy(true)
    const { error } = await supabase.rpc('set_moderator', { p_user_id: member.user_id, p_is_moderator: isModerator })
    setBusy(false)
    if (error) setActionError(friendlyError(error))
    else setRefresh((value) => value + 1)
  }

  // ---------- Render ----------
  return (
    <section aria-labelledby="members-heading">
      {/* ----- Heading and actions ----- */}
      <div className="section-head">
        <h2 id="members-heading">Members</h2>
        <div className="actions">
          <button type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Refresh members</button>
        </div>
      </div>
      <p className="meta">Moderators review internship requests and moderate the forum.</p>

      {/* ----- Search ----- */}
      <div className="filters">
        <label>
          Search
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Email or name" />
        </label>
      </div>

      {actionError && <p role="alert">{actionError}</p>}

      {/* ----- Results: loading, error, empty, or the cards ----- */}
      {loading ? (
        <p role="status">Loading members...</p>
      ) : errorMessage ? (
        <p role="alert">Could not load members: {errorMessage}</p>
      ) : visible.length === 0 ? (
        <p>{members.length === 0 ? 'No members yet.' : 'No members match your search.'}</p>
      ) : (
        <ul className="results">
          {visible.map((member) => (
            <li key={member.user_id}>
              <div className="card-top">
                <span className="company">{member.email}</span>
                {/* Invited: approved, but hasn't opened their invite link (or signed in) yet. */}
                <div className="chips">
                  {!member.has_signed_in && <span className="chip">Invited</span>}
                  <span className="chip">{roleLabels[member.role]}</span>
                </div>
              </div>
              <h3>{memberName(member)}</h3>
              {/* Administrators keep their role, so their cards have no button. */}
              {member.role !== 'administrator' && (
                <div className="card-footer">
                  {member.role === 'moderator' ? (
                    <button type="button" disabled={busy} onClick={() => handleSetModerator(member, false)}>Remove moderator</button>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => handleSetModerator(member, true)}>Make moderator</button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// The top-level component: page layout, navigation, login, and access checks.
// It decides which screen to show and hands the internships list to Listings.jsx
// and the public resume directory to Resumes.jsx.
import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import Listings from './Listings.jsx'
import Resumes from './Resumes.jsx'

export default function App() {
  // ============================================================
  // State
  // useState returns [current value, setter]. Calling a setter re-renders the component.
  // ============================================================

  // Navigation: the part of the URL after '#', e.g. '#/resumes'.
  const [page, setPage] = useState(window.location.hash)

  // Login form: controlled inputs, plus a busy flag that disables buttons during requests.
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [busy, setBusy] = useState(false)

  // Login session: null when signed out. loadingSession is true until Supabase reports
  // whether a saved session exists, so the login form doesn't flash for signed-in users.
  const [session, setSession] = useState(null)
  const [loadingSession, setLoadingSession] = useState(true)

  // Access: { is_member, is_editor } from the database, or null while checking.
  // accessCheck is a counter; changing it reruns the permissions check below.
  const [permissions, setPermissions] = useState(null)
  const [permissionsError, setPermissionsError] = useState('')
  const [accessCheck, setAccessCheck] = useState(0)

  // ============================================================
  // Effects: connect React to things outside it (the URL, Supabase).
  // useEffect(fn, deps) runs fn after rendering, and again when a value in deps changes.
  // An empty deps list [] means "run once when the component first appears".
  // A returned function is "cleanup": React calls it before rerunning or removing the effect.
  // ============================================================

  // Navigation: when the URL hash changes (a nav link was clicked), store the new page.
  useEffect(() => {
    function changePage() {
      setPage(window.location.hash)
    }
    window.addEventListener('hashchange', changePage)
    return () => window.removeEventListener('hashchange', changePage)
  }, [])

  // Session: Supabase calls this on page load (with any saved session), on log in and
  // log out, and also when the tab regains focus (it re-checks the same session then).
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession)
      setLoadingSession(false)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // The signed-in user's id, or undefined when signed out. Effects below depend on this
  // instead of the whole session, so re-checking the same user (e.g. returning to the tab)
  // doesn't reset access or reload the page's content.
  const userId = session?.user.id

  // Permissions: when the user changes or accessCheck is bumped by refreshAccess, clear the
  // old result (so one account never sees another's access), then ask the database whether
  // this account is a member/editor.
  useEffect(() => {
    setPermissions(null)
    setPermissionsError('')
    if (!userId) return
    // cancelled lets a slow, outdated response be ignored (e.g. the user signed out meanwhile).
    // It doesn't stop the network request; it only stops us from using the result.
    let cancelled = false

    async function loadPermissions() {
      // my_permissions() is a database function; .single() returns one row instead of a list.
      const { data, error } = await supabase.rpc('my_permissions').single()
      if (cancelled) return
      if (error) setPermissionsError(error.message)
      else setPermissions(data)
    }

    loadPermissions()
    return () => { cancelled = true }
  }, [userId, accessCheck])

  // ============================================================
  // Event handlers: run in response to clicks and form submits.
  // ============================================================

  // "Retry" / "Refresh access" buttons: bumping the counter reruns the permissions effect.
  function refreshAccess() {
    setAccessCheck((value) => value + 1)
  }

  // Login form submit. preventDefault stops the browser's default full-page reload.
  // await pauses this function until Supabase answers; the session listener above
  // then receives the new session automatically. The password is cleared once it's no longer needed.
  async function handleLogin(event) {
    event.preventDefault()
    setErrorMessage('')
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setErrorMessage(error.message)
    else setPassword('')
  }

  // Sign out on this device only; sessions on the user's other devices stay signed in.
  async function handleSignOut() {
    setErrorMessage('')
    setBusy(true)
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    setBusy(false)
    if (error) setErrorMessage(error.message)
  }

  // ============================================================
  // Render
  // JSX looks like HTML; anything inside { } is a JavaScript expression.
  // <>...</> is a fragment: it groups elements without adding an extra element to the page.
  // ============================================================
  return (
    <>
      {/* ----- Top bar: name and navigation on the left, account on the right ----- */}
      <header className="topbar">
        <div className="container topbar-inner">
          <div className="brand-nav">
            <a className="brand" href="#/internships">DeltaConnect</a>
            {/* aria-current marks the active link for screen readers and for the CSS highlight. */}
            <nav aria-label="Main navigation">
              <a href="#/internships" aria-current={page !== '#/resumes' ? 'page' : undefined}>Internships</a>
              <a href="#/resumes" aria-current={page === '#/resumes' ? 'page' : undefined}>Resumes</a>
            </nav>
          </div>
          {/* a && b renders b only when a is truthy: the account area appears only while signed in. */}
          {session && (
            <div className="account">
              <span>{session.user.email}</span>
              <button type="button" disabled={busy} onClick={handleSignOut}>Sign out</button>
            </div>
          )}
        </div>
      </header>

      {/* ----- Hero: site name and a tagline that depends on the page ----- */}
      <section className="hero">
        <div className="container">
          <h1>DeltaConnect</h1>
          <p className="tagline">
            {page === '#/resumes' ? 'Meet the chapter.' : 'Internships curated by our chapter, for our chapter.'}
          </p>
        </div>
      </section>

      {/* ----- Main content: exactly one screen is chosen below ----- */}
      <main className="container">
        {/* The ternary chain is checked top to bottom:
            1. Resumes page -> public directory (no login needed; members can also add/edit)
            2. Still checking for a saved session -> "Checking login..."
            3. Signed in -> access checks, then Listings
            4. Otherwise -> login form */}
        {page === '#/resumes' ? (
          // key resets the page (closing any open form) when a different account signs in.
          <Resumes key={userId} userId={userId} isMember={permissions?.is_member === true} />
        ) : loadingSession ? (
          <p role="status">Checking login...</p>
        ) : session ? (
          // Signed in: show an access error, a "checking" message, the listings for members,
          // or an access-denied message for accounts that aren't approved members.
          permissionsError ? (
            <div>
              <p role="alert">Could not check access: {permissionsError}</p>
              <button type="button" onClick={refreshAccess}>Retry access check</button>
            </div>
          ) : !permissions ? (
            <p role="status">Checking access...</p>
          ) : permissions.is_member ? (
            // key changes when the account or access check changes, which makes React
            // replace Listings with a fresh copy (empty state, new data load).
            <Listings key={`${userId}:${accessCheck}`} isEditor={permissions.is_editor} />
          ) : (
            <div>
              <p>This account does not have internship access. Contact the owner.</p>
              <button type="button" onClick={refreshAccess}>Refresh access</button>
            </div>
          )
        ) : (
          // Signed out: login form. Each input is controlled by its state value.
          <section className="login-card" aria-labelledby="login-heading">
            <h2 id="login-heading">Member login</h2>
            <p>Chapter access is by invitation. Contact the owner for an account.</p>
            <form onSubmit={handleLogin}>
              <label>
                Email
                <input type="email" autoComplete="username" required value={email}
                  onChange={(event) => setEmail(event.target.value)} />
              </label>
              <label>
                Password
                <input type="password" autoComplete="current-password" required value={password}
                  onChange={(event) => setPassword(event.target.value)} />
              </label>
              <button type="submit" disabled={busy}>{busy ? 'Logging in...' : 'Log in'}</button>
            </form>
          </section>
        )}

        {/* Login and sign-out errors, shown on the internships page only. */}
        {page !== '#/resumes' && errorMessage && <p role="alert">{errorMessage}</p>}
      </main>
    </>
  )
}

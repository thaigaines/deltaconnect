// Top-level component: layout, navigation, login, and access checks.
// Shows the public resume directory (Resumes.jsx) or the members-only internships (Listings.jsx).
import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import Listings from './Listings.jsx'
import Resumes from './Resumes.jsx'

export default function App() {
  // ---------- State ----------
  // useState returns [value, setter]; calling the setter re-renders the component.

  // The URL part after '#', e.g. '#/resumes'.
  const [page, setPage] = useState(window.location.hash)

  // Login form. busy disables buttons while a request runs.
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [busy, setBusy] = useState(false)

  // session is null when signed out. loadingSession stops the login form flashing on reload.
  const [session, setSession] = useState(null)
  const [loadingSession, setLoadingSession] = useState(true)

  // permissions is { is_member, is_editor }, or null while checking.
  // Bumping accessCheck reruns the permissions check.
  const [permissions, setPermissions] = useState(null)
  const [permissionsError, setPermissionsError] = useState('')
  const [accessCheck, setAccessCheck] = useState(0)

  // ---------- Effects ----------
  // useEffect(fn, deps) runs fn after render and again when a deps value changes ([] = once).
  // The function it returns is cleanup, run before the next run or when the component leaves.

  // Track the page when a nav link changes the URL hash.
  useEffect(() => {
    function changePage() {
      setPage(window.location.hash)
    }
    window.addEventListener('hashchange', changePage)
    return () => window.removeEventListener('hashchange', changePage)
  }, [])

  // Supabase reports the session on load, login, logout, and when the tab regains focus.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession)
      setLoadingSession(false)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // Effects depend on the id, not the session, so re-checking the same user changes nothing.
  const userId = session?.user.id
  const isResumesPage = page === '#/resumes'

  // Check member/editor access whenever the user changes or access is refreshed.
  // Clearing first means one account never sees another's access.
  useEffect(() => {
    setPermissions(null)
    setPermissionsError('')
    if (!userId) return
    // Ignores a slow, outdated response (e.g. the user signed out meanwhile).
    let cancelled = false

    async function loadPermissions() {
      // .single() returns one row instead of a list.
      const { data, error } = await supabase.rpc('my_permissions').single()
      if (cancelled) return
      if (error) setPermissionsError(error.message)
      else setPermissions(data)
    }

    loadPermissions()
    return () => { cancelled = true }
  }, [userId, accessCheck])

  // ---------- Event handlers ----------
  function refreshAccess() {
    setAccessCheck((value) => value + 1)
  }

  // preventDefault stops the page reload; the session listener picks up the new session.
  async function handleLogin(event) {
    event.preventDefault()
    setErrorMessage('')
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setErrorMessage(error.message)
    else setPassword('')
  }

  // Signs out this device only.
  async function handleSignOut() {
    setErrorMessage('')
    setBusy(true)
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    setBusy(false)
    if (error) setErrorMessage(error.message)
  }

  // ---------- Render ----------
  // In JSX, { } holds JavaScript. <>...</> groups elements without adding one to the page.
  return (
    <>
      {/* ----- Top bar ----- */}
      <header className="topbar">
        <div className="container topbar-inner">
          <div className="brand-nav">
            <a className="brand" href="#/internships">DeltaConnect</a>
            {/* aria-current marks the active link for screen readers and the CSS highlight. */}
            <nav aria-label="Main navigation">
              <a href="#/internships" aria-current={!isResumesPage ? 'page' : undefined}>Internships</a>
              <a href="#/resumes" aria-current={isResumesPage ? 'page' : undefined}>Resumes</a>
            </nav>
          </div>
          {/* a && b shows b only when a is truthy. */}
          {session && (
            <div className="account">
              <span>{session.user.email}</span>
              <button type="button" disabled={busy} onClick={handleSignOut}>Sign out</button>
            </div>
          )}
        </div>
      </header>

      {/* ----- Hero ----- */}
      <section className="hero">
        <div className="container">
          <h1>DeltaConnect</h1>
          <p className="tagline">
            {isResumesPage ? 'Meet the chapter.' : 'Internships curated by our chapter, for our chapter.'}
          </p>
        </div>
      </section>

      {/* ----- Main content: the first matching screen wins ----- */}
      <main className="container">
        {isResumesPage ? (
          // A new key (different account) resets the page and closes any open form.
          <Resumes key={userId} userId={userId} isMember={permissions?.is_member === true} />
        ) : loadingSession ? (
          <p role="status">Checking login...</p>
        ) : session ? (
          permissionsError ? (
            <div>
              <p role="alert">Could not check access: {permissionsError}</p>
              <button type="button" onClick={refreshAccess}>Retry access check</button>
            </div>
          ) : !permissions ? (
            <p role="status">Checking access...</p>
          ) : permissions.is_member ? (
            // A new key replaces Listings with a fresh copy that reloads its data.
            <Listings key={`${userId}:${accessCheck}`} isEditor={permissions.is_editor} />
          ) : (
            <div>
              <p>This account does not have internship access. Email <a href="mailto:thaiagaines@gmail.com">thaiagaines@gmail.com</a> for access.</p>
              <button type="button" onClick={refreshAccess}>Refresh access</button>
            </div>
          )
        ) : (
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

        {/* Login and sign-out errors. */}
        {errorMessage && <p role="alert">{errorMessage}</p>}
      </main>
    </>
  )
}

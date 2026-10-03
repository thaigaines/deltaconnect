// Handles login, access checks, page layout, and navigation between internships and public resumes.
import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import Listings from './Listings.jsx'
import Resumes from './Resumes.jsx'

export default function App() {
  // React: useState keeps values between renders; each setter updates the screen.
  const [page, setPage] = useState(window.location.hash)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [session, setSession] = useState(null)
  const [loadingSession, setLoadingSession] = useState(true)
  const [permissions, setPermissions] = useState(null)
  const [permissionsError, setPermissionsError] = useState('')
  const [accessCheck, setAccessCheck] = useState(0)

  // React: useEffect connects to external events. The event handler is ordinary JavaScript.
  // When the URL hash changes, update page so React renders the matching screen.
  // The returned cleanup removes this listener when App unmounts.
  useEffect(() => {
    function changePage() {
      setPage(window.location.hash)
    }
    window.addEventListener('hashchange', changePage)
    return () => window.removeEventListener('hashchange', changePage)
  }, [])

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, currentSession) => {
      // Clear the previous account's access and listings before checking again.
      setPermissions(null)
      setPermissionsError('')
      setSession(currentSession)
      setLoadingSession(false)
      setAccessCheck((value) => value + 1)
      setPassword('')
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // If there is no session, return without querying. Otherwise load this account's role.
  // [session, accessCheck] reruns the effect when either value changes.
  useEffect(() => {
    if (!session) return
    let cancelled = false

    async function loadPermissions() {
      const { data, error } = await supabase.rpc('my_permissions').single()
      // Ignore a response if the user has signed out or started another check.
      if (cancelled) return
      // If the query failed, show its error; otherwise store the returned role flags.
      if (error) setPermissionsError(error.message)
      else setPermissions(data)
    }

    loadPermissions()
    // Cleanup marks this request outdated; it doesn't stop the network request itself.
    return () => { cancelled = true }
  }, [session, accessCheck])

  function refreshAccess() {
    // Clear the old result, then increment the counter to rerun the permissions effect.
    setPermissions(null)
    setPermissionsError('')
    setAccessCheck((value) => value + 1)
  }

  async function handleLogin(event) {
    // JavaScript: async/await handles the request; the set... calls update React state.
    // preventDefault stops a page reload; await waits for Supabase before enabling the button.
    event.preventDefault()
    setErrorMessage('')
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setErrorMessage(error.message)
  }

  async function handleSignOut() {
    setErrorMessage('')
    setBusy(true)
    // Sign out here without ending the user's sessions on other devices.
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    setBusy(false)
    if (error) setErrorMessage(error.message)
  }

  // React: JSX describes the screen. Expressions inside { } use JavaScript.
  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <div className="brand-nav">
            <a className="brand" href="#/internships">DeltaConnect</a>
            <nav aria-label="Main navigation">
              <a href="#/internships" aria-current={page !== '#/resumes' ? 'page' : undefined}>Internships</a>
              <a href="#/resumes" aria-current={page === '#/resumes' ? 'page' : undefined}>Resumes</a>
            </nav>
          </div>
          {/* && shows the account area only while signed in. */}
          {session && (
            <div className="account">
              <span>{session.user.email}</span>
              <button type="button" disabled={busy} onClick={handleSignOut}>Sign out</button>
            </div>
          )}
        </div>
      </header>

      <section className="hero">
        <div className="container">
          <h1>DeltaConnect</h1>
          <p className="tagline">
            {page === '#/resumes' ? 'Meet the chapter.' : 'Internships curated by our chapter, for our chapter.'}
          </p>
        </div>
      </section>

      <main className="container">
        {/* condition ? first : second chooses one screen: resumes first, then login loading,
            then the signed-in area if session exists, otherwise the login form. */}
        {page === '#/resumes' ? (
          <Resumes />
        ) : loadingSession ? (
          <p role="status">Checking login...</p>
        ) : session ? (
          // Show an error if present; otherwise wait for permissions, then allow members.
          // A signed-in account without membership gets the access-denied message.
          permissionsError ? (
            <div>
              <p role="alert">Could not check access: {permissionsError}</p>
              <button type="button" onClick={refreshAccess}>Retry access check</button>
            </div>
          ) : !permissions ? (
            <p role="status">Checking access...</p>
          ) : permissions.is_member ? (
            <Listings key={`${session.user.id}:${accessCheck}`} isEditor={permissions.is_editor} />
          ) : (
            <div>
              <p>This account does not have internship access. Contact the owner.</p>
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
        {/* && shows the login error only when both conditions are truthy. */}
        {page !== '#/resumes' && errorMessage && <p role="alert">{errorMessage}</p>}
      </main>
    </>
  )
}

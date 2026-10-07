// Top-level component: layout, navigation, login, and access checks.
// Shows the public resume directory (Resumes.jsx), or for members the account home (Home.jsx),
// internships (Internships.jsx), or forum (Forum.jsx, ForumPost.jsx).
import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import Forum from './Forum.jsx'
import ForumPost from './ForumPost.jsx'
import Home from './Home.jsx'
import Internships from './Internships.jsx'
import PasswordForm from './PasswordForm.jsx'
import Resumes from './Resumes.jsx'
import { friendlyError } from './errors.js'

// ---------- Helpers ----------
// How to get an account; shown on the login card and to accounts without access.
const accessContact = (
  <>Access by invitation only. Contact <a href="mailto:deltaconnectapp@gmail.com">deltaconnectapp@gmail.com</a> if interested.</>
)

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
  // resetting shows the "email me a link" form instead of the login form.
  // notice is a non-error message, such as "check your email".
  const [resetting, setResetting] = useState(false)
  const [notice, setNotice] = useState('')
  // True after an invite or reset link signs the member in, until they save a password.
  const [settingPassword, setSettingPassword] = useState(false)

  // session is null when signed out. loadingSession stops the login form flashing on reload.
  const [session, setSession] = useState(null)
  const [loadingSession, setLoadingSession] = useState(true)

  // permissions is { is_member, is_editor, is_moderator }, or null while checking.
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
      // Signing out (here or in another tab) abandons an unfinished password setup.
      if (!currentSession) setSettingPassword(false)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // Invite and password-reset emails link to '/?token_hash=...&type=invite' (or type=recovery);
  // see README. Verifying the one-time token signs the member in, then they choose a password.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tokenHash = params.get('token_hash')
    const type = params.get('type')
    if (!tokenHash || (type !== 'invite' && type !== 'recovery')) return
    // Remove the token from the address first, so a reload, or StrictMode running this effect
    // twice in development, can't try the already-used token again.
    window.history.replaceState(null, '', window.location.pathname + window.location.hash)

    async function verifyEmailLink() {
      // getSession waits until Supabase finishes restoring any saved session, so that
      // restore can't replace the new one.
      await supabase.auth.getSession()
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      if (error) setErrorMessage(friendlyError(error))
      else setSettingPassword(true)
    }

    verifyEmailLink()
  }, [])

  // Effects depend on the id, not the session, so re-checking the same user changes nothing.
  const userId = session?.user.id
  // '#/forum/<id>' opens one post. Any other hash, including none, is the home page.
  const isResumesPage = page === '#/resumes'
  const isInternshipsPage = page === '#/internships'
  const forumPostId = page.startsWith('#/forum/') ? page.slice('#/forum/'.length) : null
  const isForumPage = page === '#/forum' || forumPostId !== null
  const isHomePage = !isResumesPage && !isInternshipsPage && !isForumPage

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
      if (error) setPermissionsError(friendlyError(error))
      else setPermissions(data)
    }

    loadPermissions()
    return () => { cancelled = true }
  }, [userId, accessCheck])

  // The members-only page for this address. A new key (other account, access refresh, or post)
  // replaces it with a fresh copy that reloads its data.
  const memberKey = `${userId}:${accessCheck}`
  const memberPage = isInternshipsPage ? <Internships key={memberKey} isEditor={permissions?.is_editor} />
    : forumPostId ? <ForumPost key={`${memberKey}:${forumPostId}`} postId={forumPostId} userId={userId} isModerator={permissions?.is_moderator} />
    : isForumPage ? <Forum key={memberKey} />
    : <Home key={memberKey} userId={userId} />

  // ---------- Event handlers ----------
  function refreshAccess() {
    setAccessCheck((value) => value + 1)
  }

  // preventDefault stops the page reload; the session listener picks up the new session.
  async function handleLogin(event) {
    event.preventDefault()
    setErrorMessage('')
    setNotice('')
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setErrorMessage(friendlyError(error))
    else setPassword('')
  }

  // Emails a link for choosing a password. The link's address comes from the Reset Password
  // email template in Supabase (see README). Supabase doesn't reveal whether the account exists.
  async function handleResetRequest(event) {
    event.preventDefault()
    setErrorMessage('')
    setNotice('')
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim())
    setBusy(false)
    if (error) setErrorMessage(friendlyError(error))
    else {
      setResetting(false)
      setNotice('If that email has a DeltaConnect account, a link to set your password is on its way. Check your spam folder too.')
    }
  }

  // Switches between the login and reset forms, clearing the other form's messages.
  function toggleResetting() {
    setResetting((value) => !value)
    setErrorMessage('')
    setNotice('')
  }

  function handlePasswordSaved() {
    setSettingPassword(false)
    setNotice('Password saved. Use it the next time you log in.')
  }

  // Signs out this device only.
  async function handleSignOut() {
    setErrorMessage('')
    setNotice('')
    setBusy(true)
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    setBusy(false)
    if (error) setErrorMessage(friendlyError(error))
  }

  // ---------- Render ----------
  // In JSX, { } holds JavaScript. <>...</> groups elements without adding one to the page.
  return (
    <>
      {/* ----- Top bar ----- */}
      <header className="topbar">
        <div className="container topbar-inner">
          <div className="brand-nav">
            {/* aria-label gives screen readers the full name behind the Δ symbol. */}
            <a className="brand" href="#/" aria-label="DeltaConnect home">Δ</a>
            {/* aria-current marks the active link for screen readers and the CSS highlight. */}
            <nav aria-label="Main navigation">
              <a href="#/" aria-current={isHomePage ? 'page' : undefined}>Home</a>
              <a href="#/internships" aria-current={isInternshipsPage ? 'page' : undefined}>Internships</a>
              <a href="#/forum" aria-current={isForumPage ? 'page' : undefined}>Forum</a>
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
            {isResumesPage ? 'Meet the chapter.'
              : isInternshipsPage ? 'Internships curated by our chapter, for our chapter.'
              : isForumPage ? 'Questions and conversations for our chapter.'
              : 'Your chapter account.'}
          </p>
        </div>
      </section>

      {/* ----- Main content: the first matching screen wins ----- */}
      <main className="container">
        {session && settingPassword ? (
          <PasswordForm onDone={handlePasswordSaved} />
        ) : isResumesPage ? (
          <Resumes />
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
            memberPage
          ) : (
            <div>
              <p>This account does not have internship access. {accessContact}</p>
              <button type="button" onClick={refreshAccess}>Refresh access</button>
            </div>
          )
        ) : (
          <section className="login-card" aria-labelledby="login-heading">
            <h2 id="login-heading">{resetting ? 'Set or reset your password' : 'Member login'}</h2>
            <p>{resetting ? 'New member, or forgot your password? We\'ll email you a link to choose one.' : accessContact}</p>
            {resetting ? (
              <form onSubmit={handleResetRequest}>
                <label>
                  Email
                  <input type="email" autoComplete="username" required value={email}
                    onChange={(event) => setEmail(event.target.value)} />
                </label>
                <button type="submit" disabled={busy}>{busy ? 'Sending...' : 'Email me a link'}</button>
                <button type="button" onClick={toggleResetting}>Back to login</button>
              </form>
            ) : (
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
                <button type="button" onClick={toggleResetting}>New member or forgot password?</button>
              </form>
            )}
          </section>
        )}

        {/* Login, password, and sign-out messages. */}
        {notice && <p role="status">{notice}</p>}
        {errorMessage && <p role="alert">{errorMessage}</p>}
      </main>
    </>
  )
}

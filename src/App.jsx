import { useEffect, useState } from "react"
import { supabase } from './supabase.js'

export default function App() {
  
  // const [variable, change] = useState(initial_state)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [session, setSession] = useState(null)
  const [loadingSession, setLoadingSession] = useState(true)
  const [permissions, setPermissions] = useState(null)
  const [permissionsError, setPermissionsError] = useState('')

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        setPermissions(null)
        setPermissionsError('')

        setSession(currentSession)
        setLoadingSession(false)
      },
    )
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return

    let cancelled = false

    async function loadPermissions() {
      const { data, error } = await supabase
        .rpc('my_permissions')
        .single()

      if (cancelled) return

      if (error) {
        setPermissionsError(error.message)
      } else {
        setPermissions(data)
      }
      }

      loadPermissions()

      return () => {
        cancelled = true
      }
  }, [session])


  async function handleLogin(event) {
    event.preventDefault()
    setErrorMessage('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setErrorMessage(error.message)
    }
  }

  async function handleSignOut() {
    setErrorMessage('')

    const { error } = await supabase.auth.signOut()

    if (error) {
      setErrorMessage(error.message)
    }
  }

  if (loadingSession) {
    return <p>Checking login...</p>
  }

  return (
    <main>
      <h1>DeltaConnect</h1>
      
      {session ? (

          <div>
            <p>Signed in as {session.user.email}</p>

            {permissionsError ? (
              <p role="alert">{permissionsError}</p>
            ) : !permissions ? (
              <p>Checking access...</p>
            ) : permissions.is_member ? (
              <p>Access: {permissions.is_editor ? 'Editor' : 'Member'}</p>
            ) : (
              <p>This account does not have internship access. Contact the owner.</p>
            )}

            <button type="button" onClick={handleSignOut}>
              Sign out
            </button>
          </div>

      ) : (
        <form onSubmit={handleLogin}>
          
          <label>
          Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          
          <button type="submit">Log In</button>

        </form>

      )}

      {errorMessage && <p role="alert">{errorMessage}</p>}
      
      <p>Internships curated by our chapter, for our chapter.</p>
    </main>
  )
}


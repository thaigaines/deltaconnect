// Account home page (members only): the member's profile and resume.
import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import ProfileForm from './ProfileForm.jsx'
import ResumeForm from './ResumeForm.jsx'
import { friendlyError } from './errors.js'

// ---------- Component ----------
// userId and email: the signed-in member's id and login email.
export default function Home({ userId, email }) {
  // ---------- State ----------
  // profile is the member's row with its contact details and resume nested, or null before the first save.
  const [profile, setProfile] = useState(null)
  // Only the first load shows "Loading", so reloads after a save keep the forms (and their messages) on screen.
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  // Bumping refresh reruns the load effect.
  const [refresh, setRefresh] = useState(0)
  // Kept here because a new resume path remounts the upload form.
  const [resumeWarning, setResumeWarning] = useState('')

  // ---------- Load the account ----------
  useEffect(() => {
    // Ignores an outdated response if a newer load starts or the page is left.
    let cancelled = false

    async function loadAccount() {
      setErrorMessage('')

      // One profile with at most one contact row and one resume, so each comes back as an object or null.
      // maybeSingle returns null instead of an error when the profile doesn't exist yet.
      const { data, error } = await supabase
        .from('profile')
        .select('first_name,last_name,major,graduation_term,graduation_year,linkedin_url,'
          + 'profile_contact(phone,show_in_directory,show_email,show_phone),resume(object_path,original_filename)')
        .eq('user_id', userId)
        .maybeSingle()

      if (cancelled) return
      if (error) setErrorMessage(friendlyError(error))
      else setProfile(data)
      setLoading(false)
    }

    loadAccount()
    return () => { cancelled = true }
  }, [userId, refresh])

  // ---------- Event handlers ----------
  function reload() {
    setRefresh((value) => value + 1)
  }

  function handleResumeSaved(warning) {
    setResumeWarning(warning)
    reload()
  }

  // ---------- Render ----------
  return (
    <section aria-labelledby="account-heading">
      <div className="section-head">
        <h2 id="account-heading">Your account</h2>
      </div>

      {resumeWarning && <p role="alert">{resumeWarning}</p>}

      {loading ? (
        <p role="status">Loading your account...</p>
      ) : errorMessage ? (
        <div>
          <p role="alert">Could not load your account: {errorMessage}</p>
          <button type="button" onClick={reload}>Retry</button>
        </div>
      ) : (
        <>
          <div className="panel">
            <ProfileForm userId={userId} email={email} profile={profile} onSaved={reload} />
          </div>
          {/* A resume needs a profile to name it. A new key (new file) resets the form after an upload. */}
          <div className="panel">
            {profile ? (
              <ResumeForm key={profile.resume?.object_path} userId={userId} resume={profile.resume} onSaved={handleResumeSaved} />
            ) : (
              <p className="meta">Save your profile to add a resume.</p>
            )}
          </div>
        </>
      )}
    </section>
  )
}

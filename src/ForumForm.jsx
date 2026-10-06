// Member form to write or edit a forum post (title and body) or comment (body only).
// RLS still decides if a save is allowed.
import { useState } from 'react'
import { supabase } from './supabase.js'
import { friendlyError } from './errors.js'

// ---------- Component ----------
// table: 'forum_post' or 'forum_comment'. Posts have a title; comments don't.
// item: the row being edited, or null to create one. newFields: extra columns for a new row (a comment's forum_post_id).
// onSaved: saved, so the page can reload. onCancel: optional Cancel button.
export default function ForumForm({ table, item, newFields, onSaved, onCancel }) {
  const hasTitle = table === 'forum_post'

  // ---------- State ----------
  const [title, setTitle] = useState(item?.title ?? '')
  const [body, setBody] = useState(item?.body ?? '')
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // ---------- Save ----------
  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage('')

    // Clean input: trim text, which the database requires. Length limits come from maxLength below.
    const fields = hasTitle ? { title: title.trim(), body: body.trim() } : { body: body.trim() }
    if (Object.values(fields).some((value) => !value)) {
      setErrorMessage(hasTitle ? 'Title and body are required.' : 'Write a comment first.')
      return
    }

    // user_id comes from the database default (the signed-in user).
    setBusy(true)
    const { error } = item
      ? await supabase.from(table).update(fields).eq('id', item.id).select('id').single()
      : await supabase.from(table).insert({ ...newFields, ...fields })
    setBusy(false)

    // 23503: the author has no profile row for user_id to point to.
    if (error?.code === '23503') setErrorMessage('Save your profile on the home page before posting.')
    else if (error) setErrorMessage(friendlyError(error))
    else {
      // Clear a new comment's box; edit forms and new posts close instead.
      setBody('')
      onSaved()
    }
  }

  // ---------- Render ----------
  return (
    <form className="forum-form" onSubmit={handleSubmit} aria-label={item ? 'Edit' : hasTitle ? 'New post' : 'New comment'}>
      {hasTitle && (
        <label>
          Title
          <input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
      )}
      <label>
        {hasTitle ? 'Body' : 'Comment'}
        <textarea required maxLength={hasTitle ? 10000 : 5000} rows={hasTitle ? 6 : 3} value={body}
          onChange={(event) => setBody(event.target.value)} />
      </label>

      {errorMessage && <p role="alert">{errorMessage}</p>}

      <div className="form-actions">
        {onCancel && <button type="button" onClick={onCancel}>Cancel</button>}
        <button type="submit" disabled={busy}>{busy ? 'Saving...' : item ? 'Save' : hasTitle ? 'Post' : 'Comment'}</button>
      </div>
    </form>
  )
}

// Forum page (members only): every post, newest first, plus a form to start one.
import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { loadRows } from './loadRows.js'
import ForumForm from './ForumForm.jsx'

// ---------- Helpers ----------
// Shared with ForumPost.jsx. A post or comment row with its author's profile ->
// 'Jane Doe · Oct 5, 2026, 3:04 PM · edited'.
export function byline(row) {
  const time = new Date(row.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
  return `${row.profile.first_name} ${row.profile.last_name} · ${time}${row.edited_at ? ' · edited' : ''}`
}

// ---------- Component ----------
export default function Forum() {
  // ---------- State ----------
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  // Bumping refresh reruns the load effect.
  const [refresh, setRefresh] = useState(0)
  const [formOpen, setFormOpen] = useState(false)

  // ---------- Load posts ----------
  useEffect(() => {
    // Ignores an outdated response if a newer load starts or the page is left.
    let cancelled = false

    async function loadPosts() {
      setLoading(true)
      setErrorMessage('')

      // Each post with its author's name. Newest first; id breaks ties.
      const { data, error } = await loadRows((options) => supabase
        .from('forum_post')
        .select('id,title,created_at,edited_at,profile(first_name,last_name)', options)
        .order('created_at', { ascending: false })
        .order('id'), 'id', () => cancelled)

      if (cancelled) return
      if (error) setErrorMessage(error.message)
      else setPosts(data)
      setLoading(false)
    }

    loadPosts()
    return () => { cancelled = true }
  }, [refresh])

  // ---------- Event handlers ----------
  function handleSaved() {
    setFormOpen(false)
    setRefresh((value) => value + 1)
  }

  // ---------- Render ----------
  return (
    <section aria-labelledby="forum-heading">
      {/* ----- Heading and actions ----- */}
      <div className="section-head">
        <h2 id="forum-heading">Forum</h2>
        <div className="actions">
          <button type="button" onClick={() => setFormOpen(true)}>New post</button>
          <button type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Refresh posts</button>
        </div>
      </div>

      {/* ----- New post form ----- */}
      {formOpen && (
        <div className="panel">
          <ForumForm table="forum_post" item={null} onSaved={handleSaved} onCancel={() => setFormOpen(false)} />
        </div>
      )}

      {/* ----- Posts: loading, error, empty, or the list ----- */}
      {loading ? (
        <p role="status">Loading posts...</p>
      ) : errorMessage ? (
        <p role="alert">Could not load posts: {errorMessage}</p>
      ) : posts.length === 0 ? (
        <p>No posts yet. Start the first conversation.</p>
      ) : (
        <ul className="forum-list">
          {posts.map((post) => (
            <li key={post.id}>
              {/* The title links to the post's own page. */}
              <h3><a href={`#/forum/${post.id}`}>{post.title}</a></h3>
              <p className="meta">{byline(post)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

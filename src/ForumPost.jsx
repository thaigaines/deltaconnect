// One forum post's page (members only): the post, a comment box, and its comments, newest first.
// Authors can edit or delete their own posts and comments; moderators can delete any.
import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { loadRows } from './loadRows.js'
import ForumForm from './ForumForm.jsx'
import { byline } from './Forum.jsx'

// ---------- Component ----------
// postId: from the URL. userId: the signed-in member. isModerator: may delete anything.
export default function ForumPost({ postId, userId, isModerator }) {
  // ---------- State ----------
  // post is null while loading or when it doesn't exist (deleted, or a bad link).
  const [post, setPost] = useState(null)
  const [comments, setComments] = useState([])
  // Only the first load shows "Loading", so reloads after a save keep the page on screen.
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  // Bumping refresh reruns the load effect.
  const [refresh, setRefresh] = useState(0)
  // Which item has its edit form open: null, 'post', or a comment's id.
  const [editing, setEditing] = useState(null)

  // ---------- Load the post and its comments ----------
  useEffect(() => {
    // Ignores an outdated response if a newer load starts or the page is left.
    let cancelled = false

    async function loadPost() {
      setErrorMessage('')

      // maybeSingle returns null instead of an error when no post has this id.
      const [postResult, commentResult] = await Promise.all([
        supabase.from('forum_post')
          .select('id,user_id,title,body,created_at,edited_at,profile(first_name,last_name)')
          .eq('id', postId)
          .maybeSingle(),
        loadRows((options) => supabase
          .from('forum_comment')
          .select('id,user_id,body,created_at,edited_at,profile(first_name,last_name)', options)
          .eq('forum_post_id', postId)
          .order('created_at', { ascending: false })
          .order('id'), 'id', () => cancelled),
      ])

      if (cancelled) return
      const error = postResult.error ?? commentResult.error
      if (error) setErrorMessage(error.message)
      else {
        setPost(postResult.data)
        setComments(commentResult.data)
      }
      setLoading(false)
    }

    loadPost()
    return () => { cancelled = true }
  }, [postId, refresh])

  // ---------- Event handlers ----------
  function reload() {
    setEditing(null)
    setRefresh((value) => value + 1)
  }

  // Deletes a post (and, through the database, its comments) or one comment.
  async function handleDelete(table, id) {
    if (!window.confirm(table === 'forum_post' ? 'Delete this post and all its comments?' : 'Delete this comment?')) return
    const { error } = await supabase.from(table).delete().eq('id', id).select('id').single()
    if (error) setErrorMessage(error.message)
    else if (table === 'forum_post') window.location.hash = '#/forum'
    else reload()
  }

  // Edit and Delete buttons for one post or comment, shown to its author (and Delete to moderators).
  function itemActions(table, item, editKey) {
    const isAuthor = item.user_id === userId
    if (!isAuthor && !isModerator) return null
    return (
      <div className="actions">
        {isAuthor && <button type="button" onClick={() => setEditing(editKey)}>Edit</button>}
        <button type="button" onClick={() => handleDelete(table, item.id)}>Delete</button>
      </div>
    )
  }

  // ---------- Render ----------
  if (loading) return <p role="status">Loading post...</p>
  if (errorMessage) {
    return (
      <div>
        <p role="alert">Could not load the post: {errorMessage}</p>
        <button type="button" onClick={reload}>Retry</button>
      </div>
    )
  }
  if (!post) return <p>This post doesn't exist or was deleted. <a href="#/forum">Back to the forum</a></p>

  return (
    <section aria-labelledby="post-heading">
      <p><a href="#/forum">← Back to the forum</a></p>

      {/* ----- The post, or its edit form ----- */}
      <article className="panel forum-post">
        {editing === 'post' ? (
          <ForumForm table="forum_post" item={post} onSaved={reload} onCancel={() => setEditing(null)} />
        ) : (
          <>
            <h2 id="post-heading">{post.title}</h2>
            <p className="meta">{byline(post)}</p>
            <p className="forum-body">{post.body}</p>
            {itemActions('forum_post', post, 'post')}
          </>
        )}
      </article>

      {/* ----- New comment ----- */}
      <div className="panel">
        <ForumForm table="forum_comment" item={null} newFields={{ forum_post_id: post.id }} onSaved={reload} />
      </div>

      {/* ----- Comments ----- */}
      {comments.length === 0 ? (
        <p>No comments yet.</p>
      ) : (
        <ul className="forum-list">
          {comments.map((comment) => (
            <li key={comment.id}>
              {editing === comment.id ? (
                <ForumForm table="forum_comment" item={comment} onSaved={reload} onCancel={() => setEditing(null)} />
              ) : (
                <>
                  <p className="meta">{byline(comment)}</p>
                  <p className="forum-body">{comment.body}</p>
                  {itemActions('forum_comment', comment, comment.id)}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

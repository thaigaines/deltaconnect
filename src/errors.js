// Turns Supabase errors into sentences members can act on. Pages add their own wording for
// errors that only make sense in context (like a duplicate listing URL) before calling this.

// ---------- Helpers ----------
// Browsers word a failed network request differently: Chrome, Firefox, then Safari.
const networkFailure = /Failed to fetch|NetworkError|Load failed/i

// Database (Postgres/PostgREST) and Auth errors carry a code; Storage errors carry an HTTP status.
const messagesByCode = {
  // Auth
  invalid_credentials: 'Incorrect email or password.',
  email_address_invalid: 'Enter a valid email address.',
  otp_expired: 'This link has expired or was already used. Request a new one from the login page.',
  same_password: 'Choose a password different from your current one.',
  over_request_rate_limit: 'Too many attempts. Wait a few minutes, then try again.',
  over_email_send_rate_limit: 'Too many emails were requested. Wait a few minutes, then try again.',
  session_not_found: 'Your session ended. Log in again.',
  session_expired: 'Your session ended. Log in again.',
  refresh_token_not_found: 'Your session ended. Log in again.',
  // Database: 42501 = blocked by permissions, PGRST116 = .single() matched no row,
  // P0002 = a function found nothing, 23514 = a value failed a CHECK constraint.
  '42501': 'You don\'t have permission to do that. If this seems wrong, contact the site owner.',
  PGRST116: 'That item no longer exists or you can\'t change it. Refresh the page and try again.',
  P0002: 'That item no longer exists. Refresh the page and try again.',
  '23514': 'Some information isn\'t in an accepted format. Check the fields and try again.',
}

// Object keys are strings, so status 413 and statusCode '413' find the same entry.
const storageMessagesByStatus = {
  403: 'You don\'t have permission to change this file. If this seems wrong, contact the site owner.',
  413: 'That file is too large. Choose a PDF of 500 KB or smaller.',
  415: 'Only PDF files can be uploaded.',
}

// ---------- Export ----------
export function friendlyError(error) {
  const message = error?.message ?? String(error)
  if (networkFailure.test(message) || error?.name === 'AuthRetryableFetchError' || error?.name === 'StorageUnknownError') {
    return 'Could not reach the server. Check your internet connection and try again.'
  }
  // The server's weak-password message already lists what the password needs.
  if (error?.code === 'weak_password') return message
  // The client reports a missing session by name, without a server error code.
  if (error?.name === 'AuthSessionMissingError') return messagesByCode.session_not_found
  if (messagesByCode[error?.code]) return messagesByCode[error.code]
  // Storage may report the problem in status or in statusCode (a string).
  if (error?.name === 'StorageApiError') {
    const storageMessage = storageMessagesByStatus[error.status] ?? storageMessagesByStatus[error.statusCode]
    if (storageMessage) return storageMessage
  }
  // Unknown errors keep their original wording so they can still be reported and debugged.
  return message
}

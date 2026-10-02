# DeltaConnect

## Working approach

- Evaluate proposals independently. Push back on choices you disagree with, explain tradeoffs, and recommend an alternative. Use primary-source research when evidence could change the decision. Respect the user's informed final choice.
- Keep code minimal and readable for student maintainers. Add dependencies or abstractions only for concrete requirements.
- Preserve user changes and stay within scope. Get confirmation before pushing, deploying, publishing, deleting material files, or changing shared systems.
- Prefer manual or temporary checks. Add permanent tests only when requested or agreed. Report changes, verification, and limitations.

## MVP

A public internship board for one Delta Sigma Pi chapter. Visitors browse, search, filter, and follow application links without login. Approved committee editors create, archive, and restore unchanged listings; all have equal permissions. New listings publish immediately.

Correct errors by archiving the old listing and creating a new one. Keep listing content unchanged after creation. Defer multi-chapter support, student accounts, saved listings, application tracking, notifications, scraping, and deployment decisions.

## Implementation

Use Streamlit and plain functions:

- `app.py`: UI and input.
- `logic.py`: validation, search, filtering, sorting, and visibility.
- `database.py`: loading, persistence, and conversion to the common application representation.

Read `SCHEMA.md` before changing listing fields, storage, authentication, or committee operations. It defines the planned normalized tables and write restrictions, not implemented functionality. CSV is for local fixtures; production storage uses Supabase. Keep location lists in the app and JSON arrays in CSV, converting to/from child rows at the storage boundary. Create listings and locations atomically.

## Listing behavior

- Search title, company, and location labels case-insensitively. Location filtering matches any label; work arrangement is separate from geographic eligibility.
- Public visibility requires no manual archival and an absent deadline or deadline on/after today in `America/New_York`. Enforce this before public retrieval; compute expiration on reads.
- Sort by nearest deadline, undated last, with a deterministic tie-breaker. Display absent deadlines as “No deadline provided,” not rolling applications.
- Retain expired and archived records for committee access. Restoring only clears archival; an expired listing remains hidden.
- Warn on duplicate application URLs and allow an explicit override. Review undated listings weekly.

## Access and validation

Supabase Auth identifies users; owner-approved membership grants editor access. Enforce authorization in database policies, protect audit fields and hidden location rows, and use user-scoped committee access. Keep secrets outside source and fixtures. Revoke approval when editors leave; retain accounts initially and preserve listings if account deletion is later supported.

Check affected cases: invalid required fields/URLs, empty or multiple locations, missing deadlines, Eastern date boundaries, archive/restore, duplicate overrides, filtering, and sorting. For committee operations, verify denied anonymous/unapproved writes and content edits, approved creation/archive/restore, and rollback of failed listing/location creation.

Keep README setup concise and use DeltaConnect consistently.

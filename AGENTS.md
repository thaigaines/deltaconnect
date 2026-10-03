# DeltaConnect

## Working approach

- The user writes application logic for practice. Focus agent edits on tedious tasks, formatting, and small explicitly requested changes; provide advice instead of substantial implementations unless requested.
- Evaluate proposals independently. Explain tradeoffs and use primary-source research when evidence could change a decision. Respect the user's informed final choice.
- Keep code minimal and readable for student maintainers. Add dependencies or abstractions only for concrete requirements.
- Preserve user changes and scope. Get confirmation before pushing, deploying, publishing, deleting material files, or changing shared systems.
- Prefer manual or temporary checks. Add permanent tests only when requested or agreed. Report changes, verification, and limitations.

## Product and database rules

Read `supabase/README.md` before changing listing behavior, authentication, roles, resumes, or database access. It is the authoritative source for current rules. `SCHEMA.md` describes columns; migrations implement the database. Distinguish intended rules, local verification, and hosted state.

DeltaConnect serves one Delta Sigma Pi chapter. Internship browsing requires approved membership; editors are approved members with additional permissions. Resumes are publicly downloadable. Keep multi-chapter support, saved listings, application tracking, notifications, scraping, and deployment choices outside scope unless requested.

## Implementation

The current application uses Streamlit and plain Python functions:

- `app.py`: configuration and navigation; `app_pages/`: UI and input.
- `logic.py`: search, filtering, sorting, and visibility.
- `database.py`: persistence, type conversion, and location-label formatting.

The SQL setup does not automatically connect the Python app. Use user-scoped access so Supabase enforces permissions. Keep credentials outside source and fixtures. Create listings and initial locations atomically. Validate and clean input before writes; constraints enforce stored values. Reads assume valid records and perform only type conversion and presentation formatting.

## Listing presentation

- Search title, company, and location labels case-insensitively. Location filtering matches any label; work arrangement is separate.
- Sort by nearest deadline, undated last, with a deterministic tie-breaker. Display missing deadlines as “No deadline provided.”
- Review undated listings weekly. Require explicit confirmation for duplicate application URLs.

## Verification

Check invalid fields/URLs, empty/multiple locations, duplicate overrides, Eastern-date boundaries, missing deadlines, filtering, sorting, edits, and archive/restore. Confirm regular members cannot retrieve hidden listings or their locations, while editors can. Verify denied unapproved writes, editor membership revocation, creation rollback, owner-only resume changes, public downloads, exact Storage paths, timestamps, and file/database failure cleanup.

Keep setup documentation concise and use DeltaConnect consistently.

# DeltaConnect

## Working approach

- The user writes application logic for practice. Focus agent edits on tedious tasks, formatting, and small explicitly requested changes; provide advice instead of substantial implementations unless requested.
- Evaluate proposals independently. Explain tradeoffs and use primary-source research when evidence could change a decision. Respect the user's informed final choice.
- Keep code minimal and readable for student maintainers. Add dependencies or abstractions only for concrete requirements.
- With each incremental step, re-judge earlier steps in light of the new context and content. Remove redundancies, refactor, and compress where the new step makes that possible; this cleanup is part of the step.
- Preserve user changes and scope. Get confirmation before pushing, deploying, publishing, deleting material files, or changing shared systems.
- Prefer manual or temporary checks. Add permanent tests only when requested or agreed. Report changes, verification, and limitations.

## Product and database rules

Read `README.md` before changing listing behavior, authentication, roles, resumes, or database access. It is the authoritative source for current rules; migrations implement the database and define columns. Distinguish intended rules, local verification, and hosted state.

Use owner-controlled accounts: allowed users browse internships immediately after login, with approval handled during account provisioning rather than a separate approval flow in the UI. Keep the resume directory and downloads on a separate public page accessible without login. Follow `README.md` for provisioning and editor permissions.

DeltaConnect serves one Delta Sigma Pi chapter. Keep multi-chapter support, saved listings, application tracking, notifications, scraping, and deployment choices outside scope unless requested.

## Implementation

Use JavaScript and pnpm with its lockfile; `package.json` defines dependencies and commands. Split files only when a concrete need makes the code easier to understand. Organize source files into commented sections (helpers, state, effects, handlers, render); comments explain purpose and reasoning for students learning JavaScript and React.

Supabase handles authentication, database access, and Storage; the React frontend calls it directly, with no separate backend server. Add Python supporting scripts only for concrete tasks such as data imports.

Keep the UI dark and minimal. Use purple only for active, actionable, or urgent elements, and add no decorative extras unless requested.

The SQL setup does not automatically connect the frontend. Use user-scoped access so Supabase enforces permissions. Keep credentials outside source and fixtures. Create listings and initial locations atomically. Validate and clean input before writes; constraints enforce stored values. Reads assume valid records and perform only type conversion and presentation formatting.

## Verification

Check affected validation, presentation, permissions, and failure cases against `README.md`, including date boundaries, denied access, atomic creation rollback, and file/database cleanup. Distinguish local checks from hosted verification.

Keep setup documentation concise and use DeltaConnect consistently.

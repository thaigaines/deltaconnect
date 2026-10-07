# DeltaConnect

## Scope and working approach

- The user writes application logic for practice. Focus agent edits on tedious tasks, formatting, and small explicitly requested changes; provide advice instead of substantial implementations unless requested.
- Evaluate proposals independently. Explain tradeoffs and use primary-source research when evidence could change a decision. Respect the user's informed final choice.
- Prioritize readable, correct code for student maintainers, then measured performance. Add dependencies or abstractions only for concrete requirements; split files when a concrete need makes the code easier to understand.
- Reassess earlier work with each incremental step; remove redundancies and simplify within the requested scope.
- Preserve user changes and scope. Get confirmation before pushing, deploying, publishing, deleting material files, or changing shared systems.

DeltaConnect serves one Delta Sigma Pi chapter. Keep multi-chapter support, saved listings, application tracking, notifications, scraping, and deployment choices outside scope unless requested.

## Read before changing behavior

Read `README.md` before changing listings, authentication, roles, profiles, resumes, the forum, or database access. It describes current behavior and setup, not fixed requirements. Recommend better approaches when warranted and update it to match implemented changes. Use `supabase/migrations/` for database definitions and column details.

## Implementation

Use JavaScript and pnpm with its lockfile; `package.json` defines dependencies and commands. Organize source files into commented sections (helpers, state, effects, handlers, render); explain purpose and reasoning for students learning JavaScript and React.

Supabase handles authentication, database access, and Storage; the React frontend calls it directly, with no separate backend server. Add Python supporting scripts only for concrete tasks such as data imports.

Keep the UI dark and minimal. Use purple only for active, actionable, or urgent elements (the hero's faint glow is the one requested exception), and add no decorative extras unless requested. Only clickable elements react to hover.

Use DeltaConnect in text; the top bar and browser tab show the Δ mark. Keep setup documentation concise.

## Database access and writes

The SQL setup does not automatically connect the frontend. Use user-scoped access so Supabase enforces permissions. Keep credentials outside source and fixtures. Create listings and initial locations atomically. Validate and clean input before writes; constraints enforce stored values. Reads assume valid records and perform only type conversion and presentation formatting.

## Verification

Prefer manual or temporary checks; add permanent tests only when requested or agreed. Check affected validation, presentation, permissions, and failure cases against intended behavior, including date boundaries, denied access, atomic creation rollback, and file/database cleanup.

When changing data loading, verify completeness against API limits and preserve search and filter behavior.

Report changes, verification, and limitations. Distinguish documented behavior, local checks, and verified hosted state.

# DeltaConnect

Internship listings, a member forum, and a public member directory for one Delta Sigma Pi chapter.

This README describes how the site works and is set up today. It records current
behavior, not fixed requirements: when a better approach appears or a new need
conflicts with something here, change the site and update this file to match. The
SQL migrations in `supabase/migrations/` are the source for column details.

## Pages and member workflow

The owner provisions member accounts. Emailed links let new members choose their
first password and let users reset forgotten passwords.

| Page | Current behavior |
| --- | --- |
| Account home `#/` | Approved members save their name, major, graduation term/year, optional LinkedIn and US phone number, and directory choices (show profile, email, phone; all off until checked); they upload, replace, or delete their resume |
| Internships `#/internships` | Members search, filter, and request listings (every field, including locations). Moderators add listings directly, edit details and locations, archive or restore listings, and review pending requests: edit, publish, or trash |
| Forum `#/forum`, posts `#/forum/<id>` | Members post topics and comments; moderators remove any post or comment and pin posts first |
| Member directory `#/directory` | Public, searchable by name or major. Lists members who chose to appear, with name, major, graduation, LinkedIn, and resume, plus their login email and phone only if they chose to show them; PDF downloads require no login |
| Members `#/members` | Administrators only: every member's email, name (or "No profile"), and role, plus "Invited" for accounts that have never signed in; searchable by email or name; grant or remove the moderator role |

## Run the website

Install Node.js 22.12+ and pnpm, then run:

```powershell
pnpm install
pnpm dev
```

Open the local URL printed by Vite. Use `pnpm build` to verify a production build.

For Supabase, create `.env.local` in the repository root:

```dotenv
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Restart Vite after changing these values. Use the publishable key; service-role
and secret keys must stay out of frontend code. `.env.local` is ignored by Git.

## Source guide

- `src/App.jsx`: navigation, login, email-link verification, and access checks.
- `src/Home.jsx`, `src/Internships.jsx`, `src/Forum.jsx`, `src/ForumPost.jsx`, `src/Members.jsx`, and `src/Directory.jsx`: page data and presentation; adjacent form components handle writes.
- `src/loadRows.js`: complete, ordered metadata loading for client-side search and lists.
- `src/errors.js`: shared error messages; callers handle errors specific to their workflow.
- `src/supabase.js`: shared client and resume bucket name; `src/styles.css`: shared styling.
- `supabase/migrations/`: schema and permissions; `supabase/seed.sql` and `supabase/reset.sql`: optional sample data and destructive reset.

## Data model

| Table | Purpose | Relationship |
| --- | --- | --- |
| `public.internship` | Listing content, optional deadline, archive and pending (member request awaiting review) status, and creation audit fields | `created_by` → `auth.users.id`; set to null when that account is deleted |
| `public.internship_location` | One US city/state pair per row; multiple locations per listing | `internship_id` → `internship.id`; cascading deletion |
| `public.profile` | One per user, created on first save; name, major, graduation term/year, optional LinkedIn URL. New member-visible details become columns here | `user_id` → `auth.users.id`; cascading deletion |
| `public.profile_contact` | Owner-only: optional phone (`+1` and 10 digits) and directory choices `show_in_directory`, `show_email`, `show_phone` (default off; showing a phone requires one). New private details become columns here | `user_id` → `profile.user_id`; cascading deletion |
| `public.resume` | At most one resume per profile; unique object path, original filename, upload time | `user_id` → `profile.user_id`; cascading deletion |
| `public.forum_post` | Title, body, creation time, `edited_at` (set when the text changes), and `is_pinned` | `user_id` → `profile.user_id`; cascading deletion |
| `public.forum_comment` | Body, creation time, and `edited_at`; a flat list under one post | `forum_post_id` → `forum_post.id`, `user_id` → `profile.user_id`; cascading deletion |
| `private.approved_member` | Approved member accounts | `user_id` → `auth.users.id`; cascading deletion |
| `private.approved_moderator` | Moderators, who must also be approved members | `user_id` → `approved_member.user_id`; cascading deletion |
| `private.approved_administrator` | Administrators, who must also be moderators | `user_id` → `approved_moderator.user_id`; cascading deletion |

Graduation term and year are set together; the form requires them, but profiles
saved before they existed may lack both until the member saves again. LinkedIn URLs
are `linkedin.com/in/` profile links.

Zero location rows means no city/state was specified. Use consistent city
spelling and capitalization; state is an uppercase US state/territory code.

## Permissions and listing behavior

RLS is enabled on all ten tables. Keep `private` outside the Data API.

### Account access and roles

Only owner-invited accounts are intended to log in for internship access. A trigger
on `auth.users` gives every new account an `approved_member` row, so invited users
browse immediately after setting their password. **This relies on public
self-registration staying disabled in Supabase Auth**; with it on, anyone who signs
up becomes a member. RLS still requires the approval row, so deleting it revokes
membership; the trigger runs only on account creation and never re-approves an
existing account. Administrators grant and remove the moderator role on the members
page; the administrator row is added only by hand in SQL. These hosted
settings and approvals must be verified separately.

The member directory and PDF downloads require no login. Saving a profile and
uploading a resume require an approved account, and a resume or contact row
requires a profile.

Ordinary clients use these permissions:

| Resource | Read | Write |
| --- | --- | --- |
| Internships | Members see active rows (never pending ones, including their own); moderators see all rows | Members create pending requests through `create_listing()`. Moderators create published listings, edit content/archive status, publish requests, and delete only pending requests |
| Locations | Same visibility as their internship | Moderators create, edit city/state, and delete |
| Profiles | Members: all profiles. Owners: their own. Visitors: only through `list_directory()` | Approved members create and edit only their own row |
| Contact details and directory choices | Owners only | Approved members create and edit only their own row |
| Member directory | Everyone, through `list_directory()`: approved members who opted in; email and phone only when shown | Through the owner's contact row |
| Forum posts and comments | Members only | Members create, edit, and delete their own (a profile is required); moderators delete any. Edits set `edited_at` |
| Forum pinning | Members (part of each post) | Moderators only, through `set_forum_post_pinned()`; pinned posts list first |
| Resume metadata | Owners; everyone else through `list_directory()` | Approved members manage only their own row |
| Member list and moderator role | Administrators only, through `list_members()` | Administrators only, through `set_moderator()`; administrators always keep their moderator role |
| Approval tables | No direct client access | Administrators change the moderator role through `set_moderator()`; all other changes in the SQL Editor |

Active means published (not pending), not archived, and deadline absent or on/after today in
`America/New_York`. Expiration is calculated on reads; restoring an expired listing
still leaves it hidden from regular members. No scheduled deletion is needed.

`my_permissions()` reports the signed-in user's approval. Roles stack: moderators must
first be members, and administrators must first be moderators, so removing a role removes
the roles above it. Moderators review listing requests, edit listings, and moderate the
forum; administrators can also manage moderators.

### Database functions and protected fields

The app creates listings through `create_listing()`, which saves a listing and its
initial locations atomically: published for moderators, pending for other members. It
runs with the caller's permissions and calls a `security definer` function in
`private` that checks member approval, because members can't read the pending row
they insert (Supabase advises against `security definer` functions in exposed
schemas). On creation, duplicate URLs require an explicit `p_allow_duplicate = true` override;
duplicate matches include pending and hidden rows. Moderators save edits through
`update_listing()`, which runs with their permissions and replaces the details and
locations atomically; URL edits do not prompt for duplicate confirmation.
Audit fields cannot be changed through ordinary client writes. `set_forum_post_pinned()`
runs with the caller's permissions and calls a `security definer` function in `private`,
which checks moderator approval; `is_pinned` is otherwise not client-writable.
`list_members()` and `set_moderator()` follow the same pattern and check administrator
approval, since emails live in `auth.users` and roles in `private`. `list_directory()`
follows it too: visitors can't read profiles, contacts, resumes, or `auth.users`, so the
`private` function returns only what each member chose to share. Visitors get `private`
schema usage for that one function; everything else there stays revoked, and new
`private` functions start without the default public execute permission. The directory
shows the login email; a separate contact email would be a new `profile_contact` column
returned in place of the login email when set (the function's result columns stay the same).

### Listing presentation

- Search title, company, and location labels case-insensitively. Location filtering matches any label; work arrangement is separate.
- Sort by nearest deadline, undated last, with a deterministic tie-breaker. Display missing deadlines as “No deadline provided.”
- Review undated listings weekly. Listing creation requires explicit confirmation for duplicate application URLs.

## Resume Storage

| Setting | Value |
| --- | --- |
| Bucket | `dsp-public-resumes` |
| Access | Public |
| MIME type / file limit | `application/pdf` / 500,000 bytes |
| File and metadata path | `<user-id>/<random-id>.pdf` |

Approved members can upload, inspect, and delete only PDFs in their own folder.
Upload first, then save metadata. Deleting a resume removes the file first, then the
row, so a failure leaves a row the member can delete again. Replacing a resume
uploads to a new path, saves the metadata, then removes the old file; Supabase advises against overwriting
because its CDN can serve stale copies. File and database writes are separate:
handle failures and cleanup in code. Metadata/account deletion does not remove
Storage files. Revoking membership or leaving the directory removes the member from
the directory, but a resume URL someone already saved keeps working until the file
is replaced or deleted.
Deleted public files may remain available from CDN or browser caches temporarily.

**Anyone with the public URL can download a resume.** The owner's UUID is visible
in `object_path` and `user_id`.

## Set up Supabase

### 1. Apply the schema

The SQL scripts in `supabase/migrations/` build the schema when run in filename
order. Never edit a migration a database has already run; add a new one instead.
On a fresh Supabase project, run them in the SQL Editor or apply
them with the Supabase CLI, using one method per project so migration history
stays consistent. The first migration stops safely if application tables already exist.

### 2. Configure Auth and API access

Then configure Auth, keep `private` outside the Data API, and expose the public
tables/functions using the explicit grants:

- Authentication → URL Configuration: Site URL `https://deltaconnect.vercel.app`.
- Authentication → Sign In / Providers: turn off new user sign-ups (required, since
  every new account becomes a member).
- Authentication → Emails: set up custom SMTP. Supabase's built-in sender only
  emails project team members and is tightly rate-limited. A free, dedicated Gmail
  account works: host `smtp.gmail.com`, port 465, the Gmail address as username and
  sender, and a Google app password (requires 2-Step Verification).
- Email templates: point the links at the site so the app verifies them. Scanners
  that only fetch HTML cannot consume the token; scanners that run JavaScript can:
  - Invite user: `{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=invite`
  - Reset password: `{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=recovery`

### 3. Provision accounts and optional sample data

Provision members with Invite user (they choose a password from the email) or by
creating the user and telling them to use "Forgot password?"; either way they become
members automatically. Make yourself administrator once in the SQL Editor by inserting
your Auth UUID into `private.approved_moderator`, then `private.approved_administrator`;
after that, manage moderators on the members page. Accounts kept through a reset need
their `private.approved_member` row added by hand. `supabase/seed.sql` optionally adds
fictional listings after setting `app.seed_moderator_id` to an approved test moderator
UUID in the same SQL session. No credentials or real user data are seeded.

### Reset an existing project

To start over, empty the `dsp-public-resumes` bucket in the dashboard, run
`supabase/reset.sql` (it deletes all DeltaConnect data and approvals but keeps Auth
accounts), then run the migrations again and re-approve the kept accounts by hand. If the project
was set up with the Supabase CLI, also clear its migration history (or use
`supabase migration repair`) so removed migration versions don't conflict.

# DeltaConnect

Internship listings and a public resume directory for one Delta Sigma Pi chapter.
Approved members log in to an account home page (`#/`) where they set their
profile (name and major) and upload or replace their resume. They browse
internships at `#/internships` with search and filters; editors also add listings
(with locations), edit listing details, and archive or restore listings. The
resume directory at `#/resumes` is public and searchable by name or major. The UI
does not yet edit locations after creation or delete resumes.

This README defines the product and database rules. The SQL migrations in
`supabase/migrations/` implement the database and are the source for column details.

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

## Tables

| Table | Purpose | Relationship |
| --- | --- | --- |
| `public.internship` | Listing content, optional deadline, archive status, and creation audit fields | `created_by` → `auth.users.id`; account deletion restricted |
| `public.internship_location` | One US city/state pair per row; multiple locations per listing | `internship_id` → `internship.id`; cascading deletion |
| `public.profile` | One per user, created on first save; name and major. New user details become columns here | `user_id` → `auth.users.id`; cascading deletion |
| `public.resume` | At most one resume per profile; unique object path, original filename, upload time | `user_id` → `profile.user_id`; cascading deletion |
| `private.approved_member` | Approved member accounts | `user_id` → `auth.users.id`; cascading deletion |
| `private.approved_editor` | Editors, who must also be approved members | `user_id` → `approved_member.user_id`; cascading deletion |

Zero location rows means no city/state was specified. Use consistent city
spelling and capitalization; state is an uppercase US state/territory code.

## Access

RLS is enabled on all six tables.

Only owner-allowed accounts are intended to log in for internship access. Provision
each account with an `approved_member` row before its first login, and disable
public self-registration in Supabase Auth. Allowed users browse immediately after
login; there is no separate membership-approval screen. The existing RLS still
requires the approval row, so an Auth account alone does not grant database access.
These hosted settings and approvals must be verified separately.

The resume directory and PDF downloads belong on a separate public page and
require no login. Saving a profile and uploading a resume require an approved
account, and a resume requires a profile.

Ordinary clients use these permissions:

| Resource | Read | Write |
| --- | --- | --- |
| Internships | Members see active rows; editors see all rows | Editors create and edit content/archive status; no deletion |
| Locations | Same visibility as their internship | Editors create, edit city/state, and delete |
| Profiles | Everyone, for profiles with a resume; owners see their own | Approved members create and edit only their own row |
| Resume metadata | Everyone | Approved members manage only their own row |
| Approval tables | No ordinary client access | Privileged administrator only |

Active means not archived and deadline absent or on/after today in
`America/New_York`. Expiration is calculated on reads; restoring an expired listing
still leaves it hidden from regular members. No scheduled deletion is needed.

`my_permissions()` reports the signed-in user's approval. Editors must first be
members; removing membership removes editor approval. Keep `private` unexposed.
The app creates listings through `create_listing()`, which saves a listing and its
initial locations atomically and runs with the caller's permissions (Supabase
advises against `security definer` functions in exposed schemas). Duplicate URLs
require an explicit `p_allow_duplicate = true` override; duplicate matches include
hidden rows.
Audit fields cannot be changed through ordinary client writes.

## Listing presentation

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
Upload first, then save metadata. Replacing a resume uploads to a new path, saves
the metadata, then removes the old file; Supabase advises against overwriting
because its CDN can serve stale copies. File and database writes are separate:
handle failures and cleanup in code. Metadata/account deletion does not remove
Storage files. Revoking membership does not unpublish existing resumes.

**Anyone with the public URL can download a resume.** The owner's UUID is visible
in `object_path` and `user_id`.

## Set up the database

The SQL scripts in `supabase/migrations/` build the schema when run in filename
order. Never edit a migration a database has already run; add a new one instead.
On a fresh Supabase project, run them in the SQL Editor as administrator or apply
them with the Supabase CLI, using one method per project so migration history
stays consistent. The first migration stops safely if application tables already exist.

To start over, empty the `dsp-public-resumes` bucket in the dashboard, run
`supabase/reset.sql` (it deletes all DeltaConnect data and approvals but keeps Auth
accounts), then run the migrations again.

Then configure Auth callback URLs/SMTP, keep `private` outside the Data API, and
expose the public tables/functions using the explicit grants. Approve existing Auth
UUIDs as members, then editors, using an administrator session. `supabase/seed.sql`
optionally adds fictional listings after setting `app.seed_editor_id` to an approved
test editor UUID in the same SQL session. No credentials or real user data are seeded.

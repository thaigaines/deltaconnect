# DeltaConnect

Internship listings and a public resume directory for one Delta Sigma Pi chapter.
The React/JavaScript frontend supports invited-account login, member/editor
internship browsing with search and filters, and a public resume directory at
`#/resumes`. Editors can add listings (with locations), edit listing details, and
archive or restore listings. Editing locations after creation is deferred.

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

Python may be added for supporting tasks such as data imports when needed.

## Tables

| Table | Purpose | Relationship |
| --- | --- | --- |
| `public.internship` | Listing content, optional deadline, archive status, and creation audit fields | `created_by` → `auth.users.id`; account deletion restricted |
| `public.internship_location` | One US city/state pair per row; multiple locations per listing | `internship_id` → `internship.id`; cascading deletion |
| `public.resume` | At most one resume per user; name, major, unique object path, original filename, upload time | `user_id` → `auth.users.id`; cascading deletion |
| `private.approved_member` | Approved member accounts | `user_id` → `auth.users.id`; cascading deletion |
| `private.approved_editor` | Editors, who must also be approved members | `user_id` → `approved_member.user_id`; cascading deletion |

Zero location rows means no city/state was specified. Use consistent city
spelling and capitalization; state is an uppercase US state/territory code.

## Access

RLS is enabled on all five tables.

Only owner-allowed accounts are intended to log in for internship access. Provision
each account with an `approved_member` row before its first login, and disable
public self-registration in Supabase Auth. Allowed users browse immediately after
login; there is no separate membership-approval screen. The existing RLS still
requires the approval row, so an Auth account alone does not grant database access.
These hosted settings and approvals must be verified separately.

The resume directory and PDF downloads belong on a separate public page and
require no login. Uploading and managing a resume still requires an approved account.

Ordinary clients use these permissions:

| Resource | Read | Write |
| --- | --- | --- |
| Internships | Members see active rows; editors see all rows | Editors create through `create_listing()` and edit content/archive status; no deletion |
| Locations | Same visibility as their internship | Editors create, edit city/state, and delete |
| Resume metadata | Everyone; only authenticated users can select `user_id` | Approved members manage only their own row |
| Approval tables | No ordinary client access | Privileged administrator only |

Active means not archived and deadline absent or on/after today in
`America/New_York`. Expiration is calculated on reads; restoring an expired listing
still leaves it hidden from regular members. No scheduled deletion is needed.

`my_permissions()` reports the signed-in user's approval. Editors must first be
members; removing membership removes editor approval. Keep `private` unexposed.
Listing creation and its initial locations are atomic. Duplicate URLs require an
explicit `p_allow_duplicate = true` override; duplicate matches include hidden rows.
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
| Exact file and metadata path | `<user-id>/resume.pdf` |

Approved members can upload, inspect, replace, and delete only their own file.
Upload first, then save metadata. Replacement updates the file at the same path;
update the metadata afterward to refresh `uploaded_at`. File and database writes
are separate: handle failures and cleanup in code. Metadata/account deletion does
not remove Storage files. Revoking membership does not unpublish existing resumes.

**Anyone with the public URL can download a resume.** The UUID is visible in
`object_path`, even when `user_id` is unavailable.

## Set up the database

Each migration is a SQL script that makes one change to the database schema. Run
in filename order, they build the current schema step by step. Never edit a
migration a database has already run; add a new one instead.

On a fresh Supabase project, run each file in `supabase/migrations/` in filename
order in the SQL Editor as administrator, or apply them with the Supabase CLI.
Use one method per project so migration history stays consistent. The first
migration stops safely if application tables already exist.

Then configure Auth callback URLs/SMTP, keep `private` outside the Data API, and
expose the public tables/functions using the explicit grants. Approve existing Auth
UUIDs as members, then editors, using an administrator session. `supabase/seed.sql`
optionally adds fictional listings after setting `app.seed_editor_id` to an approved
test editor UUID in the same SQL session. No credentials or real user data are seeded.

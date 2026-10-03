# DeltaConnect Database

This README defines the product and database rules. SQL migrations implement the
database; the React frontend still needs login and data access.

## Tables

| Table | Purpose | Relationship |
| --- | --- | --- |
| `public.internship` | Listing content, optional deadline, archive status, and creation audit fields | `created_by` → `auth.users.id`; account deletion restricted |
| `public.internship_location` | One US city/state pair per row; multiple locations per listing | `internship_id` → `internship.id`; cascading deletion |
| `public.resume` | At most one resume per user; unique object path, original filename, upload time | `user_id` → `auth.users.id`; cascading deletion |
| `private.approved_member` | Approved member accounts | `user_id` → `auth.users.id`; cascading deletion |
| `private.approved_editor` | Editors, who must also be approved members | `user_id` → `approved_member.user_id`; cascading deletion |

## Access

RLS is enabled on all five tables. Ordinary clients use these permissions:

Only owner-allowed accounts are intended to log in for internship access. Provision
each account with an `approved_member` row before its first login, and disable
public self-registration in Supabase Auth. Allowed users browse immediately after
login; there is no separate membership-approval screen. The existing RLS still
requires the approval row, so an Auth account alone does not grant database access.
These hosted settings and approvals must be verified separately.

The resume directory and PDF downloads belong on a separate public page and
require no login. Uploading and managing a resume still requires an approved account.

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

## Reproduce the database

From the repository root, generate the complete transactional SQL:

```powershell
.\supabase\build.ps1 | Set-Content -Encoding utf8 "$env:TEMP\deltaconnect-build.sql"
```

Open that file, then run its contents in the Supabase SQL Editor as administrator
on a fresh project. It creates tables, validation, RLS, functions, policies, and the
bucket in order. It stops safely if application tables already exist. CLI users
can apply the two migrations in filename order instead; do not mix manual builds
and CLI history without reconciling it.

For an existing project, review this destructive rebuild separately:

```powershell
.\supabase\build.ps1 -Rebuild | Set-Content -Encoding utf8 "$env:TEMP\deltaconnect-rebuild.sql"
```

**Running the rebuild deletes application rows, including approvals and resume
metadata.** It retains Auth accounts and Storage files. It replaces known
application policies, not arbitrary unrelated policies. Review any other existing
policies before using real data. Neither command executes SQL against Supabase.

Then configure Auth callback URLs/SMTP, keep `private` outside the Data API, and
expose the public tables/functions using the explicit grants. Approve existing Auth
UUIDs as members, then editors, using an administrator session. `seed.sql` optionally
adds fictional listings after setting `app.seed_editor_id` to an approved test
editor UUID in the same SQL session. No credentials or real user data are seeded.

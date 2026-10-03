# DeltaConnect schema

Supabase schema implemented by the repository migrations; hosted application status is unverified. Read `supabase/README.md` for authoritative access and product rules. US locations use separate city/state rows for filtering and normalization. No country or postal-code column.

“None” means no declared default. Defaults apply when a column is omitted, not when explicit NULL is supplied.

## `public.internship`

| Column | Type | Nullable | Default | Unique | Rule |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | No | `gen_random_uuid()` | Yes | Primary key |
| `title` | `text` | No | None | No | Trimmed, nonblank |
| `company` | `text` | No | None | No | Trimmed, nonblank |
| `application_url` | `text` | No | None | No | Absolute HTTP(S) URL |
| `work_arrangement` | `text` | No | None | No | Check: `in-person`, `hybrid`, `remote` |
| `deadline` | `date` | Yes | None (NULL if omitted) | No | Employer closing date |
| `is_archived` | `boolean` | No | `false` | No | Editors may archive and restore; listing content is also editable |
| `created_at` | `timestamptz` | No | `now()` | No | Database-stamped |
| `created_by` | `uuid` | No | `auth.uid()` | No | FK to `auth.users(id)`; `ON DELETE RESTRICT` |

## `public.internship_location`

| Column | Type | Nullable | Default | Unique | Rule |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | No | `gen_random_uuid()` | Yes | Primary key |
| `internship_id` | `uuid` | No | None | As group only | FK to `internship(id)`; `ON DELETE CASCADE` |
| `city` | `text` | No | None | As group only | Required, trimmed, nonblank |
| `state` | `text` | No | None | As group only | Required dropdown selection; store validated uppercase US state/territory code, including DC |

Duplicate rule: `UNIQUE (internship_id, city, state)`. Use consistent city spelling/capitalization. Each location row contains one complete city/state pair; add rows for additional locations. Validate state codes in the database as well as the dropdown.

Generate display labels such as `Boston, MA`. Zero rows means no city/state specified, not a row with missing values. CSV fixtures mirror both tables; the UI receives label lists. Imports validate city/state components; reads assume cleaned records.

## `private.approved_editor`

| Column | Type | Nullable | Default | Unique | Rule |
| --- | --- | --- | --- | --- | --- |
| `user_id` | `uuid` | No | None | Yes | Primary key; FK to `private.approved_member(user_id)`; `ON DELETE CASCADE` |

## `private.approved_member`

| Column | Type | Nullable | Default | Unique | Rule |
| --- | --- | --- | --- | --- | --- |
| `user_id` | `uuid` | No | None | Yes | Primary key; FK to `auth.users(id)`; `ON DELETE CASCADE` |

Only the owner or an authorized administrator manages approvals. Members cannot approve themselves. Every editor must be an approved member; removing membership also removes editor approval.

## `public.resume`

| Column | Type | Nullable | Default | Unique | Rule |
| --- | --- | --- | --- | --- | --- |
| `user_id` | `uuid` | No | `auth.uid()` | Yes | Primary key; FK to `auth.users(id)`; `ON DELETE CASCADE` |
| `object_path` | `text` | No | None | Yes | Exactly `<user-id>/resume.pdf` in the public `dsp-public-resumes` bucket |
| `original_filename` | `text` | No | None | No | Nonblank; display only |
| `uploaded_at` | `timestamptz` | No | `now()` | No | Database-stamped; refreshed on replacement |

Resume metadata and public file downloads are available to everyone. Anonymous users cannot select the `user_id` column, but the UUID remains visible in `object_path`. Approved members may upload, replace, and delete only their own resume; editors cannot change another member's resume. The bucket is PDF-only with a 500,000-byte limit.

File uploads and metadata writes are not one atomic transaction. On replacement, overwrite the same file path, then update the metadata to refresh its timestamp; handle failures and orphaned files. Deleting a metadata row or account does not automatically remove the stored PDF, so provide a cleanup workflow. Revoking membership does not unpublish an existing resume.

Location design follows [PostgreSQL array guidance](https://www.postgresql.org/docs/current/arrays.html#ARRAYS-SEARCHING); key rules follow [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html).

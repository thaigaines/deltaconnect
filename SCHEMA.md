# DeltaConnect schema

Planned Supabase schema; not yet implemented. All columns are required unless marked nullable.

## `public.internship`

| Column | Type | Rule |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `title`, `company` | `text` | Trimmed, nonblank |
| `application_url` | `text` | Absolute HTTP(S) URL; duplicates allowed |
| `work_arrangement` | `text` | `in-person`, `hybrid`, or `remote` |
| `deadline` | `date` | Nullable |
| `is_archived` | `boolean` | Default false |
| `created_at` | `timestamptz` | Database-stamped |
| `created_by` | `uuid` | References `auth.users(id)`; restrict account deletion |

## `public.internship_location`

| Column | Type | Rule |
| --- | --- | --- |
| `internship_id` | `uuid` | References `internship(id)` |
| `label` | `text` | Trimmed, nonblank city, country, or eligibility region |

Primary key: `(internship_id, label)`. An internship has zero or more locations. CSV and UI retain location lists; storage converts them to/from rows.

## `private.approved_editors`

| Column | Type | Rule |
| --- | --- | --- |
| `user_id` | `uuid` | Primary key; references `auth.users(id)` |

Supabase Auth handles login. The owner manages editor approval. Revoke approval when editors leave; retain their accounts initially. Future account deletion must preserve listings.

## Essential rules

- RLS permits only approved editors to access base tables. A restricted public-read function returns listing fields and location labels, excluding audit fields, expired listings, and archived listings.
- Public visibility: not archived, and deadline absent or on/after today in `America/New_York`.
- Create each listing and its locations in one transaction. Content and location rows remain unchanged after creation; only `is_archived` may change. Enforce this in database permissions.
- Correct errors by archiving the old listing and creating a corrected listing with a new ID. Restore only unchanged listings. No version column or edit workflow is needed.
- Database stamps creation fields. Imports preserve fixture IDs and attribute creation to the approved importing account. Retain archived records; warn on duplicate URLs and allow an explicit override.

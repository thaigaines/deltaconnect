# DeltaConnect schema

Planned Supabase schema; not yet implemented. US locations use separate city/state rows for filtering and normalization. No country or postal-code column.

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
| `is_archived` | `boolean` | No | `false` | No | Only changeable field |
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
| `user_id` | `uuid` | No | None | Yes | Primary key; FK to `auth.users(id)`; `ON DELETE CASCADE` |

## Essential rules

- RLS limits base-table access to approved editors. A restricted public-read function returns public listing fields and location labels, excluding audit fields and hidden listings.
- Public visibility: not archived, and deadline absent or on/after today in `America/New_York`.
- Create each listing and its locations in one transaction. Enforce unchanged content and locations after creation; only archival status may change.
- Correct errors by archiving and creating a new listing with a new ID. Restore only unchanged listings. No versions or edit workflow.
- Database stamping must prevent forged creation fields; defaults alone do not enforce this. Imports preserve fixture IDs and use the approved importing account. Warn on duplicate URLs and allow an explicit override. Ordinary committee operations never delete listings.

Location design follows [PostgreSQL array guidance](https://www.postgresql.org/docs/current/arrays.html#ARRAYS-SEARCHING); key rules follow [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html).

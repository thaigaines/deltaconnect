# DeltaConnect

A small Streamlit internship board for our Delta Sigma Pi chapter.

## Run locally (PowerShell)

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m streamlit run app.py
```

The board reads fictional examples from `data/internships.csv` on every rerun. Search title, company, or location and combine location and work arrangement filters. Results show nearest deadlines first, with undated listings last. Expired and manually archived rows remain in the CSV but are hidden from the board.

## Fixture format

Use unique UUIDs, work arrangements `in-person`, `hybrid`, or `remote`, and `true`/`false` for `is_archived`. Locations are JSON arrays inside quoted CSV fields; CSV escapes quotes by doubling them. Use `[]` for unspecified locations, and leave deadlines empty when none is provided. Dates use `YYYY-MM-DD` and remain visible through that day in `America/New_York`.

Examples cover multiple locations, remote geographic restrictions, missing locations/deadlines, duplicate application URLs for distinct roles, expiration, and manual archival. Boundary examples are anchored to October 2, 2026; dated examples naturally expire over time.

`database.py` parses fixtures, `logic.py` validates and selects listings, and `app.py` presents the board. CSV is for local testing only. Supabase storage, authentication, and committee editing are future work. Audit timestamps and editor IDs will be added with that schema; fixtures contain no real editor identities.

The agreed Supabase design is in [SCHEMA.md](SCHEMA.md): normalized location rows and owner-approved Auth accounts. Correct errors by archiving the old listing and creating a new one; listing content is not edited. CSV fixtures and the interface continue to use location lists.

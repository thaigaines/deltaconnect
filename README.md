# DeltaConnect

## Run locally (PowerShell)

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m streamlit run app.py
```

The board reads fictional examples from `data/internships.csv` and `data/internship_locations.csv` on every rerun. Search title, company, or location and combine location and work arrangement filters. Results show nearest deadlines first, with undated listings last. Expired and manually archived rows remain in the CSV but are hidden from the board.

## Fixture format

Fixtures mirror the schema: listings include creation fields; locations contain `id`, `internship_id`, `city`, and `state`. Add one row per city/state pair, or no rows when unspecified. Use ISO dates/timestamps, blank absent deadlines, and `true`/`false` for archival state. Creator IDs are fictional placeholders, not real Auth accounts; a future import must use the approved operator's identity.

The reader assumes fixtures have already been cleaned and validated. It only converts transport types and formats location labels. Examples cover multiple/empty locations, missing deadlines, shared application URLs, expiration, and archival. Date boundaries are anchored to October 2, 2026; dated examples naturally expire over time.

`database.py` reads fixtures, `logic.py` selects listings, and `app.py` presents the board. Supabase storage, authentication, and committee create/archive/restore operations remain future work. Validation belongs in imports, committee input, and database constraints.

The agreed Supabase design is in [SCHEMA.md](SCHEMA.md): normalized location rows and owner-approved Auth accounts. Correct errors by archiving the old listing and creating a new one; listing content is not edited. CSV fixtures and the interface continue to use location lists.

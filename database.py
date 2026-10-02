import csv
import json
from datetime import date
from pathlib import Path

from logic import public_listings, validate_listing

FIXTURE_PATH = Path(__file__).parent / "data" / "internships.csv"


def load_internships(path=FIXTURE_PATH):
    """Parse local csv, retain hidden rows for local validation in logic.py."""
    # Supabase: replace CSV parsing with a query returning this same listing shape.
    listings = []
    seen_ids = set()
    with Path(path).open(encoding="utf-8-sig", newline="") as source:
        for row_number, row in enumerate(csv.DictReader(source), start=2):
            try:
                archived = row["is_archived"].strip().lower()
                if archived not in ("true", "false"):
                    raise ValueError("is_archived must be true or false")
                deadline = row["deadline"].strip()
                listing = {
                    "id": row["id"].strip(),
                    "title": row["title"].strip(),
                    "company": row["company"].strip(),
                    "application_url": row["application_url"].strip(),
                    "work_arrangement": row["work_arrangement"].strip(),
                    "locations": json.loads(row["locations"]),
                    "deadline": date.fromisoformat(deadline) if deadline else None,
                    "is_archived": archived == "true",
                }
                # Supabase: validate editor input before writes; use a UUID primary key.
                validate_listing(listing)
                if listing["id"] in seen_ids:
                    raise ValueError("Duplicate listing id")
                seen_ids.add(listing["id"])
                listings.append(listing)
            except (KeyError, TypeError, ValueError, AttributeError) as error:
                raise ValueError(f"Invalid internship CSV row {row_number}: {error}") from error
    return listings


def load_public_internships(path=FIXTURE_PATH, today=None):
    # Supabase: use public access that returns only visible rows and public fields.
    return public_listings(load_internships(path), today)

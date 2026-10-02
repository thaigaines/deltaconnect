import csv
from datetime import date, datetime
from pathlib import Path

from logic import public_listings

FIXTURE_PATH = Path(__file__).parent / "data" / "internships.csv"
LOCATION_PATH = Path(__file__).parent / "data" / "internship_locations.csv"


def load_internships(path=FIXTURE_PATH, location_path=LOCATION_PATH):
    """Read clean fixtures and format their types and location labels for the app."""
    locations = {}
    with Path(location_path).open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            locations.setdefault(row["internship_id"], []).append(
                f"{row['city']}, {row['state']}"
            )

    listings = []
    with Path(path).open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            row["deadline"] = date.fromisoformat(row["deadline"]) if row["deadline"] else None
            row["is_archived"] = row["is_archived"] == "true"
            row["created_at"] = datetime.fromisoformat(row["created_at"])
            row["locations"] = sorted(locations.get(row["id"], []))
            listings.append(row)
    return listings


def load_public_internships(path=FIXTURE_PATH, today=None, location_path=LOCATION_PATH):
    # Supabase: query only visible rows and public fields through the public-read RPC.
    return public_listings(load_internships(path, location_path), today)

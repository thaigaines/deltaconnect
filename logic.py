from datetime import date, datetime
from urllib.parse import urlsplit
from uuid import UUID
from zoneinfo import ZoneInfo

WORK_ARRANGEMENTS = ("in-person", "hybrid", "remote")


def chapter_today():
    return datetime.now(ZoneInfo("America/New_York")).date()

# Validate fields, url, work_arrangement, locations as list (maybe need change location structure for supabase?)
def validate_listing(listing):
    UUID(listing["id"])
    for field in ("title", "company", "application_url"):
        if not listing[field].strip():
            raise ValueError(f"{field} is required")
    url = urlsplit(listing["application_url"])
    if url.scheme not in ("http", "https") or not url.hostname:
        raise ValueError("application_url must be an absolute HTTP or HTTPS URL")
    if listing["work_arrangement"] not in WORK_ARRANGEMENTS:
        raise ValueError("Invalid work_arrangement")
    if not isinstance(listing["locations"], list) or any(
        not isinstance(location, str) or not location.strip()
        for location in listing["locations"]
    ):
        raise ValueError("locations must be a list of nonblank strings")


def public_listings(listings, today=None):
    # Supabase: enforce this visibility rule in public-read policies too.
    today = today if today is not None else chapter_today()
    return [listing for listing in listings if not listing["is_archived"]
            and (listing["deadline"] is None or listing["deadline"] >= today)]

# Filter functionality
def filter_listings(listings, query="", location=None, work_arrangement=None):
    query = query.strip().casefold()
    matches = [
        listing for listing in listings
        if query in " ".join([listing["title"], listing["company"], *listing["locations"]]).casefold()
        and (location is None or location in listing["locations"])
        and (work_arrangement is None or work_arrangement == listing["work_arrangement"])
    ]
    return sorted(matches, key=lambda listing: (
        listing["deadline"] or date.max, listing["company"].casefold(), # Date.max used to archive old listings
        listing["title"].casefold(), listing["id"],
    ))

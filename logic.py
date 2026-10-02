from datetime import date, datetime
from zoneinfo import ZoneInfo

WORK_ARRANGEMENTS = ("in-person", "hybrid", "remote")


def chapter_today():
    return datetime.now(ZoneInfo("America/New_York")).date()


def public_listings(listings, today=None):
    # Supabase: enforce this visibility rule in public-read policies too.
    today = today if today is not None else chapter_today()
    return [listing for listing in listings if not listing["is_archived"]
            and (listing["deadline"] is None or listing["deadline"] >= today)]


def filter_listings(listings, query="", location=None, work_arrangement=None):
    query = query.strip().casefold()
    matches = [
        listing for listing in listings
        if query in " ".join([listing["title"], listing["company"], *listing["locations"]]).casefold()
        and (location is None or location in listing["locations"])
        and (work_arrangement is None or work_arrangement == listing["work_arrangement"])
    ]
    return sorted(matches, key=lambda listing: (
        listing["deadline"] or date.max, listing["company"].casefold(),
        listing["title"].casefold(), listing["id"],
    ))

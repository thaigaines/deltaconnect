from pathlib import Path

import streamlit as st

from database import load_public_internships
from logic import WORK_ARRANGEMENTS, filter_listings

st.set_page_config(
    page_title="DeltaConnect",
    page_icon=Path(__file__).parent / "images" / "dsptp.png",
    layout="centered",
)


def main():
    st.title("DeltaConnect")
    st.write("Explore opportunities curated by our chapter.")
    # Supabase: remove this notice once real listings replace the fixtures.
    st.caption("Sample data for testing. Fictional opportunities.")
    try:
        internships = load_public_internships()
    except OSError as error:
        # Supabase: handle query failures and keep sensitive details out of the UI.
        st.error(f"Internships could not be loaded: {error}")
        st.stop()

    query = st.text_input("Search internships", placeholder="Title, company, or location")
    location_column, arrangement_column = st.columns(2)
    locations = sorted({location for listing in internships for location in listing["locations"]})
    location = location_column.selectbox(
        "Location", [None, *locations],
        format_func=lambda value: value or "All locations",
    )
    arrangement = arrangement_column.selectbox(
        "Work arrangement", [None, *WORK_ARRANGEMENTS],
        format_func=lambda value: value.capitalize() if value else "All arrangements",
    )
    matches = filter_listings(internships, query, location, arrangement)

    st.caption(f"Showing {len(matches)} of {len(internships)} active internships · Nearest deadline first")

    if not internships:
        st.info("No active internships yet. Check back soon.")
    elif not matches:
        st.info("No internships match these filters. Try another search or select all locations and arrangements.")

    for listing in matches:
        with st.container(border=True):
            st.subheader(listing["title"])
            st.write(listing["company"])
            st.caption(listing["work_arrangement"].capitalize())
            st.write("Locations: " + ("; ".join(listing["locations"]) or "Not specified"))
            st.caption(
                f"Apply by {listing['deadline']:%b %d, %Y}"
                if listing["deadline"] else "No deadline provided"
            )
            st.link_button("View application", listing["application_url"])
    st.caption("Check the employer's application page for availability and exact closing times.")


main()

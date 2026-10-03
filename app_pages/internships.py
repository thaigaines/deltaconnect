import streamlit as st

from database import load_public_internships
from logic import WORK_ARRANGEMENTS, filter_listings

# Basic div styling
st.html("""
<style>
.st-key-main {
    background-color: #FFFFFF;
    padding: clamp(1rem, 4vw, 2rem);
    border: 1px solid #DED2EA;
    border-radius: 24px;
    box-shadow: 0 12px 40px rgba(51, 0, 102, 0.06);
}
.st-key-filters {
    background-color: #F7F3FB;
}
</style>
""")


def main():
    with st.container(horizontal_alignment="center"):
        st.title("DeltaConnect", anchor=False, text_alignment="center")
        st.markdown("Your next opportunity starts here.", text_alignment="center")
        st.caption("Internships curated by our chapter, for our chapter", text_alignment="center")
    try:
        internships = load_public_internships()
    except OSError as error:
        # Supabase: handle query failures and keep sensitive details out of the UI.
        st.error(f"Internships could not be loaded: {error}")
        st.stop()

    with st.container(border=True, key="filters"):
        query = st.text_input(
            "Search internships", placeholder="Title, company, or city",
            icon=":material/search:",
        )
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

    with st.container(horizontal=True, horizontal_alignment="distribute"):
        st.caption(f"Showing {len(matches)} of {len(internships)} opportunities", width="content")
        st.caption("Nearest deadline first", width="content")

    if not internships:
        st.info("No active internships yet. Check back soon.")
    elif not matches:
        st.info("No internships match these filters. Try another search or select all locations and arrangements.")

    for listing in matches:
        with st.container(border=True):
            st.caption(listing["company"])
            st.subheader(listing["title"])
            with st.container(horizontal=True, vertical_alignment="center"):
                st.badge(listing["work_arrangement"].capitalize(), color="primary")
                st.caption(
                    ":material/location_on: " + ("; ".join(listing["locations"]) or "Location not specified"),
                    width="content",
                )
            with st.container(horizontal=True, horizontal_alignment="distribute", vertical_alignment="center"):
                st.caption(
                    f":material/event: Apply by {listing['deadline']:%b %d, %Y}"
                    if listing["deadline"] else "No deadline provided",
                    width="content",
                )
                st.link_button(
                    "View application", listing["application_url"], type="primary",
                    icon=":material/open_in_new:", icon_position="right",
                )
    st.caption("Check the employer's application page for availability and exact closing times.")


with st.container(key="main", gap="medium"):
    main()

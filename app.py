from pathlib import Path

import streamlit as st

st.set_page_config(
    page_title="DeltaConnect",
    page_icon=Path(__file__).parent / "images" / "dsptp.png",
    layout="centered",
)

page = st.navigation(
    [
        st.Page("app_pages/internships.py", title="Internships", icon=":material/work:"),
        st.Page("app_pages/committee_login.py", title="Committee login", icon=":material/login:"),
    ],
    position="top",
)
page.run()

import streamlit as st

st.title("Committee login")
st.caption("Sign in with your approved committee account.")

with st.form("committee_login"):
    email = st.text_input("Email")
    password = st.text_input("Password", type="password")
    submitted = st.form_submit_button("Sign in", type="primary")

if submitted:
    # Authenticate with Supabase and check committee approval here.
    st.info("Login is not connected yet.")
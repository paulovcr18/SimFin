"""
Autenticação Supabase para o app Streamlit.
Session persistida em st.session_state['user'].
"""
from __future__ import annotations
import streamlit as st
from supabase import create_client, Client


@st.cache_resource
def _client() -> Client:
    url = st.secrets["SUPABASE_URL"]
    key = st.secrets["SUPABASE_KEY"]
    return create_client(url, key)


def get_client() -> Client:
    return _client()


def current_user():
    """Retorna o objeto user ou None se não autenticado."""
    return st.session_state.get("user")


def require_auth() -> bool:
    """
    Renderiza tela de login/cadastro se não autenticado.
    Retorna True se autenticado, False caso contrário.
    """
    if current_user():
        return True

    sb = get_client()

    st.markdown(
        """
        <div style="max-width:380px;margin:80px auto 0">
        """,
        unsafe_allow_html=True,
    )
    st.title("SimFin")
    st.caption("Simulador financeiro pessoal")
    st.divider()

    tab_login, tab_signup = st.tabs(["Entrar", "Criar conta"])

    with tab_login:
        email = st.text_input("E-mail", key="login_email")
        senha = st.text_input("Senha", type="password", key="login_senha")
        if st.button("Entrar", use_container_width=True, type="primary"):
            try:
                res = sb.auth.sign_in_with_password({"email": email, "password": senha})
                st.session_state["user"] = res.user
                st.session_state["session"] = res.session
                st.rerun()
            except Exception as e:
                st.error(f"Erro: {e}")

    with tab_signup:
        email2 = st.text_input("E-mail", key="signup_email")
        senha2 = st.text_input("Senha (mín. 6 caracteres)", type="password", key="signup_senha")
        if st.button("Criar conta", use_container_width=True):
            try:
                res = sb.auth.sign_up({"email": email2, "password": senha2})
                st.success("Conta criada! Verifique seu e-mail para confirmar.")
            except Exception as e:
                st.error(f"Erro: {e}")

    st.markdown("</div>", unsafe_allow_html=True)
    return False


def logout():
    sb = get_client()
    try:
        sb.auth.sign_out()
    except Exception:
        pass
    st.session_state.pop("user", None)
    st.session_state.pop("session", None)
    st.rerun()

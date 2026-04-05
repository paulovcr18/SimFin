"""
SimFin — entry point.
Redireciona para login se não autenticado, senão mostra dashboard home.
"""
import sys; sys.path.insert(0, ".")
import streamlit as st
from core.auth import require_auth, current_user, logout
from core.db import acomp_list, metas_list

st.set_page_config(page_title="SimFin", page_icon="💹", layout="wide")

if not require_auth():
    st.stop()

uid = current_user().id

with st.sidebar:
    st.markdown("## 💹 SimFin")
    st.caption(f"👤 {current_user().email}")
    if st.button("Sair", use_container_width=True):
        logout()

st.title("💹 SimFin — Painel Principal")
st.markdown("Bem-vindo ao **SimFin**. Navegue pelas páginas no menu lateral.")

st.divider()

# ── Cards de acesso rápido ────────────────────────────────────────────
c1, c2, c3 = st.columns(3)

with c1:
    st.markdown(
        """<div style="border:1px solid #30363d;border-radius:10px;padding:20px;background:#161b22;text-align:center">
        <div style="font-size:36px">📊</div>
        <h3 style="color:#c9d1d9;margin:8px 0 4px">Simulador</h3>
        <p style="color:#8b949e;font-size:13px">Compare CLT × PJ e projete seu patrimônio com cálculos fiscais 2026.</p>
        </div>""",
        unsafe_allow_html=True,
    )
    st.page_link("pages/1_Simulador.py", label="Abrir Simulador →", use_container_width=True)

with c2:
    st.markdown(
        """<div style="border:1px solid #30363d;border-radius:10px;padding:20px;background:#161b22;text-align:center">
        <div style="font-size:36px">📈</div>
        <h3 style="color:#c9d1d9;margin:8px 0 4px">Carteira B3</h3>
        <p style="color:#8b949e;font-size:13px">Acompanhe posições, P&L e evolução da sua carteira de ações.</p>
        </div>""",
        unsafe_allow_html=True,
    )
    st.page_link("pages/2_Carteira.py", label="Abrir Carteira →", use_container_width=True)

with c3:
    st.markdown(
        """<div style="border:1px solid #30363d;border-radius:10px;padding:20px;background:#161b22;text-align:center">
        <div style="font-size:36px">📅</div>
        <h3 style="color:#c9d1d9;margin:8px 0 4px">Acompanhamento</h3>
        <p style="color:#8b949e;font-size:13px">Registre patrimônio mês a mês e gerencie suas metas financeiras.</p>
        </div>""",
        unsafe_allow_html=True,
    )
    st.page_link("pages/3_Acompanhamento.py", label="Abrir Acompanhamento →", use_container_width=True)

st.divider()

# ── Resumo rápido ─────────────────────────────────────────────────────
try:
    registros = acomp_list(uid)
    metas     = metas_list(uid)

    if registros:
        import pandas as pd
        df = pd.DataFrame(registros).sort_values("mes")
        ultimo = df.iloc[-1]
        pat    = float(ultimo.get("patrimonio", 0))
        mes    = ultimo.get("mes", "—")

        metas_ativas   = [m for m in metas if not m.get("atingida")]
        metas_atingidas = [m for m in metas if m.get("atingida")]

        r1, r2, r3 = st.columns(3)
        r1.metric("💰 Último Patrimônio", f"R$ {pat:,.2f}", f"Ref.: {mes}")
        r2.metric("🎯 Metas Ativas",      str(len(metas_ativas)))
        r3.metric("✅ Metas Atingidas",   str(len(metas_atingidas)))
except Exception:
    pass

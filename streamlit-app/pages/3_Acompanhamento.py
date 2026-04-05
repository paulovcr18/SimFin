"""
Acompanhamento mensal e Metas financeiras.
"""
import sys; sys.path.insert(0, ".")
import streamlit as st
import plotly.graph_objects as go
import pandas as pd
from datetime import date, datetime
from core.auth import require_auth, current_user, logout
from core.db import (
    acomp_list, acomp_upsert, acomp_delete,
    metas_list, meta_insert, meta_delete, meta_toggle,
    config_get,
)
from core.calc import build_snaps

st.set_page_config(page_title="Acompanhamento · SimFin", page_icon="📅", layout="wide")
if not require_auth():
    st.stop()

uid = current_user().id

with st.sidebar:
    st.caption(f"👤 {current_user().email}")
    if st.button("Sair", use_container_width=True):
        logout()

st.title("📅 Acompanhamento & Metas")

R = lambda v: f"R$ {v:,.2f}"

# ── Carregar dados ────────────────────────────────────────────────────
@st.cache_data(ttl=30, show_spinner=False)
def load_data(uid):
    return acomp_list(uid), metas_list(uid), config_get(uid)

registros, metas, cfg = load_data(uid)

# ══════════════════════════════════════════════════════════════════════
# SEÇÃO 1 — Registrar mês
# ══════════════════════════════════════════════════════════════════════
st.subheader("📝 Registrar Mês")

with st.form("form_acomp"):
    fa1, fa2, fa3, fa4 = st.columns(4)
    mes_sel = fa1.text_input("Mês (YYYY-MM)", value=date.today().strftime("%Y-%m"))
    pat_val = fa2.number_input("Patrimônio (R$)", 0.0, 50_000_000.0, 0.0, 1000.0)
    aporte_val = fa3.number_input("Aporte do mês (R$)", 0.0, 500_000.0, 0.0, 100.0)
    retirada_val = fa4.number_input("Retirada do mês (R$)", 0.0, 500_000.0, 0.0, 100.0)
    motivo = st.text_input("Motivo da retirada (opcional)")
    submitted = st.form_submit_button("Salvar", type="primary")
    if submitted:
        try:
            datetime.strptime(mes_sel, "%Y-%m")
            acomp_upsert(uid, {
                "mes": mes_sel,
                "patrimonio": pat_val,
                "aporte": aporte_val,
                "retirada": retirada_val,
                "retirada_motivo": motivo or None,
            })
            st.cache_data.clear()
            st.success(f"Mês {mes_sel} salvo!")
            st.rerun()
        except ValueError:
            st.error("Formato de mês inválido. Use YYYY-MM.")

st.divider()

if not registros:
    st.info("Nenhum registro ainda. Adicione o primeiro mês acima.")
    st.stop()

# ══════════════════════════════════════════════════════════════════════
# SEÇÃO 2 — Evolução patrimonial real vs. simulado
# ══════════════════════════════════════════════════════════════════════
st.subheader("📈 Evolução Patrimonial")

df = pd.DataFrame(registros).sort_values("mes")
df["patrimonio"] = pd.to_numeric(df["patrimonio"], errors="coerce").fillna(0)
df["aporte"]     = pd.to_numeric(df["aporte"],     errors="coerce").fillna(0)

# KPIs
ultimo = df.iloc[-1]
penult = df.iloc[-2] if len(df) > 1 else None
delta_pat = ultimo["patrimonio"] - penult["patrimonio"] if penult is not None else 0.0
total_aportado = df["aporte"].sum()

k1, k2, k3, k4 = st.columns(4)
k1.metric("💰 Patrimônio Atual",   R(ultimo["patrimonio"]),
          delta=f"{R(delta_pat)} vs mês anterior" if penult is not None else None)
k2.metric("📥 Total Aportado",     R(total_aportado))
k3.metric("📅 Último Registro",    ultimo["mes"])
k4.metric("📊 Meses Registrados",  str(len(df)))

# Projeção simulada — usa config do usuário ou defaults
anos_sim  = cfg.get("anos_proj", 20)
taxa_sim  = cfg.get("taxa_aa",   10.0)
aporte_sim = df["aporte"].tail(3).mean() if len(df) >= 3 else df["aporte"].mean()
pat_ini   = df.iloc[0]["patrimonio"]
snaps     = build_snaps(anos_sim, taxa_sim, float(aporte_sim), 0.0, float(pat_ini))

# Gera série mensal de projeção a partir do primeiro mês registrado
primeiro_mes = df.iloc[0]["mes"]
try:
    start_date = datetime.strptime(primeiro_mes, "%Y-%m")
except ValueError:
    start_date = datetime.now()

proj_meses, proj_vals = [], []
for i, snap in enumerate(snaps):
    for m in range(12):
        total_meses = i * 12 + m
        mes_dt = pd.Timestamp(start_date) + pd.DateOffset(months=total_meses)
        proj_meses.append(mes_dt.strftime("%Y-%m"))
        # Interpola dentro do ano
        if i > 0:
            prev = snaps[i-1].pat
        else:
            prev = float(pat_ini)
        frac = m / 12
        val  = prev + (snap.pat - prev) * frac
        proj_vals.append(val)

fig = go.Figure()
fig.add_trace(go.Scatter(
    x=proj_meses, y=proj_vals, name=f"Projeção ({taxa_sim}% a.a.)",
    mode="lines", line=dict(color="rgba(139,148,158,0.5)", dash="dot"),
))
fig.add_trace(go.Scatter(
    x=df["mes"].tolist(), y=df["patrimonio"].tolist(), name="Real",
    mode="lines+markers",
    line=dict(color="#58a6ff", width=2.5),
    marker=dict(size=7, color="#58a6ff"),
    hovertemplate="<b>%{x}</b><br>R$ %{y:,.2f}<extra></extra>",
))
fig.update_layout(
    paper_bgcolor="#161b22", plot_bgcolor="#0d1117",
    font=dict(color="#c9d1d9"),
    xaxis=dict(gridcolor="#21262d", title="Mês"),
    yaxis=dict(gridcolor="#21262d", tickprefix="R$ ", tickformat=",.0f"),
    legend=dict(bgcolor="#161b22", bordercolor="#30363d", borderwidth=1),
    hovermode="x unified", height=360,
    margin=dict(l=10, r=10, t=20, b=10),
)
st.plotly_chart(fig, use_container_width=True)

# Tabela de histórico + delete
with st.expander("📋 Ver / remover registros"):
    for reg in sorted(registros, key=lambda x: x["mes"], reverse=True):
        c1, c2, c3, c4, c5 = st.columns([2, 2, 2, 2, 1])
        c1.write(f"**{reg['mes']}**")
        c2.write(R(reg.get("patrimonio", 0)))
        c3.write(f"Aporte: {R(reg.get('aporte', 0))}")
        c4.write(f"Retirada: {R(reg.get('retirada', 0))}")
        if c5.button("🗑️", key=f"del_{reg['mes']}"):
            acomp_delete(uid, reg["mes"])
            st.cache_data.clear()
            st.rerun()

st.divider()

# ══════════════════════════════════════════════════════════════════════
# SEÇÃO 3 — Metas
# ══════════════════════════════════════════════════════════════════════
st.subheader("🎯 Metas Financeiras")

pat_atual = float(df.iloc[-1]["patrimonio"]) if not df.empty else 0.0
aporte_medio = float(df["aporte"].mean()) if not df.empty else 0.0

# Nova meta
with st.expander("➕ Adicionar meta"):
    mg1, mg2, mg3, mg4 = st.columns(4)
    m_nome  = mg1.text_input("Nome da meta", key="m_nome")
    m_valor = mg2.number_input("Valor alvo (R$)", 0.0, 50_000_000.0, 50_000.0, 1000.0, key="m_val")
    m_data  = mg3.date_input("Data alvo", key="m_data")
    m_prio  = mg4.selectbox("Prioridade", ["Alta", "Média", "Baixa"], key="m_prio")
    if st.button("Salvar meta", type="primary"):
        if m_nome and m_valor > 0:
            meta_insert(uid, {
                "nome": m_nome,
                "valor_alvo": m_valor,
                "data_alvo": str(m_data),
                "prioridade": m_prio,
                "atingida": False,
            })
            st.cache_data.clear()
            st.success("Meta criada!")
            st.rerun()
        else:
            st.error("Preencha o nome e o valor.")

if not metas:
    st.info("Nenhuma meta cadastrada.")
else:
    col_metas = st.columns(min(len(metas), 3))
    for i, meta in enumerate(metas):
        col = col_metas[i % 3]
        valor_alvo = float(meta.get("valor_alvo", 0))
        data_alvo  = meta.get("data_alvo", "")
        atingida   = meta.get("atingida", False)

        # Calcula prazo em meses e viabilidade
        meses_restantes = 0
        try:
            dt_alvo = datetime.strptime(data_alvo, "%Y-%m-%d")
            meses_restantes = max(0, (dt_alvo.year - date.today().year) * 12
                                  + dt_alvo.month - date.today().month)
        except Exception:
            pass

        falta = max(0.0, valor_alvo - pat_atual)
        aporte_nec = (falta / meses_restantes) if meses_restantes > 0 else falta
        viavel = aporte_nec <= aporte_medio if aporte_medio > 0 else False
        progresso = min(100.0, (pat_atual / valor_alvo * 100)) if valor_alvo > 0 else 0.0

        status_icon = "✅" if atingida else ("🟢" if viavel else "🟡")
        prio_color  = {"Alta": "#f85149", "Média": "#e6b86a", "Baixa": "#3fb950"}.get(
            meta.get("prioridade", "Média"), "#8b949e")

        with col:
            st.markdown(
                f"""<div style="border:1px solid #30363d;border-radius:8px;padding:14px;margin-bottom:12px;background:#161b22">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <b style="color:#c9d1d9;font-size:15px">{status_icon} {meta['nome']}</b>
                  <span style="color:{prio_color};font-size:11px">{meta.get('prioridade','')}</span>
                </div>
                <div style="color:#8b949e;font-size:12px;margin:4px 0">Alvo: {R(valor_alvo)} · {data_alvo}</div>
                <div style="background:#21262d;border-radius:4px;height:6px;margin:8px 0">
                  <div style="background:#58a6ff;width:{progresso:.0f}%;height:6px;border-radius:4px"></div>
                </div>
                <div style="font-size:12px;color:#8b949e">{progresso:.1f}% · Falta {R(falta)}</div>
                <div style="font-size:12px;color:{'#3fb950' if viavel else '#e6b86a'};margin-top:4px">
                  {'✔ Viável' if viavel else '⚠ Requer mais aportes'} · {R(aporte_nec)}/mês necessário
                </div>
                </div>""",
                unsafe_allow_html=True,
            )
            bc1, bc2 = st.columns(2)
            if not atingida:
                if bc1.button("✅ Marcar atingida", key=f"done_{meta['id']}"):
                    meta_toggle(uid, meta["id"], True)
                    st.cache_data.clear()
                    st.rerun()
            else:
                if bc1.button("↩ Reabrir", key=f"reopen_{meta['id']}"):
                    meta_toggle(uid, meta["id"], False)
                    st.cache_data.clear()
                    st.rerun()
            if bc2.button("🗑️ Remover", key=f"mdel_{meta['id']}"):
                meta_delete(uid, meta["id"])
                st.cache_data.clear()
                st.rerun()

"""
Carteira B3 — posições, P&L e evolução patrimonial.
"""
import sys; sys.path.insert(0, ".")
import json
import streamlit as st
import plotly.graph_objects as go
import pandas as pd
from core.auth import require_auth, current_user, logout
from core.db import carteira_get, carteira_upsert
from core.prices import fetch, price_on, latest_price
from core.portfolio import current_positions, build_evolution
from datetime import date

st.set_page_config(page_title="Carteira · SimFin", page_icon="📈", layout="wide")
if not require_auth():
    st.stop()

uid = current_user().id

with st.sidebar:
    st.caption(f"👤 {current_user().email}")
    if st.button("Sair", use_container_width=True):
        logout()

st.title("📈 Carteira B3")

# ── Carregar histórico do Supabase ─────────────────────────────────
@st.cache_data(ttl=60, show_spinner=False)
def load_hist(uid):
    return carteira_get(uid)

hist = load_hist(uid)
negocs: list[dict] = hist.get("negociacoes", []) or []

# ── Import de transações ────────────────────────────────────────────
with st.expander("📂 Importar transações (JSON do SimFin web ou manual)"):
    uploaded = st.file_uploader("portfolio_transactions.json", type="json", key="cart_upload")
    if uploaded:
        raw = json.load(uploaded)
        txns_import = raw.get("transactions", raw) if isinstance(raw, dict) else raw
        # Normaliza para formato interno (ticker, date, operation, quantity, unit_price)
        normalized = []
        for t in txns_import:
            normalized.append({
                "ticker":     t.get("ticker", t.get("ativo", "")),
                "date":       t.get("date",   t.get("data", "")),
                "operation":  t.get("operation", "BUY" if t.get("tipo","").lower().find("venda") < 0 else "SELL"),
                "quantity":   float(t.get("quantity", t.get("qtd", 0))),
                "unit_price": float(t.get("unit_price", t.get("preco", 0))),
            })
        if st.button("Salvar importação", type="primary"):
            carteira_upsert(uid, normalized, hist.get("movimentacoes", []))
            st.cache_data.clear()
            st.success(f"{len(normalized)} transações importadas!")
            st.rerun()

    st.markdown("**Adicionar trade manualmente:**")
    mc1, mc2, mc3, mc4, mc5 = st.columns(5)
    m_ticker = mc1.text_input("Ticker", key="m_tk").upper().strip()
    m_date   = mc2.date_input("Data", value=date.today(), key="m_dt")
    m_op     = mc3.selectbox("Operação", ["BUY", "SELL"], key="m_op")
    m_qty    = mc4.number_input("Quantidade", 0.0, key="m_qty")
    m_price  = mc5.number_input("Preço (R$)", 0.0, key="m_price")
    if st.button("Adicionar trade"):
        if m_ticker and m_qty > 0 and m_price > 0:
            novo = {"ticker": m_ticker, "date": str(m_date),
                    "operation": m_op, "quantity": m_qty, "unit_price": m_price}
            negocs_novo = negocs + [novo]
            carteira_upsert(uid, negocs_novo, hist.get("movimentacoes", []))
            st.cache_data.clear()
            st.success("Trade adicionado!")
            st.rerun()

if not negocs:
    st.info("Nenhuma transação encontrada. Importe um arquivo JSON ou adicione manualmente acima.")
    st.stop()

# ── Busca cotações ──────────────────────────────────────────────────
tickers   = list({t["ticker"] for t in negocs})
start_dt  = min(t["date"] for t in negocs)

with st.spinner("Buscando cotações…"):
    all_prices = {t: fetch(t, start_dt) for t in tickers}

missing = [t for t, df in all_prices.items() if df.empty]
if missing:
    st.warning(f"Sem cotações para: {', '.join(missing)}")

# ── Evolução diária ─────────────────────────────────────────────────
daily = build_evolution(negocs, all_prices)
if daily.empty:
    st.error("Não foi possível calcular a evolução — verifique as cotações.")
    st.stop()

last     = daily.iloc[-1]
invested = last["invested"]
value    = last["value"]
pl       = last["pl"]
pct      = last["pct"]

# ── KPIs ─────────────────────────────────────────────────────────────
k1, k2, k3, k4 = st.columns(4)
k1.metric("💰 Total Investido",  f"R$ {invested:,.2f}")
k2.metric("📊 Valor Atual",      f"R$ {value:,.2f}")
k3.metric("📈 P&L Total",        f"R$ {pl:,.2f}", delta=f"{pct:+.2f}%")
k4.metric("📅 Atualizado",       date.today().strftime("%d/%m/%Y"))

st.divider()

# ── Gráfico + movimentações ─────────────────────────────────────────
col_chart, col_moves = st.columns([3, 1])

with col_chart:
    st.subheader("Evolução Patrimonial")
    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=daily["date"], y=daily["value"], name="Valor",
        mode="lines", line=dict(color="#58a6ff", width=2.5),
        fill="tozeroy", fillcolor="rgba(88,166,255,0.08)",
        hovertemplate="<b>%{x}</b><br>R$ %{y:,.2f}<extra></extra>",
    ))
    fig.add_trace(go.Scatter(
        x=daily["date"], y=daily["invested"], name="Investido",
        mode="lines", line=dict(color="#8b949e", width=1.5, dash="dot"),
    ))
    fig.update_layout(
        paper_bgcolor="#161b22", plot_bgcolor="#0d1117",
        font=dict(color="#c9d1d9"),
        xaxis=dict(gridcolor="#21262d"),
        yaxis=dict(gridcolor="#21262d", tickprefix="R$ ", tickformat=",.0f"),
        legend=dict(bgcolor="#161b22", bordercolor="#30363d", borderwidth=1),
        hovermode="x unified", height=360,
        margin=dict(l=10, r=10, t=20, b=10),
    )
    st.plotly_chart(fig, use_container_width=True)

with col_moves:
    st.subheader("Últimas Movimentações")
    for t in sorted(negocs, key=lambda x: x["date"], reverse=True)[:10]:
        icon  = "🟢" if t["operation"] == "BUY" else "🔴"
        total = t["quantity"] * t["unit_price"]
        st.markdown(
            f"**{icon} {t['ticker']}** `{t['date']}`  \n"
            f"{t['operation']} {t['quantity']:.0f} × R${t['unit_price']:.2f}"
            f" = **R$ {total:,.2f}**"
        )

st.divider()

# ── Posições atuais ──────────────────────────────────────────────────
st.subheader("Posições Atuais")
pos = current_positions(negocs)
rows = []
for tk, p in pos.items():
    pr  = price_on(all_prices.get(tk, pd.DataFrame(columns=["Close"])),
                   date.today().strftime("%Y-%m-%d"))
    cur = p.quantity * pr if pr else 0.0
    pl_p = cur - p.total_cost
    pct_p = (cur / p.total_cost - 1) * 100 if p.total_cost > 0 else 0.0
    rows.append({
        "Ticker":        tk,
        "Qtd":           int(p.quantity),
        "Preço Médio":   p.avg_price,
        "Investido":     p.total_cost,
        "Cotação Atual": pr or 0.0,
        "Valor Atual":   cur,
        "P&L":           pl_p,
        "% Retorno":     pct_p,
    })

pos_df = pd.DataFrame(rows).sort_values("P&L", ascending=False) if rows else pd.DataFrame()

if not pos_df.empty:
    fmt = {
        "Preço Médio":   "R$ {:.2f}",
        "Investido":     "R$ {:,.2f}",
        "Cotação Atual": "R$ {:.2f}",
        "Valor Atual":   "R$ {:,.2f}",
        "P&L":           "R$ {:,.2f}",
        "% Retorno":     "{:+.2f}%",
    }
    styled = (pos_df.style
              .format(fmt)
              .map(lambda v: "color: #3fb950" if v >= 0 else "color: #f85149",
                   subset=["P&L", "% Retorno"]))
    st.dataframe(styled, use_container_width=True, hide_index=True)

# ── Exportar ─────────────────────────────────────────────────────────
st.divider()
ec1, ec2 = st.columns(2)
with ec1:
    st.download_button("📥 Exportar JSON", json.dumps({"transactions": negocs}, indent=2),
                       "portfolio_transactions.json", "application/json")
with ec2:
    st.download_button("📥 Exportar CSV (evolução)", daily.to_csv(index=False),
                       "portfolio_evolution.csv", "text/csv")

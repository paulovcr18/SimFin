"""
Simulador CLT / PJ — projeção patrimonial com cálculos fiscais 2026.
"""
import sys; sys.path.insert(0, ".")
import streamlit as st
import plotly.graph_objects as go
from core.auth import require_auth, current_user, logout
from core.calc import (
    calc_folha_clt, calc_folha_pj, build_snaps,
    FolhaCLT, FolhaPJ,
)

st.set_page_config(page_title="Simulador · SimFin", page_icon="📊", layout="wide")
if not require_auth():
    st.stop()

# ── Sidebar logout ────────────────────────────────────────────────────
with st.sidebar:
    st.caption(f"👤 {current_user().email}")
    if st.button("Sair", use_container_width=True):
        logout()

# ── Helpers ────────────────────────────────────────────────────────────
R = lambda v: f"R$ {v:,.2f}"


def folha_table(f: FolhaCLT | FolhaPJ):
    if isinstance(f, FolhaCLT):
        rows = [
            ("Salário bruto",      f.bruto,  "base"),
            ("(-) INSS",          -f.inss,   "neg"),
            ("(-) IRRF 2026",     -f.irrf,   "neg"),
            ("Líquido mensal",     f.liq,     "pos"),
            ("(+) VR/VA",          f.vr,     "pos"),
            ("Renda operacional",  f.rendaOp,"bold"),
            ("Renda real (diluída)",f.rendaReal,"bold"),
            ("─── Extras anuais ───",0,"sep"),
            ("13° líquido",        f.liq13,   "pos"),
            ("Férias líquidas",    f.liqFer,  "pos"),
            ("PLR líquida",        f.liqPlr,  "pos"),
            ("FGTS (anual)",       f.fgts*12, "info"),
        ]
    else:
        rows = [
            ("Faturamento",        f.fat,         "base"),
            ("(-) Imposto empresa",- f.impostoEmpresa, "neg"),
            (f"Alíquota ({f.regimePJ})", f.aliqImposto*100, "pct"),
            ("Pró-labore",         f.prolabore,   "base"),
            ("(-) INSS pró-labore",-f.inss,        "neg"),
            ("(-) IRRF pró-labore",-f.irrf,        "neg"),
            ("Distribuição lucros", f.distribuicao,"pos"),
            ("Renda operacional",   f.rendaOp,     "bold"),
            ("Renda real (diluída)",f.rendaReal,   "bold"),
        ]

    html = '<table style="width:100%;font-size:13px;border-collapse:collapse">'
    for label, val, kind in rows:
        if kind == "sep":
            html += f'<tr><td colspan="2" style="padding:6px 0;color:#8b949e;font-size:11px">{label}</td></tr>'
            continue
        color = {"neg":"#f85149","pos":"#3fb950","bold":"#58a6ff","info":"#8fa0b0","base":"#c9d1d9","pct":"#e6b86a"}.get(kind,"#c9d1d9")
        fmt_val = f"{val:.1f}%" if kind == "pct" else R(val)
        weight = "700" if kind == "bold" else "400"
        html += (f'<tr style="border-bottom:1px solid #21262d">'
                 f'<td style="padding:5px 4px;color:#8b949e">{label}</td>'
                 f'<td style="padding:5px 4px;text-align:right;color:{color};font-weight:{weight};font-family:monospace">{fmt_val}</td>'
                 f'</tr>')
    html += "</table>"
    st.markdown(html, unsafe_allow_html=True)


# ── Layout ─────────────────────────────────────────────────────────────
st.title("📊 Simulador Financeiro 2026")

# ── Pessoa 1 ──────────────────────────────────────────────────────────
col1, col2, col_proj = st.columns([1, 1, 1.4])

with col1:
    st.subheader("Pessoa 1")
    r1 = st.radio("Regime", ["CLT", "PJ"], key="r1", horizontal=True)

    if r1 == "CLT":
        b1  = st.number_input("Salário bruto (R$)", 0.0, 100_000.0, 5000.0, 500.0, key="b1")
        vr1 = st.number_input("VR/VA mensal (R$)",  0.0,  5_000.0,   500.0,  50.0, key="vr1")
        plr1= st.number_input("PLR anual (R$)",      0.0, 50_000.0,     0.0, 500.0, key="plr1")
        f1  = calc_folha_clt(b1, vr1, plr1)
    else:
        fat1  = st.number_input("Faturamento mensal (R$)", 0.0, 200_000.0, 10_000.0, 500.0, key="fat1")
        ret1  = st.number_input("Retirada total (R$)",     0.0, 100_000.0,  8_000.0, 500.0, key="ret1")
        pl1   = st.number_input("Pró-labore (R$)",         0.0,  20_000.0,  1_500.0, 500.0, key="pl1")
        rpj1  = st.selectbox("Regime PJ", ["simples", "lucro_presumido"], key="rpj1")
        res1  = st.slider("Reserva férias/13° (%)", 0, 30, 0, key="res1")
        f1    = calc_folha_pj(fat1, ret1, pl1, rpj1, res1/100)

    folha_table(f1)

with col2:
    st.subheader("Pessoa 2")
    r2 = st.radio("Regime", ["CLT", "PJ", "Não se aplica"], key="r2", horizontal=True)

    f2 = None
    if r2 == "CLT":
        b2  = st.number_input("Salário bruto (R$)", 0.0, 100_000.0, 4000.0, 500.0, key="b2")
        vr2 = st.number_input("VR/VA mensal (R$)",  0.0,  5_000.0,    400.0,  50.0, key="vr2")
        plr2= st.number_input("PLR anual (R$)",      0.0, 50_000.0,      0.0, 500.0, key="plr2")
        f2  = calc_folha_clt(b2, vr2, plr2)
        folha_table(f2)
    elif r2 == "PJ":
        fat2  = st.number_input("Faturamento mensal (R$)", 0.0, 200_000.0, 8_000.0, 500.0, key="fat2")
        ret2  = st.number_input("Retirada total (R$)",     0.0, 100_000.0, 6_000.0, 500.0, key="ret2")
        pl2   = st.number_input("Pró-labore (R$)",         0.0,  20_000.0, 1_500.0, 500.0, key="pl2")
        rpj2  = st.selectbox("Regime PJ", ["simples", "lucro_presumido"], key="rpj2")
        res2  = st.slider("Reserva férias/13° (%)", 0, 30, 0, key="res2")
        f2    = calc_folha_pj(fat2, ret2, pl2, rpj2, res2/100)
        folha_table(f2)

# ── Renda combinada ─────────────────────────────────────────────────
renda_op   = f1.rendaOp   + (f2.rendaOp   if f2 else 0)
renda_real = f1.rendaReal + (f2.rendaReal if f2 else 0)

st.divider()

# ── Parâmetros de projeção ──────────────────────────────────────────
st.subheader("⚙️ Projeção Patrimonial")
pc1, pc2, pc3, pc4, pc5 = st.columns(5)
with pc1: pct_inv  = st.slider("% Investimento", 0, 60, 20)
with pc2: taxa_aa  = st.slider("Retorno a.a. (%)", 1.0, 20.0, 10.0, 0.5)
with pc3: anos     = st.slider("Horizonte (anos)", 1, 40, 20)
with pc4: reajuste = st.slider("Reajuste aporte (%/ano)", 0.0, 10.0, 0.0, 0.5)
with pc5: pat_ini  = st.number_input("Patrimônio inicial (R$)", 0.0, 10_000_000.0, 0.0, 1000.0)

aporte = renda_op * pct_inv / 100
snaps  = build_snaps(anos, taxa_aa, aporte, reajuste, pat_ini)

# ── KPIs ─────────────────────────────────────────────────────────────
k1, k2, k3, k4 = st.columns(4)
pat_final  = snaps[-1].pat
rend_final = pat_final * ((1 + taxa_aa/100)**(1/12) - 1)
gasto_mes  = renda_op * (1 - pct_inv/100)
lib_pct    = min((rend_final / gasto_mes) * 100, 200) if gasto_mes > 0 else 0

k1.metric("💰 Renda operacional",   R(renda_op),  f"Diluída: {R(renda_real)}")
k2.metric("📥 Aporte mensal",       R(aporte),    f"{pct_inv}% da renda")
k3.metric(f"📈 Patrimônio em {anos} anos", R(pat_final))
k4.metric("🎯 Liberdade financeira", f"{lib_pct:.1f}%",
          delta="✅ Atingida!" if lib_pct >= 100 else f"{R(gasto_mes)}/mês de gastos")

# ── Gráfico ─────────────────────────────────────────────────────────
labels  = [s.ano for s in snaps]
vals    = [s.pat for s in snaps]
pess    = [s.pat_pess for s in snaps]
otim    = [s.pat_otim for s in snaps]
aportes = [sum(s.aporte for s in snaps[:i+1]) for i in range(len(snaps))]

fig = go.Figure()
fig.add_trace(go.Scatter(x=labels, y=otim,    name="Otimista (+2%)",
    line=dict(color="rgba(93,212,160,0.3)", dash="dot"), fill=None))
fig.add_trace(go.Scatter(x=labels, y=pess,    name="Pessimista (-2%)",
    line=dict(color="rgba(248,81,73,0.3)",  dash="dot"), fill="tonexty",
    fillcolor="rgba(88,166,255,0.05)"))
fig.add_trace(go.Scatter(x=labels, y=vals,    name="Base",
    line=dict(color="#58a6ff", width=3),
    hovertemplate="Ano %{x}: <b>%{y:,.0f}</b><extra></extra>"))
fig.add_trace(go.Scatter(x=labels, y=aportes, name="Total aportado",
    line=dict(color="#8b949e", dash="dot")))

fig.update_layout(
    paper_bgcolor="#161b22", plot_bgcolor="#0d1117",
    font=dict(color="#c9d1d9"),
    xaxis=dict(title="Ano", gridcolor="#21262d"),
    yaxis=dict(title="Patrimônio (R$)", gridcolor="#21262d", tickformat=",.0f"),
    legend=dict(bgcolor="#161b22", bordercolor="#30363d", borderwidth=1),
    hovermode="x unified", height=380,
    margin=dict(l=10, r=10, t=20, b=10),
)
st.plotly_chart(fig, use_container_width=True)

# ── Milestones ────────────────────────────────────────────────────────
marcos = [100_000, 250_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000]
mcs = []
for m in marcos:
    hit = next((s.ano for s in snaps if s.pat >= m), None)
    mcs.append({"Marco": R(m), "Ano": f"Ano {hit}" if hit else "Não atingido"})

st.subheader("🏁 Milestones")
import pandas as pd
st.dataframe(pd.DataFrame(mcs), use_container_width=True, hide_index=True)

#!/usr/bin/env python3
"""
Portfolio Tracker — Evolução Patrimonial com cotações reais
Exporta do SimFin web → roda aqui → dashboard Streamlit

Uso:
    streamlit run portfolio_tracker.py

Cotações: brapi.dev (B3) | SimFin API (US)
Configuração: arquivo .env com SIMFIN_API_KEY (opcional para ações BR)
"""

import json
import os
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd
import plotly.graph_objects as go
import requests
import streamlit as st
from dotenv import load_dotenv

load_dotenv()

# ── Configuração ────────────────────────────────────────────────────
CACHE_DIR   = Path.home() / 'simfin_data'
BRAPI_BASE  = 'https://brapi.dev/api'
TRACKER_DIR = Path(__file__).parent


# ═══ DETECÇÃO DE MERCADO ════════════════════════════════════════════

def is_b3(ticker: str) -> bool:
    """Tickers B3 terminam em dígito: PETR4, VALE3, ITUB4, BOVA11..."""
    t = ticker.upper().rstrip()
    return bool(t) and t[-1].isdigit()


# ═══ FETCH DE COTAÇÕES ══════════════════════════════════════════════

def _cache_path(ticker: str, source: str) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR / f"{ticker}_{source}.parquet"


def _cache_valid(path: Path, max_age_h: int = 4) -> bool:
    if not path.exists():
        return False
    age = datetime.now().timestamp() - path.stat().st_mtime
    return age < max_age_h * 3600


def fetch_brapi(ticker: str) -> pd.DataFrame:
    """Cotações históricas via brapi.dev (B3). Retorna df com index=date, col=Close."""
    cache = _cache_path(ticker, 'brapi')
    if _cache_valid(cache):
        return pd.read_parquet(cache)

    url = f"{BRAPI_BASE}/quote/{ticker}?range=5y&interval=1d&fundamental=false"
    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        results = r.json().get('results', [])
        if not results or 'historicalDataPrice' not in results[0]:
            return pd.DataFrame(columns=['Close'])

        hist = results[0]['historicalDataPrice']
        df = pd.DataFrame(hist)[['date', 'close']].copy()
        df['date'] = pd.to_datetime(df['date'], unit='s').dt.strftime('%Y-%m-%d')
        df = df.rename(columns={'close': 'Close'}).set_index('date').sort_index()
        df = df[df['Close'].notna() & (df['Close'] > 0)]
        df.to_parquet(cache)
        return df
    except Exception as e:
        st.warning(f"brapi.dev [{ticker}]: {e}")
        return pd.DataFrame(columns=['Close'])


def fetch_simfin(ticker: str, api_key: str) -> pd.DataFrame:
    """Cotações via SimFin API (ações US). Requer simfin instalado."""
    if not api_key:
        return pd.DataFrame(columns=['Close'])
    cache = _cache_path(ticker, 'simfin')
    if _cache_valid(cache, max_age_h=24):
        return pd.read_parquet(cache)
    try:
        import simfin as sf
        sf.set_api_key(api_key)
        sf.set_data_dir(str(CACHE_DIR))
        prices = sf.load_shareprices(market='US', variant='daily', refresh_days=1)
        tickers_avail = prices.index.get_level_values('Ticker').unique()
        if ticker not in tickers_avail:
            return pd.DataFrame(columns=['Close'])
        df = prices.loc[ticker][['Close']].copy()
        df.index = pd.to_datetime(df.index).strftime('%Y-%m-%d')
        df = df.sort_index()
        df.to_parquet(cache)
        return df
    except Exception as e:
        st.warning(f"SimFin [{ticker}]: {e}")
        return pd.DataFrame(columns=['Close'])


def fetch_prices(ticker: str, api_key: str = '') -> pd.DataFrame:
    """Roteador: brapi.dev para B3, SimFin para US, brapi como fallback."""
    if is_b3(ticker):
        df = fetch_brapi(ticker)
        return df if not df.empty else pd.DataFrame(columns=['Close'])
    df = fetch_simfin(ticker, api_key)
    if df.empty:
        df = fetch_brapi(ticker)  # fallback
    return df


def get_price_on(prices: pd.DataFrame, target_date: str) -> float | None:
    """Último preço disponível até target_date (forward-fill fins de semana/feriados)."""
    if prices.empty:
        return None
    avail = prices[prices.index <= target_date]
    return float(avail.iloc[-1]['Close']) if not avail.empty else None


# ═══ CÁLCULOS DE PORTFOLIO ══════════════════════════════════════════

def load_transactions(path: Path) -> pd.DataFrame:
    with open(path, encoding='utf-8') as f:
        raw = json.load(f)
    txns = raw.get('transactions', raw) if isinstance(raw, dict) else raw
    df = pd.DataFrame(txns)
    df['date']      = pd.to_datetime(df['date']).dt.strftime('%Y-%m-%d')
    df['operation'] = df['operation'].str.upper().str.strip()
    df['quantity']  = df['quantity'].astype(float)
    df['unit_price']= df['unit_price'].astype(float)
    return df.sort_values('date').reset_index(drop=True)


def current_positions(txns: pd.DataFrame) -> dict:
    """Calcula saldo atual: {ticker: {quantity, total_cost, avg_price}}"""
    pos = {}
    for _, r in txns.iterrows():
        t = r['ticker']
        if t not in pos:
            pos[t] = {'quantity': 0.0, 'total_cost': 0.0}
        if r['operation'] == 'BUY':
            pos[t]['quantity']   += r['quantity']
            pos[t]['total_cost'] += r['quantity'] * r['unit_price']
        elif r['operation'] == 'SELL':
            if pos[t]['quantity'] > 0:
                avg = pos[t]['total_cost'] / pos[t]['quantity']
                pos[t]['total_cost'] -= avg * r['quantity']
            pos[t]['quantity'] -= r['quantity']
    # Remove posições zeradas
    pos = {t: p for t, p in pos.items() if p['quantity'] > 1e-6}
    for p in pos.values():
        p['avg_price'] = p['total_cost'] / p['quantity'] if p['quantity'] > 0 else 0
    return pos


def build_daily_evolution(txns: pd.DataFrame, all_prices: dict) -> pd.DataFrame:
    """
    Reconstrói dia a dia o valor do portfolio desde a 1ª transação até hoje.
    Usa forward-fill para datas sem cotação (fins de semana/feriados).
    """
    start = txns['date'].min()
    end   = date.today().strftime('%Y-%m-%d')
    dates = pd.date_range(start, end, freq='D').strftime('%Y-%m-%d').tolist()

    running = {}   # {ticker: {quantity, total_cost}}
    cost_acc = 0.0
    txn_ptr  = 0
    sorted_txns = txns.reset_index(drop=True)
    records = []

    for d in dates:
        # Aplica transações deste dia
        while txn_ptr < len(sorted_txns) and sorted_txns.at[txn_ptr, 'date'] <= d:
            r = sorted_txns.iloc[txn_ptr]
            t = r['ticker']
            if t not in running:
                running[t] = {'quantity': 0.0, 'total_cost': 0.0}
            if r['operation'] == 'BUY':
                running[t]['quantity']   += r['quantity']
                running[t]['total_cost'] += r['quantity'] * r['unit_price']
                cost_acc += r['quantity'] * r['unit_price']
            elif r['operation'] == 'SELL':
                if running[t]['quantity'] > 0:
                    avg = running[t]['total_cost'] / running[t]['quantity']
                    cost_acc -= avg * r['quantity']
                    running[t]['total_cost'] -= avg * r['quantity']
                running[t]['quantity'] -= r['quantity']
            txn_ptr += 1

        # Calcula valor total do dia
        total = 0.0
        has_any = False
        for t, pos in running.items():
            if pos['quantity'] < 1e-6:
                continue
            p = get_price_on(all_prices.get(t, pd.DataFrame(columns=['Close'])), d)
            if p is not None:
                total += pos['quantity'] * p
                has_any = True

        if has_any:
            invested = max(cost_acc, 0.0)
            pl       = total - invested
            pct      = (total / invested - 1) * 100 if invested > 0 else 0.0
            records.append({'date': d, 'value': round(total, 2),
                            'invested': round(invested, 2),
                            'pl': round(pl, 2), 'pct': round(pct, 2)})

    return pd.DataFrame(records)


# ═══ DASHBOARD STREAMLIT ════════════════════════════════════════════

def run():
    st.set_page_config(
        page_title='Portfolio Tracker · SimFin',
        page_icon='📈',
        layout='wide',
    )

    # ── Sidebar ──
    with st.sidebar:
        st.title('⚙️ Configuração')
        api_key = st.text_input(
            'SimFin API Key (ações US)',
            value=os.environ.get('SIMFIN_API_KEY', ''),
            type='password',
            help='Obtenha em simfin.com/user/account. Necessário apenas para ações US.',
        )

        st.markdown('---')
        st.markdown('**📂 Transações**')
        default_json = TRACKER_DIR / 'portfolio_transactions.json'
        uploaded = st.file_uploader('Carregar portfolio_transactions.json', type='json')

        if uploaded:
            raw = json.load(uploaded)
            txns_path = TRACKER_DIR / '_uploaded.json'
            txns_path.write_text(json.dumps(raw))
        elif default_json.exists():
            txns_path = default_json
        else:
            st.info('Exporte as transações pelo botão **"📥 Exportar para Tracker"** na aba Carteira do SimFin.')
            st.stop()

        st.markdown('---')
        st.caption('Cotações B3 via **brapi.dev** · US via **SimFin API** · cache 4h')

    # ── Carrega transações ──
    try:
        txns = load_transactions(txns_path)
    except Exception as e:
        st.error(f'Erro ao carregar transações: {e}')
        st.stop()

    tickers   = txns['ticker'].unique().tolist()
    start_dt  = txns['date'].min()
    end_dt    = date.today().strftime('%Y-%m-%d')

    # ── Busca cotações ──
    with st.spinner(f'Buscando cotações para {", ".join(tickers)}…'):
        all_prices = {t: fetch_prices(t, api_key) for t in tickers}

    missing = [t for t, df in all_prices.items() if df.empty]
    if missing:
        st.warning(f'Sem cotações para: {", ".join(missing)}')

    # ── Evolução diária ──
    daily = build_daily_evolution(txns, all_prices)
    if daily.empty:
        st.error('Não foi possível calcular a evolução — verifique se as cotações estão disponíveis.')
        st.stop()

    last       = daily.iloc[-1]
    invested   = last['invested']
    value      = last['value']
    pl         = last['pl']
    pct        = last['pct']

    # ── KPI Cards ──
    st.markdown('## 📈 Portfolio Tracker')
    c1, c2, c3, c4 = st.columns(4)
    c1.metric('💰 Total Investido',  f'R$ {invested:,.2f}')
    c2.metric('📊 Valor Atual',      f'R$ {value:,.2f}')
    c3.metric('📈 P&L Total',        f'R$ {pl:,.2f}',  delta=f'{pct:+.2f}%')
    c4.metric('🎯 Retorno',          f'{pct:+.2f}%')

    st.divider()

    # ── Gráfico principal + movimentações ──
    col_chart, col_moves = st.columns([3, 1])

    with col_chart:
        st.subheader('Evolução Patrimonial')
        fig = go.Figure()
        fig.add_trace(go.Scatter(
            x=daily['date'], y=daily['value'],
            name='Valor', mode='lines',
            line=dict(color='#58a6ff', width=2.5),
            fill='tozeroy', fillcolor='rgba(88,166,255,0.08)',
            hovertemplate='<b>%{x}</b><br>Valor: R$ %{y:,.2f}<extra></extra>',
        ))
        fig.add_trace(go.Scatter(
            x=daily['date'], y=daily['invested'],
            name='Investido', mode='lines',
            line=dict(color='#8b949e', width=1.5, dash='dot'),
            hovertemplate='<b>%{x}</b><br>Investido: R$ %{y:,.2f}<extra></extra>',
        ))
        fig.update_layout(
            paper_bgcolor='#161b22', plot_bgcolor='#0d1117',
            font=dict(color='#c9d1d9', size=12),
            xaxis=dict(gridcolor='#21262d', showgrid=True, title=''),
            yaxis=dict(gridcolor='#21262d', showgrid=True,
                       tickprefix='R$ ', tickformat=',.0f', title=''),
            legend=dict(bgcolor='#161b22', bordercolor='#30363d', borderwidth=1),
            hovermode='x unified', height=380,
            margin=dict(l=10, r=10, t=20, b=10),
        )
        st.plotly_chart(fig, use_container_width=True)

    with col_moves:
        st.subheader('Últimas Movimentações')
        for _, r in txns.sort_values('date', ascending=False).head(10).iterrows():
            icon  = '🟢' if r['operation'] == 'BUY' else '🔴'
            total = r['quantity'] * r['unit_price']
            st.markdown(
                f"**{icon} {r['ticker']}** `{r['date']}`  \n"
                f"{r['operation']} {r['quantity']:.0f} × R$ {r['unit_price']:.2f}"
                f" = **R$ {total:,.2f}**"
            )

    st.divider()

    # ── Tabela de posições ──
    st.subheader('Posições Atuais')
    pos = current_positions(txns)
    rows = []
    for ticker, p in pos.items():
        price_now = get_price_on(all_prices.get(ticker, pd.DataFrame(columns=['Close'])),
                                 end_dt)
        cur_val   = p['quantity'] * price_now if price_now else 0.0
        pl_pos    = cur_val - p['total_cost']
        pct_pos   = (cur_val / p['total_cost'] - 1) * 100 if p['total_cost'] > 0 else 0.0
        rows.append({
            'Ticker':        ticker,
            'Qtd':           int(p['quantity']),
            'Preço Médio':   p['avg_price'],
            'Investido':     p['total_cost'],
            'Cotação Atual': price_now or 0.0,
            'Valor Atual':   cur_val,
            'P&L':           pl_pos,
            '% Retorno':     pct_pos,
        })

    pos_df = pd.DataFrame(rows).sort_values('P&L', ascending=False)

    def color_pl(val):
        return 'color: #3fb950' if val >= 0 else 'color: #f85149'

    fmt = {
        'Preço Médio':   'R$ {:.2f}',
        'Investido':     'R$ {:,.2f}',
        'Cotação Atual': 'R$ {:.2f}',
        'Valor Atual':   'R$ {:,.2f}',
        'P&L':           'R$ {:,.2f}',
        '% Retorno':     '{:+.2f}%',
    }
    styled = pos_df.style.format(fmt).applymap(color_pl, subset=['P&L', '% Retorno'])
    st.dataframe(styled, use_container_width=True, hide_index=True)

    st.divider()

    # ── Exports ──
    summary = {
        'portfolio_summary': {
            'total_invested':    round(invested, 2),
            'current_value':     round(value, 2),
            'total_pl':          round(pl, 2),
            'total_return_pct':  round(pct, 2),
            'last_updated':      datetime.now().isoformat(timespec='seconds'),
        },
        'positions': [
            {k: (round(v, 4) if isinstance(v, float) else v) for k, v in r.items()}
            for r in pos_df.to_dict('records')
        ],
        'daily_evolution': daily.to_dict('records'),
    }

    ec1, ec2 = st.columns(2)
    with ec1:
        st.download_button(
            '📥 Exportar JSON',
            json.dumps(summary, indent=2, ensure_ascii=False),
            'portfolio_summary.json', 'application/json',
        )
    with ec2:
        st.download_button(
            '📥 Exportar CSV (Evolução)',
            daily.to_csv(index=False),
            'portfolio_evolution.csv', 'text/csv',
        )


if __name__ == '__main__':
    run()

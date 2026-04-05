"""
Cotações via yfinance. Cache local 4h em ~/simfin_data/.
B3: PETR4 → PETR4.SA  |  US: ticker direto
"""
from __future__ import annotations
from datetime import date, datetime
from pathlib import Path
import pandas as pd
import yfinance as yf
import streamlit as st

CACHE_DIR = Path.home() / "simfin_data"


def _b3(ticker: str) -> bool:
    return ticker.upper().strip()[-1:].isdigit()


def _yf_sym(ticker: str) -> str:
    return f"{ticker}.SA" if _b3(ticker) else ticker


def _cache(ticker: str) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR / f"{ticker}_yf.parquet"


def _fresh(path: Path, max_h: int = 4) -> bool:
    return path.exists() and (datetime.now().timestamp() - path.stat().st_mtime) < max_h * 3600


def fetch(ticker: str, start: str) -> pd.DataFrame:
    """Retorna DataFrame com index=date str, col='Close'. Vazio se indisponível."""
    c = _cache(ticker)
    if _fresh(c):
        df = pd.read_parquet(c)
        if not df.empty and df.index.max() >= date.today().strftime("%Y-%m-%d"):
            return df

    try:
        raw = yf.download(_yf_sym(ticker), start=start, auto_adjust=True, progress=False)
        if raw.empty:
            return pd.DataFrame(columns=["Close"])
        if isinstance(raw.columns, pd.MultiIndex):
            raw.columns = raw.columns.get_level_values(0)
        df = raw[["Close"]].copy()
        df["Close"] = pd.to_numeric(df["Close"], errors="coerce")
        df.index = pd.to_datetime(df.index).strftime("%Y-%m-%d")
        df = df.sort_index().dropna()
        df = df[df["Close"] > 0]
        df.to_parquet(c)
        return df
    except Exception as e:
        st.warning(f"yfinance [{ticker}]: {e}")
        return pd.DataFrame(columns=["Close"])


def price_on(df: pd.DataFrame, target: str) -> float | None:
    """Último preço disponível até target (forward-fill feriados/fins de semana)."""
    if df.empty:
        return None
    avail = df[df.index <= target]
    if avail.empty:
        return None
    val = avail.iloc[-1]["Close"]
    if isinstance(val, pd.Series):
        val = val.iloc[0]
    return float(val)


def latest_price(ticker: str) -> float | None:
    """Cotação mais recente do ticker."""
    df = fetch(ticker, start="2020-01-01")
    return price_on(df, date.today().strftime("%Y-%m-%d"))

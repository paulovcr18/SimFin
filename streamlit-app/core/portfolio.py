"""
Cálculos de portfolio: posições, P&L, evolução diária.
"""
from __future__ import annotations
from datetime import date
from dataclasses import dataclass
import pandas as pd
from core.prices import fetch, price_on


@dataclass
class Position:
    ticker: str
    quantity: float
    total_cost: float

    @property
    def avg_price(self) -> float:
        return self.total_cost / self.quantity if self.quantity > 0 else 0.0


def current_positions(transactions: list[dict]) -> dict[str, Position]:
    """Calcula posições atuais a partir do histórico de transações."""
    pos: dict[str, Position] = {}
    for t in sorted(transactions, key=lambda x: x["date"]):
        tk  = t["ticker"]
        qty = float(t["quantity"])
        prc = float(t["unit_price"])
        op  = t["operation"].upper()
        if tk not in pos:
            pos[tk] = Position(tk, 0.0, 0.0)
        p = pos[tk]
        if op == "BUY":
            p.total_cost += qty * prc
            p.quantity   += qty
        elif op == "SELL":
            if p.quantity > 0:
                avg = p.total_cost / p.quantity
                p.total_cost -= avg * qty
            p.quantity -= qty
    return {t: p for t, p in pos.items() if p.quantity > 1e-6}


def build_evolution(transactions: list[dict], all_prices: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """DataFrame dia a dia: date, value, invested, pl, pct."""
    if not transactions:
        return pd.DataFrame(columns=["date", "value", "invested", "pl", "pct"])

    sorted_txns = sorted(transactions, key=lambda x: x["date"])
    start  = sorted_txns[0]["date"]
    end    = date.today().strftime("%Y-%m-%d")
    dates  = pd.date_range(start, end, freq="D").strftime("%Y-%m-%d").tolist()

    running: dict[str, Position] = {}
    cost_acc = 0.0
    ptr = 0
    records = []

    for d in dates:
        # Aplica transações do dia
        while ptr < len(sorted_txns) and sorted_txns[ptr]["date"] <= d:
            t   = sorted_txns[ptr]
            tk  = t["ticker"]
            qty = float(t["quantity"])
            prc = float(t["unit_price"])
            op  = t["operation"].upper()
            if tk not in running:
                running[tk] = Position(tk, 0.0, 0.0)
            p = running[tk]
            if op == "BUY":
                p.quantity   += qty
                p.total_cost += qty * prc
                cost_acc     += qty * prc
            elif op == "SELL":
                if p.quantity > 0:
                    avg = p.total_cost / p.quantity
                    cost_acc     -= avg * qty
                    p.total_cost -= avg * qty
                p.quantity -= qty
            ptr += 1

        # Calcula valor total do dia
        total, has_price = 0.0, False
        for tk, p in running.items():
            if p.quantity < 1e-6:
                continue
            pr = price_on(all_prices.get(tk, pd.DataFrame(columns=["Close"])), d)
            if pr is not None:
                total    += p.quantity * pr
                has_price = True

        if has_price:
            invested = max(cost_acc, 0.0)
            pl       = total - invested
            pct      = (total / invested - 1) * 100 if invested > 0 else 0.0
            records.append({"date": d, "value": round(total, 2),
                            "invested": round(invested, 2),
                            "pl": round(pl, 2), "pct": round(pct, 2)})

    return pd.DataFrame(records)

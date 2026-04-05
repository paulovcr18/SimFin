"""
Operações CRUD no Supabase.
Todas as funções recebem user_id e operam com RLS habilitado.
"""
from __future__ import annotations
from typing import Any
import streamlit as st
from core.auth import get_client


def _sb():
    return get_client()


# ── Acompanhamento ────────────────────────────────────────────────────

def acomp_list(user_id: str) -> list[dict]:
    res = _sb().table("acompanhamento").select("*").eq("user_id", user_id).order("mes").execute()
    return res.data or []


def acomp_upsert(user_id: str, row: dict) -> None:
    """row deve conter: mes, patrimonio, aporte, retirada (opt), retirada_motivo (opt)."""
    _sb().table("acompanhamento").upsert({**row, "user_id": user_id}, on_conflict="user_id,mes").execute()


def acomp_delete(user_id: str, mes: str) -> None:
    _sb().table("acompanhamento").delete().eq("user_id", user_id).eq("mes", mes).execute()


# ── Metas ─────────────────────────────────────────────────────────────

def metas_list(user_id: str) -> list[dict]:
    res = _sb().table("metas").select("*").eq("user_id", user_id).order("data_alvo").execute()
    return res.data or []


def meta_insert(user_id: str, meta: dict) -> None:
    import time
    _sb().table("metas").insert({**meta, "user_id": user_id, "id": int(time.time() * 1000)}).execute()


def meta_delete(user_id: str, meta_id: int) -> None:
    _sb().table("metas").delete().eq("user_id", user_id).eq("id", meta_id).execute()


def meta_toggle(user_id: str, meta_id: int, atingida: bool) -> None:
    _sb().table("metas").update({"atingida": atingida}).eq("user_id", user_id).eq("id", meta_id).execute()


# ── Carteira (histórico de negociações) ───────────────────────────────

def carteira_get(user_id: str) -> dict:
    res = _sb().table("carteira_historico").select("*").eq("user_id", user_id).execute()
    if res.data:
        return res.data[0]
    return {"negociacoes": [], "movimentacoes": []}


def carteira_upsert(user_id: str, negociacoes: list, movimentacoes: list) -> None:
    _sb().table("carteira_historico").upsert({
        "user_id": user_id,
        "negociacoes": negociacoes,
        "movimentacoes": movimentacoes,
    }, on_conflict="user_id").execute()


# ── User config ───────────────────────────────────────────────────────

def config_get(user_id: str) -> dict:
    res = _sb().table("user_config").select("*").eq("user_id", user_id).execute()
    return res.data[0] if res.data else {}


def config_upsert(user_id: str, data: dict) -> None:
    _sb().table("user_config").upsert({**data, "user_id": user_id}, on_conflict="user_id").execute()

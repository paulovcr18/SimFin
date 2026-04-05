"""
Cálculos fiscais brasileiros 2026.
Portado de js/payroll.js e js/projection.js.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Literal
import math

# ── INSS 2026 (Portaria Interministerial MPS/MF nº 13/2026) ─────────
_INSS_FAIXAS = [
    (1621.00, 0.075),
    (2902.84, 0.090),
    (4354.27, 0.120),
    (8475.55, 0.140),
]

# ── IRRF 2026 (tabela inalterada desde 2015) ─────────────────────────
_IRRF_FAIXAS = [
    (2428.80,  0.000,    0.00),
    (2826.65,  0.075,  182.16),
    (3751.05,  0.150,  394.16),
    (4664.68,  0.225,  675.49),
    (math.inf, 0.275,  908.73),
]


def calc_inss(bruto: float) -> float:
    """INSS progressivo por faixas (EC 103/2019)."""
    total, prev = 0.0, 0.0
    for limite, aliq in _INSS_FAIXAS:
        if bruto <= prev:
            break
        total += (min(bruto, limite) - prev) * aliq
        prev = limite
        if bruto <= limite:
            break
    return total


def calc_irrf(bruto: float, inss: float) -> float:
    """IRRF 2026 com redutor de isenção (Lei 15.270/2025)."""
    base = bruto - inss
    ir = 0.0
    for limite, aliq, deducao in _IRRF_FAIXAS:
        if base <= limite:
            ir = max(0.0, base * aliq - deducao)
            break
    # Redutor de isenção
    if base <= 5000.00:
        redutor = ir
    elif base <= 7350.00:
        redutor = max(0.0, 978.62 - 0.133145 * base)
    else:
        redutor = 0.0
    return max(0.0, ir - redutor)


def calc_irrf_13(bruto: float, inss: float) -> float:
    """IRRF sobre 13° — tabela progressiva SEM redutor (tributação exclusiva)."""
    base = bruto - inss
    for limite, aliq, deducao in _IRRF_FAIXAS:
        if base <= limite:
            return max(0.0, base * aliq - deducao)
    return 0.0


# ── Resultados ────────────────────────────────────────────────────────
@dataclass
class FolhaCLT:
    tipo: str = "CLT"
    bruto: float = 0
    inss: float = 0
    irrf: float = 0
    fgts: float = 0
    liq: float = 0
    inss13: float = 0
    irrf13: float = 0
    liq13: float = 0
    inssFer: float = 0
    irrfFer: float = 0
    liqFer: float = 0
    plr: float = 0
    liqPlr: float = 0
    vr: float = 0
    rendaOp: float = 0
    rendaReal: float = 0
    rendaAnual: float = 0
    extrasAnuais: float = 0


@dataclass
class FolhaPJ:
    tipo: str = "PJ"
    bruto: float = 0        # retirada total
    fat: float = 0
    prolabore: float = 0
    inss: float = 0
    irrf: float = 0
    fgts: float = 0
    distribuicao: float = 0
    impostoEmpresa: float = 0
    aliqImposto: float = 0
    liq: float = 0
    rendaOp: float = 0
    rendaReal: float = 0
    rendaAnual: float = 0
    reservaPct: float = 0
    reservaMensal: float = 0
    regimePJ: str = "simples"


def calc_folha_clt(bruto: float, vr: float = 0, plr: float = 0) -> FolhaCLT:
    inss   = calc_inss(bruto)
    irrf   = calc_irrf(bruto, inss)
    fgts   = bruto * 0.08
    liq    = bruto - inss - irrf

    # 13°
    inss13 = calc_inss(bruto)
    irrf13 = calc_irrf_13(bruto, inss13)
    liq13  = bruto - inss13 - irrf13

    # Férias + 1/3
    inssFer = calc_inss(bruto)
    irrfFer = calc_irrf(bruto + bruto / 3, inssFer)
    liqFer  = (bruto + bruto / 3) - inssFer - irrfFer

    # PLR (15% flat)
    liqPlr = plr * 0.85

    rendaOp    = liq + vr
    rendaAnual = 12 * liq + liq13 + liqFer + 12 * vr + liqPlr
    rendaReal  = rendaAnual / 12
    extras     = liq13 + liqFer + liqPlr

    return FolhaCLT(
        bruto=bruto, inss=inss, irrf=irrf, fgts=fgts, liq=liq,
        inss13=inss13, irrf13=irrf13, liq13=liq13,
        inssFer=inssFer, irrfFer=irrfFer, liqFer=liqFer,
        plr=plr, liqPlr=liqPlr, vr=vr,
        rendaOp=rendaOp, rendaReal=rendaReal,
        rendaAnual=rendaAnual, extrasAnuais=extras,
    )


def calc_folha_pj(
    fat: float,
    retirada: float,
    prolabore: float,
    regime_pj: Literal["simples", "lucro_presumido"] = "simples",
    reserva_pct: float = 0.0,
) -> FolhaPJ:
    prolabore = min(prolabore, 8475.55)

    # Alíquota Simples Anexo III por RBT12
    if regime_pj == "simples":
        rbt12 = fat * 12
        if rbt12 <= 180_000:       aliq = 0.060
        elif rbt12 <= 360_000:     aliq = 0.112
        elif rbt12 <= 720_000:     aliq = 0.135
        elif rbt12 <= 1_800_000:   aliq = 0.160
        elif rbt12 <= 3_600_000:   aliq = 0.210
        else:                      aliq = 0.330
    else:
        aliq = 0.1333  # Lucro Presumido

    imposto = fat * aliq
    inss_pl = min(prolabore * 0.11, 932.31)
    irrf_pl = calc_irrf(prolabore, inss_pl)
    distrib = max(0.0, retirada - prolabore)
    liq     = prolabore - inss_pl - irrf_pl + distrib

    reserva_mensal = retirada * reserva_pct / 12
    d3equiv = retirada * reserva_pct * 0.5
    fLequiv = retirada * reserva_pct * 0.5
    renda_real = liq + d3equiv / 12 + fLequiv / 12

    return FolhaPJ(
        bruto=retirada, fat=fat, prolabore=prolabore,
        inss=inss_pl, irrf=irrf_pl, fgts=0,
        distribuicao=distrib, impostoEmpresa=imposto, aliqImposto=aliq,
        liq=liq, rendaOp=liq, rendaReal=renda_real,
        rendaAnual=renda_real * 12,
        reservaPct=reserva_pct, reservaMensal=reserva_mensal,
        regimePJ=regime_pj,
    )


# ── Projeção patrimonial ──────────────────────────────────────────────
@dataclass
class Snap:
    ano: int
    pat: float
    aporte: float
    rend: float
    pat_pess: float = 0
    pat_otim: float = 0


def build_snaps(
    anos: int,
    taxa_aa: float,
    aporte_inicial: float,
    reajuste_aa: float,
    pat_inicial: float,
) -> list[Snap]:
    """Constrói snapshots anuais (base, pessimista -2pp, otimista +2pp)."""
    taxa_m  = (1 + taxa_aa / 100) ** (1 / 12) - 1
    taxa_pm = (1 + (taxa_aa - 2) / 100) ** (1 / 12) - 1
    taxa_om = (1 + (taxa_aa + 2) / 100) ** (1 / 12) - 1

    pat = pat_p = pat_o = pat_inicial
    ap  = aporte_inicial
    snaps = [Snap(0, pat_inicial, 0, 0, pat_inicial, pat_inicial)]

    for a in range(1, anos + 1):
        rend_ano = 0.0
        for _ in range(12):
            rend = pat * taxa_m
            rend_ano += rend
            pat   = pat   * (1 + taxa_m)  + ap
            pat_p = pat_p * (1 + taxa_pm) + ap
            pat_o = pat_o * (1 + taxa_om) + ap
        ap *= (1 + reajuste_aa / 100)
        snaps.append(Snap(a, pat, ap, rend_ano, pat_p, pat_o))

    return snaps


def pat_no_mes(snaps: list[Snap], meses: int) -> float:
    """Interpola patrimônio para número de meses (não inteiro de anos)."""
    if len(snaps) < 2:
        return 0.0
    ano_exato  = meses / 12
    ano_abaixo = int(ano_exato)
    ano_acima  = math.ceil(ano_exato)
    fracao     = ano_exato - ano_abaixo
    idx_a = min(ano_abaixo, len(snaps) - 1)
    idx_b = min(ano_acima,  len(snaps) - 1)
    return snaps[idx_a].pat + (snaps[idx_b].pat - snaps[idx_a].pat) * fracao

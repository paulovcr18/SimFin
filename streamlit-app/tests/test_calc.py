"""
Golden-value tests for streamlit-app/core/calc.py — fiscal calculations 2026.

These tests act as a regression contract: updating the INSS/IRRF tables for 2027
will break the tests that reference the old golden values, making the change visible.

All expected values were derived by running the functions and verified manually
against the legal rates from:
  - INSS: Portaria Interministerial MPS/MF nº 13/2026
  - IRRF: Tabela progressiva (inalterada desde 2015) + Lei 15.270/2025 (redutor)
"""

import math
import sys
import os

import pytest

# Allow running tests from the streamlit-app/ directory or the repo root.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from core.calc import (
    calc_inss,
    calc_irrf,
    calc_irrf_13,
    calc_folha_clt,
    calc_folha_pj,
    build_snaps,
    pat_no_mes,
)

CENT = 0.01  # tolerance: within 1 cent


# ─────────────────────────────────────────────────────────────────────────────
# INSS — progressive brackets
# ─────────────────────────────────────────────────────────────────────────────


def test_inss_below_first_bracket():
    """R$1 000 falls inside the 7.5% bracket: 1000 × 0.075 = 75.00."""
    assert calc_inss(1000) == pytest.approx(75.00, abs=CENT)


def test_inss_at_first_bracket_ceiling():
    """R$1 621 is the exact ceiling of the first bracket: 1621 × 0.075 = 121.575."""
    assert calc_inss(1621) == pytest.approx(121.58, abs=CENT)


def test_inss_between_brackets_1_2():
    """R$2 000 spans brackets 1 (7.5%) and 2 (9%): expected ≈ 155.69."""
    assert calc_inss(2000) == pytest.approx(155.69, abs=CENT)


def test_inss_at_second_bracket_ceiling():
    """R$2 902.84 hits the exact ceiling of bracket 2: expected ≈ 236.94."""
    assert calc_inss(2902.84) == pytest.approx(236.94, abs=CENT)


def test_inss_mid_high_salary():
    """R$5 000 crosses three brackets: expected ≈ 501.51."""
    assert calc_inss(5000) == pytest.approx(501.51, abs=CENT)


def test_inss_at_max_bracket_ceiling():
    """R$8 475.55 is the ceiling of the last bracket: expected ≈ 988.09."""
    assert calc_inss(8475.55) == pytest.approx(988.09, abs=CENT)


def test_inss_above_max_bracket_is_capped():
    """INSS is capped at the same value once salary exceeds R$8 475.55."""
    assert calc_inss(15000) == pytest.approx(calc_inss(8475.55), abs=CENT)
    assert calc_inss(50000) == pytest.approx(calc_inss(8475.55), abs=CENT)


# ─────────────────────────────────────────────────────────────────────────────
# IRRF — regular (com redutor de isenção – Lei 15.270/2025)
# ─────────────────────────────────────────────────────────────────────────────


def test_irrf_isento_baixo_salario():
    """Salários até ~R$5 000 resultam em IRRF zero graças ao redutor."""
    assert calc_irrf(2000, calc_inss(2000)) == pytest.approx(0.00, abs=CENT)
    assert calc_irrf(3000, calc_inss(3000)) == pytest.approx(0.00, abs=CENT)
    assert calc_irrf(5000, calc_inss(5000)) == pytest.approx(0.00, abs=CENT)


def test_irrf_alto_salario_sem_reducao():
    """Para R$7 000 o redutor é zero e IRRF é significativo: expected ≈ 650.69."""
    expected = 650.69
    assert calc_irrf(7000, calc_inss(7000)) == pytest.approx(expected, abs=CENT)


def test_irrf_very_high_salary():
    """R$10 000 → IRRF ≈ 1 569.54 (alíquota máxima 27.5% sem redutor)."""
    assert calc_irrf(10000, calc_inss(10000)) == pytest.approx(1569.54, abs=CENT)


def test_irrf_never_negative():
    """IRRF nunca pode ser negativo independente do salário."""
    for bruto in [100, 500, 1000, 2429, 5000]:
        assert calc_irrf(bruto, calc_inss(bruto)) >= 0.0


# ─────────────────────────────────────────────────────────────────────────────
# IRRF 13° — tributação exclusiva SEM redutor
# ─────────────────────────────────────────────────────────────────────────────


def test_irrf_13_aplica_sem_redutor():
    """
    Para R$3 000, irrf normal = 0 (redutor zera), mas irrf_13 > 0 (sem redutor).
    Isso comprova que a função 13° usa a tabela progressiva pura.
    """
    irrf_normal = calc_irrf(3000, calc_inss(3000))
    irrf_decimo = calc_irrf_13(3000, calc_inss(3000))
    assert irrf_normal == pytest.approx(0.00, abs=CENT)
    assert irrf_decimo == pytest.approx(24.20, abs=CENT)


def test_irrf_13_high_salary_matches_regular():
    """
    Acima de R$7 350, o redutor é zero para irrf regular também.
    Portanto irrf_13 == irrf regular para salários altos.
    """
    assert calc_irrf_13(10000, calc_inss(10000)) == pytest.approx(
        calc_irrf(10000, calc_inss(10000)), abs=CENT
    )


# ─────────────────────────────────────────────────────────────────────────────
# Folha CLT
# ─────────────────────────────────────────────────────────────────────────────


def test_folha_clt_5k():
    """Golden values para CLT R$5 000 (salário médio representativo)."""
    f = calc_folha_clt(5000)
    assert f.tipo == "CLT"
    assert f.bruto == pytest.approx(5000.00, abs=CENT)
    assert f.inss == pytest.approx(501.51, abs=CENT)
    assert f.irrf == pytest.approx(0.00, abs=CENT)
    assert f.fgts == pytest.approx(400.00, abs=CENT)
    assert f.liq == pytest.approx(4498.49, abs=CENT)


def test_folha_clt_10k():
    """Golden values para CLT R$10 000 (salário alto, alíquota máxima)."""
    f = calc_folha_clt(10000)
    assert f.bruto == pytest.approx(10000.00, abs=CENT)
    assert f.inss == pytest.approx(988.09, abs=CENT)
    assert f.irrf == pytest.approx(1569.54, abs=CENT)
    assert f.fgts == pytest.approx(800.00, abs=CENT)
    assert f.liq == pytest.approx(7442.36, abs=CENT)


def test_folha_clt_vr_e_plr():
    """VR e PLR são incorporados corretamente: PLR aplica flat 15% de desconto."""
    f = calc_folha_clt(3000, vr=300, plr=5000)
    assert f.vr == pytest.approx(300.00, abs=CENT)
    assert f.plr == pytest.approx(5000.00, abs=CENT)
    assert f.liqPlr == pytest.approx(4250.00, abs=CENT)   # 5000 × 0.85
    assert f.rendaOp == pytest.approx(f.liq + 300.00, abs=CENT)


def test_folha_clt_liq_formula():
    """liq = bruto - inss - irrf para qualquer salário."""
    for bruto in [2000, 4000, 8000, 12000]:
        f = calc_folha_clt(bruto)
        expected_liq = f.bruto - f.inss - f.irrf
        assert f.liq == pytest.approx(expected_liq, abs=CENT)


def test_folha_clt_fgts_is_8_percent():
    """FGTS deve ser exatamente 8% do bruto."""
    for bruto in [1500, 5000, 20000]:
        f = calc_folha_clt(bruto)
        assert f.fgts == pytest.approx(bruto * 0.08, abs=CENT)


# ─────────────────────────────────────────────────────────────────────────────
# Folha PJ
# ─────────────────────────────────────────────────────────────────────────────


def test_folha_pj_simples():
    """Golden values PJ Simples Nacional (fat=10k → RBT12=120k → aliq 6%)."""
    p = calc_folha_pj(fat=10000, retirada=10000, prolabore=2000, regime_pj="simples")
    assert p.tipo == "PJ"
    assert p.aliqImposto == pytest.approx(0.06, abs=0.0001)
    assert p.impostoEmpresa == pytest.approx(600.00, abs=CENT)
    assert p.inss == pytest.approx(220.00, abs=CENT)   # 2000 × 0.11
    assert p.irrf == pytest.approx(0.00, abs=CENT)     # pró-labore R$2k → isento
    assert p.liq == pytest.approx(9780.00, abs=CENT)


def test_folha_pj_lucro_presumido():
    """Golden values PJ Lucro Presumido: aliq fixa 13.33%."""
    p = calc_folha_pj(fat=20000, retirada=15000, prolabore=3000, regime_pj="lucro_presumido")
    assert p.aliqImposto == pytest.approx(0.1333, abs=0.0001)
    assert p.impostoEmpresa == pytest.approx(2666.00, abs=CENT)
    assert p.liq == pytest.approx(14670.00, abs=CENT)


def test_folha_pj_prolabore_capped_at_teto():
    """Pró-labore é limitado ao teto do INSS (R$8 475.55)."""
    p = calc_folha_pj(fat=50000, retirada=30000, prolabore=999999)
    assert p.prolabore == pytest.approx(8475.55, abs=CENT)


# ─────────────────────────────────────────────────────────────────────────────
# build_snaps — projeção patrimonial
# ─────────────────────────────────────────────────────────────────────────────


def test_build_snaps_returns_correct_length():
    """build_snaps(anos=N) deve retornar N+1 snapshots (ano 0 até ano N)."""
    snaps = build_snaps(anos=5, taxa_aa=10.0, aporte_inicial=1000, reajuste_aa=0, pat_inicial=0)
    assert len(snaps) == 6


def test_build_snaps_first_snap_is_initial_pat():
    """O primeiro snapshot (ano 0) deve ter pat = pat_inicial."""
    snaps = build_snaps(anos=2, taxa_aa=10.0, aporte_inicial=1000, reajuste_aa=0, pat_inicial=5000)
    assert snaps[0].pat == pytest.approx(5000.0, abs=CENT)
    assert snaps[0].ano == 0


def test_build_snaps_pat_grows():
    """O patrimônio cresce a cada ano quando taxa_aa > 0 e aporte > 0."""
    snaps = build_snaps(anos=3, taxa_aa=10.0, aporte_inicial=1000, reajuste_aa=0, pat_inicial=0)
    for i in range(1, len(snaps)):
        assert snaps[i].pat > snaps[i - 1].pat


def test_build_snaps_golden_values():
    """Golden values para 2 anos, 10% a.a., R$1 000/mês, pat_inicial=0."""
    snaps = build_snaps(anos=2, taxa_aa=10.0, aporte_inicial=1000, reajuste_aa=0, pat_inicial=0)
    assert snaps[1].pat == pytest.approx(12540.54, abs=CENT)
    assert snaps[2].pat == pytest.approx(26335.13, abs=CENT)


def test_build_snaps_pessimist_less_than_base():
    """Cenário pessimista (taxa-2pp) deve ter pat menor que o cenário base."""
    snaps = build_snaps(anos=3, taxa_aa=10.0, aporte_inicial=1000, reajuste_aa=0, pat_inicial=0)
    for s in snaps[1:]:
        assert s.pat_pess < s.pat


def test_build_snaps_optimist_more_than_base():
    """Cenário otimista (taxa+2pp) deve ter pat maior que o cenário base."""
    snaps = build_snaps(anos=3, taxa_aa=10.0, aporte_inicial=1000, reajuste_aa=0, pat_inicial=0)
    for s in snaps[1:]:
        assert s.pat_otim > s.pat


# ─────────────────────────────────────────────────────────────────────────────
# pat_no_mes — interpolação
# ─────────────────────────────────────────────────────────────────────────────


def test_pat_no_mes_empty_snaps():
    """Lista vazia deve retornar 0."""
    assert pat_no_mes([], 6) == pytest.approx(0.0, abs=CENT)


def test_pat_no_mes_at_year_boundary():
    """Em múltiplos de 12 meses, deve retornar o pat exato do snapshot."""
    snaps = build_snaps(anos=3, taxa_aa=10.0, aporte_inicial=1000, reajuste_aa=0, pat_inicial=0)
    assert pat_no_mes(snaps, 0) == pytest.approx(snaps[0].pat, abs=CENT)
    assert pat_no_mes(snaps, 12) == pytest.approx(snaps[1].pat, abs=CENT)
    assert pat_no_mes(snaps, 24) == pytest.approx(snaps[2].pat, abs=CENT)


def test_pat_no_mes_midpoint_interpolation():
    """Meio do caminho entre anos 1 e 2 deve ser interpolado linearmente."""
    snaps = build_snaps(anos=2, taxa_aa=10.0, aporte_inicial=1000, reajuste_aa=0, pat_inicial=0)
    # 18 meses = exatamente a metade entre snaps[1] e snaps[2]
    expected = (snaps[1].pat + snaps[2].pat) / 2
    assert pat_no_mes(snaps, 18) == pytest.approx(expected, abs=CENT)


def test_pat_no_mes_zero_months():
    """0 meses deve retornar pat_inicial."""
    snaps = build_snaps(anos=2, taxa_aa=10.0, aporte_inicial=1000, reajuste_aa=0, pat_inicial=1000)
    assert pat_no_mes(snaps, 0) == pytest.approx(1000.0, abs=CENT)

// ════════════════════════════════════════════════════════════════════
// TABELAS OFICIAIS 2026
// ════════════════════════════════════════════════════════════════════
//
// INSS — Portaria Interministerial MPS/MF nº 13/2026
//   Salário mínimo 2026: R$ 1.621,00 (+3,9% sobre 2025)
//   Teto contributivo:   R$ 8.475,55
//   Cálculo: progressivo por faixas (EC 103/2019)
//
// IRRF — Tabela progressiva 2026 (mesma base de 2015, sem alteração de faixas)
//   + Redutor de isenção (Lei 15.270/2025, vigência jan/2026):
//     • Renda tributável ≤ R$ 5.000  → redutor de até R$ 312,89 → IR = 0
//     • R$ 5.000,01 a R$ 7.350       → redutor = R$ 978,62 − (0,133145 × base)
//     • Acima de R$ 7.350            → sem redutor, apenas tabela progressiva
//   Base de cálculo = Salário Bruto − INSS
// ════════════════════════════════════════════════════════════════════

// ── INSS 2026 ──
const INSS_F = [
  { a: 1621.00, q: 0.075 },
  { a: 2902.84, q: 0.090 },
  { a: 4354.27, q: 0.120 },
  { a: 8475.55, q: 0.140 },  // teto: R$ 8.475,55
];

// ── IRRF 2026 — Tabela progressiva base (inalterada desde 2015) ──
// Aplicada sobre (Bruto − INSS). O redutor de isenção é aplicado em seguida.
const IRRF_F = [
  { a: 2428.80,  q: 0.000, d:    0.00 },
  { a: 2826.65,  q: 0.075, d:  182.16 },
  { a: 3751.05,  q: 0.150, d:  394.16 },
  { a: 4664.68,  q: 0.225, d:  675.49 },
  { a: Infinity, q: 0.275, d:  908.73 },
];

// Regime de trabalho de cada pessoa: 'CLT' | 'PJ'
const regime = { 1: 'CLT', 2: 'CLT' };

// ── calcINSS: progressivo por faixas ──
function calcINSS(b) {
  let x = 0, p = 0;
  for (const f of INSS_F) {
    if (b <= p) break;
    x += (Math.min(b, f.a) - p) * f.q;
    p = f.a;
    if (b <= f.a) break;
  }
  return x;
}

// ── calcIRRF 2026: tabela progressiva + redutor de isenção ──
// Etapa 1: calcula IR pela tabela progressiva base
// Etapa 2: aplica redutor conforme faixa de renda tributável
function calcIRRF(bruto, inss) {
  const base = bruto - inss;

  // Etapa 1 — tabela progressiva
  let irBruto = 0;
  for (const f of IRRF_F) {
    if (base <= f.a) { irBruto = Math.max(0, base * f.q - f.d); break; }
  }

  // Etapa 2 — redutor de isenção (Lei 15.270/2025)
  let redutor = 0;
  if (base <= 5000.00) {
    // Isenção total: redutor cobre todo o IR calculado na etapa 1
    redutor = irBruto;
  } else if (base <= 7350.00) {
    // Redução parcial e decrescente
    redutor = Math.max(0, 978.62 - 0.133145 * base);
  }
  // Acima de R$ 7.350: redutor = 0, paga-se o IR integral da tabela progressiva

  return Math.max(0, irBruto - redutor);
}

// ── CLT ──
// ─────────────────────────────────────────────────────────────────
// DOIS conceitos de renda:
//
//  rendaOp   = líquido mensal + VR
//              → o que cai na conta todo mês (base para gastos fixos)
//
//  rendaReal = renda anual líquida total / 12
//              → diluição de 13°, férias e PLR (base para aportes)
//
// Regras fiscais aplicadas:
//  • 13°: INSS sobre bruto + IR pela tabela progressiva SEM o redutor
//         de isenção 2026 (tributação exclusiva na fonte — RIR art.638)
//  • Férias: INSS só sobre o bruto (1/3 é isento de INSS — TST/STF)
//            IR sobre bruto + 1/3 (o 1/3 é tributável pelo IR)
//  • PLR: IR de 15% exclusivo na fonte (tabela própria simplificada)
// ─────────────────────────────────────────────────────────────────
function calcIRRF_13(bruto13, inss13) {
  // Tabela progressiva SEM o redutor de isenção 2026
  const base = bruto13 - inss13;
  for (const f of IRRF_F) {
    if (base <= f.a) return Math.max(0, base * f.q - f.d);
  }
  return 0;
}

function calcFolhaCLT(bruto, vr, plr) {
  // ── Mensal normal ──
  const inss   = calcINSS(bruto);
  const irrf   = calcIRRF(bruto, inss);   // com redutor 2026
  const fgts   = bruto * 0.08;
  const liq    = bruto - inss - irrf;

  // ── 13° salário ──
  // INSS: mesma tabela, base = bruto integral
  // IR: tabela progressiva SEM redutor de isenção (tributação exclusiva)
  const inss13 = calcINSS(bruto);
  const irrf13 = calcIRRF_13(bruto, inss13);
  const liq13  = bruto - inss13 - irrf13;

  // ── Férias + 1/3 ──
  // INSS: sobre bruto apenas (1/3 = natureza indenizatória → isento INSS)
  // IR: sobre bruto + 1/3 (o abono de 1/3 é tributável pelo IRRF)
  //     usa tabela com redutor (é renda mensal de trabalho)
  const inssFer = calcINSS(bruto);
  const irrfFer = calcIRRF(bruto + bruto / 3, inssFer);
  const liqFer  = (bruto + bruto / 3) - inssFer - irrfFer;

  // ── PLR ──
  // IR exclusivo de 15% na fonte (tabela própria simplificada)
  const liqPlr  = plr * 0.85;

  // ── Renda operacional mensal (fluxo real de caixa) ──
  // É o que a pessoa dispõe todo mês para pagar as contas
  const rendaOp = liq + vr;

  // ── Renda anual líquida total ──
  const rendaAnual = 12 * liq + liq13 + liqFer + 12 * vr + liqPlr;

  // ── Renda mensal real diluída ──
  // Diluição de todos os recebimentos anuais em 12 parcelas
  // Usada como base para calcular capacidade de aporte anual
  const rendaReal = rendaAnual / 12;

  // ── Extras anuais (recebidos pontualmente, não todo mês) ──
  const extrasAnuais = liq13 + liqFer + liqPlr;

  return {
    tipo: 'CLT', bruto, inss, irrf, fgts, liq,
    inss13, irrf13, liq13,
    inssFer, irrfFer, liqFer,
    plr, liqPlr,
    vr,
    rendaOp,       // ← base para rateio de gastos mensais
    rendaReal,     // ← base para capacidade de aporte (diluída)
    extrasAnuais,  // ← 13° + férias + PLR líquidos
    rendaAnual,
    // aliases para compatibilidade com partes do código existentes
    d3: liq13, fL: liqFer, plrL: liqPlr,
    impostoEmpresa: 0,
    custoTotal: bruto * (1 + 0.08 + 0.2),
    label_bruto: 'Salário Bruto',
  };
}

// ── PJ ──
// Simples Nacional (Anexo III serviços): alíquota efetiva estimada
// Lucro Presumido: PIS 0,65% + COFINS 3% + CSLL 2,88% + IRPJ 4,80% + ISS ~2% ≈ 13,33%
// INSS sócio: 11% sobre pró-labore (teto R$ 932,31 em 2026)
// Distribuição de lucros: isenta de IR (Lucro Presumido e Simples)
function calcFolhaPJ(pid,fac){
  fac=fac||1;
  const fat      = (parseFloat(document.getElementById(`p${pid}fat`).value)||0)*fac;
  const retirada = (parseFloat(document.getElementById(`p${pid}retirada`).value)||0)*fac;
  const prolabore= Math.min((parseFloat(document.getElementById(`p${pid}prolabore`).value)||0)*fac, 8475.55);
  const regimePJ = document.getElementById(`p${pid}regime`).value;
  const reservaPct = (parseFloat(document.getElementById(`p${pid}reserva`).value)||0)/100;

  // Imposto sobre faturamento
  let aliqImposto;
  if(regimePJ==='simples'){
    // Simples Anexo III (serviços) — alíquota efetiva aproximada por faixa de RBT12
    const rbt12=fat*12;
    if(rbt12<=180000)         aliqImposto=0.06;
    else if(rbt12<=360000)    aliqImposto=0.112;
    else if(rbt12<=720000)    aliqImposto=0.135;
    else if(rbt12<=1800000)   aliqImposto=0.16;
    else if(rbt12<=3600000)   aliqImposto=0.21;
    else                       aliqImposto=0.33;
  } else {
    // Lucro Presumido: ~13,33% sobre faturamento (PIS+COFINS+CSLL+IRPJ+ISS)
    aliqImposto=0.1333;
  }

  const impostoEmpresa = fat * aliqImposto;

  // INSS do sócio: 11% sobre pró-labore (contribuinte individual)
  const inssProlabore = Math.min(prolabore * 0.11, 932.31);  // teto contrib. individual 2026 (11% × R$ 8.475,55)

  // IR sobre pró-labore (tabela 2026)
  const irrfProlabore = calcIRRF(prolabore, inssProlabore);

  // Distribuição de lucros = retirada - pró-labore (isenta de IR no Simples e LP)
  const distribuicao = Math.max(0, retirada - prolabore);

  // Líquido efetivo na mão
  const liq = prolabore - inssProlabore - irrfProlabore + distribuicao;

  // Reserva equivalente a férias/13° (o PJ precisa guardar por conta própria)
  const reservaMensal = retirada * reservaPct / 12;  // 1/12 da reserva anual
  // Reserva acumulada num ano equivale a uma "férias" e "13°" simulados
  const d3equiv = retirada * reservaPct * 0.5;   // metade da reserva anual = "13°"
  const fLequiv = retirada * reservaPct * 0.5;   // outra metade = "férias"

  // Renda real = líquido + 1/12 das reservas equivalentes
  const rendaReal = liq + d3equiv/12 + fLequiv/12;

  // Custo total para o contratante (só o faturamento)
  const custoTotal = fat;

  return{
    tipo:'PJ', bruto:retirada,
    inss:inssProlabore, irrf:irrfProlabore,
    fgts:0,
    liq,
    d3:d3equiv, fL:fLequiv,
    plr:0, plrL:0,
    vr:0,
    rendaOp: liq,           // PJ: tudo é recebido mensalmente
    rendaReal,              // PJ: inclui equivalente de férias/13°
    extrasAnuais: 0,        // PJ: não tem extras formais (reserva é própria)
    rendaAnual: rendaReal*12,
    impostoEmpresa,
    fat, prolabore, distribuicao, regimePJ,
    reservaPct, reservaMensal,
    custoTotal,
    aliqImposto,
    label_bruto:'Retirada Total',
  };
}

// ── Dispatcher ──
// fac: scale factor for future-year projections (PJ scales faturamento/retirada)
function calcFolha(bruto,vr,plr,pid,fac){
  if(regime[pid]==='PJ') return calcFolhaPJ(pid,fac||1);
  return calcFolhaCLT(bruto,vr,plr);
}

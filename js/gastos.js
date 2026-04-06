// ════════════════════════════════════════════════════════════════
// GASTOS — Painel de Realizados vs. Simulados
//
// Compara gastos reais (do extrato importado) com o orçamento
// do simulador, por categoria. Inclui:
//   - Tabela comparativa + gráfico de barras (Chart.js)
//   - Indicador de desvio (verde/amarelo/vermelho)
//   - Score de aderência orçamentária mensal (0-100%)
//   - Histórico de aderência dos últimos 12 meses
//   - Cards "Maior estouro" e "Mais econômica"
// ════════════════════════════════════════════════════════════════

let gastosBarChart = null;
let gastosLineChart = null;

// ── Obter orçamento simulado (valores mensais por categoria) ─────
function gastosGetOrcamento() {
  const rendaOp = gastosGetRendaOperacional();
  const pcts = getPcts();
  const orcamento = {};
  // Mapeia keys do simulador para nomes de categoria do extrato
  const mapa = {
    'pctMoradia': 'Moradia',
    'pctAlimentacao': 'Alimentação',
    'pctTransporte': 'Transporte',
    'pctContas': 'Contas',
    'pctLazer': 'Lazer',
    'pctInvest': 'Investimento',
  };
  for (const [key, cat] of Object.entries(mapa)) {
    orcamento[cat] = rendaOp * (pcts[key] || 0) / 100;
  }
  return orcamento;
}

// ── Renda operacional do simulador (usa cache centralizado) ────────
function gastosGetRendaOperacional() {
  if (typeof window.rendaOperacionalGlobal === 'number' && window.rendaOperacionalGlobal > 0) {
    return window.rendaOperacionalGlobal;
  }
  try {
    const g = id => (typeof gP!=='undefined'?gP(id):parseFloat(document.getElementById(id)?.value))||0;
    const f1 = calcFolha(g('p1bruto'), g('p1vr'), g('p1plr'), 1);
    const f2 = calcFolha(g('p2bruto'), g('p2vr'), g('p2plr'), 2);
    return (f1.rendaOp || f1.rendaReal) + (f2.rendaOp || f2.rendaReal);
  } catch { return 0; }
}

// ── Calcular score de aderência para um mês ──────────────────────
function gastosCalcAderencia(mes) {
  const orcamento = gastosGetOrcamento();
  const realizado = extratoResumoMes(mes);

  // Categorias comparáveis (exclui Investimento e Transferência)
  const catsCompare = ['Moradia', 'Alimentação', 'Transporte', 'Contas', 'Lazer'];
  let totalOrc = 0, totalDevio = 0;

  for (const cat of catsCompare) {
    const orc = orcamento[cat] || 0;
    const real = realizado[cat] || 0;
    if (orc <= 0) continue;
    totalOrc += orc;
    const excesso = Math.max(0, real - orc);
    totalDevio += excesso;
  }

  if (totalOrc <= 0) return 100;
  const score = Math.max(0, Math.min(100, Math.round((1 - totalDevio / totalOrc) * 100)));
  return score;
}

// ── Render principal ─────────────────────────────────────────────
function renderGastos() {
  const panel = document.getElementById('gastosPanelArea');
  if (!panel) return;

  const meses = extratoMesesDisponiveis();
  if (!meses.length) {
    document.getElementById('gastosPanel').style.display = 'none';
    return;
  }
  document.getElementById('gastosPanel').style.display = 'block';

  const mesSelect = document.getElementById('gastosMesFilter');
  const mesAtual = mesSelect.value || meses[0];
  mesSelect.innerHTML = meses.map(m => {
    const lbl = new Date(m + '-02').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return `<option value="${m}" ${m === mesAtual ? 'selected' : ''}>${lbl}</option>`;
  }).join('');
  const mesSel = mesSelect.value || meses[0];

  const orcamento = gastosGetOrcamento();
  const realizado = extratoResumoMes(mesSel);
  const catsCompare = ['Moradia', 'Alimentação', 'Transporte', 'Contas', 'Lazer'];

  // Score de aderência
  const score = gastosCalcAderencia(mesSel);

  // Encontra maior estouro e mais econômica
  let maiorEstouro = { cat: null, pct: 0 };
  let maisEconomica = { cat: null, pct: Infinity };

  for (const cat of catsCompare) {
    const orc = orcamento[cat] || 0;
    const real = realizado[cat] || 0;
    if (orc <= 0) continue;
    const pctUso = real / orc * 100;
    if (pctUso > maiorEstouro.pct) maiorEstouro = { cat, pct: pctUso, real, orc };
    if (pctUso < maisEconomica.pct) maisEconomica = { cat, pct: pctUso, real, orc };
  }

  // ── Cards de destaque ──
  let cardsHtml = `<div class="gastos-highlights">`;
  // Score
  const scoreColor = score >= 80 ? 'var(--ac)' : score >= 50 ? 'var(--go)' : 'var(--re)';
  cardsHtml += `<div class="gastos-highlight-card">
    <div class="gastos-hl-label">Aderência Orçamentária</div>
    <div class="gastos-hl-val" style="color:${scoreColor}">${score}%</div>
    <div class="gastos-hl-sub">${score >= 80 ? 'Dentro do planejado' : score >= 50 ? 'Atenção ao orçamento' : 'Orçamento estourado'}</div>
  </div>`;
  // Maior estouro
  if (maiorEstouro.cat) {
    const icon = EXTRATO_CAT_ICONS[maiorEstouro.cat] || '';
    cardsHtml += `<div class="gastos-highlight-card">
      <div class="gastos-hl-label">Maior Estouro do Mês</div>
      <div class="gastos-hl-val" style="color:var(--re)">${icon} ${maiorEstouro.cat}</div>
      <div class="gastos-hl-sub">${Math.round(maiorEstouro.pct)}% do orçamento (${fmt(maiorEstouro.real)} / ${fmt(maiorEstouro.orc)})</div>
    </div>`;
  }
  // Mais econômica
  if (maisEconomica.cat && maisEconomica.pct !== Infinity) {
    const icon = EXTRATO_CAT_ICONS[maisEconomica.cat] || '';
    cardsHtml += `<div class="gastos-highlight-card">
      <div class="gastos-hl-label">Mais Econômica do Mês</div>
      <div class="gastos-hl-val" style="color:var(--ac)">${icon} ${maisEconomica.cat}</div>
      <div class="gastos-hl-sub">${Math.round(maisEconomica.pct)}% do orçamento (${fmt(maisEconomica.real)} / ${fmt(maisEconomica.orc)})</div>
    </div>`;
  }
  cardsHtml += `</div>`;

  // ── Tabela comparativa ──
  let tableHtml = `<div class="gastos-compare-wrap"><table class="track-table gastos-table">
    <thead><tr><th style="text-align:left">Categoria</th><th>Simulado</th><th>Realizado</th><th>Desvio</th><th>Status</th></tr></thead><tbody>`;

  let totalSim = 0, totalReal = 0;
  for (const cat of catsCompare) {
    const orc = orcamento[cat] || 0;
    const real = realizado[cat] || 0;
    totalSim += orc;
    totalReal += real;
    const desvio = orc > 0 ? ((real - orc) / orc * 100) : (real > 0 ? 100 : 0);
    const icon = EXTRATO_CAT_ICONS[cat] || '';

    let statusCls, statusTxt;
    if (desvio <= 0) { statusCls = 'gastos-badge-ok'; statusTxt = 'OK'; }
    else if (desvio <= 20) { statusCls = 'gastos-badge-warn'; statusTxt = 'Atenção'; }
    else { statusCls = 'gastos-badge-over'; statusTxt = 'Estouro'; }

    tableHtml += `<tr>
      <td>${icon} ${cat}</td>
      <td style="font-family:var(--fm);text-align:right">${fmt(orc)}</td>
      <td style="font-family:var(--fm);text-align:right">${fmt(real)}</td>
      <td style="font-family:var(--fm);text-align:right;color:${desvio <= 0 ? 'var(--ac)' : desvio <= 20 ? 'var(--go)' : 'var(--re)'}">${desvio > 0 ? '+' : ''}${desvio.toFixed(0)}%</td>
      <td><span class="gastos-badge ${statusCls}">${statusTxt}</span></td>
    </tr>`;
  }

  // Outros (sem orçamento simulado)
  const outrosReal = realizado['Outros'] || 0;
  if (outrosReal > 0) {
    totalReal += outrosReal;
    tableHtml += `<tr>
      <td>📋 Outros</td>
      <td style="font-family:var(--fm);text-align:right;color:var(--t3)">—</td>
      <td style="font-family:var(--fm);text-align:right">${fmt(outrosReal)}</td>
      <td style="font-family:var(--fm);text-align:right;color:var(--t3)">—</td>
      <td><span class="gastos-badge gastos-badge-warn">Não orçado</span></td>
    </tr>`;
  }

  tableHtml += `</tbody><tfoot><tr>
    <td><strong>Total</strong></td>
    <td style="font-family:var(--fm);text-align:right"><strong>${fmt(totalSim)}</strong></td>
    <td style="font-family:var(--fm);text-align:right"><strong>${fmt(totalReal)}</strong></td>
    <td style="font-family:var(--fm);text-align:right;color:${totalReal <= totalSim ? 'var(--ac)' : 'var(--re)'}"><strong>${totalSim > 0 ? ((totalReal - totalSim) / totalSim * 100).toFixed(0) + '%' : '—'}</strong></td>
    <td></td>
  </tr></tfoot></table></div>`;

  // ── Monta HTML ──
  panel.innerHTML = cardsHtml + `<div class="gastos-main-grid">
    <div class="gastos-table-col">${tableHtml}</div>
    <div class="gastos-chart-col"><canvas id="gastosBarChart"></canvas></div>
  </div>
  <div class="gastos-line-wrap">
    <div class="ph2" style="margin-bottom:8px"><span style="font-size:13px">📈</span><span class="pt" style="font-size:12px">Aderência Mensal (últimos 12 meses)</span></div>
    <div style="position:relative;height:120px"><canvas id="gastosLineChart"></canvas></div>
  </div>`;

  // ── Chart de barras comparativo ──
  renderGastosBarChart(catsCompare, orcamento, realizado);
  renderGastosLineChart(meses);
}

// ── Gráfico de barras ────────────────────────────────────────────
function renderGastosBarChart(cats, orcamento, realizado) {
  const ctx = document.getElementById('gastosBarChart');
  if (!ctx) return;
  if (gastosBarChart) gastosBarChart.destroy();

  const labels = cats.map(c => c.replace('Alimentação', 'Aliment.'));
  const dataSim = cats.map(c => orcamento[c] || 0);
  const dataReal = cats.map(c => realizado[c] || 0);

  gastosBarChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Simulado', data: dataSim, backgroundColor: 'rgba(93,212,160,0.3)', borderColor: 'rgba(93,212,160,0.8)', borderWidth: 1 },
        { label: 'Realizado', data: dataReal, backgroundColor: 'rgba(224,108,108,0.3)', borderColor: 'rgba(224,108,108,0.8)', borderWidth: 1 },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#8fa0b0', font: { size: 10, family: 'Sora' } } },
        tooltip: {
          callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(ctx.raw)}` }
        }
      },
      scales: {
        x: { ticks: { color: '#4d6070', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: '#4d6070', font: { size: 9 }, callback: v => fmtK(v) }, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  });
}

// ── Gráfico de linha (aderência últimos 12 meses) ────────────────
function renderGastosLineChart(todosOsMeses) {
  const ctx = document.getElementById('gastosLineChart');
  if (!ctx) return;
  if (gastosLineChart) gastosLineChart.destroy();

  const ultimos12 = todosOsMeses.slice(0, 12).reverse();
  if (ultimos12.length < 2) {
    ctx.parentElement.style.display = 'none';
    return;
  }
  ctx.parentElement.style.display = 'block';

  const labels = ultimos12.map(m => new Date(m + '-02').toLocaleDateString('pt-BR', { month: 'short' }));
  const data = ultimos12.map(m => gastosCalcAderencia(m));

  gastosLineChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Aderência %',
        data,
        borderColor: '#5dd4a0',
        backgroundColor: 'rgba(93,212,160,0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: data.map(v => v >= 80 ? '#5dd4a0' : v >= 50 ? '#e6b86a' : '#e06c6c'),
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `Aderência: ${ctx.raw}%` } }
      },
      scales: {
        x: { ticks: { color: '#4d6070', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { min: 0, max: 100, ticks: { color: '#4d6070', font: { size: 9 }, callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  });
}

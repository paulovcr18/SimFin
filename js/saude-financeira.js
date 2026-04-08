// ════════════════════════════════════════════════════════════════
// SAÚDE FINANCEIRA — Dashboard + Insights de Investimentos
//
// 1. Card resumo com 4 métricas no topo
// 2. Taxa de poupança efetiva com gauge visual
// 3. Benchmark de rentabilidade vs CDI/IPCA/IBOV
// 4. Projeção dinâmica de liberdade financeira
// 5. Alertas automáticos
// ════════════════════════════════════════════════════════════════

const SAUDE_META_POUPANCA_KEY = 'simfin_meta_poupanca';

// ── Meta de poupança configurável ────────────────────────────────
function saudeGetMetaPoupanca() {
  return parseFloat(localStorage.getItem(SAUDE_META_POUPANCA_KEY)) || 30;
}
function saudeSetMetaPoupanca(val) {
  localStorage.setItem(SAUDE_META_POUPANCA_KEY, String(val));
}

// ── Render principal ─────────────────────────────────────────────
function renderSaudeFinanceira() {
  renderSaudeDashboard();
  renderSaudeInsights();
}

// ═══ DASHBOARD — 4 MÉTRICAS NO TOPO ═════════════════════════════
function renderSaudeDashboard() {
  const dash = document.getElementById('saudeDashboard');
  if (!dash) return;

  const meses = extratoMesesDisponiveis();
  const mesAtual = meses[0] || null;
  const entries = typeof loadTrack === 'function' ? loadTrack() : [];
  const lastEntry = entries.length ? entries[entries.length - 1] : null;

  // 1. Aderência orçamentária
  const aderencia = mesAtual ? gastosCalcAderencia(mesAtual) : null;
  const aderCor = aderencia === null ? 'var(--t3)' : aderencia >= 80 ? 'var(--ac)' : aderencia >= 50 ? 'var(--go)' : 'var(--re)';

  // 2. Meta de aporte
  const aporteSimulado = gastosGetAporteMensal();
  let aporteRealizado = 0;
  if (mesAtual && lastEntry && lastEntry.mes === mesAtual) {
    aporteRealizado = lastEntry.aporte || 0;
  }
  const pctAporte = aporteSimulado > 0 ? Math.round(aporteRealizado / aporteSimulado * 100) : 0;
  const aporteCor = pctAporte >= 90 ? 'var(--ac)' : pctAporte >= 50 ? 'var(--go)' : 'var(--re)';

  // 3. Saldo livre
  const rendaOp = gastosGetRendaOperacional();
  const gastosRealizados = mesAtual ? Object.values(extratoResumoMes(mesAtual)).reduce((s, v) => s + v, 0) : 0;
  const saldoLivre = rendaOp - gastosRealizados - aporteRealizado;
  const saldoCor = saldoLivre >= 0 ? 'var(--ac)' : 'var(--re)';

  // 4. Liberdade financeira (% do caminho)
  const patAtual = lastEntry?.patrimonio || 0;
  const gastMes = rendaOp > 0 ? rendaOp * (1 - (parseFloat(document.getElementById('pctInvest')?.value) || 0) / 100) : 0;
  const taxaAnual = parseFloat(document.getElementById('taxaAnual')?.value) || 10;
  const taxaMes = Math.pow(1 + taxaAnual / 100, 1/12) - 1;
  const patNecessario = gastMes > 0 ? gastMes / taxaMes : 0;
  const pctLiberdade = patNecessario > 0 ? Math.min(200, Math.round(patAtual / patNecessario * 100)) : 0;
  const libCor = pctLiberdade >= 100 ? 'var(--ac)' : pctLiberdade >= 50 ? 'var(--go)' : 'var(--re)';

  const hasDados = meses.length > 0 || entries.length > 0;

  dash.innerHTML = `<div class="saude-cards-row">
    <div class="saude-card">
      <div class="saude-card-icon" style="color:${aderCor}">🟢</div>
      <div class="saude-card-body">
        <div class="saude-card-label">Orçamento</div>
        <div class="saude-card-val" style="color:${aderCor}">${aderencia !== null ? aderencia + '%' : '—'}</div>
        <div class="saude-card-sub">aderência do mês</div>
      </div>
    </div>
    <div class="saude-card">
      <div class="saude-card-icon" style="color:${aporteCor}">📈</div>
      <div class="saude-card-body">
        <div class="saude-card-label">Investimento</div>
        <div class="saude-card-val" style="color:${aporteCor}">${hasDados ? pctAporte + '%' : '—'}</div>
        <div class="saude-card-sub">da meta de aporte</div>
      </div>
    </div>
    <div class="saude-card">
      <div class="saude-card-icon" style="color:${saldoCor}">💰</div>
      <div class="saude-card-body">
        <div class="saude-card-label">Saldo Livre</div>
        <div class="saude-card-val" style="color:${saldoCor}">${hasDados ? fmt(saldoLivre) : '—'}</div>
        <div class="saude-card-sub">renda - gastos - aporte</div>
      </div>
    </div>
    <div class="saude-card">
      <div class="saude-card-icon" style="color:${libCor}">🎯</div>
      <div class="saude-card-body">
        <div class="saude-card-label">Liberdade Financeira</div>
        <div class="saude-card-val" style="color:${libCor}">${hasDados ? pctLiberdade + '%' : '—'}</div>
        <div class="saude-card-sub">do caminho percorrido</div>
      </div>
    </div>
    ${(() => {
      const reserva  = parseFloat(document.getElementById('patReserva')?.value) || 0;
      const pctInv   = parseFloat(document.getElementById('pctInvest')?.value) || 0;
      const gastoMes = rendaOp > 0 ? rendaOp * (1 - pctInv / 100) : 0;
      const mesesAut = gastoMes > 0 ? reserva / gastoMes : 0;
      const autCor   = mesesAut >= 6 ? 'var(--ac)' : mesesAut >= 3 ? 'var(--go)' : 'var(--re)';
      const autLabel = mesesAut >= 6 ? 'Reserva adequada' : mesesAut >= 3 ? 'Reserva parcial' : reserva > 0 ? 'Reserva insuficiente' : 'Sem reserva registrada';
      return `<div class="saude-card">
        <div class="saude-card-icon" style="color:${autCor}">🛡</div>
        <div class="saude-card-body">
          <div class="saude-card-label">Meses de Autonomia</div>
          <div class="saude-card-val" style="color:${autCor}">${mesesAut > 0 ? mesesAut.toFixed(1) : '—'}</div>
          <div class="saude-card-sub">${autLabel} · meta: 6 meses</div>
        </div>
      </div>`;
    })()}
  </div>`;
}

// ── Helper: aporte mensal simulado ───────────────────────────────
function gastosGetAporteMensal() {
  const rendaOp = gastosGetRendaOperacional();
  const pctInvest = parseFloat(document.getElementById('pctInvest')?.value) || 0;
  return rendaOp * pctInvest / 100;
}

// ═══ INSIGHTS DE INVESTIMENTOS ═══════════════════════════════════
function renderSaudeInsights() {
  const area = document.getElementById('saudeInsightsArea');
  if (!area) return;

  const entries = typeof loadTrack === 'function' ? loadTrack().sort((a, b) => a.mes.localeCompare(b.mes)) : [];
  const meses = extratoMesesDisponiveis();
  const mesAtual = meses[0] || null;

  if (!entries.length && !meses.length) {
    area.innerHTML = `<div style="font-size:12px;color:var(--t3);padding:12px;text-align:center">
      Importe extratos bancários e registre meses no acompanhamento para ver os insights.</div>`;
    return;
  }

  let html = '';

  // ── 1. Taxa de poupança efetiva ──
  html += renderGaugePoupanca(mesAtual, entries);

  // ── 2. Benchmark de rentabilidade ──
  html += renderBenchmark(entries);

  // ── 3. Projeção dinâmica de liberdade financeira ──
  html += renderProjecaoDinamica(entries);

  // ── 4. Alertas automáticos ──
  html += renderAlertas(entries);

  area.innerHTML = html;
}

// ── Gauge de taxa de poupança ────────────────────────────────────
function renderGaugePoupanca(mesAtual, entries) {
  const rendaOp = gastosGetRendaOperacional();
  const meta = saudeGetMetaPoupanca();

  let aporteReal = 0;
  if (mesAtual) {
    const lastEntry = entries.filter(e => e.mes === mesAtual)[0];
    if (lastEntry) aporteReal = lastEntry.aporte || 0;
  }

  const taxaPoupanca = rendaOp > 0 ? (aporteReal / rendaOp * 100) : 0;
  const gaugePct = Math.min(100, taxaPoupanca / Math.max(meta, 1) * 100);
  const gaugeCor = taxaPoupanca >= meta ? 'var(--ac)' : taxaPoupanca >= meta * 0.5 ? 'var(--go)' : 'var(--re)';

  return `<div class="saude-insight-card">
    <div class="saude-insight-header">
      <span>💹 Taxa de Poupança Efetiva</span>
      <div class="saude-meta-config">
        <label style="font-size:10px;color:var(--t3)">Meta:</label>
        <input type="number" value="${meta}" min="1" max="100" style="width:48px;padding:2px 4px;font-size:11px;background:var(--bg6);border:1px solid var(--bd);border-radius:4px;color:var(--t1);font-family:var(--fm);text-align:center"
          onchange="saudeSetMetaPoupanca(this.value);renderSaudeFinanceira()">
        <span style="font-size:10px;color:var(--t3)">%</span>
      </div>
    </div>
    <div class="saude-gauge-wrap">
      <div class="saude-gauge-bar">
        <div class="saude-gauge-fill" style="width:${gaugePct}%;background:${gaugeCor}"></div>
        <div class="saude-gauge-marker" style="left:${Math.min(100, meta / Math.max(meta, taxaPoupanca, 1) * 100)}%"></div>
      </div>
      <div class="saude-gauge-labels">
        <span style="color:${gaugeCor};font-weight:600">${taxaPoupanca.toFixed(1)}%</span>
        <span style="color:var(--t3)">Meta: ${meta}%</span>
      </div>
      <div style="font-size:11px;color:var(--t3);margin-top:4px">(aporte realizado / renda operacional)</div>
    </div>
  </div>`;
}

// ── Benchmark de rentabilidade ───────────────────────────────────
function renderBenchmark(entries) {
  const comRend = entries.filter(e => e.taxaAnual !== null);
  if (comRend.length < 1) {
    return `<div class="saude-insight-card">
      <div class="saude-insight-header"><span>📊 Benchmark de Rentabilidade</span></div>
      <div style="font-size:11px;color:var(--t3);padding:8px">Registre ao menos 1 mês no acompanhamento para comparar.</div>
    </div>`;
  }

  // Média ponderada da taxa anualizada
  const taxaMedia = comRend.reduce((s, e) => s + e.taxaAnual, 0) / comRend.length;

  // Valores de referência do ticker (lidos do DOM se disponíveis)
  const taxaSim = parseFloat(document.getElementById('taxaAnual')?.value) || 10;

  // CDI ~ Selic (estimativa ou do ticker) e IPCA estimativa
  // Usamos valores hardcoded razoáveis como fallback
  const cdi = 14.25; // Taxa Selic anual atual (atualizar conforme cenário)
  const ipca = 5.5;  // IPCA acumulado 12m estimativa

  const benchmarks = [
    { nome: 'Sua Carteira', valor: taxaMedia, cor: 'var(--ac)' },
    { nome: 'CDI (Selic)', valor: cdi, cor: 'var(--bl)' },
    { nome: 'IPCA', valor: ipca, cor: 'var(--go)' },
    { nome: 'Meta Simulada', valor: taxaSim, cor: 'var(--pu)' },
  ];

  let bars = '';
  const maxVal = Math.max(...benchmarks.map(b => Math.abs(b.valor)), 1);
  for (const b of benchmarks) {
    const w = Math.abs(b.valor) / maxVal * 100;
    bars += `<div class="bench-row">
      <span class="bench-label">${b.nome}</span>
      <div class="bench-bar-bg"><div class="bench-bar-fill" style="width:${w}%;background:${b.cor}"></div></div>
      <span class="bench-val" style="color:${b.cor}">${b.valor.toFixed(1)}% a.a.</span>
    </div>`;
  }

  return `<div class="saude-insight-card">
    <div class="saude-insight-header"><span>📊 Benchmark de Rentabilidade</span></div>
    <div class="bench-container">${bars}</div>
    <div style="font-size:10px;color:var(--t3);margin-top:6px">Baseado na média de ${comRend.length} ${comRend.length === 1 ? 'mês registrado' : 'meses registrados'}</div>
  </div>`;
}

// ── Projeção dinâmica de liberdade financeira ─────────────────────
function renderProjecaoDinamica(entries) {
  if (entries.length < 2) {
    return `<div class="saude-insight-card">
      <div class="saude-insight-header"><span>🎯 Projeção de Liberdade Financeira</span></div>
      <div style="font-size:11px;color:var(--t3);padding:8px">Registre ao menos 2 meses no acompanhamento para projetar.</div>
    </div>`;
  }

  const lastEntry = entries[entries.length - 1];
  const patAtual = lastEntry.patrimonio;

  // Calcula aporte médio real e taxa média real
  const comRend = entries.filter(e => e.rendimento !== null);
  const aportesMedios = entries.reduce((s, e) => s + (e.aporte || 0), 0) / entries.length;
  const taxaMediaMensal = comRend.length ? comRend.reduce((s, e) => s + (e.taxaMensal || 0), 0) / comRend.length / 100 : 0;

  // Gastos mensais (usa realizado se disponível, senão simulado)
  const meses = extratoMesesDisponiveis();
  let gastosMensais;
  if (meses.length) {
    const ultimos3 = meses.slice(0, 3);
    const somaGastos = ultimos3.reduce((s, m) => {
      const resumo = extratoResumoMes(m);
      return s + Object.entries(resumo).filter(([cat]) => cat !== 'Transferência' && cat !== 'Investimento').reduce((s2, [, v]) => s2 + v, 0);
    }, 0);
    gastosMensais = somaGastos / ultimos3.length;
  } else {
    const rendaOp = gastosGetRendaOperacional();
    const pctInvest = parseFloat(document.getElementById('pctInvest')?.value) || 0;
    gastosMensais = rendaOp * (1 - pctInvest / 100);
  }

  // Patrimônio necessário para independência
  const patNecessario = gastosMensais > 0 && taxaMediaMensal > 0 ? gastosMensais / taxaMediaMensal : 0;

  // Projeção mês a mês
  let pat = patAtual;
  let mesesParaLib = 0;
  const maxMeses = 12 * 50; // max 50 anos
  if (patNecessario > 0 && pat < patNecessario && taxaMediaMensal > 0) {
    while (pat < patNecessario && mesesParaLib < maxMeses) {
      pat = pat * (1 + taxaMediaMensal) + aportesMedios;
      mesesParaLib++;
    }
  }

  const anosProj = Math.floor(mesesParaLib / 12);
  const mesesProj = mesesParaLib % 12;
  const pctCaminho = patNecessario > 0 ? Math.min(100, Math.round(patAtual / patNecessario * 100)) : 0;

  // Comparação com projeção simulada
  const taxaSim = parseFloat(document.getElementById('taxaAnual')?.value) || 10;
  const taxaSimMes = Math.pow(1 + taxaSim / 100, 1/12) - 1;
  const aporteSim = gastosGetAporteMensal();
  let patSim = patAtual;
  let mesesSimLib = 0;
  const patNecSim = gastosMensais > 0 && taxaSimMes > 0 ? gastosMensais / taxaSimMes : 0;
  if (patNecSim > 0 && patSim < patNecSim && taxaSimMes > 0) {
    while (patSim < patNecSim && mesesSimLib < maxMeses) {
      patSim = patSim * (1 + taxaSimMes) + aporteSim;
      mesesSimLib++;
    }
  }
  const anosSimProj = Math.floor(mesesSimLib / 12);

  let projecaoHtml = '';
  if (patNecessario <= 0) {
    projecaoHtml = `<div style="color:var(--t3)">Configure seus gastos para calcular.</div>`;
  } else if (pctCaminho >= 100) {
    projecaoHtml = `<div style="color:var(--ac);font-size:16px;font-weight:700">Parabéns! Você atingiu a independência financeira!</div>`;
  } else {
    projecaoHtml = `
      <div class="proj-bar-wrap">
        <div class="proj-bar"><div class="proj-bar-fill" style="width:${pctCaminho}%"></div></div>
        <div style="font-size:12px;color:var(--t1);font-weight:600;margin-top:4px">${pctCaminho}% do caminho</div>
      </div>
      <div class="proj-details">
        <div class="proj-detail">
          <span class="proj-detail-label">Patrimônio atual</span>
          <span class="proj-detail-val">${fmt(patAtual)}</span>
        </div>
        <div class="proj-detail">
          <span class="proj-detail-label">Patrimônio necessário</span>
          <span class="proj-detail-val">${fmt(patNecessario)}</span>
        </div>
        <div class="proj-detail">
          <span class="proj-detail-label">Projeção c/ dados reais</span>
          <span class="proj-detail-val" style="color:var(--ac)">${mesesParaLib < maxMeses ? `${anosProj}a ${mesesProj}m` : '> 50 anos'}</span>
        </div>
        <div class="proj-detail">
          <span class="proj-detail-label">Projeção simulada</span>
          <span class="proj-detail-val" style="color:var(--bl)">${mesesSimLib < maxMeses ? `${anosSimProj}a` : '> 50 anos'}</span>
        </div>
      </div>`;
  }

  return `<div class="saude-insight-card">
    <div class="saude-insight-header"><span>🎯 Projeção de Liberdade Financeira</span></div>
    ${projecaoHtml}
  </div>`;
}

// ── Alertas automáticos ──────────────────────────────────────────
function renderAlertas(entries) {
  const alertas = [];
  const aporteSimulado = gastosGetAporteMensal();

  // Alerta: aporte abaixo do simulado por 2 meses consecutivos
  if (entries.length >= 2 && aporteSimulado > 0) {
    const ultimos2 = entries.slice(-2);
    const abaixo = ultimos2.every(e => (e.aporte || 0) < aporteSimulado * 0.9);
    if (abaixo) {
      const deficit = aporteSimulado - ((ultimos2[0].aporte || 0) + (ultimos2[1].aporte || 0)) / 2;
      // Estimativa de impacto: cada mês sem aporte reduz patrimônio futuro
      const taxaSim = parseFloat(document.getElementById('taxaAnual')?.value) || 10;
      const anos = parseInt(document.getElementById('anos')?.value) || 20;
      const taxaMes = Math.pow(1 + taxaSim / 100, 1/12) - 1;
      // Valor futuro de um aporte mensal por N anos
      const impacto = deficit * ((Math.pow(1 + taxaMes, anos * 12) - 1) / taxaMes);

      alertas.push({
        tipo: 'aviso',
        icon: '⚠️',
        texto: `Aporte abaixo do simulado por 2 meses consecutivos. Déficit médio de ${fmt(deficit)}/mês.`,
        detalhe: `Impacto estimado na projeção: -${fmt(impacto)} em ${anos} anos.`,
      });
    }
  }

  // Alerta: rentabilidade negativa no último mês
  if (entries.length >= 1) {
    const ult = entries[entries.length - 1];
    if (ult.rendimento !== null && ult.rendimento < 0) {
      alertas.push({
        tipo: 'info',
        icon: '📉',
        texto: `Rentabilidade negativa no último mês registrado (${fmt(ult.rendimento)}).`,
        detalhe: 'Isso é normal em períodos de volatilidade. Mantenha a estratégia.',
      });
    }
  }

  // Alerta: gastos acima de 120% do orçamento
  const meses = extratoMesesDisponiveis();
  if (meses.length) {
    const score = gastosCalcAderencia(meses[0]);
    if (score < 50) {
      alertas.push({
        tipo: 'aviso',
        icon: '🔴',
        texto: `Aderência orçamentária muito baixa neste mês (${score}%).`,
        detalhe: 'Revise as categorias com maior estouro no painel de gastos.',
      });
    }
  }

  if (!alertas.length) return '';

  let html = `<div class="saude-insight-card saude-alertas">
    <div class="saude-insight-header"><span>🔔 Alertas</span></div>`;

  for (const a of alertas) {
    const bgColor = a.tipo === 'aviso' ? 'var(--reg)' : 'var(--blg)';
    const borderColor = a.tipo === 'aviso' ? 'rgba(224,108,108,0.3)' : 'rgba(106,172,230,0.3)';
    html += `<div class="saude-alerta" style="background:${bgColor};border:1px solid ${borderColor}">
      <span class="saude-alerta-icon">${a.icon}</span>
      <div>
        <div class="saude-alerta-texto">${a.texto}</div>
        <div class="saude-alerta-detalhe">${a.detalhe}</div>
      </div>
    </div>`;
  }

  html += `</div>`;
  return html;
}

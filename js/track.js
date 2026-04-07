// ════════════════════════════════════════════════════════════════
// TELA DE ACOMPANHAMENTO — Realizado vs. Simulado
// ════════════════════════════════════════════════════════════════

const TRACK_KEY = 'simfin_track';
let compareChart = null;

// ── Screen switcher ──
function switchScreen(screen) {
  const screens = {
    simulador:  { el:'screenSimulador',  display:'grid'     },
    financas:   { el:'screenFinancas',   display:'flex'     },
    metas:      { el:'screenMetas',      display:'flex'     },
    reminder:   { el:'screenReminder',   display:'flex'     },
  };
  Object.entries(screens).forEach(([key, cfg]) => {
    const el = document.getElementById(cfg.el);
    if (el) el.style.display = key === screen ? cfg.display : 'none';
  });
  // Sync desktop nav tabs
  ['tabSimulador','tabFinancas','tabMetas','tabReminder'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  const tabMap = { simulador:'tabSimulador', financas:'tabFinancas', metas:'tabMetas', reminder:'tabReminder' };
  document.getElementById(tabMap[screen])?.classList.add('active');
  // Sync mobile bottom nav
  const bnMap = { simulador:'bnSimulador', financas:'bnFinancas', metas:'bnMetas', reminder:'bnReminder' };
  ['bnSimulador','bnFinancas','bnMetas','bnReminder'].forEach(id => {
    document.getElementById(id)?.classList.remove('active');
  });
  document.getElementById(bnMap[screen])?.classList.add('active');

  if (screen === 'financas')  { initTrackMes(); renderTrack(); carteiraUpdateUI(); renderExtrato(); renderGastos(); renderRegrasCustomizadas(); renderSaudeFinanceira(); baselineBannerUpdate(); }
  if (screen === 'metas')     { renderGoals(); }
  if (screen === 'reminder')  { reminderUpdateUI(); }
}

// ── Storage helpers ──
function loadTrack() {
  try { return JSON.parse(localStorage.getItem(TRACK_KEY)) || []; } catch { return []; }
}
function saveTrack(data) {
  localStorage.setItem(TRACK_KEY, JSON.stringify(data));
}

// ── Init: pre-fill mes with current month and show patrimônio anterior ──
function initTrackMes() {
  const mesEl = document.getElementById('trackMes');
  if (!mesEl.value) {
    const now = new Date();
    mesEl.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  }
  updateTrackCalc();
}

// ── Get patrimônio anterior (último registro antes do mês atual) ──
function getPatrimonioAnterior(mes) {
  const entries = loadTrack().sort((a,b) => a.mes.localeCompare(b.mes));
  const prev = entries.filter(e => e.mes < mes).pop();
  return prev ? prev.patrimonio : null;
}

// ── Live calculation while user types ──
function updateTrackCalc() {
  const mes         = document.getElementById('trackMes').value;
  const aporte      = (typeof gP==='function'?gP('trackAporte'):parseFloat(document.getElementById('trackAporte').value))||0;
  const patrimonio  = (typeof gP==='function'?gP('trackPatrimonio'):parseFloat(document.getElementById('trackPatrimonio').value))||0;
  const infoEl      = document.getElementById('trackCalcInfo');
  const anteriorEl  = document.getElementById('trackPatrimonioAnteriorInfo');

  if (!mes) return;

  const patAnterior = getPatrimonioAnterior(mes);
  const mesLabel = new Date(mes + '-02').toLocaleDateString('pt-BR', {month:'long', year:'numeric'});

  if (patAnterior !== null) {
    anteriorEl.textContent = `Patrimônio anterior: ${fmt(patAnterior)}`;
  } else {
    anteriorEl.textContent = '1º registro — sem mês anterior';
  }

  if (!patrimonio && !aporte) {
    infoEl.innerHTML = `<span style="color:var(--t3)">Preencha os campos para ver o cálculo</span>`;
    return;
  }

  if (patAnterior === null) {
    // Primeiro registro — não tem rendimento calculável
    infoEl.innerHTML = `
      <div class="track-calc-chip"><span>📅</span><span style="color:var(--t1)">${mesLabel}</span></div>
      <div class="track-calc-chip"><span>🏦 Patrimônio inicial:</span><span style="color:var(--t1)">${fmt(patrimonio)}</span></div>
      <div class="track-calc-chip"><span>💸 Aporte:</span><span style="color:var(--ac)">${fmt(aporte)}</span></div>
      <div class="track-calc-chip"><span style="color:var(--go)">ℹ️ Primeiro registro — rendimento calculado a partir do próximo mês</span></div>`;
    return;
  }

  const rendimento = patrimonio - patAnterior - aporte;
  const base       = patAnterior + aporte;
  const taxaMensal = base > 0 ? rendimento / base * 100 : 0;
  const taxaAnual  = (Math.pow(1 + taxaMensal/100, 12) - 1) * 100;
  const taxaSim    = parseFloat(document.getElementById('taxaAnual')?.value) || 10;
  const rendColor  = rendimento >= 0 ? 'var(--ac)' : 'var(--re)';
  const taxaColor  = taxaAnual >= taxaSim * 0.8 ? 'var(--ac)' : taxaAnual >= 0 ? 'var(--go)' : 'var(--re)';

  infoEl.innerHTML = `
    <div class="track-calc-chip"><span>📅</span><span style="color:var(--t1)">${mesLabel}</span></div>
    <div class="track-calc-chip"><span>📈 Rendimento:</span><span style="color:${rendColor};font-weight:600">${rendimento >= 0 ? '+' : ''}${fmt(rendimento)}</span></div>
    <div class="track-calc-chip"><span>📊 Taxa mensal:</span><span style="color:${taxaColor}">${taxaMensal.toFixed(2)}%</span></div>
    <div class="track-calc-chip"><span>📅 Taxa anualizada:</span><span style="color:${taxaColor}">${taxaAnual.toFixed(1)}% a.a. vs ${taxaSim}% simulado</span></div>`;
}

// ── Save entry ──
function calcTrackEntry(mes, aporte, patrimonio, retirada) {
  // Rendimento = variação do patrimônio descontando aporte E retirada
  // Sem retirada: rendimento = pat - patAnt - aporte
  // Com retirada: rendimento = pat - patAnt - aporte + retirada
  // (retirada reduz o patrimônio mas não é rendimento negativo)
  const patAnterior = getPatrimonioAnterior(mes);
  const rendimento  = patAnterior !== null
    ? patrimonio - patAnterior - aporte + (retirada || 0)
    : null;
  const base       = patAnterior !== null ? patAnterior + aporte : null;
  const taxaMensal = base && base > 0 ? rendimento / base * 100 : null;
  const taxaAnual  = taxaMensal !== null ? (Math.pow(1 + taxaMensal/100, 12) - 1) * 100 : null;
  return { rendimento, taxaMensal, taxaAnual };
}

function saveTrackEntry() {
  const mes      = document.getElementById('trackMes').value;
  const aporte   = (typeof gP==='function'?gP('trackAporte'):parseFloat(document.getElementById('trackAporte').value))||0;
  const patrim   = (typeof gP==='function'?gP('trackPatrimonio'):parseFloat(document.getElementById('trackPatrimonio').value))||0;
  const retirada = (typeof gP==='function'?gP('trackRetirada'):parseFloat(document.getElementById('trackRetirada').value))||0;
  const motivo   = document.getElementById('trackRetiradaMotivo').value.trim();

  if (!mes)   { showToast('Selecione o mês de referência', '⚠️'); return; }
  if (!patrim){ showToast('Informe o saldo atual da carteira', '⚠️'); return; }

  const entries = loadTrack();
  const exists  = entries.findIndex(e => e.mes === mes);
  const { rendimento, taxaMensal, taxaAnual } = calcTrackEntry(mes, aporte, patrim, retirada);

  const entry = {
    mes, aporte, patrimonio: patrim, retirada: retirada || null,
    retiradaMotivo: motivo || null,
    rendimento, taxaMensal, taxaAnual,
    registradoEm: new Date().toISOString()
  };

  if (exists >= 0) {
    if (!confirm('Já existe um registro para este mês. Deseja substituir?')) return;
    entries[exists] = entry;
  } else {
    entries.push(entry);
  }
  entries.sort((a,b) => a.mes.localeCompare(b.mes));
  saveTrack(entries);
  dbPushAcompanhamento(entry).catch(() => {});

  const mesLbl = new Date(mes+'-02').toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  showToast(`${mesLbl} registrado!`, '✅');

  const [y,m] = mes.split('-').map(Number);
  document.getElementById('trackMes').value = m===12?`${y+1}-01`:`${y}-${String(m+1).padStart(2,'0')}`;
  document.getElementById('trackAporte').value         = '';
  document.getElementById('trackPatrimonio').value     = '';
  document.getElementById('trackRetirada').value       = '';
  document.getElementById('trackRetiradaMotivo').value = '';
  updateTrackCalc();
  renderTrack();
}

// ── Delete entry ──
function deleteTrackEntry(mes) {
  if (!confirm('Excluir este registro?')) return;
  const entries = loadTrack().filter(e => e.mes !== mes);
  saveTrack(entries);
  dbDeleteAcompanhamento(mes).catch(() => {});
  renderTrack();
  showToast('Registro excluído', '🗑', 2000);
}

// ── Render everything ──
function renderTrack() {
  const entries  = loadTrack().sort((a,b) => a.mes.localeCompare(b.mes));
  const baseline = typeof baselineLoad === 'function' ? baselineLoad() : null;
  renderTrackHistory(entries);
  renderTrackInsights(entries);
  renderCompareChart(entries, baseline);
  renderBaselineDeviationTable(entries, baseline);
}

// ── History table ──
function renderTrackHistory(entries) {
  const area    = document.getElementById('trackHistArea');
  const countEl = document.getElementById('trackHistCount');
  countEl.textContent = entries.length ? `${entries.length} ${entries.length === 1 ? 'mês registrado' : 'meses registrados'}` : '';

  if (!entries.length) {
    area.innerHTML = `<div class="track-empty">
      <div class="track-empty-icon">📭</div>
      <div class="track-empty-title">Nenhum registro ainda</div>
      <div class="track-empty-sub">Registre o primeiro mês acima. Você só precisa informar o aporte que fez e o saldo atual — o rendimento é calculado automaticamente.</div>
    </div>`;
    return;
  }

  const taxaSim = parseFloat(document.getElementById('taxaAnual')?.value) || 10;
  const taxaSimMes = (Math.pow(1 + taxaSim/100, 1/12) - 1) * 100;

  // Patrimônio simulado no mês
  const snapData = typeof snaps !== 'undefined' ? snaps : [];

  let totalAportes = 0, totalRendimentos = 0;
  const rows = entries.map((e, i) => {
    const mesLabel  = new Date(e.mes + '-02').toLocaleDateString('pt-BR', {month:'short', year:'2-digit'});
    const rendValid = e.rendimento !== null;
    totalAportes   += e.aporte || 0;
    if (rendValid) totalRendimentos += e.rendimento;

    const rendClass = !rendValid ? 'neu' : e.rendimento >= 0 ? 'pos' : 'neg';
    const rendStr   = !rendValid ? '—' : (e.rendimento >= 0 ? '+' : '') + fmt(e.rendimento);
    const taxaStr   = e.taxaAnual !== null ? `${e.taxaAnual.toFixed(1)}%` : '—';
    const taxaClass = e.taxaAnual === null ? 'neu' : e.taxaAnual >= taxaSim * 0.8 ? 'pos' : e.taxaAnual >= 0 ? 'neu' : 'neg';

    // Retirada
    const retStr = e.retirada ? `<span class="retirada-badge">-${fmt(e.retirada)}${e.retiradaMotivo?' · '+e.retiradaMotivo:''}</span>` : '';

    // Semáforo
    let semaforo = '';
    if (e.taxaMensal !== null) {
      const diff = e.taxaMensal - taxaSimMes;
      if (diff >= -0.1)      semaforo = `<span class="semaforo sem-green">▲</span>`;
      else if (diff >= -0.5) semaforo = `<span class="semaforo sem-gold">≈</span>`;
      else                   semaforo = `<span class="semaforo sem-red">▼</span>`;
    }

    return `<tr>
      <td>${mesLabel} ${semaforo}${retStr}</td>
      <td class="pos">${fmt(e.aporte || 0)}</td>
      <td class="${rendClass}">${rendStr}</td>
      <td class="${rendClass}">${e.taxaMensal !== null ? e.taxaMensal.toFixed(2) + '%' : '—'}</td>
      <td class="${taxaClass}">${taxaStr} a.a.</td>
      <td class="pos">${fmt(e.patrimonio)}</td>
      <td style="display:flex;gap:4px">
        <button class="del-btn" onclick="openEditTrack('${e.mes}')" title="Editar">✏️</button>
        <button class="del-btn" onclick="deleteTrackEntry('${e.mes}')" title="Excluir">🗑</button>
      </td>
    </tr>`;
  }).join('');

  const totalRend = totalRendimentos;
  const totalRendClass = totalRend >= 0 ? 'pos' : 'neg';

  area.innerHTML = `
    <div class="track-table-wrap">
      <table class="track-table">
        <thead>
          <tr>
            <th style="text-align:left">Mês</th>
            <th>Aporte</th>
            <th>Rendimento</th>
            <th>Taxa/mês</th>
            <th>Taxa anual.</th>
            <th>Patrimônio</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td>Total / Acumulado</td>
            <td>${fmt(totalAportes)}</td>
            <td class="${totalRendClass}">${totalRend >= 0 ? '+' : ''}${fmt(totalRend)}</td>
            <td colspan="2">—</td>
            <td>${entries.length ? fmt(entries[entries.length-1].patrimonio) : '—'}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>`;
}

// ── Insights ──
function renderTrackInsights(entries) {
  const panel = document.getElementById('trackInsightsPanel');
  const grid  = document.getElementById('trackInsights');
  if (entries.length < 1) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';

  const taxaSim    = parseFloat(document.getElementById('taxaAnual')?.value) || 10;
  const taxaSimMes = Math.pow(1 + taxaSim/100, 1/12) - 1;
  const reaj       = (parseFloat(document.getElementById('reajuste')?.value) || 5) / 100;
  const anosTotal  = parseInt(document.getElementById('anos')?.value) || 20;

  // ── Dados base ──
  const comRend    = entries.filter(e => e.rendimento !== null);
  const ultEntry   = entries[entries.length-1];
  const ultPatr    = ultEntry?.patrimonio || 0;
  const ultMes     = ultEntry?.mes || '';
  const totalAp    = entries.reduce((s,e) => s + (e.aporte||0), 0);
  const totalRend  = comRend.reduce((s,e) => s + e.rendimento, 0);
  const negativos  = comRend.filter(e => e.rendimento < 0).length;
  const positivos  = comRend.filter(e => e.rendimento > 0).length;

  // ── Taxa real: média ponderada pelo patrimônio (mais precisa que média simples) ──
  // Usa XIRR simplificado: taxa geométrica encadeada dos meses com rendimento
  let taxaMediaReal = null;
  if (comRend.length >= 1) {
    // Produto das taxas mensais (1+r1)(1+r2)...(1+rN) → taxa composta
    const produto = comRend.reduce((acc, e) => {
      const tm = e.taxaMensal !== null ? e.taxaMensal / 100 : 0;
      return acc * (1 + tm);
    }, 1);
    const taxaMesMedia = Math.pow(produto, 1/comRend.length) - 1;
    taxaMediaReal = (Math.pow(1 + taxaMesMedia, 12) - 1) * 100;
  }

  // ── Patrimônio simulado no mês exato do último registro ──
  // FIX: usa patNoMes() com interpolação, calculando meses desde o início
  let patSimulado = null;
  let mesesDecorridos = 0;
  if (typeof snaps !== 'undefined' && snaps.length > 1 && entries.length > 0) {
    const firstMes = entries[0].mes;
    const [fy,fm] = firstMes.split('-').map(Number);
    const [ly,lm] = ultMes.split('-').map(Number);
    mesesDecorridos = (ly - fy) * 12 + (lm - fm);
    // patNoMes interpola entre anos do snap → valor correto para qualquer mês
    patSimulado = typeof patNoMes === 'function'
      ? patNoMes(mesesDecorridos)
      : null;
  }

  const desvioPatr  = patSimulado !== null ? ultPatr - patSimulado : null;
  const desvioClass = desvioPatr === null ? 'ic-blue' : desvioPatr >= 0 ? 'ic-green' : 'ic-red';
  const ultMesLabel = ultMes ? new Date(ultMes+'-02').toLocaleDateString('pt-BR',{month:'long',year:'numeric'}) : '';

  // ── Recuperação de desvio: cálculo correto com juros compostos ──
  // Quanto aportar a mais por mês para recuperar o desvio em N meses,
  // considerando que o patrimônio atual também cresce com juros
  let recuperacao = null;
  let mesesRecuperar = 6;
  if (desvioPatr !== null && desvioPatr < 0) {
    // FV do desvio em N meses a taxa simulada = quanto ainda faltará
    // Aporte extra necessário = FV_desvio / ((1+r)^N - 1) * r  (anuidade)
    const fvDesvio = Math.abs(desvioPatr) * Math.pow(1 + taxaSimMes, mesesRecuperar);
    if (taxaSimMes > 0) {
      recuperacao = fvDesvio * taxaSimMes / (Math.pow(1 + taxaSimMes, mesesRecuperar) - 1);
    } else {
      recuperacao = Math.abs(desvioPatr) / mesesRecuperar;
    }
  }

  // ── Consistência: compara com aporte simulado REAJUSTADO para cada mês ──
  // FIX: não usa snaps[0].apN fixo — reconstrói o aporte esperado mês a mês
  let consistencia = null;
  if (typeof snaps !== 'undefined' && snaps.length && entries.length > 0) {
    const ap0 = snaps[0]?.apN || 0;
    if (ap0 > 0) {
      // Aporte esperado em cada mês (reajustado anualmente)
      const firstMes = entries[0].mes;
      const [fy0,fm0] = firstMes.split('-').map(Number);
      let totalSimulado = 0;
      entries.forEach(e => {
        const [ey,em] = e.mes.split('-').map(Number);
        const mesesDesdePrimeiro = (ey-fy0)*12 + (em-fm0);
        const anosReaj = Math.floor(mesesDesdePrimeiro / 12);
        const aporteEsperado = ap0 * Math.pow(1 + reaj, anosReaj);
        totalSimulado += aporteEsperado;
      });
      consistencia = totalSimulado > 0
        ? Math.min(200, (totalAp / totalSimulado * 100)).toFixed(0)
        : null;
    }
  }

  // ── Projeção ajustada: usa patrimônio REAL atual + taxa real ──
  // FIX: mesesRestantes = total do horizonte MENOS meses já decorridos desde o INÍCIO
  let patFinalAjustado = null;
  let mesesRestantes   = 0;
  if (taxaMediaReal !== null && ultPatr > 0) {
    const taxaMesReal = Math.pow(1 + taxaMediaReal/100, 1/12) - 1;
    // Meses passados desde o início da simulação (não só dos registros)
    mesesRestantes = Math.max(0, anosTotal * 12 - mesesDecorridos);
    let patFinal = ultPatr;
    let ap = ultEntry?.aporte || (snaps?.[0]?.apN || 0);
    // Reajusta o aporte para o momento atual
    const anosJaPassados = Math.floor(mesesDecorridos / 12);
    ap = (snaps?.[0]?.apN || ap) * Math.pow(1 + reaj, anosJaPassados);
    let mc = 0;
    while (mc < mesesRestantes) {
      patFinal = patFinal * (1 + taxaMesReal) + ap;
      mc++;
      if (mc % 12 === 0) ap *= (1 + reaj);
    }
    patFinalAjustado = patFinal;
  }

  const patSimFinal = snaps?.length ? snaps[snaps.length-1]?.pat || 0 : 0;

  const cards = [];

  // ── Card 1: Patrimônio Real vs. Simulado ──
  cards.push(`
    <div class="insight-card ${desvioClass}">
      <div class="insight-icon">🏦</div>
      <div class="insight-title">Patrimônio Real vs. Simulado</div>
      <div class="insight-value" style="color:${desvioPatr===null?'var(--bl)':desvioPatr>=0?'var(--ac)':'var(--re)'}">
        ${fmt(ultPatr)}
      </div>
      <div class="insight-desc">
        ${desvioPatr === null
          ? 'Configure a simulação para comparar com o planejado.'
          : `Em <strong>${ultMesLabel}</strong> o simulado previa <strong>${fmt(patSimulado)}</strong>.
             Desvio: <strong style="color:${desvioPatr>=0?'var(--ac)':'var(--re)'}">${desvioPatr>=0?'+':''}${fmt(desvioPatr)}</strong>
             ${desvioPatr >= 0 ? '🚀 Você está à frente do plano!' : ''}`}
      </div>
      ${recuperacao ? `
        <div class="insight-badge" style="background:var(--reg);color:var(--re);margin-top:8px;display:block;padding:6px 10px;border-radius:8px;font-size:11px;line-height:1.4">
          ⚠️ Para recuperar em ${mesesRecuperar} meses:<br>
          aportar <strong>+${fmt(recuperacao)}/mês</strong> além do planejado
        </div>` : ''}
    </div>`);

  // ── Card 2: Taxa Real Média ──
  const taxaColor2 = taxaMediaReal === null ? 'var(--bl)'
    : taxaMediaReal >= taxaSim ? 'var(--ac)'
    : taxaMediaReal >= taxaSim*0.7 ? 'var(--go)'
    : 'var(--re)';
  const taxaClass2 = taxaMediaReal === null ? 'ic-blue'
    : taxaMediaReal >= taxaSim ? 'ic-green'
    : taxaMediaReal >= taxaSim*0.7 ? 'ic-gold'
    : 'ic-red';
  // Diferença em pontos percentuais vs. simulado
  const diffTaxa = taxaMediaReal !== null ? (taxaMediaReal - taxaSim).toFixed(1) : null;
  cards.push(`
    <div class="insight-card ${taxaClass2}">
      <div class="insight-icon">📊</div>
      <div class="insight-title">Taxa Real Média</div>
      <div class="insight-value" style="color:${taxaColor2}">
        ${taxaMediaReal !== null ? taxaMediaReal.toFixed(1) + '% a.a.' : '—'}
      </div>
      <div class="insight-desc">
        ${taxaMediaReal === null
          ? 'Registre pelo menos 2 meses para calcular.'
          : `vs. ${taxaSim}% simulado
             <span style="color:${taxaMediaReal>=taxaSim?'var(--ac)':'var(--re)'};font-weight:600">
               (${diffTaxa > 0?'+':''}${diffTaxa} p.p.)
             </span><br>
             ${taxaMediaReal >= taxaSim
               ? 'Rentabilidade acima do plano! 🎯'
               : taxaMediaReal >= taxaSim*0.7
                 ? 'Dentro do esperado. Continue assim.'
                 : taxaMediaReal >= 0
                   ? 'Abaixo do plano. Revise a alocação.'
                   : 'Rentabilidade negativa. Renda variável em queda.'}`}
      </div>
    </div>`);

  // ── Card 3: Rendimento Total ──
  const melhorMes = comRend.length ? comRend.reduce((a,b) => (b.rendimento||0)>(a.rendimento||0)?b:a) : null;
  const piorMes   = comRend.length ? comRend.reduce((a,b) => (b.rendimento||0)<(a.rendimento||0)?b:a) : null;
  cards.push(`
    <div class="insight-card ${totalRend >= 0 ? 'ic-green' : 'ic-red'}">
      <div class="insight-icon">${totalRend >= 0 ? '✨' : '📉'}</div>
      <div class="insight-title">Rendimento Total Acumulado</div>
      <div class="insight-value" style="color:${totalRend >= 0 ? 'var(--ac)' : 'var(--re)'}">
        ${totalRend >= 0 ? '+' : ''}${fmt(totalRend)}
      </div>
      <div class="insight-desc">
        Sobre <strong>${fmt(totalAp)}</strong> aportados
        (${totalAp > 0 ? ((totalRend/totalAp)*100).toFixed(1) : 0}% de retorno).<br>
        ${positivos} positivo${positivos!==1?'s':''}, ${negativos} negativo${negativos!==1?'s':''}
        ${melhorMes ? `· Melhor: <strong style="color:var(--ac)">${new Date(melhorMes.mes+'-02').toLocaleDateString('pt-BR',{month:'short',year:'2-digit'})} (+${fmt(melhorMes.rendimento)})</strong>` : ''}
        ${piorMes && piorMes.rendimento < 0 ? `· Pior: <strong style="color:var(--re)">${new Date(piorMes.mes+'-02').toLocaleDateString('pt-BR',{month:'short',year:'2-digit'})} (${fmt(piorMes.rendimento)})</strong>` : ''}
      </div>
    </div>`);

  // ── Card 4: Consistência ──
  if (consistencia !== null) {
    const cNum = parseInt(consistencia);
    // Calcula aporte médio realizado vs. esperado
    const apMedioReal = entries.length > 0 ? totalAp / entries.length : 0;
    const apMedioEsp  = snaps?.[0]?.apN || 0;
    cards.push(`
      <div class="insight-card ${cNum >= 90 ? 'ic-green' : cNum >= 70 ? 'ic-gold' : 'ic-red'}">
        <div class="insight-icon">💪</div>
        <div class="insight-title">Consistência de Aportes</div>
        <div class="insight-value" style="color:${cNum >= 90 ? 'var(--ac)' : cNum >= 70 ? 'var(--go)' : 'var(--re)'}">
          ${consistencia}%
        </div>
        <div class="insight-desc">
          Média realizada: <strong>${fmt(apMedioReal)}/mês</strong>
          vs. planejado: <strong>${fmt(apMedioEsp)}/mês</strong>.<br>
          ${cNum >= 90
            ? '🏆 Disciplina excelente! Mantendo o plano.'
            : cNum >= 70
              ? 'Boa consistência. Tente fechar o gap.'
              : `Abaixo do planejado. Faltaram ~${fmt(apMedioEsp - apMedioReal)}/mês em média.`}
        </div>
      </div>`);
  }

  // ── Card 5: Projeção ajustada ──
  if (patFinalAjustado !== null) {
    const difProj = patFinalAjustado - patSimFinal;
    cards.push(`
      <div class="insight-card ic-purple">
        <div class="insight-icon">🔮</div>
        <div class="insight-title">Projeção Ajustada pela Taxa Real</div>
        <div class="insight-value" style="color:var(--pu)">${fmtK(patFinalAjustado)}</div>
        <div class="insight-desc">
          Taxa real ${taxaMediaReal.toFixed(1)}% a.a. · ${mesesRestantes} meses restantes<br>
          Simulado original: <strong>${fmtK(patSimFinal)}</strong>
          <span style="color:${difProj>=0?'var(--ac)':'var(--re)'}">
            (${difProj>=0?'+':''}${fmtK(difProj)})
          </span>
        </div>
      </div>`);
  }

  // ── Card 6: CDI Benchmark ──
  // Taxa CDI referência configurável — padrão 10,9% a.a. (2026)
  // Usuário pode alterar via campo taxaAnual do simulador como proxy
  const CDI_ANUAL = 10.9; // % — referência SELIC/CDI 2026
  if (taxaMediaReal !== null) {
    const diffCDI    = (taxaMediaReal - CDI_ANUAL).toFixed(1);
    const diffCDINum = parseFloat(diffCDI);
    const cdiClass   = diffCDINum >= 0 ? 'ic-green' : diffCDINum >= -3 ? 'ic-gold' : 'ic-red';
    const cdiColor   = diffCDINum >= 0 ? 'var(--ac)' : diffCDINum >= -3 ? 'var(--go)' : 'var(--re)';
    cards.push(`
      <div class="insight-card ${cdiClass}">
        <div class="insight-icon">📡</div>
        <div class="insight-title">vs. CDI (benchmark)</div>
        <div class="insight-value" style="color:${cdiColor}">
          ${diffCDINum >= 0 ? '+' : ''}${diffCDI} p.p.
        </div>
        <div class="insight-desc">
          Sua carteira rendeu <strong>${taxaMediaReal.toFixed(1)}% a.a.</strong>
          vs. CDI <strong>${CDI_ANUAL}% a.a.</strong><br>
          ${diffCDINum >= 0
            ? `🏅 Você está batendo o CDI! Carteira eficiente.`
            : diffCDINum >= -3
              ? 'Perto do CDI — alocação razoável para renda variável.'
              : 'Abaixo do CDI. Considere revisar a alocação ou os custos.'}
          <span style="font-size:9px;color:var(--t3);display:block;margin-top:4px">CDI referência ${CDI_ANUAL}% a.a. (2026)</span>
        </div>
      </div>`);
  }

  // ── Card 7: Streak de aportes consecutivos ──
  {
    const sortedEntries = [...entries].sort((a,b) => a.mes.localeCompare(b.mes));
    let streak = 0, maxStreak = 0, currentStreak = 0;
    for (let i = 0; i < sortedEntries.length; i++) {
      if ((sortedEntries[i].aporte || 0) > 0) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }
    streak = currentStreak; // streak atual (últimos meses consecutivos)
    if (entries.length >= 2) {
      const streakClass = streak >= 6 ? 'ic-green' : streak >= 3 ? 'ic-gold' : 'ic-blue';
      const streakColor = streak >= 6 ? 'var(--ac)' : streak >= 3 ? 'var(--go)' : 'var(--bl)';
      cards.push(`
        <div class="insight-card ${streakClass}">
          <div class="insight-icon">🔥</div>
          <div class="insight-title">Sequência de Aportes</div>
          <div class="insight-value" style="color:${streakColor}">
            ${streak} ${streak === 1 ? 'mês' : 'meses'}
          </div>
          <div class="insight-desc">
            ${streak >= 6
              ? `🏆 Sequência incrível! ${streak} meses consecutivos aportando.`
              : streak >= 3
                ? `Boa consistência! ${streak} meses seguidos.`
                : streak === 0
                  ? 'Nenhum aporte no mês mais recente.'
                  : `${streak} mês com aporte. Continue a sequência!`}
            ${maxStreak > streak ? `<br><span style="color:var(--t3);font-size:10px">Recorde pessoal: ${maxStreak} meses</span>` : ''}
          </div>
        </div>`);
    }
  }

  // ── Card 8: Alerta de queda sem retirada ──
  {
    const alertas = [];
    for (let i = 1; i < entries.length; i++) {
      const prev = entries[i-1], curr = entries[i];
      const queda = curr.patrimonio - prev.patrimonio;
      // Queda real = patrimônio caiu E não há retirada registrada que a justifique
      if (queda < 0 && !(curr.retirada > 0)) {
        const mesLbl = new Date(curr.mes+'-02').toLocaleDateString('pt-BR',{month:'short',year:'2-digit'});
        alertas.push(`${mesLbl}: <strong style="color:var(--re)">${fmt(queda)}</strong>`);
      }
    }
    if (alertas.length > 0) {
      cards.push(`
        <div class="insight-card ic-red">
          <div class="insight-icon">⚠️</div>
          <div class="insight-title">Quedas sem Retirada Registrada</div>
          <div class="insight-value" style="color:var(--re)">${alertas.length} ocorrência${alertas.length>1?'s':''}</div>
          <div class="insight-desc">
            ${alertas.slice(-3).join('<br>')}
            ${alertas.length > 3 ? `<br><span style="color:var(--t3);font-size:10px">+ ${alertas.length-3} anterior${alertas.length-3>1?'es':''}</span>` : ''}
            <br><span style="color:var(--t3);font-size:10px">Verifique se há retirada não registrada ou dado incorreto.</span>
          </div>
        </div>`);
    }
  }

  grid.innerHTML = cards.join('');
}

// ── Interpolação com baseline congelado ──
function baselinePatNoMes(meses, baseline) {
  const s = baseline.snaps;
  if (!s || s.length < 2) return null;
  const anos    = meses / 12;
  const maxAnos = s.length - 1;
  if (anos <= 0) return s[0].pat;
  if (anos >= maxAnos) return s[maxAnos].pat;
  const i    = Math.floor(anos);
  const frac = anos - i;
  return s[i].pat + frac * (s[i+1].pat - s[i].pat);
}

// ── Compare chart ──
function renderCompareChart(entries, baseline) {
  const panel = document.getElementById('trackChartPanel');
  if (entries.length < 1) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';

  const labels      = entries.map(e => new Date(e.mes + '-02').toLocaleDateString('pt-BR', {month:'short', year:'2-digit'}));
  const realPats    = entries.map(e => e.patrimonio);

  // Simulado: interpola o patrimônio simulado para cada mês registrado
  // usando patNoMes() que faz interpolação linear entre anos do snap
  let simPats = null;
  if (typeof snaps !== 'undefined' && snaps.length > 1 && entries.length > 0) {
    // Calcula quantos meses cada entry está à frente do primeiro entry
    const firstMes = entries[0].mes;
    simPats = entries.map(e => {
      const [fy, fm] = firstMes.split('-').map(Number);
      const [ey, em] = e.mes.split('-').map(Number);
      const mesesDesdeInicio = (ey - fy) * 12 + (em - fm);
      // patNoMes dá o patrimônio simulado naquele mês (interpolado)
      return typeof patNoMes === 'function' ? patNoMes(mesesDesdeInicio) : null;
    });
  }

  const ctx = document.getElementById('compareChart').getContext('2d');
  if (compareChart) compareChart.destroy();

  const datasets = [
    {
      label: 'Patrimônio Real',
      data: realPats,
      borderColor: '#5dd4a0',
      backgroundColor: 'rgba(93,212,160,0.1)',
      borderWidth: 2.5,
      fill: true,
      tension: 0.3,
      pointRadius: 5,
      pointHoverRadius: 8,
      pointBackgroundColor: realPats.map((v,i) => {
        if (entries[i]?.retirada) return '#e06c6c';     // vermelho = retirada
        if (!simPats || simPats[i] === null) return '#5dd4a0';
        return v >= simPats[i] ? '#5dd4a0' : '#e06c6c';
      }),
      pointRadius: realPats.map((_,i) => entries[i]?.retirada ? 8 : 5),
      pointStyle:  realPats.map((_,i) => entries[i]?.retirada ? 'triangle' : 'circle'),
      pointHoverBackgroundColor: '#fff',
    }
  ];

  if (simPats) {
    datasets.push({
      label: 'Patrimônio Simulado',
      data: simPats,
      borderColor: '#6aace6',
      backgroundColor: 'rgba(106,172,230,0.05)',
      borderWidth: 1.5,
      borderDash: [6,3],
      fill: false,
      tension: 0.3,
      pointRadius: 3,
      pointBackgroundColor: '#6aace6',
    });
  }

  let blPats = null;
  if (baseline) {
    const [by, bm] = baseline.definidoEm.split('-').map(Number);
    // Ancora a linha no patrimônio real do mês do Dia 0 (ou do primeiro mês >= Dia 0)
    const dia0Entry = entries.find(e => {
      const [ey, em] = e.mes.split('-').map(Number);
      return (ey - by) * 12 + (em - bm) >= 0;
    });
    const anchorReal = dia0Entry ? dia0Entry.patrimonio : 0;
    const anchorProj = baselinePatNoMes(0, baseline) || 0;
    const offset = anchorReal - anchorProj;

    blPats = entries.map(e => {
      const [ey, em] = e.mes.split('-').map(Number);
      const mesesDesde = (ey - by) * 12 + (em - bm);
      if (mesesDesde < 0) return null;
      const proj = baselinePatNoMes(mesesDesde, baseline);
      return proj !== null ? proj + offset : null;
    });
    datasets.push({
      label: 'Projeção Dia 0',
      data: blPats,
      borderColor: '#f0a04b',
      backgroundColor: 'rgba(240,160,75,0.05)',
      borderWidth: 1.5,
      borderDash: [4,4],
      fill: false,
      tension: 0.3,
      pointRadius: 3,
      pointBackgroundColor: '#f0a04b',
      spanGaps: true,
    });
  }

  compareChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#8fa0b0', font: { family: 'Sora', size: 11 }, boxWidth: 18 } },
        tooltip: {
          backgroundColor: '#161c28',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#e8ead4',
          bodyColor: '#8fa0b0',
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`,
            afterBody: items => {
              const i = items[0].dataIndex;
              const e = entries[i];
              const lines = [];
              if (e.rendimento !== null) {
                const sign = e.rendimento >= 0 ? '+' : '';
                lines.push(`  💸 Aporte: ${fmt(e.aporte||0)}`);
                lines.push(`  📈 Rendimento: ${sign}${fmt(e.rendimento)}`);
                if (e.taxaAnual !== null) lines.push(`  📊 Taxa: ${e.taxaAnual.toFixed(1)}% a.a.`);
              }
              if (entries[i]?.retirada) {
                lines.push(`  💰 Retirada: −${fmt(entries[i].retirada)}${entries[i].retiradaMotivo ? ' ('+entries[i].retiradaMotivo+')' : ''}`);
              }
              if (simPats && simPats[i] !== null) {
                const desvio = entries[i].patrimonio - simPats[i];
                lines.push(`  ${desvio >= 0 ? '✅' : '⚠️'} Desvio: ${desvio >= 0 ? '+' : ''}${fmt(desvio)}`);
              }
              if (blPats && blPats[i] !== null) {
                const desvioBase = entries[i].patrimonio - blPats[i];
                lines.push(`  ${desvioBase >= 0 ? '📌✅' : '📌⚠️'} vs Dia 0: ${desvioBase >= 0 ? '+' : ''}${fmt(desvioBase)}`);
              }
              return lines;
            }
          }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#4d6070', font: { family: 'DM Mono', size: 10 } } },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#4d6070', font: { family: 'DM Mono', size: 10 }, callback: v => v >= 1e6 ? `R$${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `R$${(v/1e3).toFixed(0)}K` : `R$${v}` }
        }
      }
    }
  });
}

// ── Tabela de desvio vs Dia 0 ──
function renderBaselineDeviationTable(entries, baseline) {
  const panel = document.getElementById('baselineDeviationPanel');
  if (!panel) return;
  if (!baseline || entries.length === 0) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';

  const [by, bm] = baseline.definidoEm.split('-').map(Number);
  const dia0Entry = entries.find(e => {
    const [ey, em] = e.mes.split('-').map(Number);
    return (ey - by) * 12 + (em - bm) >= 0;
  });
  const anchorReal = dia0Entry ? dia0Entry.patrimonio : 0;
  const anchorProj = baselinePatNoMes(0, baseline) || 0;
  const offset = anchorReal - anchorProj;

  const rows = entries.map(e => {
    const [ey, em] = e.mes.split('-').map(Number);
    const mesesDesde = (ey - by) * 12 + (em - bm);
    const label = new Date(e.mes+'-02').toLocaleDateString('pt-BR',{month:'short',year:'2-digit'});
    if (mesesDesde < 0) {
      return `<tr><td>${label}</td><td class="neu">—</td><td class="neu">Antes do Dia 0</td><td>—</td></tr>`;
    }
    const proj = baselinePatNoMes(mesesDesde, baseline);
    const esperado = proj !== null ? proj + offset : null;
    if (esperado === null) return '';
    const desvio = e.patrimonio - esperado;
    const pct    = esperado > 0 ? (desvio / esperado * 100) : 0;
    const statusClass = desvio >= 0 ? 'pos' : pct >= -5 ? 'neu' : 'neg';
    const statusText  = desvio >= 0 ? '✅ Acima' : pct >= -5 ? '≈ Dentro' : '⚠️ Abaixo';
    return `<tr>
      <td>${label}</td>
      <td class="pos">${fmt(e.patrimonio)}</td>
      <td class="neu">${fmt(esperado)}</td>
      <td class="${statusClass}">${desvio >= 0 ? '+' : ''}${fmt(desvio)} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%) ${statusText}</td>
    </tr>`;
  }).join('');

  panel.innerHTML = `
    <div class="track-section-title">📌 Progresso vs Dia 0</div>
    <div class="track-table-wrap">
      <table class="track-table">
        <thead><tr>
          <th style="text-align:left">Mês</th>
          <th>Real</th>
          <th>Esperado (Dia 0)</th>
          <th>Desvio</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}


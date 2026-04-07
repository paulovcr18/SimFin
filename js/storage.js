// ════════════════════════════════════════════════════════
// SAVE / EXPORT / IMPORT SYSTEM
// ════════════════════════════════════════════════════════

// Keys compartilhadas (também usadas por db.js)
const STORAGE_KEY    = 'simfin_saves';      // legado — mantido para migração no import
const SCENARIO_KEY   = 'simfin_scenario';   // cenário único atual
const REMINDER_KEY   = 'simfin_reminder_config'; // usado por reminders.js e db.js

// ── Cache em memória para localStorage — reduz JSON.parse() repetidos
const _lsCache = {};
function lsGet(key) {
  if (_lsCache[key] !== undefined) return _lsCache[key];
  const val = localStorage.getItem(key);
  try {
    _lsCache[key] = val ? JSON.parse(val) : null;
  } catch {
    _lsCache[key] = null;
  }
  return _lsCache[key];
}
function lsSet(key, val) {
  _lsCache[key] = val;
  localStorage.setItem(key, JSON.stringify(val));
}
function lsRemove(key) {
  delete _lsCache[key];
  localStorage.removeItem(key);
}

// ── Toast ──
let toastTimer;
function showToast(msg, icon='✅', dur=3000) {
  const t = document.getElementById('toast');
  document.getElementById('toastMsg').textContent  = msg;
  document.getElementById('toastIcon').textContent = icon;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), dur);
}

// ── Collect inputs ──
function getInputs() {
  const ids = ['p1bruto','p1vr','p1plr','p2bruto','p2vr','p2plr',
                'p1fat','p1retirada','p1prolabore','p1reserva',
                'p2fat','p2retirada','p2prolabore','p2reserva',
                'pctMoradia','pctAlimentacao','pctTransporte','pctContas','pctLazer','pctInvest',
                'taxaAnual','anos','reajuste','patrimonioInicial','taxaInflacao',
                'p1regime','p2regime'];
  const parseVal = el => {
    if(el.tagName === 'SELECT') return el.value;
    // Campos monetários: parse do valor formatado
    if(el.dataset.cur === 'money'){
      return parseFloat((el.value||'').replace(/\./g,'').replace(',','.')) || 0;
    }
    return parseFloat(el.value) || 0;
  };
  const out = { _regime1: regime[1], _regime2: regime[2] };
  ids.forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    out[id] = parseVal(el);
  });
  return out;
}

// ── Apply inputs ──
function applyInputs(data) {
  const parseVal = (el, val) => {
    if(el.tagName === 'SELECT') return val;
    // Campos monetários: formata o valor numérico salvo
    if(el.dataset.cur === 'money' && val && parseFloat(val) > 0){
      return parseFloat(val).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
    }
    return val;
  };
  const moneyIds = ['p1bruto','p1vr','p1plr','p2bruto','p2vr','p2plr',
                    'p1fat','p1retirada','p1prolabore',
                    'p2fat','p2retirada','p2prolabore'];
  Object.entries(data).forEach(([id, val]) => {
    if(id.startsWith('_')) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.value = parseVal(el, val);
    if(moneyIds.includes(id) && val && parseFloat(val) > 0){
      el.setAttribute('inputmode','numeric');
      el.dataset._curMasked = '1';
    }
  });
  // Init masks nos campos monetários recém-setados
  document.querySelectorAll('[data-cur="money"]').forEach(el=>{
    if(!el.dataset._curMasked){
      el.setAttribute('inputmode','numeric');
      el.oninput = function(){ curMask(this); };
      el.dataset._curMasked = '1';
    }
  });
  // Restore regimes
  if(data._regime1) setRegime(1, data._regime1);
  if(data._regime2) setRegime(2, data._regime2);
  updAno();
  calc();
}

// ── Escape HTML ──
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ════════════════════════════════════════════════════════
// CENÁRIO ÚNICO
// ════════════════════════════════════════════════════════

function scenarioLoad() {
  try { return JSON.parse(localStorage.getItem(SCENARIO_KEY)) || {}; } catch { return {}; }
}

function scenarioSave() {
  const nameEl = document.getElementById('scenarioName');
  const sc     = scenarioLoad();
  const now    = new Date().toISOString();
  const name   = nameEl?.value?.trim() || sc.name || 'Meu Cenário';
  const updated = {
    name,
    createdAt:  sc.createdAt || now,
    updatedAt:  now,
  };
  localStorage.setItem(SCENARIO_KEY, JSON.stringify(updated));
  dbPushConfig({ scenario: updated }).catch(() => {});
  scenarioBtnUpdate();
  closeScenarioDrop();
  showToast(`Cenário "${name}" salvo!`, '💾');
}

function scenarioBtnUpdate() {
  const sc    = scenarioLoad();
  const lbl   = document.getElementById('scenarioBtnLabel');
  const nameEl = document.getElementById('scenarioName');
  const dates  = document.getElementById('scenarioDates');
  const name   = sc.name || 'Cenário';

  if (lbl) lbl.textContent = name.length > 18 ? name.slice(0, 16) + '…' : name;
  if (nameEl && !nameEl.matches(':focus')) nameEl.value = sc.name || '';

  if (dates) {
    const fmtDate = iso => iso
      ? new Date(iso).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
      : '—';
    dates.innerHTML = sc.createdAt
      ? `Criado em: ${fmtDate(sc.createdAt)}<br>Editado em: ${fmtDate(sc.updatedAt)}`
      : 'Nenhum cenário salvo ainda.';
  }
}

// Inicializa o cenário na primeira vez (auto-cria ao salvar inputs)
function scenarioAutoTouch() {
  const sc = scenarioLoad();
  if (!sc.createdAt) {
    const now = new Date().toISOString();
    const initial = { name: 'Meu Cenário', createdAt: now, updatedAt: now };
    localStorage.setItem(SCENARIO_KEY, JSON.stringify(initial));
    dbPushConfig({ scenario: initial }).catch(() => {});
  }
  scenarioBtnUpdate();
}

// ════════════════════════════════════════════════════════════════
// DIA 0 — BASELINE (projeção congelada para comparação futura)
// ════════════════════════════════════════════════════════════════

const BASELINE_KEY = 'simfin_baseline';

function baselineLoad() {
  try { return JSON.parse(localStorage.getItem(BASELINE_KEY)) || null; } catch { return null; }
}

function baselineSave() {
  if (typeof snaps === 'undefined' || snaps.length < 2) {
    showToast('Calcule a simulação primeiro', '⚠️', 2500); return;
  }
  const now = new Date();
  const mes = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const payload = {
    definidoEm: mes,
    definidoEmISO: now.toISOString(),
    snaps: JSON.parse(JSON.stringify(snaps)),
    inputs: getInputs()
  };
  localStorage.setItem(BASELINE_KEY, JSON.stringify(payload));
  dbPushConfig({ baseline: payload }).catch(() => {});
  baselineBannerUpdate();
  showToast('Dia 0 definido para ' + new Date(mes+'-02').toLocaleDateString('pt-BR',{month:'long',year:'numeric'}), '📌', 3000);
}

function baselineClear() {
  if (!confirm('Remover o Dia 0? O histórico de acompanhamento não é afetado.')) return;
  localStorage.removeItem(BASELINE_KEY);
  dbPushConfig({ baseline: null }).catch(() => {});
  baselineBannerUpdate();
}

function baselineBannerUpdate() {
  const el = document.getElementById('dia0Banner');
  if (!el) return;
  const bl = baselineLoad();
  if (!bl) {
    el.innerHTML = `<div class="dia0-prompt">
      <span>📌 Defina o <strong>Dia 0</strong> para acompanhar sua evolução vs. a projeção original</span>
      <button onclick="baselineSave()" class="btn-dia0-set">Definir agora</button>
    </div>`;
    el.style.display = 'block';
    return;
  }
  const label = new Date(bl.definidoEm+'-02').toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  const s0    = bl.snaps[0]?.patrimonio || 0;
  const s1    = bl.snaps[1]?.patrimonio || 0;
  const sLast = bl.snaps[bl.snaps.length-1]?.patrimonio || 0;
  el.innerHTML = `<div class="dia0-active">
    <span class="dia0-label">📌 Dia 0: <strong>${label}</strong></span>
    <span class="dia0-snap">Ano 0: ${fmt(s0)} → Ano 1: ${fmt(s1)} → Ano ${bl.snaps.length-1}: ${fmt(sLast)}</span>
    <button onclick="baselineClear()" class="btn-dia0-clear" title="Remover baseline">✕ Redefinir</button>
  </div>`;
  el.style.display = 'block';
}

// ── Dropdown ──
function toggleScenarioDrop(e) {
  e.stopPropagation();
  const drop = document.getElementById('scenarioDrop');
  drop.classList.toggle('open');
  if (drop.classList.contains('open')) scenarioBtnUpdate();
}
function closeScenarioDrop() {
  document.getElementById('scenarioDrop')?.classList.remove('open');
}
document.addEventListener('click', e => {
  const wrap = document.getElementById('scenarioWrap');
  if (wrap && !wrap.contains(e.target)) closeScenarioDrop();
});

// ════════════════════════════════════════════════════════
// EXPORT / IMPORT
// ════════════════════════════════════════════════════════

function exportJSON() {
  const inputs  = getInputs();
  const g       = id => parseFloat(document.getElementById(id).value) || 0;
  const f1      = calcFolha(g('p1bruto'), g('p1vr'), g('p1plr'));
  const f2      = calcFolha(g('p2bruto'), g('p2vr'), g('p2plr'));
  const renda   = f1.rendaReal + f2.rendaReal;
  const anos    = parseInt(document.getElementById('anos').value) || 20;
  const taxa    = parseFloat(document.getElementById('taxaAnual').value) || 10;
  const payload = {
    _schemaVersion: 2,
    meta: {
      app: 'SimFin · Simulador Financeiro Familiar',
      versao: '3.0',
      exportadoEm: new Date().toISOString(),
      rendaMensalCasal: +renda.toFixed(2),
      projecaoAnos: anos,
      taxaAnual: taxa,
    },
    cenario:        scenarioLoad(),
    inputs,
    acompanhamento: JSON.parse(localStorage.getItem('simfin_track')         || '[]'),
    metas:          JSON.parse(localStorage.getItem('simfin_goals')         || '[]'),
    carteira:       JSON.parse(localStorage.getItem('simfin_carteira')      || '[]'),
    negociacoes:    JSON.parse(localStorage.getItem('simfin_negociacoes')   || '[]'),
    movimentacoes:  JSON.parse(localStorage.getItem('simfin_movimentacoes') || '[]'),
    projecao: snaps.map(s => ({
      ano:             s.ano,
      patrimonio:      +s.pat.toFixed(2),
      totalAportado:   +s.totAp.toFixed(2),
      rendaTotal:      +s.renda.toFixed(2),
      aporteMensal:    +s.apN.toFixed(2),
      rendimentoAnual: +(s.rendAnual||0).toFixed(2),
      f1Bruto:         +s.f1.bruto.toFixed(2),
      f2Bruto:         +s.f2.bruto.toFixed(2),
    }))
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `simfin_backup_${new Date().toISOString().slice(0,10)}.json`; a.click();
  URL.revokeObjectURL(url);
  showToast('Backup exportado com sucesso!', '📦');
}

function triggerImport() { document.getElementById('importInput').value=''; document.getElementById('importInput').click(); }

function handleImport(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.inputs && !data.acompanhamento && !data.metas) throw new Error('Formato inválido');

      const restored = [];

      if (data.inputs) { applyInputs(data.inputs); restored.push('configuração'); }

      if (data.cenario) {
        localStorage.setItem(SCENARIO_KEY, JSON.stringify(data.cenario));
        scenarioBtnUpdate();
      }

      if (data.acompanhamento?.length) {
        const local  = JSON.parse(localStorage.getItem('simfin_track') || '[]');
        const merged = [...local];
        data.acompanhamento.forEach(dr => {
          const idx = merged.findIndex(l => l.mes === dr.mes);
          if (idx < 0) merged.push(dr);
          else if (dr.registradoEm && new Date(dr.registradoEm) > new Date(merged[idx].registradoEm || 0))
            merged[idx] = dr;
        });
        merged.sort((a,b) => a.mes.localeCompare(b.mes));
        localStorage.setItem('simfin_track', JSON.stringify(merged));
        const novos = merged.length - local.length;
        if (novos > 0) restored.push(`${novos} mês(es)`);
      }

      if (data.metas?.length) {
        const local  = JSON.parse(localStorage.getItem('simfin_goals') || '[]');
        const merged = [...local];
        data.metas.forEach(dm => { if (!merged.find(l => l.id === dm.id)) merged.push(dm); });
        localStorage.setItem('simfin_goals', JSON.stringify(merged));
        const novas = merged.length - local.length;
        if (novas > 0) restored.push(`${novas} meta(s)`);
      }

      if (data.carteira?.length) {
        const local = JSON.parse(localStorage.getItem('simfin_carteira') || '[]');
        const merged = [...local];
        data.carteira.forEach(dc => {
          const idx = merged.findIndex(l => l.ticker === dc.ticker);
          if (idx < 0) merged.push(dc);
          else if (dc.updatedAt && new Date(dc.updatedAt) > new Date(merged[idx].updatedAt || 0))
            merged[idx] = dc;
        });
        localStorage.setItem('simfin_carteira', JSON.stringify(merged));
        if (merged.length > local.length) restored.push(`carteira (${merged.length - local.length} novos)`);
      }
      if (data.negociacoes?.length) {
        const local = JSON.parse(localStorage.getItem('simfin_negociacoes') || '[]');
        const merged = [...local];
        data.negociacoes.forEach(dn => {
          if (!merged.some(l => l.data===dn.data && l.ticker===dn.ticker && l.tipo===dn.tipo && Math.abs(l.preco-dn.preco)<0.01))
            merged.push(dn);
        });
        localStorage.setItem('simfin_negociacoes', JSON.stringify(merged));
        if (merged.length > local.length) restored.push(`${merged.length - local.length} negociação(ões)`);
      }
      if (data.movimentacoes?.length) {
        const local = JSON.parse(localStorage.getItem('simfin_movimentacoes') || '[]');
        const merged = [...local];
        data.movimentacoes.forEach(dm => {
          if (!merged.some(l => l.data===dm.data && l.ticker===dm.ticker && l.tipo===dm.tipo && Math.abs(l.valor-dm.valor)<0.01))
            merged.push(dm);
        });
        localStorage.setItem('simfin_movimentacoes', JSON.stringify(merged));
        if (merged.length > local.length) restored.push(`${merged.length - local.length} movimentação(ões)`);
      }

      showToast(`Importado: ${restored.join(', ') || 'dados'}`, '📂');
    } catch { showToast('Arquivo inválido ou corrompido', '❌', 4000); }
  };
  reader.readAsText(file);
}

function exportCSV() {
  if (!snaps.length) { showToast('Gere a simulação primeiro', '⚠️'); return; }
  const pcts = getPcts();
  const catLabels = ['Moradia','Alimentação','Transporte','Contas','Lazer','Investimento'];
  const catKeys   = ['pctMoradia','pctAlimentacao','pctTransporte','pctContas','pctLazer','pctInvest'];
  const header = [
    'Ano','Ano Calendário','Renda Operacional (R$)','Renda Diluída (R$)','Aporte Mensal (R$)',
    'Rendimento Mensal (R$)','Patrimônio Total (R$)','Total Aportado (R$)','Juros Acumulados (R$)',
    'Salário Bruto P1 (R$)','Renda Real P1 (R$)','Salário Bruto P2 (R$)','Renda Real P2 (R$)',
    ...catLabels.map(c => c+' (R$)'), 'Multiplicador (%)'
  ].join(';');
  const yrNow2 = new Date().getFullYear();
  const fC = v => v.toFixed(2).replace('.',',');
  const rows = snaps.map(s => {
    const juros = Math.max(0, s.pat - s.totAp);
    const mult  = s.totAp > 0 ? ((juros/s.totAp)*100).toFixed(1).replace('.',',') : '0,0';
    return [
      s.ano, yrNow2+s.ano, fC(s.rendaOp||s.renda), fC(s.renda), fC(s.apN), fC(s.rendAnual/12),
      fC(s.pat), fC(s.totAp), fC(juros),
      fC(s.f1.bruto), fC(s.f1.rendaReal), fC(s.f2.bruto), fC(s.f2.rendaReal),
      ...catKeys.map(k => fC(s.renda*(pcts[k]||0)/100)),
      mult
    ].join(';');
  });
  const csv  = '\uFEFF' + [header, ...rows].join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `simfin_projecao_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exportado! Abra no Excel ou Google Sheets', '📊');
}

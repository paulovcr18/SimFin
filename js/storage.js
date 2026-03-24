// ════════════════════════════════════════════════════════
// SAVE / EXPORT / IMPORT SYSTEM
// ════════════════════════════════════════════════════════

const STORAGE_KEY = 'simfin_saves';
const MAX_SAVES   = 10;

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
        'patInvestimentos','patFGTS','patReserva',
                'p1regime','p2regime'];
  const out = { _regime1: regime[1], _regime2: regime[2] };
  ids.forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    out[id] = el.tagName === 'SELECT' ? el.value : (parseFloat(el.value) || 0);
  });
  return out;
}

// ── Apply inputs ──
function applyInputs(data) {
  Object.entries(data).forEach(([id, val]) => {
    if(id.startsWith('_')) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.value = val;
  });
  // Restore regimes
  if(data._regime1) setRegime(1, data._regime1);
  if(data._regime2) setRegime(2, data._regime2);
  updAno();
  calc();
}

// ── LocalStorage helpers ──
function loadSaves()        { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; } }
function persistSaves(s)    { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }

// ── Escape HTML ──
function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Render saved list ──
function renderSavedList() {
  const saves = loadSaves();
  const listEl  = document.getElementById('savesDropList');
  const countEl = document.getElementById('savesDropCount');
  const lblEl   = document.getElementById('savesCountLbl');
  if (countEl) countEl.textContent = `${saves.length} / ${MAX_SAVES}`;
  if (lblEl)   lblEl.textContent   = saves.length ? `Salvas (${saves.length})` : 'Salvas';
  if (!listEl) return;
  if (!saves.length) {
    listEl.innerHTML = '<div class="saves-drop-empty">Nenhuma simulação salva ainda.</div>';
    return;
  }
  listEl.innerHTML = saves.map((s, i) => `
    <div class="sdrop-item" onclick="loadSave(${i});closeSavesDrop()" title="Carregar simulação" style="position:relative">
      <div style="font-size:16px;flex-shrink:0">📋</div>
      <div class="sdrop-item-info">
        <div class="sdrop-item-name">${escHtml(s.name)}</div>
        <div class="sdrop-item-meta">${escHtml(s.summary)} · ${escHtml(s.date)}</div>
      </div>
      <button class="sdrop-del" onclick="event.stopPropagation();openVersions(${i})" title="Histórico de versões" style="color:var(--t3);font-size:11px;background:none;border:none;cursor:pointer;padding:2px 4px">🕐</button>
      <button class="sdrop-del" onclick="event.stopPropagation();deleteSave(${i})" title="Excluir">🗑</button>
    </div>`).join('');
}

function toggleSavesDrop(e) {
  e.stopPropagation();
  document.getElementById('savesDrop').classList.toggle('open');
}
function closeSavesDrop() {
  document.getElementById('savesDrop').classList.remove('open');
}
document.addEventListener('click', e => {
  if (!document.getElementById('savesWrap').contains(e.target)) closeSavesDrop();
});

// ── Open save modal ──
function openSaveModal() {
  const saves = loadSaves();
  const hint  = document.getElementById('saveHint');
  const over  = saves.length >= MAX_SAVES;
  hint.textContent = over
    ? `⚠️ Limite de ${MAX_SAVES} simulações atingido. Exclua uma antes.`
    : `${saves.length} de ${MAX_SAVES} slots usados`;
  hint.style.color = over ? 'var(--re)' : 'var(--t3)';
  document.getElementById('saveName').value = '';
  document.getElementById('smo').classList.add('open');
  setTimeout(() => document.getElementById('saveName').focus(), 180);
}

// ── Confirm save ──
function confirmSave() {
  const saves   = loadSaves();
  const name    = document.getElementById('saveName').value.trim() || `Simulação ${new Date().toLocaleDateString('pt-BR')}`;
  const inputs  = getInputs();
  const g       = id => parseFloat(document.getElementById(id).value) || 0;
  const f1      = calcFolha(g('p1bruto'), g('p1vr'), g('p1plr'));
  const f2      = calcFolha(g('p2bruto'), g('p2vr'), g('p2plr'));
  const renda   = f1.rendaReal + f2.rendaReal;
  const anos    = parseInt(document.getElementById('anos').value) || 20;
  const taxa    = document.getElementById('taxaAnual').value;
  const summary = `Renda ${fmtK(renda)}/mês · ${anos} anos · ${taxa}% a.a.`;
  const now     = new Date();
  const date    = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});

  // Verifica se já existe simulação com o mesmo nome
  const existsIdx = saves.findIndex(s => s.name === name);
  if (existsIdx >= 0) {
    // Pergunta: sobrescrever ou criar nova versão?
    const choice = confirm(
      `"${name}" já existe.

OK → Criar nova versão (mantém histórico)
Cancelar → Sobrescrever`
    );
    const existing = saves[existsIdx];
    if (choice) {
      // Nova versão — guarda o estado atual no histórico
      const versions = existing.versions || [];
      versions.push({ inputs: existing.inputs, summary: existing.summary, savedAt: existing.date });
      saves[existsIdx] = { ...existing, inputs, summary, date, versions };
    } else {
      // Sobrescreve sem histórico adicional
      saves[existsIdx] = { ...existing, inputs, summary, date };
    }
    persistSaves(saves);
    document.getElementById('smo').classList.remove('open');
    renderSavedList();
    showToast(choice ? `"${name}" — nova versão salva!` : `"${name}" sobrescrita!`, '💾');
    driveAutoPush();
    return;
  }

  // Nome novo — salva normalmente
  if (saves.length >= MAX_SAVES) { showToast(`Limite de ${MAX_SAVES} slots atingido`, '⚠️'); return; }
  saves.push({ name, inputs, summary, date, versions: [] });
  persistSaves(saves);
  document.getElementById('smo').classList.remove('open');
  renderSavedList();
  showToast(`"${name}" salva com sucesso!`, '💾');
  driveAutoPush();
}

// ── Load / Delete ──
function loadSave(i) {
  const saves = loadSaves();
  if (!saves[i]) return;
  applyInputs(saves[i].inputs);
  renderSavedList();
  showToast(`"${saves[i].name}" carregada!`, '📋');
}
function deleteSave(i) {
  const saves = loadSaves();
  const name  = saves[i]?.name || 'Simulação';
  saves.splice(i, 1);
  persistSaves(saves);
  renderSavedList();
  showToast(`"${name}" excluída`, '🗑', 2500);
  driveAutoPush(); // sincroniza exclusão com o Drive
}

// ── Export JSON — exporta tudo: inputs, simulações salvas e acompanhamento ──
function exportJSON() {
  const inputs  = getInputs();
  const g       = id => parseFloat(document.getElementById(id).value) || 0;
  const f1      = calcFolha(g('p1bruto'), g('p1vr'), g('p1plr'));
  const f2      = calcFolha(g('p2bruto'), g('p2vr'), g('p2plr'));
  const renda   = f1.rendaReal + f2.rendaReal;
  const anos    = parseInt(document.getElementById('anos').value) || 20;
  const taxa    = parseFloat(document.getElementById('taxaAnual').value) || 10;
  const payload = {
    meta: {
      app: 'SimFin · Simulador Financeiro Familiar',
      versao: '3.0',
      exportadoEm: new Date().toISOString(),
      rendaMensalCasal: +renda.toFixed(2),
      projecaoAnos: anos,
      taxaAnual: taxa,
    },
    inputs,
    simulacoes:     JSON.parse(localStorage.getItem('simfin_saves')  || '[]'),
    acompanhamento: JSON.parse(localStorage.getItem('simfin_track')  || '[]'),
    metas:          JSON.parse(localStorage.getItem('simfin_goals')  || '[]'),
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
  showToast('Backup completo exportado! (inputs + simulações + acompanhamento)', '📦');
}

// ── Import JSON — restaura inputs, simulações salvas e acompanhamento ──
function triggerImport() { document.getElementById('importInput').value=''; document.getElementById('importInput').click(); }
function handleImport(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.inputs && !data.simulacoes && !data.acompanhamento && !data.metas) throw new Error('Formato inválido');

      const restored = [];

      // Restaura inputs da simulação atual
      if (data.inputs) {
        applyInputs(data.inputs);
        restored.push('configuração atual');
      }

      // Restaura simulações salvas (merge — não sobrescreve existentes)
      if (data.simulacoes && Array.isArray(data.simulacoes) && data.simulacoes.length) {
        const local  = loadSaves();
        const merged = [...local];
        data.simulacoes.forEach(ds => {
          const exists = merged.findIndex(l => l.name === ds.name && l.date === ds.date);
          if (exists < 0) merged.push(ds);
        });
        persistSaves(merged);
        renderSavedList();
        const novas = merged.length - local.length;
        if (novas > 0) restored.push(`${novas} simulação(ões)`);
      }

      // Restaura acompanhamento (merge — não sobrescreve meses existentes)
      if (data.acompanhamento && Array.isArray(data.acompanhamento) && data.acompanhamento.length) {
        const local  = JSON.parse(localStorage.getItem('simfin_track') || '[]');
        const merged = [...local];
        data.acompanhamento.forEach(dr => {
          const idx = merged.findIndex(l => l.mes === dr.mes);
          if (idx < 0) merged.push(dr);
          else if (dr.registradoEm && new Date(dr.registradoEm) > new Date(merged[idx].registradoEm || 0)) {
            merged[idx] = dr;
          }
        });
        merged.sort((a,b) => a.mes.localeCompare(b.mes));
        localStorage.setItem('simfin_track', JSON.stringify(merged));
        const novos = merged.length - local.length;
        if (novos > 0) restored.push(`${novos} mês(es) de acompanhamento`);
      }

      // Restaura metas (merge — não duplica por id)
      if (data.metas && Array.isArray(data.metas) && data.metas.length) {
        const local  = JSON.parse(localStorage.getItem('simfin_goals') || '[]');
        const merged = [...local];
        data.metas.forEach(dm => {
          if (!merged.find(l => l.id === dm.id)) merged.push(dm);
        });
        localStorage.setItem('simfin_goals', JSON.stringify(merged));
        const novas = merged.length - local.length;
        if (novas > 0) restored.push(`${novas} meta(s)`);
      }

      const msg = restored.length ? restored.join(', ') : 'dados';
      showToast(`Importado: ${msg}`, '📂');

      // Sincroniza com Drive se conectado
      driveAutoPush();

    } catch(err) { showToast('Arquivo inválido ou corrompido', '❌', 4000); }
  };
  reader.readAsText(file);
}

// ── Export CSV ──
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



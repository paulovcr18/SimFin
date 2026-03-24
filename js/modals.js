// ════════════════════════════════════════════════════════════════
// EDITAR META
// ════════════════════════════════════════════════════════════════
function openEditGoal(id) {
  const g = loadGoals().find(g => g.id === id);
  if (!g) return;
  document.getElementById('editGoalId').value    = id;
  document.getElementById('editGoalCat').value   = g.cat;
  document.getElementById('editGoalName').value  = g.name;
  document.getElementById('editGoalValor').value = g.valor;
  document.getElementById('editGoalMeses').value = g.meses;
  document.getElementById('editGoalModal').classList.add('open');
}
function closeEditGoal() {
  document.getElementById('editGoalModal').classList.remove('open');
}
function saveEditGoal() {
  const id    = parseInt(document.getElementById('editGoalId').value);
  const goals = loadGoals();
  const idx   = goals.findIndex(g => g.id === id);
  if (idx < 0) return;
  const meses = parseInt(document.getElementById('editGoalMeses').value) || goals[idx].meses;
  goals[idx] = {
    ...goals[idx],
    cat:   document.getElementById('editGoalCat').value,
    name:  document.getElementById('editGoalName').value.trim() || goals[idx].name,
    valor: parseFloat(document.getElementById('editGoalValor').value) || goals[idx].valor,
    meses,
    data:  mesesParaData(meses),
  };
  saveGoals(goals);
  closeEditGoal();
  renderGoals();
  showToast('Meta atualizada!', '✅');
}

// ════════════════════════════════════════════════════════════════
// EDITAR REGISTRO DE ACOMPANHAMENTO
// ════════════════════════════════════════════════════════════════
function openEditTrack(mes) {
  const entries = loadTrack();
  const e = entries.find(e => e.mes === mes);
  if (!e) return;
  document.getElementById('editTrackMes').value         = mes;
  document.getElementById('editTrackMesInput').value    = mes;
  document.getElementById('editTrackAporte').value      = e.aporte || '';
  document.getElementById('editTrackPatrimonio').value  = e.patrimonio || '';
  document.getElementById('editTrackRetirada').value    = e.retirada || '';
  document.getElementById('editTrackMotivo').value      = e.retiradaMotivo || '';
  document.getElementById('editTrackModal').classList.add('open');
}
function closeEditTrack() {
  document.getElementById('editTrackModal').classList.remove('open');
}
function saveEditTrack() {
  const mes      = document.getElementById('editTrackMes').value;
  const aporte   = parseFloat(document.getElementById('editTrackAporte').value)     || 0;
  const patrim   = parseFloat(document.getElementById('editTrackPatrimonio').value) || 0;
  const retirada = parseFloat(document.getElementById('editTrackRetirada').value)   || 0;
  const motivo   = document.getElementById('editTrackMotivo').value.trim();

  if (!patrim) { showToast('Informe o saldo da carteira', '⚠️'); return; }

  const entries = loadTrack();
  const idx     = entries.findIndex(e => e.mes === mes);
  if (idx < 0) return;

  const { rendimento, taxaMensal, taxaAnual } = calcTrackEntry(mes, aporte, patrim, retirada);

  entries[idx] = {
    ...entries[idx],
    aporte, patrimonio: patrim,
    retirada: retirada || null,
    retiradaMotivo: motivo || null,
    rendimento, taxaMensal, taxaAnual,
    editadoEm: new Date().toISOString(),
  };

  entries.sort((a,b) => a.mes.localeCompare(b.mes));
  saveTrack(entries);
  closeEditTrack();
  renderTrack();
  showToast('Registro atualizado!', '✅');
}

// ════════════════════════════════════════════════════════════════
// HISTÓRICO DE VERSÕES
// ════════════════════════════════════════════════════════════════
function openVersions(i) {
  const saves = loadSaves();
  const s     = saves[i];
  if (!s) return;
  document.getElementById('versionsSimName').textContent = `Simulação: "${s.name}"`;

  const versions = s.versions || [];
  const list     = document.getElementById('versionsList');

  if (!versions.length) {
    list.innerHTML = `<div style="font-size:12px;color:var(--t3);text-align:center;padding:20px">Nenhuma versão anterior. As próximas edições criarão um histórico aqui.</div>`;
  } else {
    list.innerHTML = [...versions].reverse().map((v, vi) => `
      <div class="ver-item" onclick="loadVersion(${i}, ${versions.length-1-vi})">
        <div class="ver-meta">
          <div class="ver-name">Versão ${versions.length - vi}</div>
          <div class="ver-date">${v.savedAt || '—'}</div>
          <div class="ver-summary">${v.summary || ''}</div>
        </div>
        <span class="ver-badge">Restaurar</span>
      </div>`).join('');
  }

  document.getElementById('versionsModal').classList.add('open');
  document._versionsIdx = i;
}

function loadVersion(saveIdx, versionIdx) {
  const saves = loadSaves();
  const s     = saves[saveIdx];
  if (!s?.versions?.[versionIdx]) return;
  if (!confirm('Restaurar esta versão? Os dados atuais da simulação serão substituídos.')) return;
  applyInputs(s.versions[versionIdx].inputs);
  closeVersions();
  showToast('Versão restaurada!', '🕐');
}

function closeVersions() {
  document.getElementById('versionsModal').classList.remove('open');
}

// ════════════════════════════════════════════════════════════════
// INFLAÇÃO — cálculo do valor real (poder de compra)
// ════════════════════════════════════════════════════════════════
function calcInflacaoSnaps(snaps) {
  const inflAnual = parseFloat(document.getElementById('taxaInflacao')?.value) || 4.5;
  return snaps.map(s => ({
    ...s,
    patReal: s.pat / Math.pow(1 + inflAnual/100, s.ano), // descontado
  }));
}



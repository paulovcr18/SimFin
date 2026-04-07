// ════════════════════════
// STORAGE KEY (needs to be before rateio code)
// ════════════════════════
const INPUTS_AUTOSAVE_KEY = 'simfin_last_inputs';

// ════════════════════════════════════════════
// RATEIO PANEL — toggle % / R$ per category
// ════════════════════════════════════════════
const RATEIO_MODE_KEY = 'simfin_rateio_mode';

// Default rates matching the original HTML defaults
const RATEIO_DEFAULTS = {
  pctMoradia: 16,
  pctAlimentacao: 11,
  pctTransporte: 11,
  pctContas: 5,
  pctLazer: 11,
  pctInvest: 35,
};

function _getRateioMode() {
  try { return JSON.parse(localStorage.getItem(RATEIO_MODE_KEY)) || {}; } catch { return {}; }
}
function _setRateioMode(m) { localStorage.setItem(RATEIO_MODE_KEY, JSON.stringify(m)); }

/**
 * getRateioComputed — retorna {key: pct} normalizando % e R$
 */
function getRateioComputed() {
  const modes = _getRateioMode();
  const rendaOp = window.rendaOperacionalGlobal || 0;
  const result = {};
  BUDGET_CATEGORIES.forEach(c => {
    const el = document.getElementById(c.key);
    const val = parseFloat(el?.value) || 0;
    const isPct = modes[c.key] !== 'brl';
    result[c.key] = isPct ? val : (rendaOp > 0 ? val / rendaOp * 100 : 0);
  });
  return result;
}

let _rateioRendered = false;

function _getSavedRateioValue(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(INPUTS_AUTOSAVE_KEY) || '{}');
    if (saved[key] !== undefined) return parseFloat(saved[key]) || RATEIO_DEFAULTS[key] || 0;
  } catch {}
  return RATEIO_DEFAULTS[key] || 0;
}

function _splitLabel(label) {
  const m = label.match(/^(\p{Emoji}+)\s*(.*)$/u);
  return m ? [m[1], m[2]] : ['', label];
}

function renderRateioPanel() {
  const panel = document.getElementById('rateioPanel');
  if (!panel) return;
  const modes = _getRateioMode();
  const rendaOp = window.rendaOperacionalGlobal || 0;

  // Only build DOM once; subsequent calls just update mirrors
  if (!_rateioRendered) {
    const cats = BUDGET_CATEGORIES;
    const gastoCats = cats.filter(c => c.key !== 'pctInvest');
    const investCat = cats.find(c => c.key === 'pctInvest');

    panel.innerHTML = `
      <div class="ri-section">
        <div class="ri-heading">Gastos</div>
        <div class="ri-list">
          ${gastoCats.map(c => {
            const val = _getSavedRateioValue(c.key);
            const [icon, name] = _splitLabel(c.label);
            return `<div class="ri-row" data-key="${c.key}">
              <div class="ri-lbl"><span class="ri-icon">${icon}</span>${name}</div>
              <div class="ri-ctrls">
                <button class="ri-toggle" onclick="toggleRateio('${c.key}')" title="Alternar entre % e R$">%</button>
                <input type="number" id="${c.key}" class="ri-input" value="${val}"
                  min="0" step="any" oninput="onRateioInput('${c.key}', this.value)"
                  title="Porcentagem % (clique em % para trocar para R$)">
                <span class="ri-mirror">—</span>
              </div>
            </div>`;
          }).join('')}
          <div class="ri-row ri-total">
            <div class="ri-lbl"><strong>Total Gastos</strong></div>
            <div class="ri-ctrls">
              <span class="ri-total-pct" id="rateioTotalPct">0%</span>
              <span class="ri-total-brl" id="rateioTotalBrl">R$ 0,00</span>
            </div>
          </div>
        </div>
      </div>
      <div class="ri-section ri-invest">
        <div class="ri-heading">Aporte</div>
        <div class="ri-list">
          <div class="ri-row" data-key="pctInvest">
            <div class="ri-lbl"><span class="ri-icon">📈</span>Investimento</div>
            <div class="ri-ctrls">
              <button class="ri-toggle" onclick="toggleRateio('pctInvest')" title="Alternar entre % e R$">%</button>
              <input type="number" id="pctInvest" class="ri-input" value="${_getSavedRateioValue('pctInvest')}"
                min="0" step="any" oninput="onRateioInput('pctInvest', this.value)"
                title="Porcentagem % (clique em % para trocar para R$)">
              <span class="ri-mirror">—</span>
            </div>
          </div>
        </div>
      </div>
    `;
    _rateioRendered = true;
    // Immediate mirror update after creating elements
    _updateRateioMirrors(rendaOp, modes);
  } else {
    // Update mirrors for all rows
    _updateRateioMirrors(rendaOp, modes);
  }
}

function _updateRateioMirrors(rendaOp, modes) {
  BUDGET_CATEGORIES.forEach(c => {
    const row = document.querySelector(`.ri-row[data-key="${c.key}"]`);
    if (!row) return;
    const inp = row.querySelector('.ri-input');
    const mirror = row.querySelector('.ri-mirror');
    if (!inp || !mirror) return;

    const isPct = modes[c.key] !== 'brl';
    const val = parseFloat(inp.value) || 0;

    if (isPct) {
      inp.setAttribute('title', 'Porcentagem %');
      const brlVal = rendaOp * val / 100;
      mirror.textContent = fmt(brlVal);
    } else {
      inp.setAttribute('title', 'Valor em R$');
      const pctVal = rendaOp > 0 ? (val / rendaOp * 100) : 0;
      mirror.textContent = pctVal.toFixed(2) + '%';
    }

    // Sync toggle button text
    const btn = row.querySelector('.ri-toggle');
    if (btn) btn.textContent = isPct ? '%' : 'R$';
  });

  // Update totals row
  const totalPct = document.getElementById('rateioTotalPct');
  const totalBrl = document.getElementById('rateioTotalBrl');
  if (totalPct && totalBrl) {
    let sumPct = 0;
    BUDGET_CATEGORIES.forEach(c => {
      const row = document.querySelector(`.ri-row[data-key="${c.key}"]`);
      if (!row) return;
      const inp = row.querySelector('.ri-input');
      const isPct = modes[c.key] !== 'brl';
      const val = parseFloat(inp?.value) || 0;
      sumPct += isPct ? val : (rendaOp > 0 ? val / rendaOp * 100 : 0);
    });
    totalPct.textContent = sumPct.toFixed(2) + '%';
    totalBrl.textContent = fmt(rendaOp * sumPct / 100);
  }
}

function toggleRateio(key) {
  const modes = _getRateioMode();
  const isPct = modes[key] !== 'brl';
  modes[key] = isPct ? 'brl' : 'pct';
  _setRateioMode(modes);

  // Convert current value in the input
  const row = document.querySelector(`.ri-row[data-key="${key}"]`);
  if (!row) return;
  const inp = row.querySelector('.ri-input');
  if (!inp) return;
  const rendaOp = window.rendaOperacionalGlobal || 0;
  const val = parseFloat(inp.value) || 0;

  if (isPct) {
    inp.value = rendaOp > 0 ? parseFloat((rendaOp * val / 100).toFixed(2)) : 0;
  } else {
    inp.value = rendaOp > 0 ? parseFloat((val / rendaOp * 100).toFixed(2)) : 0;
  }

  _updateRateioMirrors(rendaOp, modes);
  calc();
}

function onRateioInput(key, value) {
  calc();
}

// ════════════════════════
// MAIN CALC
// ════════════════════════
// ════════════════════════
// REGIME TOGGLE
// ════════════════════════
function setRegime(pid, tipo){
  regime[pid]=tipo;
  const cltEl=document.getElementById(`p${pid}cltFields`);
  const pjEl =document.getElementById(`p${pid}pjFields`);
  const tabCLT=document.getElementById(`p${pid}tabCLT`);
  const tabPJ =document.getElementById(`p${pid}tabPJ`);
  const brutoLbl=document.getElementById(`p${pid}brutoLabel`);
  const brutoRow=document.getElementById(`p${pid}bruto`).closest('.ig');

  if(tipo==='PJ'){
    cltEl.style.display='none';
    pjEl.style.display='flex';
    pjEl.style.animation='none';
    pjEl.offsetHeight;
    pjEl.style.animation='rslide .28s ease both';
    tabCLT.className='rtab';
    tabPJ.className='rtab active-pj';
    brutoLbl.textContent='Retirada Total (R$)';
    brutoRow.style.display='none';
    pjEl.style.opacity='';pjEl.style.transform='';pjEl.style.transition='';
  } else {
    pjEl.style.display='none';
    cltEl.style.display='block';
    cltEl.style.animation='none';
    cltEl.offsetHeight;
    cltEl.style.animation='rslide .28s ease both';
    brutoRow.style.display='flex';
    brutoRow.style.animation='none';
    brutoRow.offsetHeight;
    brutoRow.style.animation='rslide .22s .06s ease both';
    tabCLT.className='rtab active-clt';
    tabPJ.className='rtab';
    brutoLbl.textContent='Salário Bruto Mensal (R$)';
    pjEl.style.opacity='';pjEl.style.transform='';pjEl.style.transition='';
    cltEl.style.opacity='';cltEl.style.transform='';cltEl.style.transition='';
    brutoRow.style.opacity='';brutoRow.style.transform='';brutoRow.style.transition='';
  }
  _calcReal();
}

// ════════════════════════
  // DEBOUNCE para calc() — Evita re-renderizações excessivas
  // ════════════════════════
  let _calcDebounceTimer = null;
  // Variável global para renda operacional (cache centralizado)
  window.rendaOperacionalGlobal = 0;
  
  function _calcReal(){
  const [p1b,p1v,p1p,p2b,p2v,p2p]=['p1bruto','p1vr','p1plr','p2bruto','p2vr','p2plr'].map(gP);
  const f1=calcFolha(p1b,p1v,p1p,1),f2=calcFolha(p2b,p2v,p2p,2);
  renderFolha('tP1',f1);renderFolha('tP2',f2);
  // Update person labels
  document.getElementById('p1label').textContent=regime[1]==='PJ'?'🏢 Pessoa Jurídica':'💼 CLT';
  document.getElementById('p2label').textContent=regime[2]==='PJ'?'🏢 Pessoa Jurídica':'💼 CLT';
  // Update topbar badge
  const hasPJ=regime[1]==='PJ'||regime[2]==='PJ';
  const allPJ=regime[1]==='PJ'&&regime[2]==='PJ';
  const badgeEl=document.getElementById('badgeRegime');
  badgeEl.textContent=allPJ?'PJ · 2026':hasPJ?'CLT+PJ · 2026':'CLT · 2026';
  badgeEl.style.color=allPJ?'var(--go)':hasPJ?'var(--bl)':'var(--ac)';
  badgeEl.style.borderColor=allPJ?'rgba(230,184,106,.3)':hasPJ?'rgba(106,172,230,.3)':'var(--bda)';
  badgeEl.style.background=allPJ?'var(--gog)':hasPJ?'var(--blg)':'var(--acg)';
  const renda   = f1.rendaReal + f2.rendaReal;   // diluída anual /12
  const rendaOp = (f1.rendaOp || f1.rendaReal) + (f2.rendaOp || f2.rendaReal);  // operacional mensal
  window.rendaOperacionalGlobal = rendaOp;
  renderRateioPanel();
  renderBudget(rendaOp, renda);
  const rates=getRateioComputed(), pI=rates.pctInvest, ap=rendaOp*pI/100; // aporte sobre renda operacional (alinhado com orçamento)
  const taxa=parseFloat(document.getElementById('taxaAnual').value)||10;
  const anos=parseInt(document.getElementById('anos').value)||20;
  const reaj=gP('reajuste'),patI=gP('patrimonioInicial');
  const tM=Math.pow(1+taxa/100,1/12)-1;
  let pat=patI,aporte=ap;
  for(let a=0;a<anos;a++){for(let m=0;m<12;m++)pat=pat*(1+tM)+aporte;aporte*=(1+reaj/100);}
  const rendFinal=pat*tM;
  const gastMes=rendaOp*(1-pI/100);  // gastos sobre renda operacional
  const libPct=gastMes>0?Math.min((rendFinal/gastMes)*100,200):0;
  const lc=libPct>=100?'var(--ac)':libPct>=50?'var(--go)':'var(--re)';

  document.getElementById('cardRenda').textContent=fmt(rendaOp);
  document.getElementById('cardRendaSub').textContent=`Operacional: ${fmt(rendaOp)} · Diluída: ${fmt(renda)}`;
  document.getElementById('cardAporte').textContent=fmt(ap);
  document.getElementById('cardAporteSub').textContent=`${pI}% da renda operacional mensal`;
  document.getElementById('cardProj').textContent=fmt(pat);
  document.getElementById('cardProjSub').textContent=`em ${anos} anos · ${taxa}% a.a.`;
  const fgtsAnual=(f1.fgts+f2.fgts)*12;
  document.getElementById('fgtsVal').textContent=fmt(fgtsAnual);
  // Update FGTS strip label to reflect PJ note
  const pjCount = [regime[1], regime[2]].filter(r => r === 'PJ').length;
  document.getElementById('fgtsStrip').style.opacity=fgtsAnual===0?'0.4':'1';
  document.getElementById('fgtsNote').textContent=pjCount>0
    ?`${pjCount===2?'Ambas as pessoas são PJ':'Uma pessoa é PJ'} · PJ não tem FGTS legal`
    :'patrimônio trabalhista · não incluso na renda';
  document.getElementById('rendPass').textContent=fmt(rendFinal);
  document.getElementById('rendPassSub').textContent=`no ano ${anos} · taxa ${taxa}% a.a.`;
  document.getElementById('libVal').textContent=`${libPct.toFixed(1)}%`;
  document.getElementById('libVal').style.color=lc;
  document.getElementById('libSub').textContent=`rendimento ${fmt(rendFinal)} vs. gastos ${fmt(gastMes)}/mês`;
  document.getElementById('libBar').style.width=Math.min(libPct,100)+'%';

  // PJ comparison info strip
  const pjEl=document.getElementById('pjInfoStrip');
  const pjPeople=[];
  if(regime[1]==='PJ') pjPeople.push({n:'Pessoa 1',f:f1});
  if(regime[2]==='PJ') pjPeople.push({n:'Pessoa 2',f:f2});
  if(pjPeople.length){
    pjEl.style.display='block';
    pjEl.innerHTML=pjPeople.map(p=>`
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div style="font-size:11px;color:var(--go);font-weight:600">🏢 ${p.n} · PJ ${p.f.regimePJ==='simples'?'Simples Nacional':'Lucro Presumido'}</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <span style="font-size:11px;color:var(--t2)">Faturamento: <span style="color:var(--t1);font-family:var(--fm)">${fmt(p.f.fat)}</span></span>
          <span style="font-size:11px;color:var(--t2)">Imposto: <span style="color:var(--re);font-family:var(--fm)">${fmt(p.f.impostoEmpresa)} (${(p.f.aliqImposto*100).toFixed(1)}%)</span></span>
          <span style="font-size:11px;color:var(--t2)">Dist. Lucros: <span style="color:var(--ac);font-family:var(--fm)">${fmt(p.f.distribuicao)}</span></span>
          <span style="font-size:11px;color:var(--t2)">CLT equivalente seria: <span style="color:var(--go);font-family:var(--fm)">${fmt(p.f.retirada/1.4)} bruto</span></span>
        </div>
      </div>`).join('<hr style="border-color:var(--bd);margin:8px 0">');
  } else {
    pjEl.style.display='none';
  }

  renderChart(anos,taxa,ap,reaj,patI,p1b,p1v,p1p,p2b,p2v,p2p);
  autoSaveInputs();
  }

  function calc() {
    _calcReal();
  }
  // Expõe no escopo global para handlers HTML
  window.calc = calc;

  // ── Auto-save inputs no localStorage ──

function autoSaveInputs() {
  try {
    const data = getInputs();
    data._regimes = { 1: regime[1], 2: regime[2] };
    localStorage.setItem(INPUTS_AUTOSAVE_KEY, JSON.stringify(data));
    dbDebounce('autosave', () => dbPushConfig({ autosave: data }).catch(() => {}));
  } catch(e) {}
}

async function saveSimulacao() {
  if (!currentUser) {
    showToast('Faça login para salvar a simulação', '⚠️', 4000);
    return;
  }
  const btn = document.getElementById('btnSalvarSimulacao');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
  try {
    const data = getInputs();
    data._regimes = { 1: regime[1], 2: regime[2] };
    localStorage.setItem(INPUTS_AUTOSAVE_KEY, JSON.stringify(data));
    await dbPushConfig({ autosave: data });
    showToast('Simulação salva! Disponível em qualquer dispositivo.', '💾');
  } catch(e) {
    showToast('Erro ao salvar. Verifique a conexão.', '❌', 4000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Salvar Simulação'; }
  }
}

function autoRestoreInputs() {
  // Always wire up oninput handlers on money fields, regardless of saved data
  document.querySelectorAll('[data-cur="money"]').forEach(el=>{
    el.setAttribute('inputmode','numeric');
    el.oninput = function(){ curMask(el); if(typeof calc==='function') calc(); };
    el.dataset._curMasked='1';
  });
  try {
    const saved = localStorage.getItem(INPUTS_AUTOSAVE_KEY);
    if (!saved) return false;
    const data = JSON.parse(saved);
    // Restaura regimes primeiro
    if (data._regimes) {
      setRegime(1, data._regimes[1] || 'CLT');
      setRegime(2, data._regimes[2] || 'CLT');
    }
    // Restaura todos os campos
    Object.entries(data).forEach(([id, val]) => {
      if (id.startsWith('_')) return;
      const el = document.getElementById(id);
      if (!el) return;
      el.value = val;
    });
    // Re-aplica mascara em campos monetários com valor salvo
    document.querySelectorAll('[data-cur="money"]').forEach(el=>{
      const num = parseFloat(el.value);
      if(num && num > 0){
        el.value = num.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
      }
    });
    return true;
  } catch(e) { return false; }
}

function updAno(){document.getElementById('anosLabel').textContent=document.getElementById('anos').value+' anos';}

document.addEventListener('keydown',e=>{
  if(!document.getElementById('moOv').classList.contains('open'))return;
  if(e.key==='Escape')closeM();
  if(e.key==='ArrowLeft')navM(-1);
  if(e.key==='ArrowRight')navM(+1);
});

updAno();
_calcReal(); // executa imediatamente (sem debounce)

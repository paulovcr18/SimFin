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
  renderBudget(rendaOp, renda);
  const pI=gP('pctInvest'),ap=rendaOp*pI/100; // aporte sobre renda operacional (alinhado com orçamento)
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
const INPUTS_AUTOSAVE_KEY = 'simfin_last_inputs';

function autoSaveInputs() {
  try {
    const data = getInputs();
    data._regimes = { 1: regime[1], 2: regime[2] };
    localStorage.setItem(INPUTS_AUTOSAVE_KEY, JSON.stringify(data));
    dbDebounce('autosave', () => dbPushConfig({ autosave: data }).catch(() => {}));
  } catch(e) {}
}

function autoRestoreInputs() {
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
    // Re-aplica mascara em campos monetários que ainda usam masking
    document.querySelectorAll('[data-cur="money"]').forEach(el=>{
      const num = parseFloat(el.value);
      if(num && num > 0){
        el.value = num.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
      }
      el.setAttribute('inputmode','numeric');
      el.oninput = function(){ curMask(el); if(typeof calc==='function') calc(); };
      el.dataset._curMasked='1';
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

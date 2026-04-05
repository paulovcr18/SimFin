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

  if(tipo==='PJ'){
    cltEl.style.display='none';
    pjEl.style.display='flex';
    tabCLT.className='rtab';
    tabPJ.className='rtab active-pj';
    brutoLbl.textContent='Retirada Total (R$)';
    // Hide the bruto input row (PJ uses retirada field instead)
    document.getElementById(`p${pid}bruto`).closest('.ig').style.display='none';
  } else {
    cltEl.style.display='block';
    pjEl.style.display='none';
    tabCLT.className='rtab active-clt';
    tabPJ.className='rtab';
    brutoLbl.textContent='Salário Bruto Mensal (R$)';
    document.getElementById(`p${pid}bruto`).closest('.ig').style.display='flex';
  }
  calc();
}

// ════════════════════════
  // DEBOUNCE para calc() — Evita re-renderizações excessivas
  // ════════════════════════
  let _calcDebounceTimer = null;
  // Variável global para renda operacional (cache centralizado)
  window.rendaOperacionalGlobal = 0;
  
  function _calcReal(){
  const g=id=>parseFloat(document.getElementById(id).value)||0;
  const [p1b,p1v,p1p,p2b,p2v,p2p]=['p1bruto','p1vr','p1plr','p2bruto','p2vr','p2plr'].map(g);
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
  const pI=g('pctInvest'),ap=rendaOp*pI/100; // aporte sobre renda operacional (alinhado com orçamento)
  const taxa=parseFloat(document.getElementById('taxaAnual').value)||10;
  const anos=parseInt(document.getElementById('anos').value)||20;
  const reaj=g('reajuste'),patI=g('patrimonioInicial');
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
    clearTimeout(_calcDebounceTimer);
    _calcDebounceTimer = setTimeout(() => { _calcReal(); }, 150);
  }

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

// ── Market Trends Ticker ──
(function initMktTicker(){
  function fmtNum(n, decimals=2){
    return n.toLocaleString('pt-BR',{minimumFractionDigits:decimals,maximumFractionDigits:decimals});
  }
  function fmtChg(pct){
    const cls = pct > 0 ? 'up' : pct < 0 ? 'dn' : 'nt';
    const sign = pct > 0 ? '+' : '';
    return { txt: sign + fmtNum(pct) + '%', cls };
  }
  function setChip(suffix, val, chgTxt, chgCls){
    ['','2'].forEach(s => {
      const v = document.getElementById('mkt-'+suffix+'-val'+(s==='2'?'2':''));
      const c = document.getElementById('mkt-'+suffix+'-chg'+(s==='2'?'2':''));
      if(v) v.textContent = val;
      if(c){ c.textContent = chgTxt; c.className = 'mkt-chip-chg '+chgCls; }
    });
  }

  async function fetchMkt(){
    try {
      const tickers = ['%5EBVSP','USDBRL=X','EURBRL=X','%5EIFIX','BTC-BRL'];
      const url = `https://brapi.dev/api/quote/${tickers.join(',')}?fundamental=false`;
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if(!r.ok) return;
      const data = await r.json();
      const results = data.results || [];
      const bySymbol = {};
      results.forEach(q => { bySymbol[q.symbol] = q; });

      const ibov = bySymbol['^BVSP'] || bySymbol['%5EBVSP'];
      if(ibov){
        const chg = fmtChg(ibov.regularMarketChangePercent||0);
        setChip('ibov', fmtNum(ibov.regularMarketPrice||0,0)+' pts', chg.txt, chg.cls);
      }
      const usd = bySymbol['USDBRL=X'];
      if(usd){
        const chg = fmtChg(usd.regularMarketChangePercent||0);
        setChip('usd', 'R$ '+fmtNum(usd.regularMarketPrice||0), chg.txt, chg.cls);
      }
      const eur = bySymbol['EURBRL=X'];
      if(eur){
        const chg = fmtChg(eur.regularMarketChangePercent||0);
        setChip('eur', 'R$ '+fmtNum(eur.regularMarketPrice||0), chg.txt, chg.cls);
      }
      const ifix = bySymbol['^IFIX'] || bySymbol['%5EIFIX'];
      if(ifix){
        const chg = fmtChg(ifix.regularMarketChangePercent||0);
        setChip('ifix', fmtNum(ifix.regularMarketPrice||0,0), chg.txt, chg.cls);
      }
      const btc = bySymbol['BTC-BRL'];
      if(btc){
        const chg = fmtChg(btc.regularMarketChangePercent||0);
        const bVal = btc.regularMarketPrice>=1000
          ? 'R$ '+fmtNum(btc.regularMarketPrice/1000,1)+'k'
          : 'R$ '+fmtNum(btc.regularMarketPrice||0,0);
        setChip('btc', bVal, chg.txt, chg.cls);
      }
    } catch(e){}
  }

  fetchMkt();
  let _mktInterval = setInterval(fetchMkt, 5*60*1000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearInterval(_mktInterval); _mktInterval = null; }
    else if (!_mktInterval) { _mktInterval = setInterval(fetchMkt, 5*60*1000); fetchMkt(); }
  });
})();

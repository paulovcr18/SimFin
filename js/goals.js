// ════════════════════════════════════════════════════════════════
// ABA DE METAS
// ════════════════════════════════════════════════════════════════

const GOALS_KEY = 'simfin_goals';
let goalsChart  = null;

const GOAL_CATS = {
  carro:     { icon:'🚗', label:'Carro',                color:'#6aace6' },
  imovel:    { icon:'🏠', label:'Casa / Imóvel',        color:'#5dd4a0' },
  viagem:    { icon:'✈️', label:'Viagem Internacional', color:'#a78bfa' },
  casamento: { icon:'💍', label:'Casamento',            color:'#e6b86a' },
  outro:     { icon:'⭐', label:'Outro',                color:'#8fa0b0' },
};

function loadGoals() { try { return JSON.parse(localStorage.getItem(GOALS_KEY))||[]; } catch { return []; } }
function saveGoals(g) { localStorage.setItem(GOALS_KEY,JSON.stringify(g)); }

// ── Interpola o patrimônio para meses não inteiros de ano ──
// snaps tem um ponto por ano (Ano 0, Ano 1, ..., Ano N)
// Para 18 meses = 1.5 anos → interpola entre Ano 1 e Ano 2
function patNoMes(meses) {
  if (!snaps || snaps.length < 2) return 0;
  const anoExato  = meses / 12;                        // ex: 1.5
  const anoAbaixo = Math.floor(anoExato);               // ex: 1
  const anoAcima  = Math.ceil(anoExato);                // ex: 2
  const fracao    = anoExato - anoAbaixo;               // ex: 0.5

  const idxA = Math.min(anoAbaixo, snaps.length - 1);
  const idxB = Math.min(anoAcima,  snaps.length - 1);

  const patA = snaps[idxA]?.pat || 0;
  const patB = snaps[idxB]?.pat || 0;

  // Interpolação linear simples entre os dois anos
  return patA + (patB - patA) * fracao;
}

const yrNowG=new Date().getFullYear();
function mesesParaData(m){ const d=new Date(); d.setMonth(d.getMonth()+parseInt(m)); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function dataParaMeses(yyyymm){ const [y,m]=yyyymm.split('-').map(Number),now=new Date(); return (y-now.getFullYear())*12+(m-1-now.getMonth()); }
function mesLabel(yyyymm){ return new Date(yyyymm+'-02').toLocaleDateString('pt-BR',{month:'long',year:'numeric'}); }

function goalCatChanged(){
  const cat=document.getElementById('goalCat').value;
  const nome=document.getElementById('goalName');
  if(!nome.value) nome.value=GOAL_CATS[cat]?.label||'';
}

function goalCalcAuto(changed){
  const valorEl=document.getElementById('goalValor');
  const mesesEl=document.getElementById('goalMeses');
  const dataEl =document.getElementById('goalData');
  const hintEl =document.getElementById('goalHint');
  const valor  =parseFloat(valorEl.value)||0;

  if(changed==='meses'&&mesesEl.value) dataEl.value=mesesParaData(mesesEl.value);
  else if(changed==='data'&&dataEl.value){ const m=dataParaMeses(dataEl.value); if(m>0) mesesEl.value=m; }

  const meses=parseInt(mesesEl.value)||0;
  if(valor>0&&meses>0){
    const patNaMeta=patNoMes(meses);
    if(patNaMeta>=valor){
      hintEl.innerHTML=`<span>✅</span><span>Patrimônio previsto em <strong>${mesLabel(mesesParaData(meses))}</strong>: <strong>${fmt(patNaMeta)}</strong> — suficiente para esta meta!</span>`;
    } else {
      hintEl.innerHTML=`<span>⚠️</span><span>Em <strong>${mesLabel(mesesParaData(meses))}</strong> o patrimônio previsto é <strong>${fmt(patNaMeta)}</strong>. Faltarão <strong style="color:var(--re)">${fmt(valor-patNaMeta)}</strong>.</span>`;
    }
  } else {
    hintEl.innerHTML=`<span>💡</span><span>Preencha o valor e o prazo — os campos se completam automaticamente.</span>`;
  }
}

function addGoal(){
  const cat  =document.getElementById('goalCat').value;
  const name =document.getElementById('goalName').value.trim();
  const valor=parseFloat(document.getElementById('goalValor').value)||0;
  const meses=parseInt(document.getElementById('goalMeses').value)||0;
  const data =document.getElementById('goalData').value;
  if(!name)  { showToast('Informe o nome da meta','⚠️'); return; }
  if(!valor) { showToast('Informe o valor necessário','⚠️'); return; }
  const mesesFinal=meses||dataParaMeses(data);
  if(mesesFinal<=0){ showToast('O prazo deve ser no futuro','⚠️'); return; }
  const goals=loadGoals();
  goals.push({ id:Date.now(), cat, name, valor, meses:mesesFinal, data:mesesParaData(mesesFinal), criadoEm:new Date().toISOString() });
  saveGoals(goals);
  document.getElementById('goalName').value='';
  document.getElementById('goalValor').value='';
  document.getElementById('goalMeses').value='';
  document.getElementById('goalData').value='';
  document.getElementById('goalHint').innerHTML='<span>✅</span><span>Meta adicionada!</span>';
  renderGoals();
  showToast(`Meta "${name}" adicionada!`,'🎯');
}

function deleteGoal(id){
  saveGoals(loadGoals().filter(g=>g.id!==id));
  renderGoals();
  showToast('Meta excluída','🗑',2000);
}

function calcProjectionWithGoals(goals){
  if(!snaps||snaps.length<2) return null;
  const sorted=[...goals].sort((a,b)=>a.meses-b.meses);
  const taxa  =parseFloat(document.getElementById('taxaAnual')?.value)||10;
  const reaj  =parseFloat(document.getElementById('reajuste')?.value)||5;
  const taxaM =Math.pow(1+taxa/100,1/12)-1;
  const totalAnos=parseInt(document.getElementById('anos')?.value)||20;
  const totalMeses=totalAnos*12;
  const ap0=snaps[0]?.apN||0;
  const patI=parseFloat(document.getElementById('patrimonioInicial')?.value)||0;
  let pat=patI, aporte=ap0;
  const results=[{mes:0,pat,label:'Hoje'}];
  for(let m=1;m<=totalMeses;m++){
    pat=pat*(1+taxaM)+aporte;
    sorted.forEach(g=>{ if(g.meses===m) pat=Math.max(0,pat-g.valor); });
    if(m%12===0) aporte*=(1+reaj/100);
    if(m%12===0||m===totalMeses){
      const ano=Math.floor(m/12);
      results.push({mes:m,pat,label:ano===0?'Hoje':`Ano ${ano}`});
    }
  }
  return results;
}

function renderGoals(){
  const goals=loadGoals();
  renderGoalsList(goals);
  renderGoalsSummary(goals);
  renderGoalsChart(goals);
}

function renderGoalsList(goals){
  const area=document.getElementById('goalsListArea');
  const count=document.getElementById('goalsCount');
  count.textContent=goals.length?`${goals.length} meta${goals.length>1?'s':''}`:'';
  if(!goals.length){
    area.innerHTML=`<div class="goals-empty"><div class="goals-empty-icon">🎯</div><div class="goals-empty-title">Nenhuma meta cadastrada</div><div class="goals-empty-sub">Adicione sua primeira meta acima. O simulador calculará quando você atingirá o valor e como isso afeta sua trajetória patrimonial.</div></div>`;
    return;
  }
  area.innerHTML=`<div class="goal-grid">${goals.sort((a,b)=>a.meses-b.meses).map(g=>{
    const cat=GOAL_CATS[g.cat]||GOAL_CATS.outro;
    const patNaMeta=patNoMes(g.meses);
    const viavel=patNaMeta>=g.valor;
    const pct=Math.min(100,(patNaMeta/Math.max(g.valor,1))*100);
    const anoCalend = yrNowG + Math.floor(g.meses/12);

    // Opção B — % do patrimônio previsto (peso da meta)
    const pesoPct = patNaMeta > 0 ? (g.valor / patNaMeta * 100).toFixed(1) : '—';

    // Opção A — patrimônio líquido após a retirada
    const patApos = Math.max(0, patNaMeta - g.valor);

    // Opção C — meses para recuperar o nível pré-retirada após a meta
    // Simula aportes + juros a partir de patApos até atingir patNaMeta novamente
    let mesesRecup = null;
    if (patApos < patNaMeta) {
      const taxa = parseFloat(document.getElementById('taxaAnual')?.value) || 10;
      const taxaM = Math.pow(1 + taxa/100, 1/12) - 1;
      const ap0 = snaps?.[0]?.apN || 0;
      const reaj = (parseFloat(document.getElementById('reajuste')?.value) || 5) / 100;
      const anosReaj = Math.floor(g.meses / 12);
      let ap = ap0 * Math.pow(1 + reaj, anosReaj);
      let pat = patApos, m = 0;
      while (pat < patNaMeta && m < 120) {
        pat = pat * (1 + taxaM) + ap;
        m++;
        if (m % 12 === 0) ap *= (1 + reaj);
      }
      mesesRecup = m < 120 ? m : null;
    }

    return `<div class="goal-card">
      <div class="goal-card-header">
        <div class="goal-card-icon" style="background:${cat.color}22;color:${cat.color}">${cat.icon}</div>
        <div class="goal-card-info">
          <div class="goal-card-name">${escHtml(g.name)}</div>
          <div class="goal-card-cat">${cat.label} · ${mesLabel(g.data)}</div>
        </div>
        <button class="goal-card-del" onclick="openEditGoal(${g.id})" title="Editar" style="color:var(--t3);font-size:12px">✏️</button>
        <button class="goal-card-del" onclick="deleteGoal(${g.id})" title="Excluir">🗑</button>
      </div>
      <div class="goal-card-body">
        <div class="goal-row">
          <span class="goal-row-label">Valor necessário</span>
          <span class="goal-row-val">
            <span style="color:${cat.color}">${fmt(g.valor)}</span>
            <span style="font-size:10px;color:var(--t3);font-family:var(--fb);margin-left:5px">(${pesoPct}% do patrimônio)</span>
          </span>
        </div>
        <div class="goal-row"><span class="goal-row-label">Patrimônio previsto no prazo</span><span class="goal-row-val" style="color:${viavel?'var(--ac)':'var(--re)'}">${fmt(patNaMeta)}</span></div>
        <div class="goal-progress-wrap"><div class="goal-progress-bar" style="width:${pct}%;background:${viavel?cat.color:'var(--re)'}"></div></div>
        <div class="goal-row"><span class="goal-row-label">Prazo</span><span class="goal-row-val">${g.meses} meses · ${anoCalend}</span></div>
        <div class="goal-row"><span class="goal-row-label">Patrimônio após a retirada</span><span class="goal-row-val" style="color:var(--go)">${fmt(patApos)}</span></div>
        <div class="goal-row"><span class="goal-row-label">Tempo para recuperar</span><span class="goal-row-val" style="color:var(--t2)">${mesesRecup !== null ? mesesRecup + ' meses' : '> 10 anos'}</span></div>
        <div>${viavel
          ?`<span class="goal-status gs-ok">✅ Meta atingível no prazo</span>`
          :`<span class="goal-status gs-warn">⚠️ Faltam ${fmt(g.valor-patNaMeta)} no prazo</span>`}
        </div>
      </div>
    </div>`;
  }).join('')}</div>`;
}

function renderGoalsSummary(goals){
  const area=document.getElementById('goalsSummaryArea');
  if(!goals.length){area.style.display='none';return;}
  area.style.display='block';
  const totalValor=goals.reduce((s,g)=>s+g.valor,0);
  const viaveisCount=goals.filter(g=>patNoMes(g.meses)>=g.valor).length;
  const patFinalSem=snaps?.[snaps.length-1]?.pat||0;
  const proj=calcProjectionWithGoals(goals);
  const patFinalCom=proj?.[proj.length-1]?.pat||0;
  const impacto=patFinalSem-patFinalCom;
  const anos=document.getElementById('anos')?.value||20;
  document.getElementById('goalsSummary').innerHTML=`
    <div class="gsum-card"><div class="gsum-label">🎯 Total de Metas</div><div class="gsum-val">${goals.length}</div><div style="font-size:10px;color:var(--t3);margin-top:4px">${viaveisCount} atingível${viaveisCount!==1?'s':''} no prazo</div></div>
    <div class="gsum-card"><div class="gsum-label">💰 Valor Total</div><div class="gsum-val" style="color:var(--go)">${fmtK(totalValor)}</div><div style="font-size:10px;color:var(--t3);margin-top:4px">a retirar do patrimônio</div></div>
    <div class="gsum-card"><div class="gsum-label">📉 Impacto Final</div><div class="gsum-val" style="color:var(--re)">−${fmtK(impacto)}</div><div style="font-size:10px;color:var(--t3);margin-top:4px">vs. projeção sem metas</div></div>
    <div class="gsum-card"><div class="gsum-label">🏦 Patrimônio c/ Metas</div><div class="gsum-val" style="color:var(--ac)">${fmtK(patFinalCom)}</div><div style="font-size:10px;color:var(--t3);margin-top:4px">ao final de ${anos} anos</div></div>`;
}

function renderGoalsChart(goals){
  const panel=document.getElementById('goalsChartPanel');
  if(!goals.length||!snaps?.length){panel.style.display='none';return;}
  panel.style.display='block';
  const semMetas=snaps.map(s=>({label:s.ano===0?'Hoje':`Ano ${s.ano}`,pat:s.pat}));
  const comMetas=calcProjectionWithGoals(goals);
  if(!comMetas)return;
  const labels=semMetas.map(d=>d.label);
  const valsSem=semMetas.map(d=>d.pat);
  const valsCom=comMetas.map(d=>d.pat);
  const goalAnots=goals.map(g=>({anoIdx:Math.floor(g.meses/12),label:`${GOAL_CATS[g.cat]?.icon||'⭐'} ${g.name}`,color:GOAL_CATS[g.cat]?.color||'#8fa0b0',valor:g.valor}));
  const ctx=document.getElementById('goalsChart').getContext('2d');
  if(goalsChart)goalsChart.destroy();
  goalsChart=new Chart(ctx,{
    type:'line',
    data:{labels,datasets:[
      {label:'Sem metas',data:valsSem,borderColor:'#5dd4a0',backgroundColor:'rgba(93,212,160,0.06)',borderWidth:2,borderDash:[6,3],fill:true,tension:.4,pointRadius:2,pointBackgroundColor:'#5dd4a0'},
      {label:'Com metas',data:valsCom,borderColor:'#e6b86a',backgroundColor:'rgba(230,184,106,0.08)',borderWidth:2.5,fill:true,tension:.4,
        pointRadius:valsCom.map((_,i)=>goalAnots.some(a=>a.anoIdx===i)?8:3),
        pointBackgroundColor:valsCom.map((_,i)=>{const h=goalAnots.find(a=>a.anoIdx===i);return h?h.color:'#e6b86a';}),
        pointStyle:valsCom.map((_,i)=>goalAnots.some(a=>a.anoIdx===i)?'triangle':'circle'),
        pointHoverRadius:9,
      },
    ]},
    options:{
      responsive:true,maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{labels:{color:'#8fa0b0',font:{family:'Sora',size:11},boxWidth:18,padding:16}},
        tooltip:{
          backgroundColor:'#161c28',borderColor:'rgba(255,255,255,0.1)',borderWidth:1,
          titleColor:'#e8ead4',bodyColor:'#8fa0b0',padding:12,
          callbacks:{
            label:c=>` ${c.dataset.label}: ${fmtK(c.parsed.y)}`,
            afterBody(items){
              const i=items[0].dataIndex;
              const metas=goalAnots.filter(a=>a.anoIdx===i);
              if(!metas.length)return[];
              const diff=(valsSem[i]||0)-(valsCom[i]||0);
              const lines=['  ─────────────────'];
              metas.forEach(m=>lines.push(`  ${m.label}: −${fmt(m.valor)}`));
              lines.push(`  Impacto acum.: −${fmtK(diff)}`);
              return lines;
            }
          }
        }
      },
      scales:{
        x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#4d6070',font:{family:'DM Mono',size:10},maxTicksLimit:14}},
        y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#4d6070',font:{family:'DM Mono',size:10},callback:v=>v>=1e6?`R$${(v/1e6).toFixed(1)}M`:v>=1e3?`R$${(v/1e3).toFixed(0)}K`:`R$${v}`}}
      }
    }
  });
}



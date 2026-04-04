// ════════════════════════
// PAYROLL TABLE
// ════════════════════════
function renderFolha(id,f){
  let rows;
  if(f.tipo==='PJ'){
    rows=[
      [`💰 Faturamento Bruto`,     f.fat,                  ''],
      [`🔻 Impostos s/ Fat. (${(f.aliqImposto*100).toFixed(1)}%)`, -f.impostoEmpresa, 'rn'],
      [`💼 Pró-labore`,            f.prolabore,             'rp'],
      [`🔻 INSS Sócio (11%)`,     -f.inss,                'rn'],
      [`🔻 IR s/ Pró-labore`,     -f.irrf,                'rn'],
      [`💸 Distribuição Lucros`,    f.distribuicao,         'rp'],
      [`✅ Líquido na Mão`,         f.liq,                  'rb'],
      [`🏖 Reserva Férias/13° (${Math.round(f.reservaPct*100)}%)`, f.reservaMensal*12/12, 'rp'],
      [`🎄 "13°" Equiv. (díl.)`,   f.d3/12,               'rp'],
      [`🌴 "Férias" Equiv. (díl.)`,f.fL/12,               'rp'],
      [`💼 FGTS`,                  0,                       'ro'],
      [`🌟 Renda Real Mensal`,     f.rendaReal,            'rb'],
    ];
  } else {
    // CLT — duas linhas de renda distintas
    rows=[
      ['💰 Salário Bruto',            f.bruto,      ''],
      ['🔻 INSS',                    -f.inss,      'rn'],
      ['🔻 IRRF 2026',               -f.irrf,      'rn'],
      ['✅ Líquido Mensal',            f.liq,       'rb'],
      ['🎁 VR/VA',                    f.vr,        'rp'],
      ['─── Recebimentos anuais ───', null,         'sep'],
      ['🎄 13° Líq. (IR excl. fonte)', f.liq13,    'rp'],
      ['🌴 Férias+1/3 Líq.',          f.liqFer,    'rp'],
      ['🏆 PLR Líquida',              f.liqPlr,    'rp'],
      ['💼 FGTS (patrimônio)',        f.fgts,      'ro'],
      ['─── Síntese ───',             null,         'sep'],
      ['💵 Renda Operacional/mês',    f.rendaOp,   'rb'],
      ['📅 Renda Real Diluída/mês',   f.rendaReal, 'rb'],
    ];
  }
  // Para linhas anuais (13° e férias) a col "Mensal" = o evento, "Anual" = mesmo valor
  // Para linhas mensais a col "Anual" = ×12
  const anualRows = new Set(['🎄 13° Líq. (IR excl. fonte)','🌴 Férias+1/3 Líq.','🏆 PLR Líquida',
                              '💵 Renda Operacional/mês','📅 Renda Real Diluída/mês']);
  document.querySelector(`#${id} tbody`).innerHTML=rows
    .map(([l,m,cls])=>{
      if(cls==='sep') return `<tr style="background:var(--bg6)"><td colspan="3" style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--t3);padding:5px 12px">${l}</td></tr>`;
      if(m==null) return `<tr><td>${l}</td><td class="${cls}">—</td><td class="${cls}">—</td></tr>`;
      const isAnual = anualRows.has(l);
      const colA = isAnual ? '(evento anual)' : fmt(m*12);
      const colM = isAnual && l!=='💵 Renda Operacional/mês' && l!=='📅 Renda Real Diluída/mês' ? fmt(m)+' ¹' : fmt(m);
      return `<tr><td>${l}</td><td class="${cls}">${colM}</td><td class="${cls}" style="${isAnual&&!l.startsWith('💵')&&!l.startsWith('📅')?'color:var(--t3);font-size:11px':''}">${colA}</td></tr>`;
    })
    .join('');
}

// ════════════════════════
// BUDGET TABLE
// ════════════════════════
function renderBudget(rendaOp, rendaDil){
  const p=getPcts();let tP=0,tV=0;
  document.querySelector('#tBudget tbody').innerHTML=CATS.map(c=>{
    const pc=p[c.key],v=rendaOp*pc/100;tP+=pc;tV+=v;
    return `<tr><td>${c.label}</td>
      <td style="font-family:var(--fm);text-align:right">${pc}%</td>
      <td style="font-family:var(--fm);text-align:right;color:var(--t1)">${fmt(v)}</td>
      <td><div style="height:6px;background:var(--bg6);border-radius:3px;overflow:hidden"><div style="width:${Math.min(pc,100)}%;height:6px;border-radius:3px;background:${c.color}"></div></div>
      <div style="font-size:10px;color:var(--t3);margin-top:2px">${pc}%</div></td></tr>`;
  }).join('');
  const over=tP>100;
  document.querySelector('#tBudget tfoot').innerHTML=`<tr class="rb"><td>Total</td>
    <td style="font-family:var(--fm);text-align:right;color:${over?'var(--re)':'var(--ac)'}">${tP}%</td>
    <td style="font-family:var(--fm);text-align:right">${fmt(tV)}</td>
    <td style="font-size:10px;color:${over?'var(--re)':'var(--t3)'}">${over?'⚠️ Acima de 100%':'✅ Balanceado'}</td></tr>
    <tr style="background:var(--bg6)"><td colspan="4" style="font-size:10px;color:var(--t3);padding:6px 12px">
      📊 Base de cálculo: <strong style="color:var(--t2)">${fmt(rendaOp)}/mês operacional</strong> · 
      Capacidade de aporte anual diluída: <strong style="color:var(--ac)">${fmt(rendaDil)}/mês</strong>
    </td></tr>`;
}

// ════════════════════════
// SNAPSHOTS
// ════════════════════════
let snaps=[],curIdx=0;

function buildSnaps(anos,taxa,apI,reaj,patI,p1b,p1v,p1p,p2b,p2v,p2p){
  const tM=Math.pow(1+taxa/100,1/12)-1;
  let pat=patI,totAp=patI,ap=apI;
  const d=[];
  const f10=calcFolha(p1b,p1v,p1p,1),f20=calcFolha(p2b,p2v,p2p,2); // fac=1 implícito
  d.push({ano:0,pat,totAp,apN:ap,rendAnual:pat*(Math.pow(1+taxa/100,1)-1),renda:f10.rendaReal+f20.rendaReal,rendaOp:(f10.rendaOp||f10.rendaReal)+(f20.rendaOp||f20.rendaReal),f1:f10,f2:f20});
  for(let a=1;a<=anos;a++){
    const fac=Math.pow(1+reaj/100,a);
    // PJ: scale faturamento and retirada via fac; CLT: scale bruto/vr/plr
    const f1a=calcFolha(p1b*fac,p1v*fac,p1p*fac,1,fac);
    const f2a=calcFolha(p2b*fac,p2v*fac,p2p*fac,2,fac);
    const pBef=pat,apN=ap;
    for(let m=0;m<12;m++){pat=pat*(1+tM)+ap;totAp+=ap;}
    const rendAnual=pat-pBef-ap*12;
    ap*=(1+reaj/100);
    d.push({ano:a,pat,totAp,apN,rendAnual,renda:f1a.rendaReal+f2a.rendaReal,rendaOp:(f1a.rendaOp||f1a.rendaReal)+(f2a.rendaOp||f2a.rendaReal),f1:f1a,f2:f2a});
  }
  return d;
}

// ════════════════════════
// MILESTONES
// ════════════════════════
const MS_TARGETS=[
  {v:100e3,  lbl:'R$ 100 mil',   icon:'🌱', color:'#5dd4a0'},
  {v:250e3,  lbl:'R$ 250 mil',   icon:'🌿', color:'#6aace6'},
  {v:500e3,  lbl:'R$ 500 mil',   icon:'💎', color:'#e6b86a'},
  {v:1e6,    lbl:'R$ 1 milhão',  icon:'🏆', color:'#a78bfa'},
  {v:2e6,    lbl:'R$ 2 milhões', icon:'🚀', color:'#e06c6c'},
  {v:5e6,    lbl:'R$ 5 milhões', icon:'🌙', color:'#5dd4a0'},
  {v:10e6,   lbl:'R$ 10 milhões',icon:'⭐', color:'#6aace6'},
];
const yrNow=new Date().getFullYear();

function renderMilestones(data){
  const el=document.getElementById('msList');
  const items=[];
  for(const t of MS_TARGETS){
    const s=data.find(d=>d.pat>=t.v);
    if(!s)break;
    items.push({...t,s});
  }
  if(!items.length){
    el.innerHTML=`<div style="color:var(--t3);font-size:12px;text-align:center;padding:16px">Ajuste os valores para visualizar marcos financeiros</div>`;
    return;
  }
  el.innerHTML=items.map((m,i)=>`
    <div class="ms-item" style="animation:mIn .3s ease ${i*.06}s both" onclick="openM(${m.s.ano})">
      <div class="ms-dot" style="color:${m.color};background:${m.color}"></div>
      <div style="flex:1;min-width:0">
        <div class="ms-yr">${yrNow+m.s.ano} · Ano ${m.s.ano}${m.s.ano===0?' (hoje)':''}</div>
        <div class="ms-ti">${m.icon} ${m.lbl} acumulados</div>
        <div class="ms-vl" style="color:${m.color}">${fmt(m.s.pat)}</div>
      </div>
      <div style="font-size:10px;color:var(--t3);text-align:right;flex-shrink:0">
        <div>Renda: ${fmtK(m.s.renda)}/mês</div>
        <div style="color:${m.color};margin-top:2px;font-size:9px">→ ver snapshot</div>
      </div>
    </div>`).join('');
}

// ════════════════════════
// CHART
// ════════════════════════
let myChart=null,donutChart=null;

function renderChart(anos,taxa,apI,reaj,patI,p1b,p1v,p1p,p2b,p2v,p2p){
  snaps=buildSnaps(anos,taxa,apI,reaj,patI,p1b,p1v,p1p,p2b,p2v,p2p);
  renderMilestones(snaps);
  const inflAnual = parseFloat(document.getElementById('taxaInflacao')?.value)||4.5;

  // Cenários pessimista (−2 p.p.) e otimista (+2 p.p.)
  const snapsPess = buildSnaps(anos, Math.max(0, taxa-2), apI,reaj,patI,p1b,p1v,p1p,p2b,p2v,p2p);
  const snapsOtim = buildSnaps(anos, taxa+2,               apI,reaj,patI,p1b,p1v,p1p,p2b,p2v,p2p);

  const labels =snaps.map(d=>d.ano===0?'Hoje':`Ano ${d.ano}`);
  const vals   =snaps.map(d=>d.pat);
  const aps    =snaps.map(d=>d.totAp);
  const reais  =snaps.map(d=>d.pat/Math.pow(1+inflAnual/100,d.ano));
  const pessim =snapsPess.map(d=>d.pat);
  const otimis =snapsOtim.map(d=>d.pat);

  const ctx=document.getElementById('chartP').getContext('2d');
  if(myChart)myChart.destroy();
  myChart=new Chart(ctx,{
    type:'line',
    data:{labels,datasets:[
      {label:'Patrimônio com Juros',data:vals,borderColor:'#5dd4a0',backgroundColor:'rgba(93,212,160,0.08)',borderWidth:2.5,fill:true,tension:.4,pointRadius:4,pointHoverRadius:9,pointBackgroundColor:'#5dd4a0',pointHoverBackgroundColor:'#fff',pointHoverBorderColor:'#5dd4a0',pointHoverBorderWidth:2.5},
      {label:'Aportes sem Juros',data:aps,borderColor:'#6aace6',backgroundColor:'rgba(106,172,230,0.05)',borderWidth:1.5,fill:true,tension:.4,borderDash:[6,3],pointRadius:2,pointHoverRadius:5,pointBackgroundColor:'#6aace6'},
      {label:`Valor Real (−${inflAnual}% inflação/ano)`,data:reais,borderColor:'rgba(167,139,250,.8)',backgroundColor:'transparent',borderWidth:1.5,fill:false,tension:.4,borderDash:[3,3],pointRadius:2,pointHoverRadius:5,pointBackgroundColor:'rgba(167,139,250,.8)'},
      {label:`Otimista (+2% → ${taxa+2}% a.a.)`,data:otimis,borderColor:'rgba(93,212,160,0.4)',backgroundColor:'transparent',borderWidth:1,fill:false,tension:.4,borderDash:[2,4],pointRadius:0,pointHoverRadius:4,pointBackgroundColor:'rgba(93,212,160,0.6)'},
      {label:`Pessimista (−2% → ${Math.max(0,taxa-2)}% a.a.)`,data:pessim,borderColor:'rgba(224,108,108,0.4)',backgroundColor:'transparent',borderWidth:1,fill:false,tension:.4,borderDash:[2,4],pointRadius:0,pointHoverRadius:4,pointBackgroundColor:'rgba(224,108,108,0.6)'},
    ]},
    options:{
      responsive:true,maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      onClick(_,elements){if(elements.length)openM(elements[0].index);},
      plugins:{
        legend:{labels:{color:'#8fa0b0',font:{family:'Sora',size:11},boxWidth:18,padding:16}},
        tooltip:{
          backgroundColor:'#161c28',borderColor:'rgba(255,255,255,0.1)',borderWidth:1,
          titleColor:'#e8ead4',bodyColor:'#8fa0b0',padding:12,
          callbacks:{
            label:c=>` ${c.dataset.label}: ${fmtK(c.parsed.y)}`,
            afterBody(items){
              const s=snaps[items[0].dataIndex];
              if(!s)return[];
              const patReal=s.pat/Math.pow(1+inflAnual/100,s.ano);
              return[
                `  ─────────────────`,
                `  💰 Renda Real: ${fmtK(s.renda)}/mês`,
                `  📈 Aporte: ${fmtK(s.apN)}/mês`,
                ...(s.ano>0?[`  ✨ Rendimento: ${fmtK(s.rendAnual)}/ano`]:[]),
                ...(s.ano>0?[`  💜 Poder de compra: ${fmtK(patReal)}`]:[]),
                ``,
                `  ↩ Clique para snapshot completo`
              ];
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

// ════════════════════════
// MODAL
// ════════════════════════
function openM(idx){curIdx=idx;popM(idx);document.getElementById('moOv').classList.add('open');document.body.style.overflow='hidden';}
function closeM(){document.getElementById('moOv').classList.remove('open');document.body.style.overflow='';}
function handleOvClick(e){if(e.target===document.getElementById('moOv'))closeM();}
function navM(dir){const n=curIdx+dir;if(n<0||n>=snaps.length)return;curIdx=n;popM(n);}

function popM(idx){
  const s=snaps[idx];if(!s)return;
  const taxa=parseFloat(document.getElementById('taxaAnual').value)||10;
  const reaj=parseFloat(document.getElementById('reajuste').value)||5;
  const pcts=getPcts();
  const tM=Math.pow(1+taxa/100,1/12)-1;

  document.getElementById('bPrev').disabled=idx===0;
  document.getElementById('bNext').disabled=idx===snaps.length-1;

  const acum=idx===0?0:((Math.pow(1+reaj/100,s.ano)-1)*100).toFixed(1);
  const anoC=yrNow+s.ano;
  document.getElementById('mYN').textContent=s.ano;
  document.getElementById('mYL').textContent=anoC;
  document.getElementById('mTI').textContent=idx===0?'Situação Atual — Hoje':`Snapshot do Ano ${s.ano}`;
  document.getElementById('mSU').textContent=idx===0
    ?`Sem reajuste acumulado · ${anoC}`
    :`Reajuste acumulado de ${acum}% · ${anoC} · taxa ${taxa}% a.a.`;

  const ap=s.apN;
  const rendMes=s.rendAnual/12;
  const rendaOp_s = s.rendaOp || s.renda;    // operacional mensal real
  const rendaDil_s= s.renda;                 // diluída anual /12
  const gastMes=rendaOp_s*(1-pcts.pctInvest/100);  // gastos sobre operacional
  const rendPat=s.pat*tM;
  const juros=Math.max(0,s.pat-s.totAp);
  const libPct=gastMes>0?Math.min((rendPat/gastMes)*100,200):0;
  const libC=libPct>=100?'#5dd4a0':libPct>=50?'#e6b86a':'#e06c6c';

  // Extras anuais (13°+férias+PLR) do casal
  const ext1 = s.f1.extrasAnuais || 0;
  const ext2 = s.f2.extrasAnuais || 0;
  const extrasAnuais = ext1 + ext2;

  // ── KPIs ──
  document.getElementById('mKpis').innerHTML=`
    <div class="mkpi kac">
      <div class="mkl">Renda Operacional/mês</div>
      <div class="mkv ac">${fmtK(rendaOp_s)}</div>
      <div class="mks">líquido + VR · cai na conta todo mês</div>
    </div>
    <div class="mkpi" style="background:var(--bg7);border:1px solid var(--bd);border-radius:10px;padding:12px 14px;position:relative;overflow:hidden">
      <div style="position:absolute;top:0;left:0;right:0;height:2px;background:var(--ac);opacity:.4"></div>
      <div class="mkl">Renda Diluída/mês</div>
      <div class="mkv" style="color:var(--t2)">${fmtK(rendaDil_s)}</div>
      <div class="mks">inclui 13°+férias+PLR rateados</div>
    </div>
    <div class="mkpi kgo"><div class="mkl">Aporte / Mês</div><div class="mkv go">${fmtK(ap)}</div><div class="mks">${pcts.pctInvest}% da renda operacional</div></div>
    <div class="mkpi kbl"><div class="mkl">Rendimento / Mês</div><div class="mkv bl">${fmtK(rendMes)}</div><div class="mks">juros do patrimônio</div></div>
    <div class="mkpi kpu"><div class="mkl">Patrimônio Total</div><div class="mkv pu">${fmtK(s.pat)}</div>
      <div class="mks">acumulado · <span class="inf-badge">💜 ${fmtK(s.pat/Math.pow(1+(parseFloat(document.getElementById('taxaInflacao')?.value)||4.5)/100,s.ano))} hoje</span></div>
    </div>
    <div class="mkpi kre"><div class="mkl">Gastos Fixos/mês</div><div class="mkv re">${fmtK(gastMes)}</div><div class="mks">${100-pcts.pctInvest}% do operacional</div></div>
    <div class="mkpi kgo"><div class="mkl">Aporte Extra Potencial</div><div class="mkv go">${fmtK(extrasAnuais*pcts.pctInvest/100)}</div><div class="mks">${pcts.pctInvest}% de ${fmtK(extrasAnuais)} de extras anuais</div></div>
    <div class="mkpi kgo"><div class="mkl">FGTS Anual</div><div class="mkv go">${(s.f1.fgts+s.f2.fgts)>0?fmtK((s.f1.fgts+s.f2.fgts)*12):'N/A (PJ)'}</div><div class="mks">${s.f1.tipo==='PJ'&&s.f2.tipo==='PJ'?'PJ não tem FGTS':'patrimônio trabalhista'}</div></div>`;

  // ── Liberdade financeira ──
  const libStatus=libPct>=100?'🎉 Independência financeira atingida — rendimentos cobrem todos os gastos!'
    :libPct>=75?'🔥 Quase lá — rendimentos cobrem a maioria dos seus gastos mensais'
    :libPct>=50?'📈 Progresso sólido — metade dos gastos já coberta por rendimentos passivos'
    :libPct>=25?'⏳ Acumulando — continue investindo, você está no caminho certo'
    :'🌱 Fase inicial — o patrimônio está crescendo, os juros vêm a seguir';
  document.getElementById('mLib').innerHTML=`
    <div class="pph">
      <div class="ppt">Rendimento passivo mensal vs. gastos do casal</div>
      <div class="ppv" style="color:${libC}">${libPct.toFixed(1)}%</div>
    </div>
    <div class="ppbg"><div class="ppb" style="width:${Math.min(libPct,100)}%;background:${libPct>=100?'linear-gradient(90deg,#2a6e55,#5dd4a0)':libPct>=50?'linear-gradient(90deg,#7a5c28,#e6b86a)':'linear-gradient(90deg,#5c1a1a,#e06c6c)'}"></div></div>
    <div class="pprow">
      <span>Renda passiva: <span style="color:#5dd4a0">${fmtK(rendPat)}/mês</span></span>
      <span>Gastos operacionais: <span style="color:#e06c6c">${fmtK(gastMes)}/mês</span></span>
    </div>
    <div class="ppd">${libStatus}</div>`;

  // ── Donut ──
  const catPcts=CATS.map(c=>pcts[c.key]);
  const catVals=catPcts.map(p=>rendaOp_s*p/100);   // usa rendaOp (não diluída)
  const totalG=catVals.reduce((a,b)=>a+b,0);
  document.getElementById('dcv').textContent=fmtK(totalG);
  const dCtx=document.getElementById('donutC').getContext('2d');
  if(donutChart)donutChart.destroy();
  donutChart=new Chart(dCtx,{
    type:'doughnut',
    data:{labels:CATS.map(c=>c.label),datasets:[{data:catVals,backgroundColor:CATS.map(c=>c.color+'bb'),borderColor:CATS.map(c=>c.color),borderWidth:1.5,hoverOffset:10}]},
    options:{cutout:'68%',responsive:false,plugins:{
      legend:{display:false},
      tooltip:{backgroundColor:'#161c28',borderColor:'rgba(255,255,255,0.1)',borderWidth:1,titleColor:'#e8ead4',bodyColor:'#8fa0b0',
        callbacks:{label:c=>` ${fmt(c.raw)} · ${catPcts[c.dataIndex]}%`}}
    }}
  });

  const maxV=Math.max(...catVals,1);
  document.getElementById('mBudg').innerHTML=CATS.map((c,i)=>`
    <div class="mbr">
      <div class="mbrla">${c.label}</div>
      <div class="mbrbw"><div class="mbrb" style="width:${Math.round((catVals[i]/maxV)*100)}%;background:${c.color}"></div></div>
      <div class="mbrv">${fmt(catVals[i])}</div>
      <div class="mbrp">${catPcts[i]}%</div>
    </div>`).join('');

  // ── Income detail ──
  const mkR=f=>{
    const rows=f.tipo==='PJ'?[
      [`💰 Faturamento Bruto`,                   fmt(f.fat),              ''],
      [`🔻 Impostos (${(f.aliqImposto*100).toFixed(1)}%)`,fmt(-f.impostoEmpresa),'rn'],
      [`💼 Pró-labore`,                           fmt(f.prolabore),        'rp'],
      [`🔻 INSS Sócio`,                          fmt(-f.inss),           'rn'],
      [`🔻 IR s/ Pró-labore`,                    fmt(-f.irrf),           'rn'],
      [`💸 Distribuição Lucros`,                  fmt(f.distribuicao),    'rp'],
      [`✅ Líquido na Mão`,                       fmt(f.liq),             'rb'],
      [`🎄 "13°" Equiv. (díl.)`,                 fmt(f.d3/12),           'rp'],
      [`🌴 "Férias" Equiv. (díl.)`,              fmt(f.fL/12),           'rp'],
      [`💼 FGTS`,                                '—',                     'ro'],
      [`🌟 Renda Real`,                           fmt(f.rendaReal),       'rb'],
    ]:[
      ['💰 Salário Bruto',     fmt(f.bruto),    ''],
      ['🔻 INSS',             fmt(-f.inss),    'rn'],
      ['🔻 IRRF 2026',        fmt(-f.irrf),    'rn'],
      ['✅ Líquido',           fmt(f.liq),      'rb'],
      ['🎁 VR/VA',            fmt(f.vr),       'rp'],
      ['🎄 13° (diluído)',    fmt(f.d3/12),    'rp'],
      ['🌴 Férias (diluído)', fmt(f.fL/12),    'rp'],
      ['🏆 PLR (diluído)',    fmt(f.plrL/12),  'rp'],
      ['🌟 Renda Real',       fmt(f.rendaReal),'rb'],
    ];
    return rows.map(([l,v,cl])=>`<tr><td>${l}</td><td class="${cl}">${v}</td></tr>`).join('');
  };

  document.getElementById('mInc').innerHTML=`
    <div class="mf">
      <div class="mfh">
        <span style="width:8px;height:8px;border-radius:50%;background:var(--ac);display:inline-block"></span>
        Pessoa 1
        <span style="margin-left:6px;font-size:9px;padding:2px 7px;border-radius:10px;background:${s.f1.tipo==='PJ'?'rgba(230,184,106,.2)':'rgba(93,212,160,.15)'};color:${s.f1.tipo==='PJ'?'var(--go)':'var(--ac)'}">${s.f1.tipo}</span>
      </div>
      <table><tbody>${mkR(s.f1)}</tbody></table>
    </div>
    <div class="mf">
      <div class="mfh">
        <span style="width:8px;height:8px;border-radius:50%;background:var(--go);display:inline-block"></span>
        Pessoa 2
        <span style="margin-left:6px;font-size:9px;padding:2px 7px;border-radius:10px;background:${s.f2.tipo==='PJ'?'rgba(230,184,106,.2)':'rgba(93,212,160,.15)'};color:${s.f2.tipo==='PJ'?'var(--go)':'var(--ac)'}">${s.f2.tipo}</span>
      </div>
      <table><tbody>${mkR(s.f2)}</tbody></table>
    </div>`;

  // ── Divisão de Aportes ──
  (function(){
    // Renda operacional de cada um (o que cai na conta todo mês — base do orçamento)
    const op1=s.f1.rendaOp||s.f1.rendaReal, op2=s.f2.rendaOp||s.f2.rendaReal;
    const opTotal=op1+op2;

    // Renda diluída (para referência — inclui 13°, férias, PLR rateados)
    const r1=s.f1.rendaReal, r2=s.f2.rendaReal;
    const rendaTotal=r1+r2;

    const pctInvest=pcts.pctInvest/100;

    // Aporte total alinhado com o rateio orçamentário (base: rendaOp, igual ao orçamento)
    const aporteTotal=opTotal*pctInvest;

    // Divisão proporcional pela participação na rendaOp de cada pessoa
    // → cada um contribui exatamente pctInvest% da sua própria rendaOp
    const ap1=op1*pctInvest;
    const ap2=op2*pctInvest;

    // % da renda operacional própria (deve ser sempre = pctInvest, mostra consistência)
    const pctDaRenda1=op1>0?(ap1/op1*100):0;
    const pctDaRenda2=op2>0?(ap2/op2*100):0;

    // Proporção de cada um na renda operacional total (para as barras)
    const pct1=opTotal>0?op1/opTotal:0.5;
    const pct2=opTotal>0?op2/opTotal:0.5;

    // Tipo e cores
    const tipo1=s.f1.tipo, tipo2=s.f2.tipo;
    const c1='#5dd4a0', c2='#e6b86a';

    const barW1=opTotal>0?(op1/opTotal*100).toFixed(1):50;
    const barW2=opTotal>0?(op2/opTotal*100).toFixed(1):50;

    const badge=(tipo,c)=>`<span class="ap-card-badge" style="background:${tipo==='PJ'?'rgba(230,184,106,.2)':'rgba(93,212,160,.15)'};color:${tipo==='PJ'?'var(--go)':'var(--ac)'}">${tipo}</span>`;

    const varRenda=(pctDaRenda1-pctDaRenda2).toFixed(1);
    const notaTxt=Math.abs(pctDaRenda1-pctDaRenda2)<0.5
      ?`Contribuição equilibrada — ambos aportam <strong>${pcts.pctInvest}%</strong> da sua renda individual.`
      :pctDaRenda1>pctDaRenda2
        ?`Pessoa 1 destina proporcionalmente mais (<strong>${pctDaRenda1.toFixed(1)}%</strong> vs <strong>${pctDaRenda2.toFixed(1)}%</strong> da renda). O rateio é feito pela participação na renda do casal.`
        :`Pessoa 2 destina proporcionalmente mais (<strong>${pctDaRenda2.toFixed(1)}%</strong> vs <strong>${pctDaRenda1.toFixed(1)}%</strong> da renda). O rateio é feito pela participação na renda do casal.`;

    document.getElementById('mAporte').innerHTML=`
      <!-- Barra total -->
      <div class="ap-total-bar">
        <div>
          <div class="ap-total-lbl">Aporte Total do Casal / Mês</div>
          <div class="ap-total-sub">${pcts.pctInvest}% da renda operacional · alinhado com o orçamento</div>
        </div>
        <div style="text-align:right">
          <div class="ap-total-val">${fmt(aporteTotal)}</div>
          <div class="ap-total-sub">${fmtK(aporteTotal*12)}/ano</div>
        </div>
      </div>

      <!-- Barra VS proporcional -->
      <div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--t3);margin-bottom:5px">
          <span>Pessoa 1 · ${barW1}% da renda operacional</span>
          <span>Pessoa 2 · ${barW2}% da renda operacional</span>
        </div>
        <div class="ap-vs-bar">
          <div class="ap-vs-seg" style="width:${barW1}%;background:${c1}">
            <span class="ap-vs-seg-lbl">${barW1}%</span>
          </div>
          <div class="ap-vs-seg" style="width:${barW2}%;background:${c2}">
            <span class="ap-vs-seg-lbl">${barW2}%</span>
          </div>
        </div>
      </div>

      <!-- Cards por pessoa -->
      <div class="ap-persons">
        <!-- Pessoa 1 -->
        <div class="ap-card">
          <div class="ap-card-header">
            <div class="ap-card-dot" style="background:${c1}"></div>
            <div class="ap-card-name">Pessoa 1</div>
            ${badge(tipo1,c1)}
          </div>
          <div class="ap-card-body">
            <div class="ap-share-pct" style="color:${c1}">${fmt(ap1)}</div>
            <div class="ap-share-sub">por mês · ${fmt(ap1*12)}/ano</div>
            <div class="ap-divider-row"><div class="ap-divider-line"></div><div class="ap-divider-txt">composição</div><div class="ap-divider-line"></div></div>
            <div class="ap-row">
              <span class="ap-row-lbl">Renda operacional/mês</span>
              <span class="ap-row-val" style="color:${c1}">${fmt(op1)}</span>
            </div>
            <div class="ap-bar-wrap"><div class="ap-bar" style="width:100%;background:${c1}40"></div></div>
            <div class="ap-row">
              <span class="ap-row-lbl">Aporte mensal (${pcts.pctInvest}%)</span>
              <span class="ap-row-val" style="color:${c1}">${fmt(ap1)}</span>
            </div>
            <div class="ap-bar-wrap"><div class="ap-bar" style="width:${pctInvest*100}%;background:${c1}"></div></div>
            <div class="ap-row">
              <span class="ap-row-lbl">% da renda operacional</span>
              <span class="ap-row-val" style="color:${c1}">${pctDaRenda1.toFixed(1)}%</span>
            </div>
            <div class="ap-row">
              <span class="ap-row-lbl">Sobra p/ gastos</span>
              <span class="ap-row-val" style="color:var(--t2)">${fmt(op1-ap1)}</span>
            </div>
            <div class="ap-row" style="opacity:.6;font-size:10px">
              <span class="ap-row-lbl">Renda diluída (c/ 13°+férias+PLR)</span>
              <span class="ap-row-val" style="font-size:10px">${fmt(r1)}</span>
            </div>
            <div class="ap-row" style="font-size:10px">
              <span class="ap-row-lbl" style="color:var(--ac)">📅 Aporte extra anual</span>
              <span class="ap-row-val" style="font-size:10px;color:var(--ac)">${fmtK((s.f1.extrasAnuais||0)*pcts.pctInvest/100)}</span>
            </div>
            <div class="ap-row" style="opacity:.55;font-size:10px">
              <span class="ap-row-lbl">Total líquido extras (13°+férias+PLR)</span>
              <span class="ap-row-val" style="font-size:10px">${fmtK(s.f1.extrasAnuais||0)}</span>
            </div>
          </div>
        </div>

        <!-- Pessoa 2 -->
        <div class="ap-card">
          <div class="ap-card-header">
            <div class="ap-card-dot" style="background:${c2}"></div>
            <div class="ap-card-name">Pessoa 2</div>
            ${badge(tipo2,c2)}
          </div>
          <div class="ap-card-body">
            <div class="ap-share-pct" style="color:${c2}">${fmt(ap2)}</div>
            <div class="ap-share-sub">por mês · ${fmt(ap2*12)}/ano</div>
            <div class="ap-divider-row"><div class="ap-divider-line"></div><div class="ap-divider-txt">composição</div><div class="ap-divider-line"></div></div>
            <div class="ap-row">
              <span class="ap-row-lbl">Renda operacional/mês</span>
              <span class="ap-row-val" style="color:${c2}">${fmt(op2)}</span>
            </div>
            <div class="ap-bar-wrap"><div class="ap-bar" style="width:100%;background:${c2}40"></div></div>
            <div class="ap-row">
              <span class="ap-row-lbl">Aporte mensal (${pcts.pctInvest}%)</span>
              <span class="ap-row-val" style="color:${c2}">${fmt(ap2)}</span>
            </div>
            <div class="ap-bar-wrap"><div class="ap-bar" style="width:${pctInvest*100}%;background:${c2}"></div></div>
            <div class="ap-row">
              <span class="ap-row-lbl">% da renda operacional</span>
              <span class="ap-row-val" style="color:${c2}">${pctDaRenda2.toFixed(1)}%</span>
            </div>
            <div class="ap-row">
              <span class="ap-row-lbl">Sobra p/ gastos</span>
              <span class="ap-row-val" style="color:var(--t2)">${fmt(op2-ap2)}</span>
            </div>
            <div class="ap-row" style="opacity:.6;font-size:10px">
              <span class="ap-row-lbl">Renda diluída (c/ 13°+férias+PLR)</span>
              <span class="ap-row-val" style="font-size:10px">${fmt(r2)}</span>
            </div>
            <div class="ap-row" style="font-size:10px">
              <span class="ap-row-lbl" style="color:var(--go)">📅 Aporte extra anual</span>
              <span class="ap-row-val" style="font-size:10px;color:var(--go)">${fmtK((s.f2.extrasAnuais||0)*pcts.pctInvest/100)}</span>
            </div>
            <div class="ap-row" style="opacity:.55;font-size:10px">
              <span class="ap-row-lbl">Total líquido extras (13°+férias+PLR)</span>
              <span class="ap-row-val" style="font-size:10px">${fmtK(s.f2.extrasAnuais||0)}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Nota explicativa -->
      <div class="ap-note">💡 ${notaTxt} O aporte mensal (<strong>${fmt(aporteTotal)}</strong>) é calculado sobre a <strong>renda operacional</strong> — o que cai na conta todo mês — e está alinhado com o rateio orçamentário. Cada pessoa destina exatamente <strong>${pcts.pctInvest}%</strong> da sua renda operacional. Nos meses de 13°, férias e PLR, o casal pode aportar adicionalmente <strong>${fmtK(extrasAnuais*pcts.pctInvest/100)}/ano</strong> (${pcts.pctInvest}% dos ${fmtK(extrasAnuais)} de extras), sobrando <strong>${fmtK(extrasAnuais*(1-pcts.pctInvest/100))}</strong> para outros fins.</div>
    `;
  })();

  // ── Waterfall ──
  const wItems=[
    {l:'Total\nAportado',  v:s.totAp,              pct:null,  bg:'#6aace6'},
    {l:'Juros\nGerados',   v:juros,                 pct:null,  bg:'#5dd4a0'},
    {l:'Patrimônio\nTotal',v:s.pat,                 pct:null,  bg:'linear-gradient(180deg,#a78bfa,#5dd4a0)'},
    {l:'Multiplicador\nCapital',v:s.totAp>0?juros/s.totAp*100:0,pct:true,bg:'rgba(167,139,250,.25)',br:'#a78bfa'},
  ];
  const maxW=Math.max(s.pat,s.totAp,juros,1);
  const H=80;
  document.getElementById('mWfall').innerHTML=`
    <div class="wfall">
      ${wItems.map(w=>{
        const h=w.pct?Math.max(8,Math.round((Math.min(w.v,100)/100)*H)):Math.max(4,Math.round((w.v/maxW)*H));
        return `<div class="wcol">
          <div class="wcola">${w.pct?w.v.toFixed(0)+'%':fmtK(w.v)}</div>
          <div class="wbar" style="height:${h}px;background:${w.bg}${w.br?`;border:1px dashed ${w.br}`:''}"></div>
          <div class="wcoll">${w.l.replace('\n','<br>')}</div>
        </div>`;
      }).join('')}
    </div>`;

  // ── Saúde financeira ──
  const sc1=Math.min(pcts.pctInvest/25*100,100);
  const pG=100-pcts.pctInvest;
  const sc2=pG<=70?100:Math.max(0,100-(pG-70)*5);
  const sc3=Math.min(libPct/100*100,100);
  const score=Math.round(sc1*.4+sc2*.3+sc3*.3);
  const sc=score>=75?'#5dd4a0':score>=50?'#e6b86a':'#e06c6c';
  const sl=score>=75?'Excelente 🚀':score>=50?'Bom 👍':'Atenção ⚠️';
  const R=34,circ=2*Math.PI*R,dash=(score/100)*circ;
  const aut=gastMes>0?(s.pat/gastMes).toFixed(0):0;
  const rRat=ap>0?((rendMes/ap)*100).toFixed(0):0;

  document.getElementById('mHealth').innerHTML=`
    <svg width="88" height="88" viewBox="0 0 88 88" style="flex-shrink:0;overflow:visible">
      <circle cx="44" cy="44" r="${R}" fill="none" stroke="var(--bg6)" stroke-width="8"/>
      <circle cx="44" cy="44" r="${R}" fill="none" stroke="${sc}" stroke-width="8"
        stroke-dasharray="${dash.toFixed(2)} ${circ.toFixed(2)}"
        stroke-dashoffset="${(circ*.25).toFixed(2)}" stroke-linecap="round"/>
      <text x="44" y="44" text-anchor="middle" dominant-baseline="middle"
        font-family="DM Mono" font-size="15" font-weight="500" fill="${sc}">${score}</text>
      <text x="44" y="57" text-anchor="middle" font-family="Sora" font-size="8" fill="var(--t3)">/100</text>
    </svg>
    <div class="hm">
      <div class="hmr"><span class="hml">🏅 Nota Geral</span><span class="hmv" style="color:${sc}">${sl}</span></div>
      <div class="hmr"><span class="hml">💰 Taxa de Poupança</span><span class="hmv">${pcts.pctInvest}%</span></div>
      <div class="hmr"><span class="hml">📊 Gastos / Renda</span><span class="hmv">${pG}%</span></div>
      <div class="hmr"><span class="hml">📈 Rendimento / Aporte</span><span class="hmv">${rRat}%</span></div>
      <div class="hmr"><span class="hml">🏦 Meses de Autonomia</span><span class="hmv">${aut}</span></div>
      <div class="hmr"><span class="hml">📡 Liberdade Financeira</span><span class="hmv" style="color:${libC}">${libPct.toFixed(1)}%</span></div>
    </div>`;

  document.getElementById('mFN').textContent=idx===0
    ?'Situação base · valores sem reajuste salarial acumulado'
    :`Reajuste ${reaj}% a.a. acumulado · use ‹ › ou ← → para navegar entre anos`;
}

// ════════════════════════
// INFLAÇÃO — valor real (poder de compra)
// Movido de modals.js para cá — pertence semanticamente à projeção
// ════════════════════════
function calcInflacaoSnaps(snapsArr) {
  const inflAnual = parseFloat(document.getElementById('taxaInflacao')?.value) || 4.5;
  return snapsArr.map(s => ({
    ...s,
    patReal: s.pat / Math.pow(1 + inflAnual/100, s.ano),
  }));
}

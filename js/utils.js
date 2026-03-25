// ════════════════════════
// FORMAT
// ════════════════════════
const fmt=v=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtK=v=>v>=1e6?`R$ ${(v/1e6).toFixed(2)}M`:v>=1e3?`R$ ${(v/1e3).toFixed(1)}K`:fmt(v);
// fmtS: retorna '—' para null/undefined/NaN (distingue zero de "sem dado")
const fmtS=v=>{if(v==null||isNaN(v))return '—';return v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e3?`${(v/1e3).toFixed(0)}K`:`${v.toFixed(0)}`;};

// ════════════════════════
// CATS
// ════════════════════════
const CATS=[
  {key:'pctMoradia',    label:'🏠 Moradia',     color:'#6aace6'},
  {key:'pctAlimentacao',label:'🍽 Alimentação',  color:'#5dd4a0'},
  {key:'pctTransporte', label:'🚗 Transporte',   color:'#e6b86a'},
  {key:'pctContas',     label:'💡 Contas',       color:'#c86ae6'},
  {key:'pctLazer',      label:'🎉 Lazer',        color:'#e06c6c'},
  {key:'pctInvest',     label:'📈 Investimento', color:'#5dd4a0'},
];
function getPcts(){const o={};CATS.forEach(c=>o[c.key]=parseFloat(document.getElementById(c.key).value)||0);return o;}

// ════════════════════════
// FORMAT
// ════════════════════════
const fmt=v=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtK=v=>v>=1e6?`R$ ${(v/1e6).toFixed(2)}M`:v>=1e3?`R$ ${(v/1e3).toFixed(1)}K`:fmt(v);
// fmtS: retorna '—' para null/undefined/NaN (distingue zero de "sem dado")
const fmtS=v=>{if(v==null||isNaN(v))return '—';return v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e3?`${(v/1e3).toFixed(0)}K`:`${v.toFixed(0)}`;};

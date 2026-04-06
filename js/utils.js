// ════════════════════════
// FORMAT
// ════════════════════════
const fmt=v=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtK=v=>v>=1e6?`R$ ${(v/1e6).toFixed(2)}M`:v>=1e3?`R$ ${(v/1e3).toFixed(1)}K`:fmt(v);
const fmtS=v=>{if(v==null||isNaN(v))return '—';return v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e3?`${(v/1e3).toFixed(0)}K`:`${v.toFixed(0)}`;};

// ════════════════════════════════════
// CURRENCY MASK — BRL formatting
// ════════════════════════════════════
/**
 * Máscora BRL acumulativo.
 * Cada tecla de dígito adiciona ao valor existente.
 * - Usa beforeinput para interceptar dígitos ANTES de entrarem no input
 * - Guarda valor acumulado em memória (_moneyInputs)
 * - Formata display como "11.500,00" mas o valor cru é 11500
 * - gP lê o valor cru, não o display formatado
 */
const _moneyInputs = {}; // id → {raw: "11500"}
let _masking = false;

function _formatMoney(raw){
  if(!raw || raw === '0') return '';
  // Interpreta os últimos 2 dígitos como centavos
  const val = parseInt(raw,10) / 100;
  return val.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
}

function _updateMoneyDisplay(id){
  const entry = _moneyInputs[id];
  if(!entry) return;
  const el = document.getElementById(id);
  if(!el) return;
  _masking = true;
  try {
    el.value = _formatMoney(entry.raw);
    el.dataset.rawValue = entry.raw;
    el.setSelectionRange(el.value.length, el.value.length);
  } finally {
    _masking = false;
  }
}

function curMask(el){
  // Compatibilidade com handlers inline (track, goals modais)
  if(!el.id) return;
  if(!_moneyInputs[el.id]){
    // Primeira chamada: captura dígitos atuais do input
    const digits = (el.value||'').replace(/\D/g,'');
    _moneyInputs[el.id] = {raw: digits || ''};
  }
  _updateMoneyDisplay(el.id);
}

/**
 * Parseia campo monetário. Se tem rawValue ou entry em memória, usa esse.
 */
function gP(id){
  // 1. Tenta memória: raw é string de dígitos acumulados (últimos 2 = centavos)
  if(_moneyInputs[id]){
    const raw = _moneyInputs[id].raw;
    if(!raw) return 0;
    return (parseInt(raw,10) || 0) / 100;
  }
  // 2. Fallback: dataset.rawValue
  const el = document.getElementById(id);
  if(!el) return 0;
  if(el.dataset.rawValue !== undefined){
    const rv = parseFloat(el.dataset.rawValue) || 0;
    return rv / 100;
  }
  // 3. Fallback normal: parse do value
  const raw = (el.value||'').replace(/\./g,'').replace(',','.');
  return parseFloat(raw)||0;
}

function initCurMasks(){
  document.addEventListener('beforeinput', function(e){
    const el = e.target;
    if(!el.dataset || el.dataset.cur !== 'money') return;
    if(_masking) return;

    // Inicializa se necessário
    if(!_moneyInputs[el.id]){
      const digits = (el.value||'').replace(/\D/g,'');
      _moneyInputs[el.id] = {raw: digits || ''};
    }

    if(e.inputType === 'deleteContentBackward'){
      e.preventDefault();
      _moneyInputs[el.id].raw = _moneyInputs[el.id].raw.slice(0,-1);
      _updateMoneyDisplay(el.id);
      // Dispara calc associado
      _triggerCalc(el);
      return;
    }

    const digit = e.data;
    if(digit && /^\d$/.test(digit)){
      e.preventDefault();
      _moneyInputs[el.id].raw += digit;
      if(_moneyInputs[el.id].raw.length > 12) _moneyInputs[el.id].raw = _moneyInputs[el.id].raw.slice(-12);
      _updateMoneyDisplay(el.id);
      _triggerCalc(el);
    }
  });

  document.querySelectorAll('[data-cur="money"]').forEach(el=>{
    el.setAttribute('inputmode','numeric');
  });
}

// Dispara função de calc associada ao input
function _triggerCalc(el){
  // Sidebar inputs → window.calc
  if(typeof calc === 'function') calc();
  // Track/modal inputs chamam suas próprias funções via handlers inline
  // (curMask + updateTrackCalc) — já são chamados pelo handler HTML
}

// Expõe para uso externo
window._getMoneyRawValue = function(id){
  return _moneyInputs[id]?.raw || '';
};

// Expõe para handlers inline (track, goals modais)
window.getRawValue = function(id){
  return parseInt(_moneyInputs[id]?.raw,10) || 0;
};

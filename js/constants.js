// ════════════════════════════════════════════════════════════════
// CONSTANTS — Single Source of Truth para chaves, categorias e configs
// ════════════════════════════════════════════════════════════════

// ════════════════════════
// CATEGORIAS DO ORÇAMENTO (Simulador)
// ════════════════════════
const BUDGET_CATEGORIES = [
  { key: 'pctMoradia',     label: '🏠 Moradia',     color: '#6aace6' },
  { key: 'pctAlimentacao', label: '🍽 Alimentação', color: '#5dd4a0' },
  { key: 'pctTransporte', label: '🚗 Transporte',  color: '#e6b86a' },
  { key: 'pctContas',      label: '💡 Contas',      color: '#c86ae6' },
  { key: 'pctLazer',       label: '🎉 Lazer',       color: '#e06c6c' },
  { key: 'pctInvest',      label: '📈 Investimento', color: '#5dd4a0' },
];

// ════════════════════════
// CATEGORIAS DO EXTRATO (Dashboard)
// ════════════════════════
const EXTRATO_CATEGORIAS = [
  'Moradia', 'Alimentação', 'Transporte', 'Contas', 'Lazer', 'Investimento', 'Transferência', 'Outros'
];

const EXTRATO_CAT_ICONS = {
  'Moradia': '🏠', 'Alimentação': '🍽', 'Transporte': '🚗',
  'Contas': '💡', 'Lazer': '🎉', 'Investimento': '📈',
  'Transferência': '🔄', 'Outros': '📋'
};

// ════════════════════════
// MAPEAMENTO: Simulador ↔ Extrato
// ════════════════════════
const BUDGET_TO_EXTRATO_MAP = {
  'pctMoradia':     'Moradia',
  'pctAlimentacao': 'Alimentação',
  'pctTransporte':  'Transporte',
  'pctContas':      'Contas',
  'pctLazer':       'Lazer',
  'pctInvest':      'Investimento',
};

// ════════════════════════
// KEYS DO LOCALSTORAGE
// ════════════════════════
const STORAGE_KEYS = {
  CARTEIRA:    'simfin_carteira',
  NEGOCIACOES:'simfin_negociacoes',
  MOVIMENTACOES:'simfin_movimentacoes',
  TRACK:      'simfin_track',
  SCENARIO:   'simfin_scenario',
  AUTOSAVE:   'simfin_last_inputs',
  EXTRATO:    'simfin_extrato',
  REMINDER:   'simfin_reminder_config',
};

// ════════════════════════
// HELPERS
// ════════════════════════
function getPcts() {
  const o = {};
  BUDGET_CATEGORIES.forEach(c => {
    o[c.key] = parseFloat(document.getElementById(c.key)?.value) || 0;
  });
  return o;
}

function getExtratoCatFromBudgetKey(budgetKey) {
  return BUDGET_TO_EXTRATO_MAP[budgetKey] || null;
}
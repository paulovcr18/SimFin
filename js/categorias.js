// ════════════════════════════════════════════════════════════════
// CATEGORIZAÇÃO AUTOMÁTICA — regras por palavras-chave
//
// Prioridade:
//   1. Regras customizadas do usuário (localStorage)
//   2. Regras padrão por banco/palavra-chave
//   3. Detecção de transferências entre contas
// ════════════════════════════════════════════════════════════════

const CATEGORIAS_RULES_KEY = 'simfin_cat_rules';

// ── Regras padrão por categoria ──────────────────────────────────
const REGRAS_PADRAO = {
  'Moradia': [
    'aluguel', 'condomini', 'iptu', 'seguro residenc', 'imobiliaria',
    'mudanca', 'reforma', 'construcao', 'moveis', 'decoracao',
  ],
  'Alimentação': [
    'supermercado', 'mercado', 'hortifruti', 'padaria', 'acougue',
    'restaurante', 'lanchonete', 'ifood', 'rappi', 'uber eats',
    'zé delivery', 'ze delivery', 'mcdonald', 'burger king', 'pizza',
    'sushi', 'subway', 'starbucks', 'cafeteria', 'cafe ',
    'assai', 'atacadao', 'carrefour', 'extra', 'pao de acucar',
    'big', 'sam\'s', 'costco', 'makro', 'bretas', 'dia ',
  ],
  'Transporte': [
    'uber', '99 ', '99app', 'cabify', 'combustivel', 'gasolina',
    'alcool', 'etanol', 'diesel', 'posto ', 'shell', 'ipiranga',
    'br distribuidora', 'estacionamento', 'parking', 'zona azul',
    'pedagio', 'sem parar', 'conectcar', 'veloe', 'auto posto',
    'mecanico', 'oficina', 'pneu', 'seguro auto', 'detran',
    'ipva', 'dpvat', 'licenciamento', 'multa',
  ],
  'Contas': [
    'energia', 'eletric', 'cpfl', 'enel', 'cemig', 'celesc', 'copel',
    'agua ', 'saneamento', 'sabesp', 'copasa', 'sanepar', 'compesa',
    'gas ', 'comgas', 'naturgy', 'telefone', 'telecom', 'claro',
    'vivo', 'tim', 'oi ', 'internet', 'fibra', 'net ', 'netflix',
    'spotify', 'amazon prime', 'disney', 'hbo', 'globoplay',
    'youtube premium', 'apple', 'google one', 'icloud',
    'plano de saude', 'unimed', 'amil', 'sulamerica', 'bradesco saude',
    'farmacia', 'drogaria', 'droga raia', 'drogasil', 'pague menos',
    'escola', 'faculdade', 'universidade', 'mensalidade',
    'seguro vida',
  ],
  'Lazer': [
    'cinema', 'teatro', 'show', 'ingresso', 'viagem', 'hotel',
    'pousada', 'airbnb', 'booking', 'decolar', 'latam', 'gol',
    'azul', 'aerea', 'passagem', 'parque', 'diversao', 'game',
    'playstation', 'xbox', 'nintendo', 'steam', 'jogos',
    'roupa', 'vestuario', 'calçado', 'shopping', 'magazine',
    'americanas', 'amazon', 'aliexpress', 'mercado livre', 'shopee',
    'renner', 'riachuelo', 'c&a', 'zara', 'shein',
    'academia', 'gym', 'smartfit', 'bodytech',
    'salao', 'barbearia', 'estetica', 'beleza',
  ],
  'Investimento': [
    'aplicacao', 'resgate', 'investimento', 'tesouro', 'cdb', 'lci',
    'lca', 'fundo', 'acao', 'fii', 'etf', 'debenture', 'cri', 'cra',
    'previdencia', 'pgbl', 'vgbl', 'corretora', 'xp ', 'rico ',
    'nuinvest', 'btg', 'clear', 'inter invest', 'modal',
    'aporte', 'dividendo', 'rendimento',
  ],
  'Transferência': [
    'transferencia', 'ted', 'doc', 'pix enviado', 'pix recebido',
    'transf entre contas', 'resgate conta', 'deposito',
    'saldo anterior',
  ],
};

// ── Carregar regras customizadas ─────────────────────────────────
function categoriaLoadRegras() {
  try { return JSON.parse(localStorage.getItem(CATEGORIAS_RULES_KEY)) || {}; } catch { return {}; }
}

// ── Salvar regra customizada (aprende com recategorização do usuário)
function categoriaSalvarRegra(descricao, categoria) {
  const regras = categoriaLoadRegras();
  // Extrai palavras-chave da descrição (3+ caracteres)
  const palavras = descricao.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(p => p.length >= 3);

  if (palavras.length === 0) return;

  // Usa as 2 primeiras palavras significativas como chave
  const chave = palavras.slice(0, 3).join(' ');
  regras[chave] = categoria;
  localStorage.setItem(CATEGORIAS_RULES_KEY, JSON.stringify(regras));
}

// ── Categorizar uma transação ────────────────────────────────────
function categorizarTransacao(descricao, valor) {
  if (!descricao) return 'Outros';

  const desc = descricao.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // 1. Verifica regras customizadas
  const regras = categoriaLoadRegras();
  for (const [chave, cat] of Object.entries(regras)) {
    if (desc.includes(chave)) return cat;
  }

  // 2. Detecta transferências (para ignorar dupla contagem)
  const transf = ['transferencia', 'ted ', 'doc ', 'pix enviado', 'pix recebido',
    'transf entre', 'transf. entre', 'resgate conta'];
  if (transf.some(t => desc.includes(t))) return 'Transferência';

  // 3. Regras padrão
  for (const [cat, palavras] of Object.entries(REGRAS_PADRAO)) {
    if (cat === 'Transferência') continue; // já tratado acima
    for (const palavra of palavras) {
      if (desc.includes(palavra)) return cat;
    }
  }

  return 'Outros';
}

// ── Listar regras customizadas do usuário ────────────────────────
function categoriaListarRegras() {
  return categoriaLoadRegras();
}

// ── Remover regra customizada ────────────────────────────────────
function categoriaRemoverRegra(chave) {
  const regras = categoriaLoadRegras();
  delete regras[chave];
  localStorage.setItem(CATEGORIAS_RULES_KEY, JSON.stringify(regras));
}

// ── Recategorizar tudo (após edição de regras) ───────────────────
function categoriaRecategorizarTudo() {
  const txns = extratoLoad();
  for (const t of txns) {
    t.categoria = categorizarTransacao(t.descricao, t.valor);
  }
  extratoSave(txns);
}

// ── Render painel de regras customizadas ─────────────────────────
function renderRegrasCustomizadas() {
  const area = document.getElementById('regrasCustomArea');
  if (!area) return;
  const regras = categoriaLoadRegras();
  const entries = Object.entries(regras);

  if (!entries.length) {
    area.innerHTML = `<div style="font-size:11px;color:var(--t3);padding:8px">
      Nenhuma regra customizada. Ao recategorizar transações, as regras são aprendidas automaticamente.</div>`;
    return;
  }

  let html = '<div class="regras-list">';
  for (const [chave, cat] of entries) {
    html += `<div class="regra-item">
      <span class="regra-chave">"${chave}"</span>
      <span class="regra-seta">→</span>
      <span class="regra-cat">${EXTRATO_CAT_ICONS[cat] || '📋'} ${cat}</span>
      <button class="del-btn" onclick="categoriaRemoverRegra('${chave.replace(/'/g, "\\'")}');renderRegrasCustomizadas()" title="Remover regra">✕</button>
    </div>`;
  }
  html += '</div>';
  area.innerHTML = html;
}

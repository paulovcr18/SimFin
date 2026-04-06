// ════════════════════════════════════════════════════════════════
// ABA CARTEIRA — Ativos + Cotações BRAPI + Importação CSV/XLSX
// ════════════════════════════════════════════════════════════════

const CART_KEY       = 'simfin_carteira';
const CART_TOKEN_KEY = 'simfin_brapi_token';
const NEGOC_KEY      = 'simfin_negociacoes';
const MOVIM_KEY      = 'simfin_movimentacoes';
const BRAPI_BASE     = 'https://brapi.dev/api/quote/';
// Edge Function Supabase — proxy server-side para Yahoo Finance (resolve CORS)
const COTACOES_FN    = 'https://qaopienbsmssjosttucn.supabase.co/functions/v1/cotacoes';

// Cache para memoização de carteiramigrar()
let _carteiraMigrarCache = { hash: null, result: null };

// Função para calcular hash simples dos dados
function _carteiraHashDados() {
  const negocs = negocLoad();
  const movims = movimLoad();
  const cart = carteiraLoad();
  return JSON.stringify({ negocs, movims, cart }).slice(0, 1000);
}

function carteiraLoad()    { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; } }
function carteiraSave(d)   {
  localStorage.setItem(CART_KEY, JSON.stringify(d));
  dbDebounce('carteira', () => dbPushCarteira(d).catch(() => {}));
}
function carteiraSaveToken() {
  const token = document.getElementById('cartBrapiToken')?.value?.trim() || '';
  localStorage.setItem(CART_TOKEN_KEY, token);
  dbPushConfig({ brapi_token: token || null }).catch(() => {});
}
function carteiraGetToken() { return localStorage.getItem(CART_TOKEN_KEY) || ''; }
function negocLoad()       { try { return JSON.parse(localStorage.getItem(NEGOC_KEY)) || []; } catch { return []; } }
function negocSave(d)      {
  localStorage.setItem(NEGOC_KEY, JSON.stringify(d));
  dbDebounce('historico', () => dbPushHistorico(d, movimLoad()).catch(() => {}));
}
function movimLoad()       { try { return JSON.parse(localStorage.getItem(MOVIM_KEY)) || []; } catch { return []; } }
function movimSave(d)      {
  localStorage.setItem(MOVIM_KEY, JSON.stringify(d));
  dbDebounce('historico', () => dbPushHistorico(negocLoad(), d).catch(() => {}));
}

// ── Atualiza UI da tela ──
// ── Computa posições de Tesouro Direto a partir das movimentações (síncrono) ──
// Chamado por carteiraMigrar() para garantir que Tesouro sempre aparece na carteira
function tesouroComputarPosicoes(movims) {
  const tesMovims = (movims||[]).filter(m => /^tesouro/i.test(m.produto));
  if (!tesMovims.length) return [];
  const map = {};
  tesMovims.forEach(m => {
    const nome = m.produto.trim();
    if (!map[nome]) map[nome] = { nome, qtd: 0, totalCusto: 0 };
    const isCompra  = /compra/i.test(m.tipo) ||
      (/liquidação|liquidacao/i.test(m.tipo) && m.entradaSaida === 'debito');
    const isResgate = /resgate|venda|vencimento/i.test(m.tipo) ||
      (/liquidação|liquidacao/i.test(m.tipo) && m.entradaSaida === 'credito');
    if (isCompra)  { map[nome].qtd += m.qtd;  map[nome].totalCusto += m.valor; }
    if (isResgate) { map[nome].qtd -= m.qtd;  map[nome].totalCusto -= m.valor; }
  });
  return Object.values(map)
    .filter(t => t.qtd >= 0.0001)
    .map(t => {
      const pmedio = t.qtd > 0 ? Math.round((t.totalCusto / t.qtd) * 100) / 100 : 0;
      return {
        ticker:           tesouroSyntheticTicker(t.nome),
        nome:             t.nome,
        qtd:              Math.round(t.qtd * 10000) / 10000,
        pmedio,
        preco:            pmedio,   // melhor estimativa até próximo refresh
        precoEstimado:    true,     // sinaliza que preco = custo, não mercado
        variacao:         0,
        tipo:             'tesouro',
        categoria:        'tesouro',
        valorInvestido:   Math.round(Math.max(0, t.totalCusto) * 100) / 100,
        fromMovimentacao: true,
      };
    });
}

// ── Deduplicar lista de negociações (chave: data+ticker+tipo+qtd+preço) ──
function negocDedup(lista) {
  const vistas = new Set();
  return lista.filter(n => {
    const chave = `${n.data}|${n.ticker}|${n.tipo}|${n.qtd}|${Math.round((n.preco||0)*100)}`;
    if (vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  });
}

function carteiraMigrar() {
  // Memoização: verifica se dados mudaram desde última execução
  const hashAtual = _carteiraHashDados();
  if (_carteiraMigrarCache.hash === hashAtual && _carteiraMigrarCache.result !== null) {
    return _carteiraMigrarCache.result;
  }
  
  // 1. Normaliza e deduplicata negociações (principal causa de PM inflado)
  const negocs  = negocLoad();
  const negocsN = negocs.map(n => ({ ...n, ticker: normalizarTicker(n.ticker) }));
  const negocsD = negocDedup(negocsN); // remove duplicatas após normalização
  const negocsMudou = negocsD.length !== negocs.length ||
                      negocsN.some((n,i) => n.ticker !== negocs[i]?.ticker);
  if (negocsMudou) negocSave(negocsD);

  // 2. Normaliza movimentações
  const movims  = movimLoad();
  const movimsN = movims.map(m => ({ ...m, ticker: normalizarTicker(m.ticker) }));
  const movimsD = movimsN.filter((m,i,arr) => {
    const chave = `${m.data}|${m.ticker}|${m.tipo}|${Math.round((m.valor||0)*100)}`;
    return arr.findIndex(x => `${x.data}|${x.ticker}|${x.tipo}|${Math.round((x.valor||0)*100)}` === chave) === i;
  });
  if (movimsD.length !== movims.length || movimsN.some((m,i) => m.ticker !== movims[i]?.ticker))
    movimSave(movimsD);

  // 3. Recalcula posição a partir das negociações dedupadas
  const negocsFinal = negocsMudou ? negocsD : negocs;
  if (negocsFinal.length) {
    const posicoes   = carteiraCalcularPosicaoDeNegociacoes(negocsFinal).filter(p => p.qtd > 0.001);
    const existentes = carteiraLoad();
    // Normaliza tickers nos ativos existentes
    const ativosN = existentes.map(a => ({
      ...a,
      ticker:    normalizarTicker(a.ticker),
      categoria: (a.categoria && a.categoria !== 'outro') ? a.categoria : inferirCategoria(normalizarTicker(a.ticker)),
    }));
    // Consolida duplicatas de ativos (ex: WEGE3F e WEGE3 → WEGE3)
    const mapaAtivos = {};
    ativosN.forEach(a => {
      if (!mapaAtivos[a.ticker] || (a.preco && !mapaAtivos[a.ticker].preco))
        mapaAtivos[a.ticker] = a;
    });
    // Atualiza qtd, PM e ganho de cada ativo com o cálculo correto
    posicoes.forEach(p => {
      if (!mapaAtivos[p.ticker]) {
        mapaAtivos[p.ticker] = { ticker:p.ticker, categoria:inferirCategoria(p.ticker), nome:p.ticker };
      }
      mapaAtivos[p.ticker].qtd            = p.qtd;
      mapaAtivos[p.ticker].pmedio         = p.pmedio > 0 ? Math.round(p.pmedio*100)/100 : null;
      mapaAtivos[p.ticker].ganhoRealizado = p.ganhoRealizado;
      mapaAtivos[p.ticker].fromNegociacao = true;
    });
    // Remove ativos que vieram de negociação e agora estão zerados
    const final = Object.values(mapaAtivos)
      .filter(a => !a.fromNegociacao || posicoes.some(p => p.ticker === a.ticker));
    // Merge Tesouro Direto (calculado das movimentações)
    tesouroComputarPosicoes(movims).forEach(t => {
      const idx = final.findIndex(a => a.ticker === t.ticker);
      if (idx >= 0) final[idx] = { ...t, preco: final[idx].preco || t.preco, updatedAt: final[idx].updatedAt };
      else final.push(t);
    });
    carteiraSave(final);
  } else {
    // Só normaliza tickers e categorias dos ativos
    const existentes = carteiraLoad();
    const mudou = existentes.some(a => normalizarTicker(a.ticker) !== a.ticker || a.categoria === 'outro');
    const tesouroPos = tesouroComputarPosicoes(movims);
    const temTesouroNovo = tesouroPos.some(t => !existentes.find(a => a.ticker === t.ticker));
    if (mudou || temTesouroNovo) {
      const base = existentes.map(a => ({
        ...a,
        ticker:    normalizarTicker(a.ticker),
        categoria: (a.categoria && a.categoria !== 'outro') ? a.categoria : inferirCategoria(normalizarTicker(a.ticker)),
      }));
      tesouroPos.forEach(t => {
        const idx = base.findIndex(a => a.ticker === t.ticker);
        if (idx >= 0) base[idx] = { ...t, preco: base[idx].preco || t.preco, updatedAt: base[idx].updatedAt };
        else base.push(t);
      });
      carteiraSave(base);
    }
  }
  // Atualiza cache
  _carteiraMigrarCache.hash = hashAtual;
  _carteiraMigrarCache.result = true;
}

// ── Exportar transações para o Portfolio Tracker Python ─────────────
function carteiraExportarTracker() {
  const negocs = negocLoad();
  if (!negocs.length) {
    showToast('Nenhuma negociação importada para exportar', '⚠️', 3000);
    return;
  }
  const transactions = negocs
    .filter(n => n.qtd > 0 && n.preco > 0)
    .map(n => ({
      ticker:     n.ticker,
      quantity:   n.qtd,
      unit_price: n.preco,
      date:       n.data,
      operation:  n.tipo.includes('venda') ? 'SELL' : 'BUY',
    }));
  const payload = { transactions };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'portfolio_transactions.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast(`${transactions.length} transações exportadas`, '📥', 2500);
}

function carteiraLimparHistorico() {
  // 1ª confirmação
  if (!confirm(
    'Isso vai apagar todos os ativos, negociações e movimentações importadas da B3.\n' +
    'Você precisará reimportar os arquivos.\n\n' +
    'Continuar?'
  )) return;

  // 2ª confirmação — palavra-chave para evitar clique acidental
  const confirmacao = prompt('Para confirmar, digite a palavra  LIMPAR  em maiúsculas:');
  if (confirmacao?.trim() !== 'LIMPAR') {
    showToast('Operação cancelada', 'ℹ️', 2500);
    return;
  }

  // Auto-backup antes de deletar
  try {
    const backup = {
      _schemaVersion: 1,
      _backupAt: new Date().toISOString(),
      _motivo: 'auto-backup antes de limpar histórico',
      carteira:      carteiraLoad(),
      negociacoes:   negocLoad(),
      movimentacoes: movimLoad(),
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `simfin-backup-carteira-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch(e) {
    console.warn('[SimFin] Auto-backup falhou antes de limpar histórico:', e);
  }

  localStorage.removeItem(CART_KEY);
  localStorage.removeItem(NEGOC_KEY);
  localStorage.removeItem(MOVIM_KEY);
  // Limpa também no Supabase para evitar que o pull no próximo login restaure os dados
  dbPushCarteira([]).catch(() => {});
  dbPushHistorico([], []).catch(() => {});
  carteiraRenderList();
  showToast('Histórico apagado. Backup salvo automaticamente.', '🗑', 5000);
}

function carteiraUpdateUI() {
  // Migrar já foi feito no auth login — só renderiza aqui
  // Sincroniza FGTS e Reserva dos campos da projeção
  const patFGTSEl    = document.getElementById('patFGTS');
  const patReservaEl = document.getElementById('patReserva');
  const fgtsCart     = document.getElementById('patFGTSCart');
  const reservaCart  = document.getElementById('patReservaCart');
  if (fgtsCart    && patFGTSEl?.value)    fgtsCart.value    = patFGTSEl.value;
  if (reservaCart && patReservaEl?.value) reservaCart.value = patReservaEl.value;
  carteiraUpdatePatrimonio();
  carteiraRenderList();
}

// ── Adicionar ativo ──
async function carteiraAdd() {
  const ticker = document.getElementById('cartTicker')?.value?.trim().toUpperCase();
  const qtd    = parseFloat(document.getElementById('cartQtd')?.value) || 0;
  const pmedio = parseFloat(document.getElementById('cartPmedio')?.value) || null;
  const statusEl = document.getElementById('cartAddStatus');

  if (!ticker) { carteiraSetStatus(statusEl, 'Informe o ticker', 'err'); return; }
  if (!qtd)    { carteiraSetStatus(statusEl, 'Informe a quantidade', 'err'); return; }

  // Verifica duplicata
  const ativos = carteiraLoad();
  const existing = ativos.findIndex(a => a.ticker === ticker);

  carteiraSetStatus(statusEl, `Buscando cotação de ${ticker}...`, 'load');

  // Busca cotação
  const quote = await carteiraBuscarCotacao([ticker]);
  if (!quote || !quote[ticker]) {
    carteiraSetStatus(statusEl, `Ticker ${ticker} não encontrado. Verifique o código.`, 'err');
    return;
  }

  const q = quote[ticker];
  // Tenta inferir categoria pelo shortName da BRAPI
  const nomeApi = (q.shortName || q.longName || '').toLowerCase();
  const catManual = /fii|fundo.*imob/i.test(nomeApi) ? 'fii'
                  : /etf|fundo.*indice/i.test(nomeApi) ? 'etf'
                  : /bdr/i.test(nomeApi) ? 'bdr'
                  : 'acao';
  const ativo = {
    ticker, qtd, pmedio,
    categoria:    catManual,
    nome:         q.shortName || q.longName || ticker,
    preco:        q.regularMarketPrice,
    variacao:     q.regularMarketChangePercent,
    updatedAt:    new Date().toISOString(),
  };

  if (existing >= 0) {
    ativos[existing] = { ...ativos[existing], ...ativo };
  } else {
    ativos.push(ativo);
  }

  carteiraSave(ativos);
  carteiraSetStatus(statusEl, `${ticker} adicionado! ${fmt(q.regularMarketPrice)}/ação`, 'ok');

  document.getElementById('cartTicker').value  = '';
  document.getElementById('cartQtd').value     = '';
  document.getElementById('cartPmedio').value  = '';
  carteiraRenderList();
}

// ── Remover ativo ──
function carteiraRemove(ticker) {
  carteiraSave(carteiraLoad().filter(a => a.ticker !== ticker));
  carteiraRenderList();
  showToast(`${ticker} removido`, '🗑', 2000);
}

// ── Rate-limit: impede refresh em menos de 60s (usado pela função abaixo) ──
let _lastRefreshTs = 0;

// ── Buscar cotações via BRAPI (com batching e cache-busting) ──
// ── Cotações: Edge Function (Yahoo Finance proxy) com fallback BRAPI ─────────
async function carteiraBuscarCotacao(tickers) {
  // 1ª opção: Supabase Edge Function (proxy server-side — sem CORS, sem token)
  let edgeFnErrorMotivo = null;
  try {
    const res = await fetch(
      `${COTACOES_FN}?tickers=${tickers.join(',')}`,
      { headers: { 'apikey': SUPABASE_ANON }, cache: 'no-store' }
    );
    if (res.ok) {
      const data = await res.json();
      if (data.results && Object.keys(data.results).length) {
        return data.results;  // formato idêntico ao BRAPI: { TICKER: { regularMarketPrice, ... } }
      }
      // results vazio mas sem erro — fallthrough silencioso
      console.warn('[cotacoes] edge fn retornou results vazio, tentando BRAPI...');
    } else {
      // Lê o motivo de erro (422 = formato inválido, 429 = rate limit, 500 = interno)
      let motivo = `HTTP ${res.status}`;
      try {
        const errData = await res.json();
        if (errData?.error) motivo = errData.error;
      } catch { /* ignora parse error */ }
      edgeFnErrorMotivo = motivo;
      console.warn('[cotacoes] edge fn retornou', res.status, motivo);
    }
  } catch(e) {
    edgeFnErrorMotivo = `Erro de rede: ${e.message}`;
    console.warn('[cotacoes] edge fn falhou, tentando BRAPI...', e.message);
  }

  // 2ª opção: BRAPI com token do usuário
  const token = carteiraGetToken();
  if (!token) {
    const detail = edgeFnErrorMotivo ? ` (${edgeFnErrorMotivo})` : '';
    showToast(`Cotações indisponíveis${detail}. Configure um token em brapi.dev para fallback.`, '⚠️', 6000);
    return null;
  }

  const BATCH = 30;
  const map   = {};
  for (let i = 0; i < tickers.length; i += BATCH) {
    const batch = tickers.slice(i, i + BATCH);
    const url   = `${BRAPI_BASE}${batch.join(',')}?token=${token}`;
    try {
      const res  = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 401) showToast('Token BRAPI inválido. Verifique em brapi.dev.', '🔑', 5000);
        if (res.status === 429) showToast('Limite BRAPI atingido. Tente novamente em alguns minutos.', '⏱', 5000);
        console.warn('[BRAPI] HTTP', res.status);
        continue;
      }
      const data = await res.json();
      (data.results || []).forEach(r => { if (r.regularMarketPrice) map[r.symbol] = r; });
    } catch(e) {
      console.error('[BRAPI]', e);
    }
  }
  if (!Object.keys(map).length) {
    const detail = edgeFnErrorMotivo ? ` (Edge Function: ${edgeFnErrorMotivo})` : '';
    showToast(`Cotações indisponíveis${detail}. BRAPI também falhou.`, '⚠️', 6000);
    return null;
  }
  return map;
}

// ── Usar total da carteira como patrimônio no acompanhamento ──
function carteiraUsarTotal() {
  const total = carteiraLoad().reduce((s,a) => s + (a.preco||0) * (a.qtd||0), 0);
  if (!total) { showToast('Atualize as cotações primeiro', '⚠️'); return; }
  // Preenche o campo de patrimônio na tela de acompanhamento
  const el = document.getElementById('trackPatrimonio');
  if (el) el.value = total.toFixed(2);
  switchScreen('financas');
  showToast(`Patrimônio preenchido: ${fmt(total)}`, '📥');
  updateTrackCalc();
}

// ── Labels e cores das categorias ──
const CAT_LABELS = { acao:'Ações', fii:'FIIs', etf:'ETFs', bdr:'BDRs', 'renda-fixa':'Renda Fixa', tesouro:'Tesouro Direto', outro:'Outros' };
const CAT_COLORS = { acao:'#10b981', fii:'#818cf8', etf:'#f59e0b', bdr:'#a78bfa', 'renda-fixa':'#60a5fa', tesouro:'#2dd4bf', outro:'#94a3b8' };
const CAT_ICONS  = { acao:'📈', fii:'🏢', etf:'🌐', bdr:'🌎', 'renda-fixa':'🏛', tesouro:'🏛', outro:'📦' };

// ── Atualizar patrimônio total (B3 + FGTS + Reserva) ──
function carteiraUpdatePatrimonio() {
  const ativos  = carteiraLoad();
  const b3      = ativos.reduce((s,a) => s + (a.preco||0)*(a.qtd||0), 0);
  const gV = id => { const el = document.getElementById(id); return el ? (parseFloat((el.value||'').replace(/\./g,'').replace(',','.'))||0) : 0; };
  const fgts    = gV('patFGTSCart');
  const reserva = gV('patReservaCart');
  const total   = b3 + fgts + reserva;

  // Hero
  const heroEl = document.getElementById('patHeroTotal');
  if (heroEl) heroEl.textContent = fmt(total);

  // Bucket B3
  const b3El    = document.getElementById('patBucketB3');
  const b3SubEl = document.getElementById('patBucketB3Sub');
  if (b3El)    b3El.textContent = fmt(b3);
  if (b3SubEl) b3SubEl.textContent = ativos.length
    ? `${ativos.length} ativo${ativos.length!==1?'s':''} · ${(b3/total*100||0).toFixed(1)}% do patrimônio`
    : 'importe os extratos abaixo';

  // Subtítulo hero
  const subEl = document.getElementById('patHeroSub');
  if (subEl && total > 0) {
    const parts = [];
    if (b3 > 0)    parts.push(`B3 ${(b3/total*100).toFixed(1)}%`);
    if (fgts > 0)  parts.push(`FGTS ${(fgts/total*100).toFixed(1)}%`);
    if (reserva>0) parts.push(`Reserva ${(reserva/total*100).toFixed(1)}%`);
    subEl.textContent = parts.join(' · ');
  }

  // Sincroniza com campos da projeção
  const patFGTSEl    = document.getElementById('patFGTS');
  const patReservaEl = document.getElementById('patReserva');
  const patInvEl     = document.getElementById('patInvestimentos');
  if (patFGTSEl)    patFGTSEl.value    = fgts    || '';
  if (patReservaEl) patReservaEl.value = reserva  || '';
  if (patInvEl)     patInvEl.value     = b3       || '';
}

// Formata cotação: retorna "N/D" se preco é null/undefined e ativo nunca foi cotado
function fmtCotacao(preco) {
  if (preco === null || preco === undefined) return '<span class="cotacao-indisponivel">N/D</span>';
  return fmt(preco);
}

// ── Renderizar lista de ativos (tabela compacta) ──
function carteiraRenderList() {
  // Injeta estilo para cotacao-indisponivel (executado uma vez)
  if (!document.getElementById('_cotacaoStyle')) {
    const s = document.createElement('style');
    s.id = '_cotacaoStyle';
    s.textContent = '.cotacao-indisponivel { color: #94a3b8; font-style: italic; }';
    document.head.appendChild(s);
  }

  const ativos  = carteiraLoad();
  const area    = document.getElementById('cartListArea');
  const countEl = document.getElementById('cartCount');
  const lastEl  = document.getElementById('cartLastUpdate');
  const mainWrap   = document.getElementById('cartMainWrap');
  const metricsRow = document.getElementById('cartMetricsRow');
  const bottomRow  = document.getElementById('cartBottomRow');

  if (!ativos.length) {
    if (area) area.innerHTML = `<div class="track-empty" style="padding:28px 20px">
      <div class="track-empty-icon">💼</div>
      <div class="track-empty-title">Nenhum ativo importado</div>
      <div class="track-empty-sub">Use os botões acima para importar o Extrato de Negociação da B3.</div>
    </div>`;
    if (mainWrap)   mainWrap.style.display   = 'none';
    if (metricsRow) metricsRow.style.display = 'none';
    if (bottomRow)  bottomRow.style.display  = 'none';
    carteiraUpdatePatrimonio();
    return;
  }

  const total      = ativos.reduce((s,a) => s + (a.preco||0)*(a.qtd||0), 0);
  const totalCusto = ativos.reduce((s,a) => s + (a.pmedio||0)*(a.qtd||0), 0);
  const lucroTotal = totalCusto > 0 ? total - totalCusto : null;
  const ganhoReal  = ativos.reduce((s,a) => s + (a.ganhoRealizado||0), 0);
  const proventos  = movimLoad().filter(m => /dividendo|jcp|juros.*capital|provento|rendimento/i.test(m.tipo))
                                .reduce((s,m) => s+m.valor, 0);

  if (mainWrap)   mainWrap.style.display   = 'grid';
  if (metricsRow) metricsRow.style.display = 'grid';
  if (bottomRow)  bottomRow.style.display  = 'grid';
  if (countEl)    countEl.textContent = `${ativos.length} ativo${ativos.length!==1?'s':''}`;

  const lastUpdate = ativos.map(a=>a.updatedAt).filter(Boolean).sort().pop();
  if (lastEl) {
    if (lastUpdate) {
      const dt = new Date(lastUpdate);
      const hoje = new Date();
      const mesmodia = dt.toDateString() === hoje.toDateString();
      const dtStr = mesmodia
        ? dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
        : dt.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}) + ' ' + dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      lastEl.textContent = `cotações ${dtStr}`;
    } else {
      lastEl.textContent = 'cotações não atualizadas';
    }
  }

  // ── Métricas ──
  const mInv = document.getElementById('metricInvestido');
  const mRes = document.getElementById('metricResultado');
  const mRea = document.getElementById('metricRealizado');
  const mPro = document.getElementById('metricProventos');
  if (mInv) mInv.textContent = totalCusto > 0 ? fmt(totalCusto) : '—';
  if (mRes && lucroTotal !== null) {
    mRes.innerHTML = `<span style="color:${lucroTotal>=0?'var(--ac)':'var(--re)'}">${lucroTotal>=0?'+':''}${fmt(lucroTotal)} (${((lucroTotal/totalCusto)*100).toFixed(1)}%)</span>`;
  }
  if (mRea) mRea.innerHTML = ganhoReal !== 0
    ? `<span style="color:${ganhoReal>=0?'var(--ac)':'var(--re)'}">${ganhoReal>=0?'+':''}${fmt(ganhoReal)}</span>` : '—';
  if (mPro) mPro.innerHTML = proventos > 0 ? `<span style="color:var(--ac)">${fmt(proventos)}</span>` : '—';

  // ── Tabela de ativos ──
  const sorted = [...ativos].sort((a,b) => (b.preco||0)*(b.qtd||0) - (a.preco||0)*(a.qtd||0));

  // Renderiza linha de detalhe Tesouro
  function renderTesouroDetail(a) {
    if (a.tipo !== 'tesouro') return '';
    const tid  = `td-${a.ticker}`;
    const st   = a._tdStatus || (a.precoEstimado ? 'estimado' : a.preco ? 'ok' : 'nao_encontrado');
    const badgeLabel = { ok:'Cotação atualizada', estimado:'Estimado', nao_encontrado:'Não encontrado', indisponivel:'Indisponível', ambiguo:'Ambíguo', carregando:'Carregando…' };
    const fieldsHtml = (st === 'ok' && (a.taxaCompra || a.taxaVenda || a.puCompra || a.puVenda))
      ? `<div class="td-fields">
          ${a.dataRef    ? `<div>Data <b>${escHtml(a.dataRef)}</b></div>` : ''}
          ${a.taxaCompra != null ? `<div>Tx Compra <b>${a.taxaCompra.toFixed(2)}% a.a.</b></div>` : ''}
          ${a.taxaVenda  != null ? `<div>Tx Venda <b>${a.taxaVenda.toFixed(2)}% a.a.</b></div>` : ''}
          ${a.puCompra   != null ? `<div>PU Compra <b>R$ ${fmt(a.puCompra)}</b></div>` : ''}
          ${a.puVenda    != null ? `<div>PU Venda <b>R$ ${fmt(a.puVenda)}</b></div>` : ''}
        </div>` : '';
    const ambigHtml = st === 'ambiguo' && a._tdOpcoes
      ? `<div class="td-ambiguo">Refine o cadastro informando tipo e vencimento. Opções: ${a._tdOpcoes.map(o => escHtml(o.nome)).join(', ')}</div>` : '';
    return `<tr class="tesouro-detail-row" id="${tid}" style="display:none">
      <td colspan="8">
        <div class="tesouro-detail">
          <span class="td-badge td-badge-${st}">${badgeLabel[st]||st}</span>
          ${fieldsHtml}${ambigHtml}
          ${a._tdSource ? `<span style="font-size:10px;color:var(--t3);margin-left:8px">fonte: ${escHtml(a._tdSource)}</span>` : ''}
        </div>
      </td>
    </tr>`;
  }

  area.innerHTML = `<div class="cart-table-wrap"><table class="cart-table">
    <thead><tr>
      <th>Ativo</th>
      <th class="r">Qtd</th>
      <th class="r">Preço Médio</th>
      <th class="r">Cotação</th>
      <th class="r">Resultado</th>
      <th class="r">Valor</th>
      <th class="r">%</th>
      <th></th>
    </tr></thead>
    <tbody>${sorted.map(a => {
      const valor    = (a.preco||0) * (a.qtd||0);
      const lucro    = a.pmedio && a.preco ? (a.preco - a.pmedio) * a.qtd : null;
      const lucroPct = a.pmedio && a.pmedio>0 && a.preco ? (a.preco/a.pmedio-1)*100 : null;
      const pct      = total > 0 ? (valor/total*100).toFixed(1) : '0';
      const varCls   = !a.variacao ? '' : a.variacao >= 0 ? 'var(--ac)' : 'var(--re)';
      const cat      = a.categoria || 'outro';
      const isTes    = a.tipo === 'tesouro';
      const expandBtn = isTes ? `<button class="cart-trow-del" onclick="carteiraToggleTesouroDetail('${a.ticker}')" title="Ver detalhes">ℹ</button>` : '';
      return `<tr${isTes ? ` style="cursor:pointer" onclick="carteiraToggleTesouroDetail('${a.ticker}')"` : ''}>
        <td>
          <div style="display:flex;align-items:center;gap:7px">
            <div>
              <div style="display:flex;align-items:center;gap:5px">
                <span class="cart-asset-ticker" style="font-size:13px">${a.ticker}</span>
                <span class="cart-cat-badge ${cat}">${CAT_ICONS[cat]||'📦'} ${CAT_LABELS[cat]||cat}</span>
              </div>
              ${a.nome && a.nome!==a.ticker ? `<div style="font-size:10px;color:var(--t3);margin-top:1px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(a.nome)}</div>` : ''}
            </div>
          </div>
        </td>
        <td class="r" style="color:var(--t2)">${a.qtd?.toLocaleString('pt-BR')}</td>
        <td class="r" style="color:var(--t3)">${a.pmedio ? fmt(a.pmedio) : '—'}</td>
        <td class="r">
          <div style="color:${a.precoEstimado?'var(--t3)':'var(--t1)'}">
            ${a.precoEstimado?'<span title="Preço estimado (custo médio) — clique em Atualizar cotações para ver o valor de mercado" style="font-size:9px;color:var(--go);margin-right:2px;vertical-align:middle">~</span>':''}${fmtCotacao(a.preco)}
          </div>
          ${a.precoEstimado
            ? `<div style="font-size:9px;color:var(--t3)">custo — atualizar</div>`
            : (a.variacao!=null ? `<div style="font-size:10px;color:${varCls}">${a.variacao>=0?'+':''}${a.variacao.toFixed(2)}%</div>` : '')}
        </td>
        <td class="r">${lucro!==null ? `<span style="color:${lucro>=0?'var(--ac)':'var(--re)'};font-size:12px">${lucro>=0?'+':''}${fmt(lucro)}<br><span style="font-size:10px">${lucroPct>=0?'+':''}${lucroPct.toFixed(1)}%</span></span>` : '<span style="color:var(--t3)">—</span>'}</td>
        <td class="r" style="color:var(--ac);font-weight:600">${a.preco != null ? fmt(a.preco * a.qtd) : '<span class="cotacao-indisponivel">N/D</span>'}</td>
        <td class="r" style="color:var(--t3)">${pct}%</td>
        <td onclick="event.stopPropagation()"><button class="cart-trow-del" onclick="carteiraRemove('${a.ticker}')" title="Remover">🗑</button>${expandBtn}</td>
      </tr>${renderTesouroDetail(a)}`;
    }).join('')}</tbody>
  </table></div>`;

  carteiraUpdatePatrimonio();
  carteiraRenderAlocacao();
  carteiraRenderRecomendacoes();
  carteiraRenderProventos();
  carteiraRenderGanhos();
}

// ── Toggle linha de detalhe Tesouro ──────────────────────────────────────
function carteiraToggleTesouroDetail(ticker) {
  const row = document.getElementById(`td-${ticker}`);
  if (!row) return;
  row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
}

// ── Renderizar gráfico de alocação por categoria ──
function carteiraRenderAlocacao() {
  const ativos = carteiraLoad();
  const panel  = document.getElementById('cartAlocacaoPanel');
  if (!panel) return;

  if (!ativos.length) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';

  // Agrupa por categoria
  const cats = {};
  ativos.forEach(a => {
    const cat   = a.categoria || 'outro';
    const valor = (a.preco||0) * (a.qtd||0);
    if (valor > 0) cats[cat] = (cats[cat]||0) + valor;
  });

  const entries = Object.entries(cats).sort(([,a],[,b]) => b - a);
  const total   = entries.reduce((s,[,v]) => s+v, 0);
  if (!total) { panel.style.display = 'none'; return; }

  // Gráfico doughnut
  const canvas = document.getElementById('cartAlocacaoChart');
  if (canvas) {
    if (window._cartAlocChart) { try { window._cartAlocChart.destroy(); } catch(e){} }
    window._cartAlocChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: entries.map(([k]) => CAT_LABELS[k]||k),
        datasets: [{
          data: entries.map(([,v]) => v),
          backgroundColor: entries.map(([k]) => CAT_COLORS[k]||'#94a3b8'),
          borderWidth: 2,
          borderColor: 'var(--bg8, #10141c)',
          hoverOffset: 6,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const pct = (ctx.parsed / total * 100).toFixed(1);
                return ` ${fmt(ctx.parsed)} · ${pct}%`;
              }
            }
          }
        }
      }
    });
  }

  // Legenda compacta
  const legendEl = document.getElementById('cartAlocacaoLegend');
  if (legendEl) {
    legendEl.innerHTML = entries.map(([k, v]) => {
      const pct   = (v / total * 100).toFixed(1);
      const color = CAT_COLORS[k] || '#94a3b8';
      return `<div style="display:flex;align-items:center;gap:7px;padding:4px 0;border-bottom:1px solid var(--bd);font-size:11px">
        <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></span>
        <span style="color:var(--t2);flex:1">${CAT_LABELS[k]||k}</span>
        <span style="font-family:var(--fm);color:var(--t3)">${pct}%</span>
      </div>`;
    }).join('');
  }
}

// ── Renderizar recomendações ativas ──
function carteiraRenderRecomendacoes() {
  const ativos = carteiraLoad();
  const panel  = document.getElementById('cartRecomPanel');
  const area   = document.getElementById('cartRecomArea');
  if (!panel || !area) return;

  if (!ativos.length) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';

  const total = ativos.reduce((s,a) => s + (a.preco||0)*(a.qtd||0), 0);
  const recs  = [];

  // 1. Concentração excessiva por ativo
  ativos.forEach(a => {
    const valor = (a.preco||0)*(a.qtd||0);
    const pct   = total > 0 ? valor/total*100 : 0;
    if (pct > 20) {
      recs.push({ type:'warn', icon:'⚠️',
        title:`${a.ticker} representa ${pct.toFixed(1)}% da carteira`,
        desc:`Concentração acima de 20% em um único ativo aumenta o risco. Considere diversificar gradualmente.`
      });
    }
  });

  // 2. Top ganhador e maior perdedor (vs preço médio)
  const comPM = ativos.filter(a => a.pmedio && a.preco && a.pmedio > 0);
  if (comPM.length) {
    const sorted    = [...comPM].sort((a,b) => (b.preco/b.pmedio) - (a.preco/a.pmedio));
    const best      = sorted[0];
    const worst     = sorted[sorted.length-1];
    const bestPct   = (best.preco/best.pmedio-1)*100;
    const worstPct  = (worst.preco/worst.pmedio-1)*100;

    if (bestPct > 0) {
      recs.push({ type:'ok', icon:'🏆',
        title:`Melhor ativo: ${best.ticker} (+${bestPct.toFixed(1)}% vs PM)`,
        desc:`Preço atual ${fmt(best.preco)} vs PM ${fmt(best.pmedio)} · L/P acumulado: ${fmt((best.preco-best.pmedio)*best.qtd)}`
      });
    }
    if (worstPct < -5 && worst.ticker !== best.ticker) {
      recs.push({ type:'err', icon:'📉',
        title:`Atenção: ${worst.ticker} (${worstPct.toFixed(1)}% vs PM)`,
        desc:`Preço atual ${fmt(worst.preco)} vs PM ${fmt(worst.pmedio)} · Prejuízo: ${fmt((worst.preco-worst.pmedio)*worst.qtd)}`
      });
    }
  }

  // 3. Sem renda passiva (FII / Renda Fixa)
  const cats = {};
  ativos.forEach(a => { const c = a.categoria||'outro'; cats[c] = (cats[c]||0)+1; });
  if (!cats.fii && !cats['renda-fixa'] && !cats.tesouro && ativos.length >= 3) {
    recs.push({ type:'info', icon:'💡',
      title:'Carteira sem renda fixa ou FIIs',
      desc:'Adicionar FIIs ou Renda Fixa pode reduzir a volatilidade e gerar renda passiva recorrente.'
    });
  }

  // 4. Sem ações nacionais
  if (!cats.acao && !cats.etf && ativos.length >= 2) {
    recs.push({ type:'info', icon:'📊',
      title:'Nenhuma ação ou ETF na carteira',
      desc:'Ações e ETFs têm maior potencial de crescimento no longo prazo. Considere adicionar exposição variável.'
    });
  }

  // 5. Cotações desatualizadas
  const desatual = ativos.filter(a => {
    if (!a.updatedAt) return true;
    return (Date.now() - new Date(a.updatedAt)) > 24 * 60 * 60 * 1000;
  });
  if (desatual.length) {
    recs.push({ type:'warn', icon:'🕐',
      title:`${desatual.length} ativo${desatual.length>1?'s':''} sem cotação atualizada (>24h)`,
      desc:`Clique em "Atualizar cotações" para buscar os preços mais recentes do mercado.`
    });
  }

  if (!recs.length) {
    area.innerHTML = `<div style="text-align:center;padding:16px 0;font-size:12px;color:var(--t3)">✅ Nenhuma recomendação crítica no momento. Continue acompanhando!</div>`;
    return;
  }

  area.innerHTML = recs.map(r => `
    <div class="recom-card ${r.type}">
      <div class="recom-icon">${r.icon}</div>
      <div class="recom-body">
        <div class="recom-title">${r.title}</div>
        <div class="recom-desc">${r.desc}</div>
      </div>
    </div>`).join('');
}

// ── Detectar formato B3 — função unificada ──
// Retorna 'b3' | 'negociacao' | 'movimentacao' | 'desconhecido'
function carteiraDetectarFormato(rows) {
  if (!rows.length) return 'desconhecido';
  const headers = Object.keys(rows[0]);
  if (headers.some(h => /entrada.*sa[íi]da/i.test(h)))          return 'movimentacao';
  if (headers.some(h => /data.*neg[oó]cio/i.test(h)))            return 'negociacao';
  if (headers.some(h => /c[oó]digo de negoci/i.test(h)))         return 'b3';
  return 'desconhecido';
}

// Aliases mantidos para compatibilidade com chamadas existentes no código
function carteiraIsFormatoB3(rows)          { return carteiraDetectarFormato(rows) === 'b3'; }
function carteiraIsFormatoNegociacao(rows)  { return carteiraDetectarFormato(rows) === 'negociacao'; }
function carteiraIsFormatoMovimentacao(rows){ return carteiraDetectarFormato(rows) === 'movimentacao'; }

// ── Extrair categoria a partir do campo "Tipo" da B3 ──
function carteiraExtrairCategoria(tipo) {
  if (!tipo) return 'outro';
  const t = tipo.toLowerCase();
  if (/fundo.*imob|fii/i.test(t))            return 'fii';
  if (/etf|fundo.*índice|fundo de índice/i.test(t)) return 'etf';
  if (/bdr/i.test(t))                        return 'bdr';
  if (/ação|ações|acoes|acao/i.test(t))      return 'acao';
  if (/renda.*fixa|cri|cra|debênture|debenture/i.test(t)) return 'renda-fixa';
  if (/tesouro/i.test(t))                    return 'tesouro';
  return 'outro';
}

// ── Extrair ativos do formato B3 ──
function carteiraExtrairB3(rows) {
  const tickerCol  = Object.keys(rows[0]).find(h => /código de negociação|codigo de negociacao/i.test(h));
  const qtdCol     = Object.keys(rows[0]).find(h => /quantidade(?!\s*disponível|\s*indisponível)/i.test(h));
  const pmedioCol  = Object.keys(rows[0]).find(h => /preço médio|preco medio/i.test(h));
  const tipoCol    = Object.keys(rows[0]).find(h => /^tipo$/i.test(h));
  const produtoCol = Object.keys(rows[0]).find(h => /^produto$/i.test(h));

  const parseBR = v => parseFloat(String(v||'').replace(/\./g,'').replace(',','.')) || null;

  return rows
    .map(r => {
      const ticker = (r[tickerCol]||'').toString().trim().toUpperCase().replace(/\s+/g,'');
      const qtd    = parseBR(r[qtdCol]);
      const pmedio = pmedioCol ? parseBR(r[pmedioCol]) : null;
      const tipo   = tipoCol   ? (r[tipoCol]  ||'').toString().trim() : '';
      const nome   = produtoCol? (r[produtoCol]||'').toString().trim() : ticker;
      return { ticker, qtd, pmedio, categoria: carteiraExtrairCategoria(tipo), nomeB3: nome };
    })
    .filter(a => a.ticker && a.ticker.length >= 4 && a.qtd > 0);
}

// ── Extrair trades do formato B3 Negociação ──
// ── Normaliza ticker: remove sufixo F do mercado fracionário (ex: WEGE3F → WEGE3) ──
function normalizarTicker(raw) {
  const t = (raw||'').toString().trim().toUpperCase().replace(/\s+/g,'');
  // Fracionário: letra(s) + dígito(s) + F no final (ex: WEGE3F, GOAU4F, KNRI11F)
  return t.replace(/^([A-Z]{3,6}\d{1,2})F$/, '$1');
}

// ── Infere categoria a partir do padrão do ticker ──
function inferirCategoria(ticker) {
  if (!ticker) return 'outro';
  const t = ticker.toUpperCase();

  // Tesouro Direto sintético
  if (/^TD_/.test(t)) return 'tesouro';

  // BDRs: 4-5 letras + 2 dígitos entre 32-39 (ex: AAPL34, MSFT34, GOOGL32)
  if (/^[A-Z]{4,5}3[2-9]$/.test(t)) return 'bdr';

  // ETFs: tickers conhecidos da B3 (sufixo 10, 11 ou 12)
  const ETF_SET = new Set([
    'BOVA11','IVVB11','SMAL11','HASH11','DIVO11','XFIX11','FIXA11','GOLD11',
    'SPXI11','NASD11','TECK11','ACWI11','FIND11','MATB11','UTIL11','ISUS11',
    'ECOO11','AGRI11','IFNC11','GOVE11','BBSD11','XBOV11','BBOV11','BOVV11',
    'PIBB11','SMAC11','CSMO11','EURP11','ASIA11','USTK11','WRLD11','NTNB11',
    'B5P211','IRFM11','IMAB11','FIIM11','VILG11',
    'BOVA10','SMAL10','SPXI10',
  ]);
  if (ETF_SET.has(t)) return 'etf';

  // FIIs: 2–4 letras + 11 (após descartar ETFs acima)
  if (/^[A-Z]{2,4}11$/.test(t)) return 'fii';

  // Ações: 4 letras + 1 dígito (ON=3, PN=4, UNT=5, etc.)
  if (/^[A-Z]{4}\d$/.test(t)) return 'acao';

  return 'outro';
}

function carteiraExtrairNegociacoes(rows) {
  const h = Object.keys(rows[0]);
  const dataCol   = h.find(k => /data.*neg[oó]cio/i.test(k));
  const tipoCol   = h.find(k => /tipo.*moviment/i.test(k));
  const tickerCol = h.find(k => /c[oó]digo.*negoci/i.test(k));
  const qtdCol    = h.find(k => /^quantidade$/i.test(k));
  const precoCol  = h.find(k => /^pre[çc]o$/i.test(k));
  const valorCol  = h.find(k => /^valor$/i.test(k));

  // SheetJS lê XLSX como JS numbers (ex: 163.57). String(163.57)="163.57".
  // replace(/\./g,'') removeria o ponto decimal → 16357. Por isso,
  // se o valor já é number, retorna direto sem processar como string BR.
  const parseBR  = v => typeof v === 'number' ? v :
    parseFloat(String(v||'').replace(/\./g,'').replace(',','.')) || 0;
  const parseData = d => {
    const m = String(d||'').match(/(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : String(d||'');
  };

  return rows
    .map(r => {
      const ticker = normalizarTicker(r[tickerCol]);
      return {
        data:   parseData(r[dataCol]),
        tipo:   (r[tipoCol]||'').toLowerCase(),
        ticker,
        qtd:    parseBR(r[qtdCol]),
        preco:  parseBR(r[precoCol]),
        valor:  parseBR(r[valorCol]),
      };
    })
    .filter(n => n.ticker.length >= 4 && n.qtd > 0 &&
      (n.tipo.includes('compra') || n.tipo.includes('venda')));
}

// ── Extrair eventos do formato B3 Movimentação ──
function carteiraExtrairMovimentacoes(rows) {
  const h = Object.keys(rows[0]);
  const esCol      = h.find(k => /entrada.*sa[íi]da/i.test(k));
  const dataCol    = h.find(k => /^data$/i.test(k));
  const movimCol   = h.find(k => /^movimenta[çc][aã]o$/i.test(k));
  const produtoCol = h.find(k => /^produto$/i.test(k));
  const qtdCol     = h.find(k => /^quantidade$/i.test(k));
  const precoCol   = h.find(k => /pre[çc]o.*unit[aá]rio/i.test(k));
  const valorCol   = h.find(k => /valor.*opera[çc][aã]o/i.test(k));

  const parseBR  = v => typeof v === 'number' ? v :
    parseFloat(String(v||'').replace(/\./g,'').replace(',','.')) || 0;
  const parseData = d => {
    const m = String(d||'').match(/(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : String(d||'');
  };
  const extractTicker = p => normalizarTicker((String(p||'').split(/[\s-]/)[0]||'').trim());

  return rows
    .map(r => ({
      data:         parseData(r[dataCol]),
      tipo:         (r[movimCol]||'').toString().trim(),
      produto:      (r[produtoCol]||'').toString().trim(),
      ticker:       extractTicker(r[produtoCol]),
      entradaSaida: (r[esCol]||'').toLowerCase(),
      qtd:          parseBR(r[qtdCol]),
      preco:        parseBR(r[precoCol]),
      valor:        parseBR(r[valorCol]),
    }))
    .filter(m => m.ticker && m.ticker.length >= 4);
}

// ── Calcular posição atual a partir do histórico de Negociação (custo médio ponderado) ──
function carteiraCalcularPosicaoDeNegociacoes(negocs) {
  const map = {};
  [...negocs].sort((a,b) => a.data.localeCompare(b.data)).forEach(n => {
    if (!map[n.ticker]) map[n.ticker] = { qtd:0, totalCusto:0, ganhoRealizado:0 };
    const m = map[n.ticker];
    if (n.tipo.includes('compra')) {
      m.totalCusto += n.qtd * n.preco;
      m.qtd += n.qtd;
    } else if (n.tipo.includes('venda')) {
      const pm = m.qtd > 0 ? m.totalCusto / m.qtd : 0;
      m.ganhoRealizado += (n.preco - pm) * n.qtd;
      m.totalCusto = Math.max(0, m.totalCusto - pm * n.qtd);
      m.qtd = Math.max(0, m.qtd - n.qtd);
    }
  });
  return Object.entries(map).map(([ticker, m]) => ({
    ticker,
    qtd:             Math.round(m.qtd * 1000) / 1000,
    pmedio:          m.qtd > 0 ? m.totalCusto / m.qtd : 0,
    ganhoRealizado:  m.ganhoRealizado,
  }));
}

// ── Importar B3 / CSV / XLSX ──
async function carteiraImportFile(file) {
  if (!file) return;
  const statusEl = document.getElementById('cartImportStatus');
  carteiraSetStatus(statusEl, 'Lendo arquivo...', 'load');

  const ext = file.name.split('.').pop().toLowerCase();

  try {
    let rows = [];
    if (ext === 'csv') {
      rows = await carteiraParseCSV(file);
    } else if (ext === 'xlsx' || ext === 'xls') {
      rows = await carteiraParseXLSX(file);
    } else {
      carteiraSetStatus(statusEl, 'Formato não suportado. Use CSV ou XLSX da B3 / corretora.', 'err');
      return;
    }

    if (!rows.length) {
      carteiraSetStatus(statusEl, 'Arquivo vazio ou sem dados reconhecidos', 'err');
      return;
    }

    // ── Roteamento por formato detectado ──
    if (carteiraIsFormatoNegociacao(rows)) {
      // ── B3 Extrato de Negociação ──
      carteiraSetStatus(statusEl, '📊 Extrato de Negociação B3 detectado! Processando trades...', 'load');
      const negocs = carteiraExtrairNegociacoes(rows);
      if (!negocs.length) {
        carteiraSetStatus(statusEl, 'Nenhum trade de compra/venda encontrado no arquivo', 'err');
        return;
      }
      // Mescla com histórico existente (evita duplicatas)
      const existingNegocs = negocLoad();
      const newNegocs = negocs.filter(n => !existingNegocs.some(e =>
        e.data===n.data && e.ticker===n.ticker && e.tipo===n.tipo &&
        e.qtd===n.qtd && Math.abs(e.preco-n.preco)<0.01
      ));
      const allNegocs = [...existingNegocs, ...newNegocs];
      negocSave(allNegocs);

      // Calcula posição atual de todo o histórico
      const posicoes = carteiraCalcularPosicaoDeNegociacoes(allNegocs).filter(p => p.qtd > 0.001);
      if (!posicoes.length) {
        carteiraSetStatus(statusEl,
          `${negocs.length} trades importados (${newNegocs.length} novos). Posição zerada.`, 'ok');
        carteiraRenderList();
        return;
      }

      carteiraSetStatus(statusEl, `Calculando posição de ${posicoes.length} ativos... Buscando cotações...`, 'load');
      const tickers = posicoes.map(p => p.ticker);
      const quotes  = await carteiraBuscarCotacao(tickers);
      const existentes = carteiraLoad();
      let adicionados = 0;

      posicoes.forEach(p => {
        const q   = quotes?.[p.ticker];
        const idx = existentes.findIndex(e => e.ticker === p.ticker);
        const ativo = {
          ticker:          p.ticker,
          qtd:             p.qtd,
          pmedio:          p.pmedio > 0 ? Math.round(p.pmedio * 100) / 100 : null,
          ganhoRealizado:  p.ganhoRealizado,
          categoria:       existentes[idx]?.categoria || inferirCategoria(p.ticker),
          nome:            q?.shortName || q?.longName || p.ticker,
          preco:           q?.regularMarketPrice || null,
          variacao:        q?.regularMarketChangePercent || null,
          updatedAt:       new Date().toISOString(),
          fromNegociacao:  true,
        };
        if (idx >= 0) {
          existentes[idx] = { ...existentes[idx], ...ativo };
        } else {
          existentes.push(ativo);
          adicionados++;
        }
      });

      // Remove ativos zerados que vieram do histórico de negociação
      const atualTickers = new Set(posicoes.map(p => p.ticker));
      const filtrados = existentes.filter(a => !a.fromNegociacao || atualTickers.has(a.ticker));
      carteiraSave(filtrados);
      carteiraRenderList();

      const ganhoTotal = posicoes.reduce((s,p) => s + (p.ganhoRealizado||0), 0);
      const ganhoStr   = ganhoTotal !== 0 ? ` · Realizado: ${ganhoTotal>=0?'+':''}${fmt(ganhoTotal)}` : '';
      carteiraSetStatus(statusEl,
        `✅ [Negociação B3] ${negocs.length} trades (${newNegocs.length} novos) → ${posicoes.length} ativos (${adicionados} novos)${ganhoStr}`, 'ok');

    } else if (carteiraIsFormatoMovimentacao(rows)) {
      // ── B3 Extrato de Movimentação ──
      carteiraSetStatus(statusEl, '💰 Extrato de Movimentação B3 detectado! Processando proventos...', 'load');
      const movims = carteiraExtrairMovimentacoes(rows);
      if (!movims.length) {
        carteiraSetStatus(statusEl, 'Nenhuma movimentação encontrada no arquivo', 'err');
        return;
      }
      const existingMovims = movimLoad();
      const newMovims = movims.filter(m => !existingMovims.some(e =>
        e.data===m.data && e.ticker===m.ticker && e.tipo===m.tipo && Math.abs(e.valor-m.valor)<0.01
      ));
      const todasMovims = [...existingMovims, ...newMovims];
      movimSave(todasMovims);

      // Tesouro é sincronizado automaticamente via carteiraMigrar() no próximo render
      carteiraMigrar();
      carteiraRenderList();

      // Enriquecer cotações de Tesouro via API AA40 (assíncrono)
      enriquecerTesouroMovimentacoes().catch(e => console.warn('[Tesouro API]', e));

      const tesouroCount = tesouroComputarPosicoes(todasMovims).length;
      const proventos   = movims.filter(m => /dividendo|jcp|juros.*capital|provento|rendimento/i.test(m.tipo));
      const totalProv   = proventos.reduce((s,m) => s + m.valor, 0);
      const tiposUnicos = [...new Set(movims.map(m => m.tipo))].slice(0,4).join(', ');
      const tesStr      = tesouroCount > 0 ? ` · 🏛 ${tesouroCount} título(s) Tesouro Direto` : '';
      carteiraSetStatus(statusEl,
        `✅ [Movimentação B3] ${movims.length} eventos (${newMovims.length} novos) · ${proventos.length} proventos = ${fmt(totalProv)} · Tipos: ${tiposUnicos}${tesStr}`, 'ok');

    } else {
      // ── B3 Posição (snapshot) ou CSV genérico ──
      const isB3 = carteiraIsFormatoB3(rows);
      let novos = [];

      if (isB3) {
        carteiraSetStatus(statusEl, '🏦 Posição B3 detectada! Extraindo...', 'load');
        novos = carteiraExtrairB3(rows);
      } else {
        const tickerCol = Object.keys(rows[0]).find(h =>
          /ticker|ativo|papel|codigo|código|symbol/i.test(h)
        );
        const qtdCol = Object.keys(rows[0]).find(h =>
          /qtd|quantidade|qtde|quant|shares|cotas/i.test(h)
        );
        const pmedioCol = Object.keys(rows[0]).find(h =>
          /preço médio|preco medio|pm|custo|p\.m\.|p med/i.test(h)
        );
        if (!tickerCol || !qtdCol) {
          carteiraSetStatus(statusEl,
            `Colunas não reconhecidas. Encontradas: ${Object.keys(rows[0]).join(', ')}`, 'err');
          return;
        }
        const parseBR = v => typeof v === 'number' ? v :
          parseFloat(String(v||'').replace(/\./g,'').replace(',','.')) || null;
        novos = rows
          .map(r => ({
            ticker:    (r[tickerCol]||'').toString().trim().toUpperCase().replace(/[\s.]/g,''),
            qtd:       parseBR(r[qtdCol]),
            pmedio:    pmedioCol ? parseBR(r[pmedioCol]) : null,
            categoria: 'outro',
            nomeB3:    '',
          }))
          .filter(a => a.ticker && a.ticker.length >= 4 && a.qtd > 0);
      }

      if (!novos.length) {
        carteiraSetStatus(statusEl, 'Nenhum ativo válido encontrado no arquivo', 'err');
        return;
      }

      carteiraSetStatus(statusEl, `Encontrei ${novos.length} ativos. Buscando cotações...`, 'load');
      const tickers = [...new Set(novos.map(a => a.ticker))];
      const quotes  = await carteiraBuscarCotacao(tickers);
      const existentes = carteiraLoad();
      let adicionados = 0;

      novos.forEach(n => {
        const q   = quotes?.[n.ticker];
        const idx = existentes.findIndex(e => e.ticker === n.ticker);
        const ativo = {
          ticker:    n.ticker,
          qtd:       n.qtd,
          pmedio:    n.pmedio,
          categoria: n.categoria,
          nome:      q?.shortName || q?.longName || n.nomeB3 || n.ticker,
          preco:     q?.regularMarketPrice  || null,
          variacao:  q?.regularMarketChangePercent || null,
          updatedAt: new Date().toISOString(),
        };
        if (idx >= 0) {
          if (!isB3 && existentes[idx].categoria) ativo.categoria = existentes[idx].categoria;
          existentes[idx] = { ...existentes[idx], ...ativo };
        } else {
          existentes.push(ativo);
          adicionados++;
        }
      });

      carteiraSave(existentes);
      carteiraRenderList();
      const srcTag = isB3 ? '🏦 B3 Posição' : '📂 Corretora';
      carteiraSetStatus(statusEl,
        `✅ [${srcTag}] ${novos.length} ativos (${adicionados} novos, ${novos.length-adicionados} atualizados)`, 'ok');
    }

  } catch(e) {
    console.error('[Carteira import]', e);
    carteiraSetStatus(statusEl, 'Erro ao processar arquivo: ' + e.message, 'err');
  }
}

// ── Parse CSV ──
async function carteiraParseCSV(file) {
  const text = await file.text();
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  // Detecta separador
  const sep = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map(h => h.replace(/["']/g,'').trim());
  return lines.slice(1)
    .filter(l => l.trim())
    .map(line => {
      const vals = line.split(sep).map(v => v.replace(/["']/g,'').trim());
      const obj = {};
      headers.forEach((h,i) => { obj[h] = vals[i] || ''; });
      return obj;
    });
}

// ── Parse XLSX ──
async function carteiraParseXLSX(file) {
  if (!window.XLSX) {
    throw new Error('[SimFin] SheetJS (window.XLSX) não disponível. Verifique se o script foi carregado em index.html.');
  }
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb   = window.XLSX.read(e.target.result, { type: 'binary' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const data = window.XLSX.utils.sheet_to_json(ws, { defval: '' });
        res(data);
      } catch(err) { rej(err); }
    };
    reader.onerror = rej;
    reader.readAsBinaryString(file);
  });
}

// ── Helper status ──
function carteiraSetStatus(el, msg, type) {
  if (!el) return;
  el.className = 'cart-status ' + type;
  el.innerHTML = (type==='load'?'⏳ ':type==='ok'?'✅ ':'❌ ') + msg;
  el.style.display = 'flex';
}

// ── Renderizar painel de Proventos Recebidos ──
function carteiraRenderProventos() {
  const movims  = movimLoad();
  const panel   = document.getElementById('cartProventosPanel');
  const area    = document.getElementById('cartProventosArea');
  const totalEl = document.getElementById('cartProventosTotal');
  if (!panel || !area) return;

  const proventos = movims.filter(m => /dividendo|jcp|juros.*capital|provento|rendimento/i.test(m.tipo));
  if (!proventos.length) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';

  // Agrupa por ticker
  const byTicker = {};
  proventos.forEach(p => {
    if (!byTicker[p.ticker]) byTicker[p.ticker] = { total:0, count:0, tipos: new Set() };
    byTicker[p.ticker].total += p.valor;
    byTicker[p.ticker].count++;
    byTicker[p.ticker].tipos.add(p.tipo);
  });

  const entries    = Object.entries(byTicker).sort(([,a],[,b]) => b.total - a.total);
  const totalProv  = entries.reduce((s,[,v]) => s + v.total, 0);
  const totalAnual = (() => {
    const now = new Date();
    const anoAtual = proventos.filter(p => p.data.startsWith(now.getFullYear().toString()));
    return anoAtual.reduce((s,p) => s+p.valor, 0);
  })();

  if (totalEl) totalEl.textContent = `Total: ${fmt(totalProv)}`;

  area.innerHTML = `
    <div style="display:flex;gap:16px;margin-bottom:12px;flex-wrap:wrap">
      <div style="flex:1;min-width:120px;background:var(--bg3);border-radius:10px;padding:10px 14px">
        <div style="font-size:10px;color:var(--t3);margin-bottom:2px">Total acumulado</div>
        <div style="font-size:18px;font-weight:700;color:var(--ac)">${fmt(totalProv)}</div>
      </div>
      ${totalAnual > 0 ? `<div style="flex:1;min-width:120px;background:var(--bg3);border-radius:10px;padding:10px 14px">
        <div style="font-size:10px;color:var(--t3);margin-bottom:2px">Ano atual</div>
        <div style="font-size:18px;font-weight:700;color:var(--ac)">${fmt(totalAnual)}</div>
      </div>` : ''}
      <div style="flex:1;min-width:120px;background:var(--bg3);border-radius:10px;padding:10px 14px">
        <div style="font-size:10px;color:var(--t3);margin-bottom:2px">Pagamentos</div>
        <div style="font-size:18px;font-weight:700;color:var(--t1)">${proventos.length}</div>
      </div>
    </div>
    ${entries.map(([ticker, v]) => `
    <div class="cart-asset-row" style="padding:8px 0;border-bottom:1px solid var(--bd)">
      <div>
        <span class="cart-asset-ticker" style="font-size:12px">${ticker}</span>
        <span style="font-size:10px;color:var(--t3);margin-left:6px">${[...v.tipos].join(', ')} · ${v.count}x</span>
      </div>
      <span style="font-size:13px;font-weight:700;color:var(--ac)">${fmt(v.total)}</span>
    </div>`).join('')}`;
}

// ── Renderizar painel de Ganhos/Perdas Realizados ──
function carteiraRenderGanhos() {
  const ativos  = carteiraLoad();
  const panel   = document.getElementById('cartGanhosPanel');
  const area    = document.getElementById('cartGanhosArea');
  const totalEl = document.getElementById('cartGanhosTotal');
  if (!panel || !area) return;

  const comGanho = ativos.filter(a => a.ganhoRealizado !== undefined && a.ganhoRealizado !== 0);
  if (!comGanho.length) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';

  const totalGanho = comGanho.reduce((s,a) => s + (a.ganhoRealizado||0), 0);
  if (totalEl) {
    totalEl.textContent = `${totalGanho>=0?'+':''}${fmt(totalGanho)}`;
    totalEl.style.color = totalGanho >= 0 ? 'var(--ac)' : 'var(--re)';
  }

  const sorted = [...comGanho].sort((a,b) => (b.ganhoRealizado||0) - (a.ganhoRealizado||0));

  area.innerHTML = `
    <div style="background:var(--bg3);border-radius:10px;padding:10px 14px;margin-bottom:12px">
      <div style="font-size:10px;color:var(--t3);margin-bottom:2px">Resultado total realizado</div>
      <div style="font-size:20px;font-weight:700;color:${totalGanho>=0?'var(--ac)':'var(--re)'}">
        ${totalGanho>=0?'+':''}${fmt(totalGanho)}
      </div>
      <div style="font-size:10px;color:var(--t3);margin-top:2px">IR sobre ganho: ${totalGanho>0?fmt(totalGanho*0.15)+' (15% aprox.)':'—'}</div>
    </div>
    ${sorted.map(a => `
    <div class="cart-asset-row" style="padding:8px 0;border-bottom:1px solid var(--bd)">
      <span class="cart-asset-ticker" style="font-size:12px">${a.ticker}</span>
      <span style="font-size:13px;font-weight:700;color:${(a.ganhoRealizado||0)>=0?'var(--ac)':'var(--re)'}">
        ${(a.ganhoRealizado||0)>=0?'+':''}${fmt(a.ganhoRealizado||0)}
      </span>
    </div>`).join('')}`;
}

// ── Incluir carteira no Drive payload ──
// (adicionado via driveGetPayload que já inclui tudo via localStorage)


// ════════════════════════════════════════════════════════════════
// PATRIMÔNIO SEPARADO — soma os 3 buckets para a projeção
// ════════════════════════════════════════════════════════════════
function calcPatrimonio() {
  const inv   = parseFloat(document.getElementById('patInvestimentos')?.value) || 0;
  const fgts  = parseFloat(document.getElementById('patFGTS')?.value)          || 0;
  const res   = parseFloat(document.getElementById('patReserva')?.value)       || 0;
  const total = inv + fgts + res;
  // Atualiza o campo hidden que alimenta a projeção
  const el = document.getElementById('patrimonioInicial');
  if (el) el.value = total;
  // Atualiza o display
  const disp = document.getElementById('patTotal');
  if (disp) disp.textContent = fmt(total);
  calc();
}

// ════════════════════════════════════════════════════════════════
// TESOURO DIRETO — via Edge Function (mesmo proxy do Yahoo Finance)
// ════════════════════════════════════════════════════════════════

// Mapa estático de nomes conhecidos → ticker sintético
// Garante consistência entre dispositivos e evita colisão de nomes similares.
// Para títulos não listados, usa a função de fallback abaixo.
const TESOURO_TICKER_MAP = {
  // Tesouro Selic
  'Tesouro Selic 2026':          'TD_SELIC2026',
  'Tesouro Selic 2027':          'TD_SELIC2027',
  'Tesouro Selic 2028':          'TD_SELIC2028',
  'Tesouro Selic 2029':          'TD_SELIC2029',
  'Tesouro Selic 2031':          'TD_SELIC2031',
  // Tesouro IPCA+
  'Tesouro IPCA+ 2029':          'TD_IPCA2029',
  'Tesouro IPCA+ 2035':          'TD_IPCA2035',
  'Tesouro IPCA+ 2040':          'TD_IPCA2040',
  'Tesouro IPCA+ 2045':          'TD_IPCA2045',
  'Tesouro IPCA+ 2055':          'TD_IPCA2055',
  // Tesouro IPCA+ com Juros Semestrais
  'Tesouro IPCA+ com Juros Semestrais 2030': 'TD_IPCAJS2030',
  'Tesouro IPCA+ com Juros Semestrais 2032': 'TD_IPCAJS2032',
  'Tesouro IPCA+ com Juros Semestrais 2035': 'TD_IPCAJS2035',
  'Tesouro IPCA+ com Juros Semestrais 2040': 'TD_IPCAJS2040',
  'Tesouro IPCA+ com Juros Semestrais 2055': 'TD_IPCAJS2055',
  // Tesouro Prefixado
  'Tesouro Prefixado 2026':      'TD_PRE2026',
  'Tesouro Prefixado 2027':      'TD_PRE2027',
  'Tesouro Prefixado 2029':      'TD_PRE2029',
  'Tesouro Prefixado 2031':      'TD_PRE2031',
  // Tesouro Prefixado com Juros Semestrais
  'Tesouro Prefixado com Juros Semestrais 2029': 'TD_PREJS2029',
  'Tesouro Prefixado com Juros Semestrais 2031': 'TD_PREJS2031',
  'Tesouro Prefixado com Juros Semestrais 2033': 'TD_PREJS2033',
};

// Gera ticker sintético — usa mapa estático primeiro, fallback por extração de nome
function tesouroSyntheticTicker(produto) {
  const nomeTrimado = (produto||'').trim();
  // 1. Busca exata no mapa
  if (TESOURO_TICKER_MAP[nomeTrimado]) return TESOURO_TICKER_MAP[nomeTrimado];
  // 2. Busca case-insensitive no mapa
  const chaveCI = Object.keys(TESOURO_TICKER_MAP).find(k =>
    k.toLowerCase() === nomeTrimado.toLowerCase()
  );
  if (chaveCI) return TESOURO_TICKER_MAP[chaveCI];
  // 3. Fallback: extração heurística (títulos futuros não mapeados)
  const name  = nomeTrimado.replace(/tesouro\s+/i, '').toUpperCase();
  const noNum = name.replace(/\d+/g, '').replace(/[^A-Z]/g, '');
  const ano   = (name.match(/\d{4}/) || [''])[0];
  return ('TD_' + noNum.slice(0, 5) + ano).slice(0, 14);
}

// tesouroFetchPrices definido em tesouro-api.js

// ── Toggle tipo de ativo no formulário ──
function carteiraToggleTipo() {
  const tipo = document.getElementById('cartTipo')?.value;
  const acaoFields    = document.getElementById('cartCamposAcao');
  const tesouoFields  = document.getElementById('cartCamposTesouro');
  if (tipo === 'tesouro') {
    if (acaoFields)   acaoFields.style.display   = 'none';
    if (tesouoFields) tesouoFields.style.display = 'grid'; // display grid com repeat(auto-fit,minmax(...))
  } else {
    if (acaoFields)   acaoFields.style.display   = 'grid'; // display grid com repeat(auto-fit,minmax(...))
    if (tesouoFields) tesouoFields.style.display = 'none';
  }
}

// ── Adicionar ativo — suporte a Tesouro Direto ──
// (override da função existente para suportar os dois tipos)
const _carteiraAddOrig = carteiraAdd;
async function carteiraAdd() {
  const tipo = document.getElementById('cartTipo')?.value || 'acao';
  if (tipo === 'tesouro') {
    await carteiraAddTesouro();
    return;
  }
  await _carteiraAddOrig();
}

async function carteiraAddTesouro() {
  const tipoTitulo = document.getElementById('cartTesouoTipo')?.value || 'Tesouro Selic';
  const valor      = (typeof gP==='function'?gP('cartTesouoValor'):parseFloat(document.getElementById('cartTesouoValor')?.value))||0;
  const venc       = document.getElementById('cartTesouoVenc')?.value?.trim() || '';
  const statusEl   = document.getElementById('cartAddStatus');

  if (!valor) { carteiraSetStatus(statusEl, 'Informe o valor investido', 'err'); return; }

  carteiraSetStatus(statusEl, `Buscando preço do ${tipoTitulo}...`, 'load');

  const prices = await tesouroFetchPrices([tipoTitulo]);
  let precoUnit  = null;
  let nomeCompleto = tipoTitulo + (venc ? ' ' + venc : '');

  if (prices) {
    const match = prices.find(p =>
      p.nome.toLowerCase().includes(tipoTitulo.toLowerCase().replace('tesouro ','')) &&
      (!venc || p.nome.includes(venc))
    ) || prices.find(p => p.nome.toLowerCase().includes(tipoTitulo.toLowerCase().replace('tesouro ','')));

    if (match) {
      precoUnit    = match.preco;
      nomeCompleto = match.nome;
    }
  }

  // Modelo por unidade: qtd = valor / preço_unit, pmedio = preço_unit
  // Sem preço disponível: qtd=1, pmedio=valor (posição como unidade total)
  const qtd    = precoUnit ? Math.round((valor / precoUnit) * 10000) / 10000 : 1;
  const pmedio = precoUnit || valor;
  const ticker = tesouroSyntheticTicker(nomeCompleto);

  const ativos = carteiraLoad();
  const idx    = ativos.findIndex(a => a.ticker === ticker);

  const ativo = {
    ticker,
    nome:           nomeCompleto,
    qtd,
    pmedio,
    preco:          precoUnit || valor,
    variacao:       0,
    tipo:           'tesouro',
    categoria:      'tesouro',
    valorInvestido: valor,
    updatedAt:      new Date().toISOString(),
  };

  if (idx >= 0) ativos[idx] = { ...ativos[idx], ...ativo };
  else           ativos.push(ativo);

  carteiraSave(ativos);
  carteiraSetStatus(statusEl,
    precoUnit
      ? `${nomeCompleto} adicionado! ${qtd} unidades · PM: ${fmt(pmedio)}`
      : `${nomeCompleto} adicionado (preço indisponível — usando valor investido como PM)`,
    'ok');

  document.getElementById('cartTesouoValor').value = '';
  document.getElementById('cartTesouoVenc').value  = '';
  carteiraRenderList();
}

// ── Atualizar cotações — inclui Tesouro Direto ──
async function carteiraRefresh() {
  const ativos = carteiraLoad();
  if (!ativos.length) return;

  // Rate-limit: impede múltiplos refreshes em menos de 60s
  const now = Date.now();
  if (now - _lastRefreshTs < 60_000) {
    const segs = Math.ceil((60_000 - (now - _lastRefreshTs)) / 1000);
    showToast(`Aguarde ${segs}s para atualizar novamente`, '⏱', 2500);
    return;
  }
  _lastRefreshTs = now;

  const acoes   = ativos.filter(a => a.tipo !== 'tesouro');
  const tesouro = ativos.filter(a => a.tipo === 'tesouro');

  const btn = document.getElementById('cartRefreshBtn');
  if (btn) { btn.textContent = '⏳ Atualizando...'; btn.disabled = true; }

  // Atualiza ações via BRAPI
  let quotesAcoes = {};
  if (acoes.length) {
    const q = await carteiraBuscarCotacao(acoes.map(a => a.ticker));
    if (q) quotesAcoes = q;
  }

  // Atualiza Tesouro via API
  let pricesTesouro = [];
  if (tesouro.length) {
    pricesTesouro = await tesouroFetchPrices(null, true) || []; // forceRefresh=true: ignora cache de 4h
  }

  // Mapa nome→price para O(1) lookup em vez de find() por ativo
  const tesouroPriceMap = new Map(pricesTesouro.map(p => [p.nome, p]));

  const agora   = new Date().toISOString();
  const updated = ativos.map(a => {
    if (a.tipo === 'tesouro') {
      const match = tesouroPriceMap.get(a.nome)
        || pricesTesouro.find(p => tesouroMatchTitulo(
            tesouroNormalizarTitulo(a.nome),
            p.nomeB3 || p.nome
          ));
      if (!match) return { ...a, _tdStatus: 'nao_encontrado', updatedAt: agora };
      const fromCache = match._fromCache;

      // Campos ricos do CKAN (podem ser null se vier da fonte B3 legado)
      const precoFinal = match.puVenda || match.preco || null;
      return {
        ...a,
        preco:          precoFinal,
        precoEstimado:  !precoFinal,
        variacao:       precoFinal && a.pmedio ? ((precoFinal - a.pmedio) / a.pmedio * 100) : a.variacao,
        taxaCompra:     match.taxaCompra  ?? null,
        taxaVenda:      match.taxaVenda   ?? null,
        puCompra:       match.puCompra    ?? null,
        puVenda:        match.puVenda     ?? null,
        dataRef:        match.dataRef     ?? null,
        _tdStatus:      match.status      || 'ok',
        _tdOpcoes:      match.opcoes      ?? null,
        _tdSource:      match._source     ?? null,
        updatedAt:      agora,
        cotadoEm:       fromCache ? `cache ${match._cacheAge}min` : agora,
      };
    } else {
      const q = quotesAcoes[a.ticker];
      if (!q) return a;
      return {
        ...a,
        preco:         q.regularMarketPrice,
        precoEstimado: false,
        variacao:      q.regularMarketChangePercent,
        nome:          q.shortName||q.longName||a.nome,
        updatedAt:     agora,
      };
    }
  });

  // Feedback com aviso se Tesouro veio de cache local
  const tesouroCacheAge = pricesTesouro.find(p => p._fromCache)?._cacheAge;
  const tesouroIndisponivel = pricesTesouro.some(p => p.status === 'indisponivel');
  const toastMsg = tesouroIndisponivel
    ? 'Cotações atualizadas · Tesouro: serviço indisponível (sem cache)'
    : tesouroCacheAge
      ? `Cotações atualizadas · Tesouro: dados de ${tesouroCacheAge}min atrás (cache)`
      : 'Cotações atualizadas!';

  carteiraSave(updated);
  carteiraRenderList();
  if (btn) { btn.textContent = '🔄 Atualizar cotações'; btn.disabled = false; }
  showToast(toastMsg, '✅', tesouroCacheAge ? 5000 : 3000);
}

// ── Usar total da carteira para preencher saldo no acompanhamento ──
function carteiraUsarTotal() {
  const total = carteiraLoad().reduce((s,a) => {
    // Para Tesouro: usa preço atual
    return s + (a.preco||0) * (a.qtd||0);
  }, 0);
  if (!total) { showToast('Atualize as cotações primeiro', '⚠️'); return; }
  const el = document.getElementById('trackPatrimonio');
  if (el) el.value = total.toFixed(2);
  // Scroll para o formulário de registro
  document.getElementById('trackMes')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  showToast(`Saldo preenchido: ${fmt(total)}`, '📥');
  updateTrackCalc();
}

// ── Atualiza patInvestimentos quando carteira muda ──
function carteiraSyncPatrimonio() {
  const total = carteiraLoad().reduce((s,a) => {
    return s + (a.preco||0) * (a.qtd||0);
  }, 0);
  const el = document.getElementById('patInvestimentos');
  if (el && !el.value) { // só preenche se estiver vazio
    el.value = total.toFixed(2);
    calcPatrimonio();
  }
}

// ── Enriquecer movimentações de Tesouro com cotações via API AA40 ──
// Chamado após importar arquivo com movimentações
async function enriquecerTesouroMovimentacoes() {
  const movims = movimLoad();
  const tesouroMovs = movims.filter(m => /^tesouro/i.test(m.produto));
  if (!tesouroMovs.length) return;

  showToast('Atualizando cotações de Tesouro Direto...', '📊', 8000);

  // Coletar títulos únicos
  const titulos = [...new Set(tesouroMovs.map(m => tesouroNormalizarTitulo(m.produto)).filter(Boolean))];
  if (!titulos.length) return;

  // Consultar cotações (batch)
  const cotacoes = await tesouroFetchMultiplos(titulos);

  // Enriquecer movimentações
  let atualizadas = 0;
  tesouroMovs.forEach(mov => {
    const titulo = tesouroNormalizarTitulo(mov.produto);
    const cot = cotacoes[titulo];
    if (cot) {
      mov.precoUnitario = cot.pu || mov.precoUnitario;
      mov.cotacaoAtualizada = true;
      mov.cotacaoAtualizadaEm = new Date().toISOString();
      atualizadas++;
    }
  });

  // Salvar atualizado
  if (atualizadas > 0) {
    movimSave(movims);
    carteiraUpdateUI();
    showToast(`✅ ${atualizadas} cotação(ões) de Tesouro atualizada(s) via AA40`, '📈', 4000);
  }
}

// ── Init ──
scenarioAutoTouch();
reminderCheckDue();
// Restaura últimos inputs usados (se houver)
if (autoRestoreInputs()) {
  updAno();
  calcPatrimonio(); // recalcula o total dos buckets
} else {
  updAno();
  calc();
}


// ════════════════════════════════════════════════════════════════
// CAMADA DE DADOS — Write-through cache
//
// Padrão:
//   • Leitura  → localStorage (síncrono, sem latência na UI)
//   • Escrita  → localStorage imediatamente + Supabase em background
//   • Login    → dbMigrateIfNeeded() + dbPullAll() → re-renderiza app
//
// Resultado: dados disponíveis offline E sincronizados entre dispositivos.
// ════════════════════════════════════════════════════════════════

// ── UUID compatível com browsers sem crypto.randomUUID ───────────────────────
function dbUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ── Debounce — evita flood de writes para Supabase (ex: updates de preço) ────
const _dbTimers = {};
function dbDebounce(key, fn, ms = 1500) {
  clearTimeout(_dbTimers[key]);
  _dbTimers[key] = setTimeout(fn, ms);
}

// ── Flag para suprimir pushes durante o pull inicial ─────────────────────────
let _dbSyncing = false;

// ═════════════════════════════════════════════════════════════════════════════
// PULL: Supabase → localStorage  (chamado no login)
// ═════════════════════════════════════════════════════════════════════════════
async function dbPullAll() {
  if (!currentUser) return;
  _dbSyncing = true;
  try {
    const uid = currentUser.id;
    await Promise.allSettled([
      _dbPullSimulacoes(uid),
      _dbPullMetas(uid),
      _dbPullAcompanhamento(uid),
      _dbPullCarteira(uid),
      _dbPullConfig(uid),
    ]);
  } finally {
    _dbSyncing = false;
  }
}

async function _dbPullSimulacoes(uid) {
  const { data, error } = await sb.from('simulacoes')
    .select('*').eq('user_id', uid)
    .order('atualizado_em', { ascending: false });
  if (error || !data) return;
  const saves = data.map(r => ({
    id:       r.id,
    name:     r.nome,
    inputs:   r.inputs,
    summary:  r.summary || '',
    date:     new Date(r.atualizado_em).toLocaleString('pt-BR'),
    versions: r.versoes || [],
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
}

async function _dbPullMetas(uid) {
  const { data, error } = await sb.from('metas').select('*').eq('user_id', uid);
  if (error || !data) return;
  const metas = data.map(r => ({
    id:       Number(r.id),
    cat:      r.categoria,
    name:     r.nome,
    valor:    parseFloat(r.valor),
    meses:    r.meses,
    data:     r.data_alvo,
    atingida: r.atingida,
    criadoEm: r.criado_em,
  }));
  localStorage.setItem(GOALS_KEY, JSON.stringify(metas));
}

async function _dbPullAcompanhamento(uid) {
  const { data, error } = await sb.from('acompanhamento')
    .select('*').eq('user_id', uid).order('mes');
  if (error || !data) return;
  const track = data.map(r => ({
    mes:            r.mes,
    aporte:         r.aporte        !== null ? parseFloat(r.aporte)        : 0,
    patrimonio:     r.patrimonio    !== null ? parseFloat(r.patrimonio)    : 0,
    retirada:       r.retirada      !== null ? parseFloat(r.retirada)      : null,
    retiradaMotivo: r.retirada_motivo || null,
    rendimento:     r.rendimento    !== null ? parseFloat(r.rendimento)    : null,
    taxaMensal:     r.taxa_mensal   !== null ? parseFloat(r.taxa_mensal)   : null,
    taxaAnual:      r.taxa_anual    !== null ? parseFloat(r.taxa_anual)    : null,
    registradoEm:   r.registrado_em,
    editadoEm:      r.editado_em    || undefined,
  }));
  localStorage.setItem(TRACK_KEY, JSON.stringify(track));
}

async function _dbPullCarteira(uid) {
  const [posRes, histRes] = await Promise.allSettled([
    sb.from('carteira_posicoes').select('*').eq('user_id', uid),
    sb.from('carteira_historico').select('*').eq('user_id', uid).maybeSingle(),
  ]);
  if (posRes.status === 'fulfilled' && posRes.value.data) {
    const posicoes = posRes.value.data.map(r => ({
      ticker:         r.ticker,
      categoria:      r.categoria,
      nome:           r.nome,
      qtd:            parseFloat(r.qtd),
      pmedio:         r.preco_medio     !== null ? parseFloat(r.preco_medio)     : null,
      ganhoRealizado: parseFloat(r.ganho_realizado),
      preco:          r.preco_atual     !== null ? parseFloat(r.preco_atual)     : null,
      cotadoEm:       r.cotado_em,
    }));
    // Só sobrescrever se local estiver vazio OU se o remote tiver timestamp mais recente
    // que qualquer item local. "length > length" é heurística errada — reverte deleções.
    const localCart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    const remoteTs  = posicoes.length
      ? Math.max(...posicoes.map(p => p.cotadoEm ? new Date(p.cotadoEm).getTime() : 0))
      : 0;
    const localTs   = localCart.length
      ? Math.max(...localCart.map(p => p.cotadoEm ? new Date(p.cotadoEm).getTime() : 0))
      : 0;
    if (!localCart.length || remoteTs > localTs) {
      localStorage.setItem(CART_KEY, JSON.stringify(posicoes));
    }
  }
  if (histRes.status === 'fulfilled' && histRes.value.error) {
    console.error('[db] carteira_historico maybySingle error:', histRes.value.error);
  }
  if (histRes.status === 'fulfilled' && histRes.value.data) {
    const h = histRes.value.data;
    if (h.negociacoes) {
      const localNegocs = JSON.parse(localStorage.getItem(NEGOC_KEY) || '[]');
      // Para negociacoes: remote só vence se local estiver vazio
      if (!localNegocs.length) {
        localStorage.setItem(NEGOC_KEY, JSON.stringify(h.negociacoes));
      }
    }
    if (h.movimentacoes) {
      const localMovims = JSON.parse(localStorage.getItem(MOVIM_KEY) || '[]');
      // Para movimentacoes: remote só vence se local estiver vazio
      if (!localMovims.length) {
        localStorage.setItem(MOVIM_KEY, JSON.stringify(h.movimentacoes));
      }
    }
  }
}

async function _dbPullConfig(uid) {
  const { data } = await sb.from('user_config').select('*').eq('user_id', uid).maybeSingle();
  if (!data) return;
  if (data.autosave)    localStorage.setItem(INPUTS_AUTOSAVE_KEY, JSON.stringify(data.autosave));
  if (data.brapi_token) localStorage.setItem(CART_TOKEN_KEY, data.brapi_token);
  if (data.lembretes && Object.keys(data.lembretes).length)
    localStorage.setItem(REMINDER_KEY, JSON.stringify(data.lembretes));
  if (data.scenario && data.scenario.name)
    localStorage.setItem(SCENARIO_KEY, JSON.stringify(data.scenario));
  if (data.baseline && data.baseline.definidoEm)
    localStorage.setItem(BASELINE_KEY, JSON.stringify(data.baseline));
}

// ═════════════════════════════════════════════════════════════════════════════
// MIGRAÇÃO: localStorage → Supabase  (apenas na primeira vez por usuário)
// Detecta se user_config existe; se não, considera dados locais como origem.
// ═════════════════════════════════════════════════════════════════════════════
async function dbMigrateIfNeeded() {
  if (!currentUser) return;
  const { count } = await sb.from('user_config')
    .select('user_id', { count: 'exact', head: true })
    .eq('user_id', currentUser.id);
  if (count > 0) return; // já migrado anteriormente

  const saves    = JSON.parse(localStorage.getItem(STORAGE_KEY)         || '[]');
  const metas    = JSON.parse(localStorage.getItem(GOALS_KEY)           || '[]');
  const track    = JSON.parse(localStorage.getItem(TRACK_KEY)           || '[]');
  const carteira = JSON.parse(localStorage.getItem(CART_KEY)            || '[]');
  const negocs   = JSON.parse(localStorage.getItem(NEGOC_KEY)           || '[]');
  const movims   = JSON.parse(localStorage.getItem(MOVIM_KEY)           || '[]');
  const autosave = JSON.parse(localStorage.getItem(INPUTS_AUTOSAVE_KEY) || 'null');
  const token    = localStorage.getItem(CART_TOKEN_KEY) || null;
  const lembretes = JSON.parse(localStorage.getItem(REMINDER_KEY)       || '{}');

  const tasks = [];
  if (saves.length)            tasks.push(dbPushSimulacoes(saves));
  if (metas.length)            tasks.push(dbPushMetas(metas));
  if (track.length)            tasks.push(...track.map(e => dbPushAcompanhamento(e)));
  if (carteira.length)         tasks.push(dbPushCarteira(carteira));
  if (negocs.length || movims.length) tasks.push(dbPushHistorico(negocs, movims));
  // Cria a linha de user_config mesmo vazia — marca migração como concluída
  tasks.push(dbPushConfig({ autosave: autosave || null, brapi_token: token, lembretes }));

  await Promise.allSettled(tasks);
}

// ═════════════════════════════════════════════════════════════════════════════
// PUSH: localStorage → Supabase  (chamado após cada escrita local)
// ═════════════════════════════════════════════════════════════════════════════

async function dbPushSimulacoes(saves) {
  if (!currentUser || _dbSyncing) return;
  const uid = currentUser.id;
  if (!saves.length) {
    await sb.from('simulacoes').delete().eq('user_id', uid);
    return;
  }
  // Garante UUIDs estáveis (necessário para upsert por id)
  let changed = false;
  saves.forEach(s => { if (!s.id) { s.id = dbUUID(); changed = true; } });
  if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));

  const rows = saves.map(s => ({
    id:           s.id,
    user_id:      uid,
    nome:         s.name,
    inputs:       s.inputs,
    summary:      s.summary || '',
    versoes:      s.versions || [],
    atualizado_em: new Date().toISOString(),
  }));
  await sb.from('simulacoes').upsert(rows, { onConflict: 'id' });
  // Remove do Supabase simulações que foram deletadas localmente
  const ids = rows.map(r => r.id).join(',');
  await sb.from('simulacoes').delete().eq('user_id', uid).not('id', 'in', `(${ids})`);
}

async function dbPushMetas(metas) {
  if (!currentUser || _dbSyncing) return;
  const uid = currentUser.id;
  if (!metas.length) {
    await sb.from('metas').delete().eq('user_id', uid);
    return;
  }
  const rows = metas.map(g => ({
    id:        g.id,
    user_id:   uid,
    categoria: g.cat,
    nome:      g.name,
    valor:     g.valor,
    meses:     g.meses,
    data_alvo: g.data,
    atingida:  g.atingida || false,
    criado_em: g.criadoEm || new Date().toISOString(),
  }));
  await sb.from('metas').upsert(rows, { onConflict: 'id' });
  const ids = rows.map(r => r.id).join(',');
  await sb.from('metas').delete().eq('user_id', uid).not('id', 'in', `(${ids})`);
}

async function dbPushAcompanhamento(entry) {
  if (!currentUser || _dbSyncing) return;
  await sb.from('acompanhamento').upsert({
    user_id:         currentUser.id,
    mes:             entry.mes,
    aporte:          entry.aporte          ?? null,
    patrimonio:      entry.patrimonio      ?? null,
    retirada:        entry.retirada        ?? null,
    retirada_motivo: entry.retiradaMotivo  || null,
    rendimento:      entry.rendimento      ?? null,
    taxa_mensal:     entry.taxaMensal      ?? null,
    taxa_anual:      entry.taxaAnual       ?? null,
    registrado_em:   entry.registradoEm   || new Date().toISOString(),
    editado_em:      entry.editadoEm      || null,
  }, { onConflict: 'user_id,mes' });
}

async function dbDeleteAcompanhamento(mes) {
  if (!currentUser || _dbSyncing) return;
  await sb.from('acompanhamento').delete().eq('user_id', currentUser.id).eq('mes', mes);
}

async function dbPushCarteira(posicoes) {
  if (!currentUser || _dbSyncing) return;
  const uid = currentUser.id;
  if (!posicoes.length) {
    await sb.from('carteira_posicoes').delete().eq('user_id', uid);
    return;
  }
  const rows = posicoes.map(a => ({
    user_id:         uid,
    ticker:          a.ticker,
    categoria:       a.categoria       || null,
    nome:            a.nome            || null,
    qtd:             a.qtd             || 0,
    preco_medio:     a.pmedio          ?? null,
    ganho_realizado: a.ganhoRealizado  || 0,
    preco_atual:     a.preco           ?? null,
    cotado_em:       a.cotadoEm        || null,
    atualizado_em:   new Date().toISOString(),
  }));
  await sb.from('carteira_posicoes').upsert(rows, { onConflict: 'user_id,ticker' });
  // Remove tickers deletados localmente
  const tickers = rows.map(r => `"${r.ticker}"`).join(',');
  await sb.from('carteira_posicoes').delete().eq('user_id', uid).not('ticker', 'in', `(${tickers})`);
}

async function dbPushHistorico(negociacoes, movimentacoes) {
  if (!currentUser || _dbSyncing) return;
  await sb.from('carteira_historico').upsert({
    user_id:       currentUser.id,
    negociacoes:   negociacoes   || [],
    movimentacoes: movimentacoes || [],
    atualizado_em: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

async function dbPushConfig(partial) {
  if (!currentUser || _dbSyncing) return;
  await sb.from('user_config').upsert({
    user_id: currentUser.id,
    ...partial,
    atualizado_em: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

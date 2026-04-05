// ════════════════════════════════════════════════════════════════
// TESOURO DIRETO — cotações via CKAN Tesouro Transparente
//
// Fontes (em ordem de prioridade):
//   1. ./data/tesouro-latest.json  — GitHub Pages, atualizado diariamente por GH Action
//   2. Edge Function ?tesouro_ckan=1 — CKAN datastore_search (fallback em tempo real)
//   3. Edge Function ?tesouro=1    — B3 JSON legado (fallback adicional)
//   4. Cache localStorage expirado — último recurso quando rede falha
//
// Cache localStorage: TTL de 30 min (TESOURO_CACHE_TTL)
// COTACOES_FN e SUPABASE_ANON definidos em js/db.js
// ════════════════════════════════════════════════════════════════

const TESOURO_CACHE_KEY = 'simfin_tesouro_cache_v2';
const TESOURO_CACHE_TTL = 30 * 60 * 1000;   // 30 minutos
const TESOURO_GH_JSON   = './data/tesouro-latest.json';

// ── Cache localStorage ────────────────────────────────────────────────────
function tesouroLoadCache() {
  try { return JSON.parse(localStorage.getItem(TESOURO_CACHE_KEY)) || {}; } catch { return {}; }
}
function tesouroSaveCache(cache) {
  try { localStorage.setItem(TESOURO_CACHE_KEY, JSON.stringify(cache)); } catch {}
}

// ── Normaliza string para comparação ─────────────────────────────────────
// Remove acentos, lowercase, colapsa espaços, normaliza variantes de tipo
function tesouroNormalizarStr(s) {
  if (!s) return '';
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // remove acentos
    .replace(/ipca\s*\+/g, 'ipca')
    .replace(/igp-?m\s*\+?/g, 'igpm')
    .replace(/\bprefixo\b|\bltn\b/g, 'prefixado')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Extrai tipo e ano de um texto de título ───────────────────────────────
// Retorna { tipo: 'SELIC'|'IPCA'|'PREFIXADO'|'IGPM'|null, ano: '2028'|null }
function tesouroExtrairChave(texto) {
  const s = tesouroNormalizarStr(texto);
  const anoM = s.match(/\b(20\d{2})\b/);
  const ano  = anoM ? anoM[1] : null;

  let tipo = null;
  if (s.includes('selic'))          tipo = 'SELIC';
  else if (s.includes('igpm'))      tipo = 'IGPM';
  else if (s.includes('ipca'))      tipo = 'IPCA';
  else if (s.includes('prefixado')) tipo = 'PREFIXADO';

  return { tipo, ano };
}

// ── Normaliza nome B3 antigo para nome canônico (retrocompatibilidade) ───
function tesouroNormalizarTitulo(texto) {
  if (!texto) return null;
  const { tipo, ano } = tesouroExtrairChave(texto);
  if (!tipo) return null;
  const mapa = { SELIC: 'Tesouro Selic', IPCA: 'Tesouro IPCA+', PREFIXADO: 'Tesouro Prefixado', IGPM: 'Tesouro IGPM+' };
  return ano ? `${mapa[tipo]} ${ano}` : mapa[tipo];
}

// ── Matching fuzzy legado (retrocompatibilidade com carteira.js) ──────────
function tesouroMatchTitulo(normalizado, nomeB3) {
  if (!normalizado || !nomeB3) return false;
  const { tipo: tipoN, ano: anoN } = tesouroExtrairChave(normalizado);
  const { tipo: tipoB, ano: anoB } = tesouroExtrairChave(nomeB3);
  if (anoN  && anoB  && anoN  !== anoB)  return false;
  if (tipoN && tipoB && tipoN !== tipoB) return false;
  return true;
}

// ── Constrói índice { nomeTitulo → dados } a partir de payload de rede ───
function tesouroIndexarPayload(payload) {
  // GH Pages JSON: { titulos: { nome: {...} } }
  if (payload.titulos && typeof payload.titulos === 'object') {
    return payload.titulos;
  }

  if (payload.results) {
    if (Array.isArray(payload.results)) {
      // B3 legacy: array de { nome, preco, taxa, venc }
      const idx = {};
      for (const item of payload.results) {
        if (!item.nome) continue;
        idx[item.nome] = {
          nome:       item.nome,
          taxaCompra: null,
          taxaVenda:  item.taxa  || null,
          puCompra:   null,
          puVenda:    item.preco || null,
          dataRef:    null,
        };
      }
      return idx;
    } else {
      // CKAN datastore: objeto { nome → {...} }
      return payload.results;
    }
  }

  return {};
}

// ── Busca todos os títulos disponíveis (multi-fonte com fallback) ─────────
// Retorna { index, fromCache, _source, _generatedAt?, error? }
async function tesouroFetchTodos(forceRefresh = false) {
  const cache    = tesouroLoadCache();
  const cacheAge = cache._fetchedAt ? Date.now() - cache._fetchedAt : Infinity;
  const cacheOk  = cacheAge < TESOURO_CACHE_TTL && cache._index && Object.keys(cache._index).length > 0;

  if (!forceRefresh && cacheOk) {
    return { index: cache._index, fromCache: true, _source: cache._source, _generatedAt: cache._generatedAt };
  }

  // ── Fonte 1: GitHub Pages JSON ──
  try {
    const res = await fetch(TESOURO_GH_JSON, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data  = await res.json();
      const index = tesouroIndexarPayload(data);
      if (Object.keys(index).length > 0) {
        const genAt   = data._generatedAt ? new Date(data._generatedAt).getTime() : 0;
        const jsonAge = genAt ? Date.now() - genAt : Infinity;
        if (jsonAge < 24 * 3600 * 1000) {
          tesouroSaveCache({ _fetchedAt: Date.now(), _index: index, _source: 'gh-pages', _generatedAt: data._generatedAt });
          return { index, fromCache: false, _source: 'gh-pages', _generatedAt: data._generatedAt };
        }
        console.info('[Tesouro] GH Pages JSON > 24h, tentando Edge Function CKAN');
      }
    }
  } catch (e) {
    console.info('[Tesouro] GH Pages JSON indisponível:', e.message);
  }

  // ── Fonte 2: Edge Function CKAN ──
  try {
    const res = await fetch(`${COTACOES_FN}?tesouro_ckan=1`, {
      headers: { 'apikey': SUPABASE_ANON },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const data  = await res.json();
      const index = tesouroIndexarPayload(data);
      if (Object.keys(index).length > 0) {
        tesouroSaveCache({ _fetchedAt: Date.now(), _index: index, _source: 'edge-ckan' });
        return { index, fromCache: false, _source: 'edge-ckan' };
      }
    }
  } catch (e) {
    console.warn('[Tesouro] Edge Function CKAN falhou:', e.message);
  }

  // ── Fonte 3: Edge Function B3 legado ──
  try {
    const res = await fetch(`${COTACOES_FN}?tesouro=1`, {
      headers: { 'apikey': SUPABASE_ANON },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data  = await res.json();
      const index = tesouroIndexarPayload(data);
      if (Object.keys(index).length > 0) {
        tesouroSaveCache({ _fetchedAt: Date.now(), _index: index, _source: 'edge-b3' });
        return { index, fromCache: false, _source: 'edge-b3' };
      }
    }
  } catch (e) {
    console.warn('[Tesouro] Edge Function B3 falhou:', e.message);
  }

  // ── Fonte 4: cache expirado como último recurso ──
  if (cache._index && Object.keys(cache._index).length > 0) {
    console.warn('[Tesouro] Todas as fontes falharam — usando cache expirado');
    return { index: cache._index, fromCache: true, _source: cache._source, error: 'indisponivel', _cacheAge: Math.round(cacheAge / 60000) };
  }

  return { index: {}, fromCache: false, _source: null, error: 'indisponivel' };
}

// ── Filtra candidatos por tipo e ano (helper compartilhado) ──────────────
function tesouroFiltrarCandidatos(candidatos, tipoAtivo, anoAtivo) {
  let result = tipoAtivo
    ? candidatos.filter(t => tesouroExtrairChave(t.nome).tipo === tipoAtivo)
    : candidatos;
  if (anoAtivo) result = result.filter(t => tesouroExtrairChave(t.nome).ano === anoAtivo);
  return result;
}

// ── Resolve um ativo contra o índice (com detecção de ambiguidade) ────────
// ativo = { nome, tipo?, venc? }
//
// Retorna:
//   { status: 'ok',             match: { nome, taxaCompra, taxaVenda, puCompra, puVenda, dataRef } }
//   { status: 'ambiguo',        opcoes: [{ nome, ... }] }
//   { status: 'nao_encontrado'                          }
//   { status: 'indisponivel'                            }
async function tesouroResolveAtivo(ativo, forceRefresh = false) {
  const { index, error } = await tesouroFetchTodos(forceRefresh);

  if (error === 'indisponivel' && Object.keys(index).length === 0) {
    return { status: 'indisponivel' };
  }

  const textoCompleto = [ativo.tipo || '', ativo.nome || '', ativo.venc || ''].join(' ');
  const { tipo: tipoAtivo, ano: anoAtivo } = tesouroExtrairChave(textoCompleto);

  const candidatos = Object.values(index);
  const filtrados  = tesouroFiltrarCandidatos(candidatos, tipoAtivo, anoAtivo);

  if (filtrados.length === 0) return { status: 'nao_encontrado' };
  if (filtrados.length === 1) return { status: 'ok', match: filtrados[0] };
  return { status: 'ambiguo', opcoes: filtrados };
}

// ── Batch: cotações para lista de títulos da carteira ────────────────────
// Retorna array de { nome, nomeB3?, preco, taxa, taxaCompra, taxaVenda,
//                    puCompra, puVenda, dataRef, status, opcoes?, _fromCache }
async function tesouroFetchPrices(titulosEspecificos = null, forceRefresh = false) {
  const { index, fromCache, _source, error, _cacheAge } = await tesouroFetchTodos(forceRefresh);

  let titulos = [];
  if (titulosEspecificos && titulosEspecificos.length) {
    titulos = titulosEspecificos;
  } else {
    try {
      const ativos = carteiraLoad ? carteiraLoad().filter(a => a.tipo === 'tesouro') : [];
      titulos = [...new Set(ativos.map(a => a.nome).filter(Boolean))];
    } catch { titulos = []; }
  }

  if (error === 'indisponivel' && Object.keys(index).length === 0) {
    return titulos.map(nome => ({ nome, status: 'indisponivel', _fromCache: false }));
  }

  const resultado  = [];
  const candidatos = Object.values(index);

  for (const titulo of titulos) {
    const { tipo: tipoAtivo, ano: anoAtivo } = tesouroExtrairChave(titulo);
    const filtrados = tesouroFiltrarCandidatos(candidatos, tipoAtivo, anoAtivo);

    if (filtrados.length === 0) {
      resultado.push({ nome: titulo, status: 'nao_encontrado', _fromCache: fromCache, _source });
      continue;
    }

    if (filtrados.length > 1) {
      resultado.push({ nome: titulo, status: 'ambiguo', opcoes: filtrados, _fromCache: fromCache, _source });
      continue;
    }

    const match = filtrados[0];
    resultado.push({
      nome:       titulo,
      nomeB3:     match.nome,
      preco:      match.puVenda  || null,
      taxa:       match.taxaVenda || null,
      taxaCompra: match.taxaCompra || null,
      taxaVenda:  match.taxaVenda  || null,
      puCompra:   match.puCompra   || null,
      puVenda:    match.puVenda    || null,
      dataRef:    match.dataRef    || null,
      status:     'ok',
      _fromCache: fromCache,
      _cacheAge:  _cacheAge || 0,
      _source,
    });
  }

  return resultado;
}

// ── Batch legado (retrocompatibilidade) ───────────────────────────────────
async function tesouroFetchMultiplos(titulos, forceRefresh = false) {
  const prices = await tesouroFetchPrices(titulos, forceRefresh);
  const results = {};
  for (const p of prices) {
    if (p.status === 'ok') {
      results[p.nome] = { pu: p.puVenda, taxa: p.taxaVenda, titulo: p.nomeB3, fromCache: p._fromCache };
    }
  }
  return results;
}

// ── Cotação de um único título (retrocompatibilidade) ─────────────────────
async function tesouroFetchCotacao(titulo, forceRefresh = false) {
  const prices = await tesouroFetchPrices([titulo], forceRefresh);
  const p = prices[0];
  if (!p || p.status !== 'ok') return null;
  return { nome: p.nomeB3, preco: p.puVenda, taxa: p.taxaVenda };
}

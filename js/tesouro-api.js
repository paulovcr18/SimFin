// ════════════════════════════════════════════════════════════════
// TESOURO DIRETO — via Edge Function Supabase
// Proxy server-side da API oficial da B3/Tesouro Nacional
// Resolve CORS e elimina dependência de APIs de terceiros
// ════════════════════════════════════════════════════════════════

const TESOURO_CACHE_KEY = 'simfin_tesouro_cache';
const TESOURO_CACHE_TTL = 4 * 3600000; // 4 horas em ms

// ── Cache local: armazena a lista completa de uma vez ──
function tesouroLoadCache() {
  try { return JSON.parse(localStorage.getItem(TESOURO_CACHE_KEY)) || {}; } catch { return {}; }
}
function tesouroSaveCache(cache) {
  try { localStorage.setItem(TESOURO_CACHE_KEY, JSON.stringify(cache)); } catch {}
}

// ── Busca todos os títulos via Edge Function (API oficial da B3) ──
// forceRefresh=true ignora cache e faz nova requisição à rede
async function tesouroFetchTodos(forceRefresh = false) {
  const cache = tesouroLoadCache();
  const cacheAge = cache._fetchedAt ? Date.now() - cache._fetchedAt : Infinity;

  if (!forceRefresh && cacheAge < TESOURO_CACHE_TTL && cache._list?.length) {
    return { list: cache._list, fromCache: true, cacheAgeH: Math.round(cacheAge / 3600000) };
  }

  try {
    const res = await fetch(`${COTACOES_FN}?tesouro=1`, {
      headers: { 'apikey': SUPABASE_ANON },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const list = data.results || [];
    if (!list.length) throw new Error('Lista vazia retornada pela API');

    tesouroSaveCache({ _fetchedAt: Date.now(), _list: list });
    return { list, fromCache: false, cacheAgeH: 0 };
  } catch (e) {
    console.warn('[Tesouro] Edge Function falhou:', e.message);
    // Fallback: retorna cache expirado se disponível
    if (cache._list?.length) {
      return { list: cache._list, fromCache: true, cacheAgeH: Math.round(cacheAge / 3600000) };
    }
    return { list: [], fromCache: false, cacheAgeH: 0 };
  }
}

// ── Normaliza texto importado da B3 para nome canônico ──
// Extrai tipo e ano de vencimento de strings como:
//   "Tesouro IPCA+ 2029", "TD IPCA+ 2029", "IPCA + 2029", etc.
function tesouroNormalizarTitulo(texto) {
  if (!texto) return null;
  const s = String(texto).toLowerCase().trim();

  // Extrai o ano de 4 dígitos
  const anoM = s.match(/\b(20\d{2})\b/);
  const ano  = anoM ? anoM[1] : null;

  if (s.includes('ipca'))      return ano ? `Tesouro IPCA+ ${ano}`      : 'Tesouro IPCA+';
  if (s.includes('selic'))     return ano ? `Tesouro Selic ${ano}`      : 'Tesouro Selic';
  if (s.includes('igpm') || s.includes('igp-m')) return ano ? `Tesouro IGPM+ ${ano}` : 'Tesouro IGPM+';
  if (s.includes('prefixado') || s.includes('prefixo') || s.includes('ltn'))
                                return ano ? `Tesouro Prefixado ${ano}` : 'Tesouro Prefixado';
  if (s.includes('tesouro'))   return ano ? `Tesouro ${ano}`            : null;

  return null;
}

// ── Matching fuzzy: título normalizado vs. nome canônico da B3 ──
function tesouroMatchTitulo(normalizado, nomeB3) {
  if (!normalizado || !nomeB3) return false;
  const n = normalizado.toLowerCase();
  const b = nomeB3.toLowerCase();

  // Extrai ano dos dois lados
  const anoN = (n.match(/\b(20\d{2})\b/) || [])[1];
  const anoB = (b.match(/\b(20\d{2})\b/) || [])[1];

  // Anos precisam bater (se ambos presentes)
  if (anoN && anoB && anoN !== anoB) return false;

  // Tipo precisa bater
  if (n.includes('ipca')      && !b.includes('ipca'))      return false;
  if (n.includes('selic')     && !b.includes('selic'))      return false;
  if (n.includes('igpm')      && !b.includes('igpm'))      return false;
  if (n.includes('prefixado') && !b.includes('prefixado')) return false;

  return true;
}

// ── Busca cotação de um título específico ──
async function tesouroFetchCotacao(titulo, forceRefresh = false) {
  const { list } = await tesouroFetchTodos(forceRefresh);
  const normalizado = tesouroNormalizarTitulo(titulo);
  if (!normalizado) return null;

  // Busca exata pelo nome canônico primeiro
  let match = list.find(item => item.nome === titulo);
  // Fallback: matching fuzzy
  if (!match) match = list.find(item => tesouroMatchTitulo(normalizado, item.nome));

  return match || null;
}

// ── Batch: consultar múltiplos títulos (1 request só) ──
async function tesouroFetchMultiplos(titulos, forceRefresh = false) {
  const { list, fromCache, cacheAgeH } = await tesouroFetchTodos(forceRefresh);
  const results = {};

  for (const titulo of titulos) {
    const normalizado = tesouroNormalizarTitulo(titulo);
    if (!normalizado) continue;

    let match = list.find(item => item.nome === titulo);
    if (!match) match = list.find(item => tesouroMatchTitulo(normalizado, item.nome));

    if (match) {
      results[titulo] = {
        pu:         match.preco,
        taxa:       match.taxa || 0,
        titulo:     match.nome,
        fromCache,
        cacheAgeH,
      };
    }
  }

  return results;
}

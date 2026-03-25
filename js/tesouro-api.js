// ════════════════════════════════════════════════════════════════
// TESOURO DIRETO — API AA40 (aposenteaos40.org)
// Consulta cotações em tempo real via proxy público
// ════════════════════════════════════════════════════════════════

const TESOURO_API = 'https://www.aposenteaos40.org/fire-dash/includes/api_tesouro.php';
const TESOURO_CACHE_KEY = 'simfin_tesouro_cache';
const TESOURO_CACHE_TTL = 24 * 3600000; // 24 horas em ms

// Mapeamento de nomes para consulta na API
const TESOURO_TITULO_MAP = {
  'Tesouro Prefixado 2026': { api: 'Tesouro+Prefixado', vencimento: '01-2026' },
  'Tesouro Prefixado 2027': { api: 'Tesouro+Prefixado', vencimento: '01-2027' },
  'Tesouro Prefixado 2029': { api: 'Tesouro+Prefixado', vencimento: '01-2029' },
  'Tesouro Prefixado 2031': { api: 'Tesouro+Prefixado', vencimento: '01-2031' },
  'Tesouro IPCA+ 2026': { api: 'Tesouro+IPCA%2B', vencimento: '08-2026' },
  'Tesouro IPCA+ 2029': { api: 'Tesouro+IPCA%2B', vencimento: '05-2029' },
  'Tesouro IPCA+ 2032': { api: 'Tesouro+IPCA%2B', vencimento: '08-2032' },
  'Tesouro IPCA+ 2035': { api: 'Tesouro+IPCA%2B', vencimento: '05-2035' },
  'Tesouro IPCA+ 2040': { api: 'Tesouro+IPCA%2B', vencimento: '08-2040' },
  'Tesouro IPCA+ 2045': { api: 'Tesouro+IPCA%2B', vencimento: '05-2045' },
  'Tesouro IPCA+ 2050': { api: 'Tesouro+IPCA%2B', vencimento: '08-2050' },
  'Tesouro Selic 2027': { api: 'Tesouro+Selic', vencimento: '03-2027' },
  'Tesouro Selic 2030': { api: 'Tesouro+Selic', vencimento: '03-2030' },
  'Tesouro IGPM+ 2031': { api: 'Tesouro+IGPM%2B+com+Juros+Semestrais', vencimento: '01-2031' },
  'Tesouro IGPM+ 2033': { api: 'Tesouro+IGPM%2B+com+Juros+Semestrais', vencimento: '01-2033' },
  'Tesouro IGPM+ 2035': { api: 'Tesouro+IGPM%2B+com+Juros+Semestrais', vencimento: '01-2035' },
  'Tesouro IGPM+ 2037': { api: 'Tesouro+IGPM%2B+com+Juros+Semestrais', vencimento: '01-2037' },
  'Tesouro IGPM+ 2040': { api: 'Tesouro+IGPM%2B+com+Juros+Semestrais', vencimento: '01-2040' },
  'Tesouro IGPM+ 2045': { api: 'Tesouro+IGPM%2B+com+Juros+Semestrais', vencimento: '01-2045' },
  'Tesouro IGPM+ 2050': { api: 'Tesouro+IGPM%2B+com+Juros+Semestrais', vencimento: '01-2050' },
  'Tesouro IGPM+ 2055': { api: 'Tesouro+IGPM%2B+com+Juros+Semestrais', vencimento: '01-2055' },
};

// ── Cache local (evita requisições excessivas) ──
function tesouroLoadCache() {
  try { return JSON.parse(localStorage.getItem(TESOURO_CACHE_KEY)) || {}; } catch { return {}; }
}
function tesouroSaveCache(cache) {
  localStorage.setItem(TESOURO_CACHE_KEY, JSON.stringify(cache));
}
function tesouroIsCacheValid(titulo) {
  const cache = tesouroLoadCache();
  if (!cache[titulo]) return false;
  const age = Date.now() - cache[titulo].ts;
  return age < TESOURO_CACHE_TTL;
}

// ── Consulta cotação via API AA40 ──
async function tesouroFetchCotacao(titulo) {
  // Validar cache primeiro
  if (tesouroIsCacheValid(titulo)) {
    const cache = tesouroLoadCache();
    return cache[titulo].data;
  }

  const config = TESOURO_TITULO_MAP[titulo];
  if (!config) return null;

  try {
    const url = `${TESOURO_API}?titulo=${config.api}&vencimento=${config.vencimento}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();

    // Parse CSV: "PU_Venda,Taxa_Compra"
    const [pu, taxa] = text.trim().split(',').map(v => v.trim());
    if (!pu || !taxa) return null;

    const result = {
      pu: parseFloat(pu),
      taxa: parseFloat(taxa),
      titulo,
      ts: Date.now()
    };

    // Atualizar cache
    const cache = tesouroLoadCache();
    cache[titulo] = { data: result, ts: Date.now() };
    tesouroSaveCache(cache);

    return result;
  } catch (e) {
    console.warn('[Tesouro API]', e);
    return null;
  }
}

// ── Batch: consultar múltiplos títulos ──
async function tesouroFetchMultiplos(titulos) {
  const results = {};
  for (const titulo of titulos) {
    const data = await tesouroFetchCotacao(titulo);
    if (data) results[titulo] = data;
  }
  return results;
}

// ── Normalizar nome do título a partir de texto importado ──
function tesouroNormalizarTitulo(texto) {
  // Remove números de série, IDs, etc. e normaliza para o formato esperado
  const lower = String(texto).toLowerCase();

  // Prefixado
  if (lower.includes('prefixado') || lower.includes('prefixo')) {
    if (lower.includes('2026') || lower.includes('26')) return 'Tesouro Prefixado 2026';
    if (lower.includes('2027') || lower.includes('27')) return 'Tesouro Prefixado 2027';
    if (lower.includes('2029') || lower.includes('29')) return 'Tesouro Prefixado 2029';
    if (lower.includes('2031') || lower.includes('31')) return 'Tesouro Prefixado 2031';
  }

  // IPCA+
  if (lower.includes('ipca')) {
    if (lower.includes('2026') || lower.includes('26')) return 'Tesouro IPCA+ 2026';
    if (lower.includes('2029') || lower.includes('29')) return 'Tesouro IPCA+ 2029';
    if (lower.includes('2032') || lower.includes('32')) return 'Tesouro IPCA+ 2032';
    if (lower.includes('2035') || lower.includes('35')) return 'Tesouro IPCA+ 2035';
    if (lower.includes('2040') || lower.includes('40')) return 'Tesouro IPCA+ 2040';
    if (lower.includes('2045') || lower.includes('45')) return 'Tesouro IPCA+ 2045';
    if (lower.includes('2050') || lower.includes('50')) return 'Tesouro IPCA+ 2050';
  }

  // Selic
  if (lower.includes('selic')) {
    if (lower.includes('2027') || lower.includes('27')) return 'Tesouro Selic 2027';
    if (lower.includes('2030') || lower.includes('30')) return 'Tesouro Selic 2030';
  }

  // IGPM+
  if (lower.includes('igpm')) {
    if (lower.includes('2031') || lower.includes('31')) return 'Tesouro IGPM+ 2031';
    if (lower.includes('2033') || lower.includes('33')) return 'Tesouro IGPM+ 2033';
    if (lower.includes('2035') || lower.includes('35')) return 'Tesouro IGPM+ 2035';
    if (lower.includes('2037') || lower.includes('37')) return 'Tesouro IGPM+ 2037';
    if (lower.includes('2040') || lower.includes('40')) return 'Tesouro IGPM+ 2040';
    if (lower.includes('2045') || lower.includes('45')) return 'Tesouro IGPM+ 2045';
    if (lower.includes('2050') || lower.includes('50')) return 'Tesouro IGPM+ 2050';
    if (lower.includes('2055') || lower.includes('55')) return 'Tesouro IGPM+ 2055';
  }

  return null;
}

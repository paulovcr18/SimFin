// ════════════════════════════════════════════════════════════════
// SimFin — Edge Function: cotacoes
// Proxy server-side para Yahoo Finance e Tesouro Nacional (resolve CORS do browser)
//
// Endpoints:
//   GET /functions/v1/cotacoes?tickers=WEGE3,KNRI11,GMAT3
//   GET /functions/v1/cotacoes?tesouro_ckan=1   ← CKAN Tesouro Transparente (rico)
//   GET /functions/v1/cotacoes?tesouro=1         ← B3 JSON legado (fallback)
//
// Respostas:
//   tickers:       { results: { WEGE3: { regularMarketPrice, ... } } }
//   tesouro_ckan:  { results: { "Tesouro Selic 2028": { nome, taxaCompra, taxaVenda, puCompra, puVenda, dataRef } }, _source: 'ckan_datastore' }
//   tesouro:       { results: [{ nome, preco, venc, taxa }] }
// ════════════════════════════════════════════════════════════════

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// ── Rate limiting in-memory (best-effort, por isolate) ─────────────────────
const RATE_LIMIT   = 10;   // max requests por IP por janela
const RATE_WINDOW  = 60_000; // janela em ms (1 minuto)
const rateLimiter  = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(ip: string): boolean {
  const now    = Date.now();
  const entry  = rateLimiter.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW) {
    rateLimiter.set(ip, { count: 1, windowStart: now });
    return true;   // OK
  }
  entry.count++;
  if (entry.count > RATE_LIMIT) return false;  // bloqueado
  return true;
}

const TESOURO_NACIONAL_API = 'https://www.tesourodireto.com.br/json/br/com/b3/tesouro/tesouro-direto/2/prices-and-rates.json';
const CKAN_PKG_URL         = 'https://www.tesourotransparente.gov.br/ckan/api/3/action/package_show?id=taxas-dos-titulos-ofertados-pelo-tesouro-direto';
const CKAN_DS_URL          = 'https://www.tesourotransparente.gov.br/ckan/api/3/action/datastore_search';

// ── Heurística de colunas para records do CKAN datastore ──────────────────
function detectarColunaCkan(fields: { id: string }[], conds: string[]): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const f of fields) {
    const n = norm(f.id);
    if (conds.every(c => n.includes(c))) return f.id;
  }
  return null;
}

function parseNumCkan(s: unknown): number | null {
  if (s === null || s === undefined || s === '') return null;
  const n = parseFloat(String(s).replace(',', '.'));
  return isNaN(n) ? null : n;
}

Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
           ?? req.headers.get('x-real-ip')
           ?? 'unknown';

  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: 'Rate limit excedido. Tente novamente em 1 minuto.' }), {
      status: 429,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Retry-After': '60' },
    });
  }

  try {
    const url = new URL(req.url);

    // ── Rota CKAN Tesouro Transparente (rico: taxa + PU compra/venda) ──────
    if (url.searchParams.get('tesouro_ckan') === '1') {
      // 1. Descobre resource_id via package_show
      const pkgRes = await fetch(CKAN_PKG_URL, {
        headers: { 'User-Agent': 'SimFin/1.0' },
      });
      if (!pkgRes.ok) throw new Error(`CKAN package_show HTTP ${pkgRes.status}`);
      const pkg = await pkgRes.json() as { result?: { resources?: { id: string; format?: string }[] } };
      const csvResource = pkg.result?.resources?.find(r => r.format?.toUpperCase() === 'CSV');
      if (!csvResource) throw new Error('Recurso CSV não encontrado no pacote CKAN');

      // 2. datastore_search — busca últimas 500 linhas ordenadas por data desc
      const dsUrl = `${CKAN_DS_URL}?resource_id=${csvResource.id}&limit=500&sort=Data%20Venda%20desc`;
      const dsRes = await fetch(dsUrl, { headers: { 'User-Agent': 'SimFin/1.0' } });
      if (!dsRes.ok) throw new Error(`CKAN datastore_search HTTP ${dsRes.status}`);
      const dsData = await dsRes.json() as {
        result?: {
          fields?: { id: string }[];
          records?: Record<string, unknown>[];
        };
      };

      const fields  = dsData.result?.fields  ?? [];
      const records = dsData.result?.records ?? [];

      // 3. Detecta colunas por heurística
      const colTitulo     = detectarColunaCkan(fields, ['tipo']) ?? detectarColunaCkan(fields, ['titulo']);
      const colData       = detectarColunaCkan(fields, ['datavenda']) ?? detectarColunaCkan(fields, ['data']);
      const colTaxaCompra = detectarColunaCkan(fields, ['taxa', 'compra']);
      const colTaxaVenda  = detectarColunaCkan(fields, ['taxa', 'venda']);
      const colPuCompra   = detectarColunaCkan(fields, ['pu', 'compra']) ?? detectarColunaCkan(fields, ['unit', 'compra']);
      const colPuVenda    = detectarColunaCkan(fields, ['pu', 'venda'])  ?? detectarColunaCkan(fields, ['unit', 'venda']);

      if (!colTitulo) throw new Error('Coluna de título não detectada nos fields do CKAN');

      // 4. Agrupa por título, mantém somente a linha mais recente por título
      const titulos: Record<string, Record<string, unknown>> = {};
      for (const row of records) {
        const nome = String(row[colTitulo] ?? '').trim();
        if (!nome) continue;
        if (titulos[nome]) continue;  // já temos a mais recente (sort desc)

        titulos[nome] = {
          nome,
          taxaCompra: colTaxaCompra ? parseNumCkan(row[colTaxaCompra]) : null,
          taxaVenda:  colTaxaVenda  ? parseNumCkan(row[colTaxaVenda])  : null,
          puCompra:   colPuCompra   ? parseNumCkan(row[colPuCompra])   : null,
          puVenda:    colPuVenda    ? parseNumCkan(row[colPuVenda])    : null,
          dataRef:    colData       ? String(row[colData] ?? '').trim() : null,
        };
      }

      return new Response(JSON.stringify({ results: titulos, _source: 'ckan_datastore' }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // ── Rota Tesouro Direto B3 (legado) ─────────────────────────────────
    if (url.searchParams.get('tesouro') === '1') {
      const tRes = await fetch(TESOURO_NACIONAL_API, {
        headers: { 'User-Agent': 'Mozilla/5.0 (SimFin/1.0)' },
      });
      if (!tRes.ok) throw new Error(`Tesouro Nacional retornou HTTP ${tRes.status}`);
      const tData = await tRes.json() as { response?: { TrsrBdTradgList?: { TrsrBd: Record<string, unknown> }[] } };
      const list  = tData?.response?.TrsrBdTradgList ?? [];
      const results = list.map(item => ({
        nome:  item.TrsrBd.nm            as string,
        preco: item.TrsrBd.untrRedVal    as number,
        venc:  item.TrsrBd.mtrtyDt       as string,
        taxa:  item.TrsrBd.anulInvstmtRate as number,
      }));
      return new Response(JSON.stringify({ results }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // ── Rota Yahoo Finance (B3 tickers) ──
    const raw     = url.searchParams.get('tickers') || '';
    const tickers = raw.split(',').map(t => t.trim().toUpperCase()).filter(t => t.length >= 4);

    if (!tickers.length) {
      return new Response(JSON.stringify({ error: 'Informe ao menos um ticker (ex: ?tickers=WEGE3,KNRI11)' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Yahoo Finance v7/spark — funciona server-side sem restrição
    // Adiciona sufixo .SA (Bovespa) para todos os tickers brasileiros
    const symbols  = tickers.map(t => t + '.SA').join(',');
    const yahooUrl = `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${symbols}&range=1d&interval=1d`;

    const yahooRes = await fetch(yahooUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (SimFin/1.0)' },
    });

    if (!yahooRes.ok) {
      throw new Error(`Yahoo Finance retornou HTTP ${yahooRes.status}`);
    }

    const data    = await yahooRes.json();
    const rawList = data?.spark?.result ?? [];

    // Normaliza para o mesmo formato que o BRAPI retorna
    const results: Record<string, unknown> = {};
    for (const item of rawList) {
      const sym  = String(item.symbol ?? '').replace(/\.SA$/i, '');
      const meta = (item.response as { meta?: Record<string, unknown> }[])?.[0]?.meta ?? {};
      const price = meta.regularMarketPrice as number | undefined;
      if (price) {
        results[sym] = {
          symbol:                      sym,
          regularMarketPrice:          price,
          regularMarketChangePercent:  (meta.regularMarketChangePercent as number) ?? 0,
          shortName:                   (meta.shortName as string) || sym,
          longName:                    (meta.longName  as string) || sym,
        };
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});

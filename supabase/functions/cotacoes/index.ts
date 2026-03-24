// ════════════════════════════════════════════════════════════════
// SimFin — Edge Function: cotacoes
// Proxy server-side para Yahoo Finance (resolve CORS do browser)
//
// Endpoint: GET /functions/v1/cotacoes?tickers=WEGE3,KNRI11,GMAT3
//
// Resposta: { results: { WEGE3: { regularMarketPrice, regularMarketChangePercent, shortName, symbol } } }
// ════════════════════════════════════════════════════════════════

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const url     = new URL(req.url);
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
    // (carteira.js usa r.regularMarketPrice, r.regularMarketChangePercent, r.shortName, r.symbol)
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

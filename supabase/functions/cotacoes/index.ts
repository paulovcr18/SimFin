// ════════════════════════════════════════════════════════════════
// SimFin — Edge Function: cotacoes
// Proxy server-side para Yahoo Finance e Tesouro Nacional (resolve CORS do browser)
//
// Endpoints:
//   GET /functions/v1/cotacoes?tickers=WEGE3,KNRI11,GMAT3
//   GET /functions/v1/cotacoes?tesouro=1
//
// Respostas:
//   tickers: { results: { WEGE3: { regularMarketPrice, regularMarketChangePercent, shortName, symbol } } }
//   tesouro: { results: [{ nome, preco, venc }] }
// ════════════════════════════════════════════════════════════════

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const TESOURO_NACIONAL_API = 'https://www.tesourodireto.com.br/json/br/com/b3/tesouro/tesouro-direto/2/prices-and-rates.json';

Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const url = new URL(req.url);

    // ── Rota Tesouro Direto ──
    if (url.searchParams.get('tesouro') === '1') {
      const tRes = await fetch(TESOURO_NACIONAL_API, {
        headers: { 'User-Agent': 'Mozilla/5.0 (SimFin/1.0)' },
      });
      if (!tRes.ok) throw new Error(`Tesouro Nacional retornou HTTP ${tRes.status}`);
      const tData = await tRes.json() as { response?: { TrsrBdTradgList?: { TrsrBd: Record<string, unknown> }[] } };
      const list  = tData?.response?.TrsrBdTradgList ?? [];
      const results = list.map(item => ({
        nome:  item.TrsrBd.nm  as string,
        preco: item.TrsrBd.untrRedVal as number,
        venc:  item.TrsrBd.mtrtyDt   as string,
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

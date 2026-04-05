# SimFin — Roadmap de Melhorias

**Milestone:** v2.0 — Performance, Limpeza e Estabilidade
**Status:** Planejamento

---

## Fase 1 — Remoção de Código Morto e Dependências de Risco

**Goal:** Eliminar toda a superfície de código que não está sendo usada e reduzir riscos de segurança/manutenção.

**Escopo:**
- Deletar `tracker/` (script standalone legado, 100% substituído pelo Streamlit)
- Remover ou marcar como `@deprecated` o app Streamlit (`streamlit-app/`) — a PWA é o produto principal
- Corrigir `sw.js`: remover o asset duplicado `js/db.js` e excluir endpoints de cotação do cache (usuário não deve ver preço desatualizado)
- Adicionar hash de integridade SRI ao SheetJS no CDN ou vender o arquivo localmente
- Corrigir o cenário save: ou salva os inputs reais ou remove a ilusão de "gerenciamento de cenários" da UI

**Critério de aceitação:**
- `tracker/` não existe mais no repo
- Service Worker não cacheia chamadas para `brapi.dev` e `query1.finance.yahoo.com`
- SheetJS tem integridade verificada ou está servido localmente
- Não há botão/UI prometendo feature de cenários que não funciona

---

## Fase 2 — Performance da PWA: Login e Sync

**Goal:** Tornar o login e carregamento inicial perceptivelmente mais rápido.

**Problemas alvo:**
- `authOnLogin()` bloqueia a UI até 5 queries Supabase completarem. Usuário fica olhando para loading screen.
- SheetJS (~1MB) carrega na hora da importação, causando delay inesperado no fluxo principal do usuário.

**Escopo:**
- Implementar padrão stale-while-revalidate no login: mostrar o app com dados do localStorage imediatamente, sincronizar Supabase em background.
- Pré-carregar SheetJS no Service Worker (junto com os outros assets estáticos) para que já esteja disponível quando o usuário precisar.
- Corrigir erros silenciados em `authOnLogin`: `catch(e) {}` vazio → `catch(e) { console.error('[init]', e); }`.

**Critério de aceitação:**
- App renderiza dentro de <200ms após login (dados do cache local)
- Sync Supabase ocorre em background sem bloquear UI
- Importação de arquivo XLSX não tem delay de download do SheetJS
- Erros de inicialização aparecem no console

---

## Fase 3 — Performance do Portfólio (PWA + Streamlit)

**Goal:** Eliminar o gargalo principal de performance no cálculo de evolução do portfólio.

**Problemas alvo:**
- `build_evolution()` em `streamlit-app/core/portfolio.py` itera dia a dia sobre todo o histórico para cada page load. Para portfólio de 5 anos, são ~36.500 operações sem cache.
- Conflito de sync usa "array maior vence" em vez de timestamp — pode restaurar dados deletados.

**Escopo:**
- Adicionar `@st.cache_data(ttl=3600)` em `build_evolution()` com cache key baseada no hash das transações.
- Alternativamente (melhor): vetorizar usando pandas `merge` + `reindex` ao invés de loop dia a dia.
- Corrigir a lógica de conflito em `js/db.js` `_dbPullCarteira()`: usar `atualizado_em` timestamp ao invés de comprimento do array.
- Corrigir `maybeSingle()` em `js/db.js` linha 105: verificar `!histRes.value.error` além de `.data`.

**Critério de aceitação:**
- Página de Carteira no Streamlit carrega em <2s na segunda visita
- Deletar uma posição localmente não é revertido no próximo login
- Erros de Supabase no `maybeSingle()` são capturados e logados

---

## Fase 4 — Estabilidade: Validação de APIs Externas

**Goal:** Tornar o app resiliente a mudanças de APIs externas e dar feedback claro ao usuário quando dados não estão disponíveis.

**Problemas alvo:**
- Yahoo Finance endpoint não-oficial (`query1.finance.yahoo.com/v7/finance/spark`) muda de formato sem aviso — falha silenciosa, usuário vê R$0.
- Tesouro Direto CKAN usa heurística de nome de coluna — se renomear, todos os preços ficam null sem mensagem.

**Escopo:**
- Adicionar validação de shape da resposta do Yahoo Finance na Edge Function: se o formato esperado não for encontrado, retornar erro explícito com mensagem descritiva.
- Adicionar assertion das colunas obrigatórias do CKAN antes de tentar parsear — `throw` com mensagem se não encontrar.
- Exibir mensagem clara na UI da PWA quando cotações não puderem ser carregadas (ao invés de mostrar R$0).
- Adicionar rate limiting básico na Edge Function para cotações.

**Critério de aceitação:**
- Se Yahoo Finance mudar o formato, o app exibe "Cotações indisponíveis — Yahoo Finance fora do ar" ao invés de R$0
- Se CKAN mudar colunas, a GitHub Action falha com erro legível
- Edge Function rejeita abuso com HTTP 429

---

## Fase 5 — Qualidade: Testes para Cálculos Fiscais

**Goal:** Garantir que cálculos de INSS/IRRF/FGTS não regridem silenciosamente quando as tabelas mudam.

**Contexto:** As tabelas fiscais de 2026 existem duplicadas em `js/payroll.js` e `streamlit-app/core/calc.py`. Qualquer divergência entre os dois produz resultados diferentes para o mesmo salário sem que ninguém perceba.

**Escopo:**
- Criar testes unitários para `streamlit-app/core/calc.py` cobrindo: limites de faixa INSS, IRRF com e sem deduções, CLT vs PJ para salários representativos.
- Criar fixture de "salário golden" — tabela com entradas e saídas esperadas que serve como contrato entre JS e Python.
- Opcionalmente: script de verificação de paridade JS vs Python rodando na CI.

**Critério de aceitação:**
- `pytest streamlit-app/` passa com ≥10 casos de teste para `calc.py`
- Atualizar tabela INSS/IRRF para 2027 não quebra os testes sem revisão explícita
- Divergência entre JS e Python é detectável via fixture

---

## Backlog / Ideias Futuras (999.x)

- **999.1** — Migrar PWA de `localStorage` para IndexedDB para suportar datasets maiores sem limite de 5MB
- **999.2** — Substituir yfinance por API paga/estável (ex: Brapi.dev já usado no JS, tem plano pago)
- **999.3** — Implementar versioning de cenários de simulação de verdade (salvar inputs, não só metadados)
- **999.4** — PWA: migrar de vanilla JS para um framework leve (Preact/Solid) para facilitar manutenção

---

*Gerado em: 2026-04-05*

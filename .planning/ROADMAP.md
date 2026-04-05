# Roadmap: SimFin — v2.0 Performance, Limpeza e Estabilidade

## Overview

Milestone de melhoria do SimFin focado em três eixos: remover código morto e features quebradas que acumularam dívida técnica, tornar o app perceptivelmente mais rápido (login, portfólio, importação), e adicionar resiliência contra quebras de APIs externas não-oficiais. O produto principal é a PWA; o app Streamlit é secundário.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Dead Code Removal** - Deletar tracker/, corrigir SW cache e cenários quebrados
- [ ] **Phase 2: PWA Login Performance** - Stale-while-revalidate no boot, preload SheetJS
- [ ] **Phase 3: Portfolio Performance** - Cache build_evolution(), fix sync conflict
- [ ] **Phase 4: External API Resilience** - Validação Yahoo Finance, CKAN assertions, rate limiting
- [ ] **Phase 5: Fiscal Calculation Tests** - Pytest para calc.py, fixture de paridade JS/Python

## Phase Details

### Phase 1: Dead Code Removal
**Goal**: Eliminar todo código que não está sendo usado, corrigir features que existem na UI mas não funcionam, e reduzir a superfície de risco de segurança.
**Depends on**: Nothing
**Requirements**: Nenhum requisito externo
**Success Criteria** (what must be TRUE):
  1. `tracker/` não existe mais no repositório
  2. Service Worker não cacheia chamadas para `brapi.dev` e `query1.finance.yahoo.com`
  3. SheetJS tem hash SRI ou está servido localmente (não CDN sem integridade)
  4. Não há UI prometendo gerenciamento de cenários que não funciona — ou feature funciona ou UI não existe
  5. Duplicate entry `js/db.js` em `sw.js` removida
**Plans**: 4 plans

Plans:
- [ ] 01-01-PLAN.md — Delete tracker/ and add streamlit-app deprecation notice
- [ ] 01-02-PLAN.md — Fix Service Worker: network-only API bypass, dedup db.js, add SheetJS preload
- [x] 01-03-PLAN.md — Add SRI integrity hash to SheetJS CDN script tag in index.html
- [ ] 01-04-PLAN.md — Remove broken scenario management UI; fix silent catch blocks in authOnLogin

### Phase 2: PWA Login Performance
**Goal**: Tornar o carregamento inicial e o login perceptivelmente mais rápidos implementando stale-while-revalidate e pré-carregamento de assets pesados.
**Depends on**: Phase 1
**Requirements**: Nenhum requisito externo
**Success Criteria** (what must be TRUE):
  1. App renderiza com dados do localStorage em <200ms após autenticação (sem esperar Supabase)
  2. Sync Supabase ocorre em background sem bloquear a UI
  3. Importação de arquivo XLSX não tem delay de download do SheetJS (preloaded)
  4. Erros em `authOnLogin` aparecem no console em vez de serem engolidos silenciosamente
**Plans**: TBD

### Phase 3: Portfolio Performance
**Goal**: Eliminar o gargalo O(days × tickers) em `build_evolution()` e corrigir a lógica de resolução de conflito de sync que pode reverter deleções do usuário.
**Depends on**: Phase 1
**Requirements**: Nenhum requisito externo
**Success Criteria** (what must be TRUE):
  1. Página de Carteira no Streamlit carrega em <2s na segunda visita (cache ativo)
  2. Deletar uma posição localmente não é revertido no próximo login
  3. Erros de Supabase no `maybySingle()` de `js/db.js` são capturados e logados
  4. `build_evolution()` não roda na íntegra a cada page load quando dados não mudaram
**Plans**: TBD

### Phase 4: External API Resilience
**Goal**: Tornar o app resiliente a mudanças de formato das APIs externas não-oficiais (Yahoo Finance, CKAN Tesouro) e dar feedback claro ao usuário quando dados não estão disponíveis.
**Depends on**: Phase 1
**Requirements**: Nenhum requisito externo
**Success Criteria** (what must be TRUE):
  1. Se Yahoo Finance mudar o formato, app exibe mensagem de erro clara ao invés de R$0
  2. Se CKAN mudar colunas, a GitHub Action falha com erro legível (não silencioso)
  3. Edge Function retorna HTTP 429 quando chamada excessivamente (rate limiting básico)
  4. Usuário vê "Cotações indisponíveis" com motivo quando API falha
**Plans**: TBD

### Phase 5: Fiscal Calculation Tests
**Goal**: Garantir que os cálculos de INSS/IRRF/FGTS não regridem silenciosamente quando as tabelas fiscais são atualizadas, e detectar divergência entre a implementação JS e Python.
**Depends on**: Phase 1
**Requirements**: Nenhum requisito externo
**Success Criteria** (what must be TRUE):
  1. `pytest streamlit-app/` passa com ≥10 casos de teste cobrindo `calc.py`
  2. Casos de teste cobrem: limites de faixa INSS, IRRF com e sem deduções, CLT vs PJ para salários representativos
  3. Fixture "golden salary" documenta entradas e saídas esperadas como contrato
  4. Atualizar tabela INSS/IRRF para 2027 quebra pelo menos um teste (detectabilidade garantida)
**Plans**: TBD

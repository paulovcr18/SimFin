# SimFin — Projeto de Melhoria

## Visão

SimFin é uma ferramenta pessoal de finanças para brasileiros: simula CLT vs PJ, acompanha portfólio B3 e Tesouro Direto, e projeta patrimônio. O objetivo deste milestone é tornar o app significativamente mais rápido, remover código morto e estabilizar as features existentes.

## Stack Atual

- **PWA**: HTML/CSS/JS vanilla — app principal, offline-capable via Service Worker
- **Streamlit app**: Python, app paralelo com as mesmas features (duplicata)
- **Backend**: Supabase (PostgreSQL + Auth + Edge Functions)
- **Charts**: Chart.js (PWA), Plotly (Streamlit)

## Princípios de Engenharia

1. **Uma fonte de verdade**: lógica de negócio não pode existir duplicada em JS e Python.
2. **Performance first**: nenhuma operação O(n) deve rodar em cada page load sem cache.
3. **Sem features fantasmas**: se não está na UI funcionando, remove do código.
4. **PWA é o produto**: o Streamlit foi um experimento. O app principal é a PWA.

## Restrições

- Manter compatibilidade com dados existentes no Supabase (schema não quebra)
- Não introduzir build steps no PWA sem necessidade (continua sendo static files)
- Manter autenticação via Supabase Auth

## Usuário

Paulo Victor — dono e único usuário do app. App pessoal, não SaaS.

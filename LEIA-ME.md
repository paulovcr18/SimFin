# SimFin PWA — Guia de Instalação

## O que é um PWA?

Progressive Web App: o SimFin vira um app no celular, funciona offline,
tem ícone na tela inicial e abre sem barra do navegador — sem precisar
da Play Store.

---

## Opção A — Hospedar grátis no GitHub Pages (recomendado)

1. Crie uma conta em https://github.com
2. Clique em "New repository" → nome: `simfin` → público → Create
3. Faça upload dos 5 arquivos desta pasta:
   - index.html
   - manifest.json
   - sw.js
   - icon-192.svg
   - icon-512.svg
4. Vá em Settings → Pages → Source: "Deploy from a branch" → main → Save
5. Em ~2 minutos seu app estará em:
   https://SEU_USUARIO.github.io/simfin/

---

## Opção B — Hospedar no Netlify (mais fácil, arrastar e soltar)

1. Acesse https://netlify.com → Sign up grátis
2. Arraste a pasta inteira para a área de deploy
3. URL gerada automaticamente (ex: simfin-abc123.netlify.app)

---

## Instalar no Android (Chrome)

1. Abra a URL do app no Chrome
2. Menu (⋮) → "Adicionar à tela inicial"
   — ou Chrome vai mostrar um banner automático na parte inferior
3. Confirme → ícone do SimFin aparece na tela inicial
4. Abra como qualquer app — sem barra do browser

## Instalar no iPhone (Safari)

1. Abra a URL no Safari
2. Botão de compartilhar (□↑) → "Adicionar à Tela de Início"
3. Confirme o nome → Adicionar

---

## Funciona offline?

Sim. Na primeira abertura com internet, o Service Worker baixa
todos os assets. Depois funciona completamente sem conexão —
incluindo os cálculos, gráficos e simulações salvas.

Os dados salvos ficam no localStorage do navegador do celular.

---

## Arquivos

| Arquivo       | Função                                      |
|---------------|---------------------------------------------|
| index.html    | O simulador completo                        |
| manifest.json | Configurações do app (nome, ícone, cores)   |
| sw.js         | Service Worker — cache offline              |
| icon-192.svg  | Ícone para tela inicial (Android)           |
| icon-512.svg  | Ícone splash screen / Play Store            |

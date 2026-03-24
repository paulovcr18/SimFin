-- ════════════════════════════════════════════════════════════════
-- SimFin — Schema Supabase
-- Executar no SQL Editor do Supabase (Project → SQL Editor → New query)
-- ════════════════════════════════════════════════════════════════

-- 1. Simulações salvas manualmente (substituí simfin_saves do localStorage)
CREATE TABLE simulacoes (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome          text          NOT NULL,
  inputs        jsonb         NOT NULL DEFAULT '{}',
  summary       text,
  versoes       jsonb         NOT NULL DEFAULT '[]',
  criado_em     timestamptz   NOT NULL DEFAULT now(),
  atualizado_em timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (user_id, nome)
);
CREATE INDEX ON simulacoes (user_id);

-- 2. Metas financeiras (substituí simfin_goals)
CREATE TABLE metas (
  id         bigint        PRIMARY KEY,   -- Date.now() gerado pelo cliente JS
  user_id    uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  categoria  text          NOT NULL,      -- 'carro' | 'imovel' | 'viagem' | 'casamento' | 'outro'
  nome       text          NOT NULL,
  valor      numeric(15,2) NOT NULL,
  meses      integer       NOT NULL,
  data_alvo  text          NOT NULL,      -- 'YYYY-MM'
  atingida   boolean       NOT NULL DEFAULT false,
  criado_em  timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX ON metas (user_id);

-- 3. Acompanhamento mensal real vs. simulado (substituí simfin_track)
--    UNIQUE(user_id, mes) garante 1 registro por mês por usuário no banco
CREATE TABLE acompanhamento (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mes             text          NOT NULL,   -- 'YYYY-MM'
  aporte          numeric(15,2),
  patrimonio      numeric(15,2),
  retirada        numeric(15,2),
  retirada_motivo text,
  rendimento      numeric(15,2),
  taxa_mensal     numeric(10,6),
  taxa_anual      numeric(10,6),
  registrado_em   timestamptz   NOT NULL DEFAULT now(),
  editado_em      timestamptz,
  UNIQUE (user_id, mes)
);
CREATE INDEX ON acompanhamento (user_id, mes);

-- 4. Carteira: posições consolidadas (substituí simfin_carteira)
--    UNIQUE(user_id, ticker) elimina o dedup manual que existia no JS
CREATE TABLE carteira_posicoes (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker          text          NOT NULL,
  categoria       text,
  nome            text,
  qtd             numeric(18,6) NOT NULL DEFAULT 0,
  preco_medio     numeric(15,4),
  ganho_realizado numeric(15,2) NOT NULL DEFAULT 0,
  preco_atual     numeric(15,4),
  cotado_em       timestamptz,
  atualizado_em   timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (user_id, ticker)
);
CREATE INDEX ON carteira_posicoes (user_id);

-- 5. Carteira: histórico bulk de negociações e movimentações
--    JSONB por usuário — não há ganho de normalizar linha a linha aqui
--    pois só fazemos import/export, sem queries analíticas server-side
CREATE TABLE carteira_historico (
  user_id        uuid  PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  negociacoes    jsonb NOT NULL DEFAULT '[]',
  movimentacoes  jsonb NOT NULL DEFAULT '[]',
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);

-- 6. Configurações por usuário
--    autosave   : último estado dos inputs do simulador (simfin_last_inputs)
--    brapi_token: token pessoal da API de cotações
--    lembretes  : config de lembretes (simfin_reminder_config)
CREATE TABLE user_config (
  user_id       uuid  PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  autosave      jsonb,
  brapi_token   text,
  lembretes     jsonb NOT NULL DEFAULT '{}',
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Cada usuário só enxerga e altera os próprios dados.
-- Segurança garantida pelo PostgreSQL, não pelo frontend.

ALTER TABLE simulacoes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE metas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE acompanhamento     ENABLE ROW LEVEL SECURITY;
ALTER TABLE carteira_posicoes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE carteira_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_config        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own" ON simulacoes         USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own" ON metas              USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own" ON acompanhamento     USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own" ON carteira_posicoes  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own" ON carteira_historico USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own" ON user_config        USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

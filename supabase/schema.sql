-- ============================================================
-- Moral Mirror v2 — Supabase Schema (연구용 전체 데이터 수집)
-- ============================================================

-- 1. 참가자 마스터
CREATE TABLE participants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id  TEXT UNIQUE NOT NULL,          -- 관리자 부여 ID (예: P001)
  condition       TEXT CHECK (condition IN ('A', 'B', 'C')),
  scenario_order  TEXT DEFAULT '1-2-3',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  is_active       BOOLEAN DEFAULT TRUE
);

-- 2. 실험 세션 (참가자 1회 실험 = 1 row)
CREATE TABLE experiment_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id  TEXT REFERENCES participants(participant_id),
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  total_duration_ms   INTEGER,                  -- 전체 실험 소요 시간(ms)
  is_completed    BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 시나리오 응답 (세션당 5개, 핵심 연구 데이터 테이블)
CREATE TABLE scenario_responses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID REFERENCES experiment_sessions(id) ON DELETE CASCADE,
  scenario_id         INTEGER NOT NULL,          -- 1-5

  -- 초기 선택
  initial_choice      TEXT NOT NULL,             -- "레버를 당긴다" 등
  initial_reasoning   TEXT NOT NULL,             -- 선택 이유 원문

  -- 자기 반박 (Phase 2)
  self_rebuttal       TEXT,                      -- 사용자 자기반박 원문

  -- 최종 선택 (Phase 3 이후)
  final_choice        TEXT,                      -- 초기와 동일하거나 변경
  final_reflection    TEXT,                      -- 최종 소감/이유
  is_practice         BOOLEAN DEFAULT FALSE,     -- 연습 세션 여부

  -- Phase별 교환 횟수
  phase1_exchange_count   INTEGER DEFAULT 0,
  phase2_exchange_count   INTEGER DEFAULT 0,
  phase3_exchange_count   INTEGER DEFAULT 0,

  -- 타이밍 (밀리초)
  choice_duration_ms      INTEGER,               -- 시나리오 진입 → 선택 클릭
  reasoning_duration_ms   INTEGER,               -- 선택 클릭 → 토론시작 클릭
  phase1_duration_ms      INTEGER,               -- Phase 1 전체 소요
  phase2_duration_ms      INTEGER,               -- Phase 2 전체 소요
  phase3_duration_ms      INTEGER,               -- Phase 3 전체 소요
  reflection_duration_ms  INTEGER,               -- 최종소감 작성 소요
  total_duration_ms       INTEGER,               -- 해당 시나리오 전체 소요

  started_at          TIMESTAMPTZ DEFAULT NOW(),
  completed_at        TIMESTAMPTZ,

  UNIQUE(session_id, scenario_id)
);

-- 4. 대화 메시지 (Phase 1, Phase 3 전체 로그)
CREATE TABLE phase_messages (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_response_id    UUID REFERENCES scenario_responses(id) ON DELETE CASCADE,
  phase                   TEXT NOT NULL CHECK (phase IN ('phase1', 'phase2', 'phase3', 'baseline')),
  role                    TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content                 TEXT NOT NULL,
  message_order           INTEGER NOT NULL,       -- 0-indexed 순서
  response_time_ms        INTEGER,                -- 이전 메시지로부터 경과시간
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_phase_messages_response ON phase_messages(scenario_response_id, phase, message_order);

-- 5. AI 추출 논거 카드 (Phase 2)
CREATE TABLE extracted_arguments (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_response_id    UUID REFERENCES scenario_responses(id) ON DELETE CASCADE,
  argument_index          INTEGER NOT NULL,       -- 0-based 순서
  content                 TEXT NOT NULL,           -- 논거 원문
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- 6. 윤리 프레임 점수 (시나리오별 × 프레임별)
CREATE TABLE ethics_scores (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_response_id    UUID REFERENCES scenario_responses(id) ON DELETE CASCADE,
  frame                   TEXT NOT NULL,           -- 공리주의, 의무론, 관계주의, 법치주의, 감정
  initial_score           INTEGER NOT NULL,        -- 초기 선택 기반 점수 (1-4)
  adjusted_score          INTEGER,                 -- Phase 3 보정 후 점수
  delta                   INTEGER,                 -- initial - adjusted
  created_at              TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(scenario_response_id, frame)
);

CREATE INDEX idx_ethics_scores_response ON ethics_scores(scenario_response_id);

-- 7. 연구 지표 (시나리오별 PROBE 메트릭)
CREATE TABLE probe_metrics (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_response_id    UUID REFERENCES scenario_responses(id) ON DELETE CASCADE UNIQUE,
  probe_breadth           INTEGER,                 -- 사용된 Aspect 수 (0~7)
  probe_depth             REAL,                    -- 정교화 비율 (0~100)
  ethical_stance_count    INTEGER DEFAULT 0,
  moral_tension_count     INTEGER DEFAULT 0,
  analogical_reasoning_count INTEGER DEFAULT 0,
  feeling_count           INTEGER DEFAULT 0,
  decision_justification_count INTEGER DEFAULT 0,
  insight_count           INTEGER DEFAULT 0,
  alternative_perspective_count INTEGER DEFAULT 0,
  reasoning_length        INTEGER,                 -- 초기 이유 글자수
  rebuttal_length         INTEGER,                 -- 자기반박 글자수
  phase1_user_avg_length  REAL,                    -- Phase 1 사용자 메시지 평균 길이
  phase2_user_avg_length  REAL,                    -- Phase 2 사용자 메시지 평균 길이
  phase3_user_avg_length  REAL,                    -- Phase 3 사용자 메시지 평균 길이
  total_user_messages     INTEGER,                 -- 전체 사용자 메시지 수
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- 8. PROBE 문장 단위 분석 결과 (Kappa 계산용 raw unit)
CREATE TABLE probe_thought_units (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_response_id    UUID REFERENCES scenario_responses(id) ON DELETE CASCADE,
  source                  TEXT NOT NULL,           -- initial_reasoning, phase1_0, phase2_1 ...
  unit_id                 TEXT NOT NULL,           -- s0_u0 같은 분절 고유값
  unit_index              INTEGER NOT NULL,        -- 저장 순서
  text_unit               TEXT NOT NULL,           -- 문장(분석 단위) 원문
  aspect                  TEXT,                    -- 코더 라벨링 전에는 NULL
  is_elaborated           BOOLEAN,                 -- 코더 라벨링 전에는 NULL
  confidence              REAL,                    -- 모델 신뢰도(선택)
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_probe_units_response
  ON probe_thought_units(scenario_response_id, unit_index);

-- ============================================================
-- RLS (Row Level Security) — 프로토타입이므로 기본 정책
-- 필요 시 활성화하여 참가자별 접근 제한 가능
-- ============================================================
-- ALTER TABLE scenario_responses ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE phase_messages ENABLE ROW LEVEL SECURITY;
-- ...

-- Existing DB migration helpers
ALTER TABLE participants
ADD COLUMN IF NOT EXISTS condition TEXT CHECK (condition IN ('A', 'B', 'C'));

ALTER TABLE participants
ADD COLUMN IF NOT EXISTS scenario_order TEXT DEFAULT '1-2-3';

ALTER TABLE scenario_responses
ADD COLUMN IF NOT EXISTS is_practice BOOLEAN DEFAULT FALSE;

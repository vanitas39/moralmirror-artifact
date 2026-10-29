-- ============================================================
-- Moral Mirror v2
-- Existing DB migration for Phase2 chatbot redesign
-- Safe to run multiple times
-- ============================================================

BEGIN;

-- 0) participants: condition 컬럼 추가
ALTER TABLE IF EXISTS public.participants
  ADD COLUMN IF NOT EXISTS condition TEXT CHECK (condition IN ('A', 'B', 'C'));

ALTER TABLE IF EXISTS public.participants
  ADD COLUMN IF NOT EXISTS scenario_order TEXT DEFAULT '1-2-3';

-- 1) scenario_responses: phase2 교환 횟수 컬럼 추가
ALTER TABLE IF EXISTS public.scenario_responses
  ADD COLUMN IF NOT EXISTS phase2_exchange_count INTEGER DEFAULT 0;

ALTER TABLE IF EXISTS public.scenario_responses
  ADD COLUMN IF NOT EXISTS is_practice BOOLEAN DEFAULT FALSE;

-- 2) probe_metrics: phase2 평균 길이 컬럼 추가
ALTER TABLE IF EXISTS public.probe_metrics
  ADD COLUMN IF NOT EXISTS phase2_user_avg_length REAL;

-- 2-1) PROBE 컬럼명 업데이트 (기존 breadth/depth -> probe_breadth/probe_depth)
ALTER TABLE IF EXISTS public.probe_metrics
  ADD COLUMN IF NOT EXISTS probe_breadth INTEGER;
ALTER TABLE IF EXISTS public.probe_metrics
  ADD COLUMN IF NOT EXISTS probe_depth REAL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'probe_metrics'
      AND column_name = 'breadth'
  ) THEN
    EXECUTE 'UPDATE public.probe_metrics SET probe_breadth = COALESCE(probe_breadth, breadth)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'probe_metrics'
      AND column_name = 'depth'
  ) THEN
    EXECUTE 'UPDATE public.probe_metrics SET probe_depth = COALESCE(probe_depth, depth)';
  END IF;
END $$;

-- 2-2) 트롤리 특화 7개 Aspect 카운트 컬럼 추가
ALTER TABLE IF EXISTS public.probe_metrics
  ADD COLUMN IF NOT EXISTS ethical_stance_count INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS public.probe_metrics
  ADD COLUMN IF NOT EXISTS moral_tension_count INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS public.probe_metrics
  ADD COLUMN IF NOT EXISTS analogical_reasoning_count INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS public.probe_metrics
  ADD COLUMN IF NOT EXISTS feeling_count INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS public.probe_metrics
  ADD COLUMN IF NOT EXISTS decision_justification_count INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS public.probe_metrics
  ADD COLUMN IF NOT EXISTS insight_count INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS public.probe_metrics
  ADD COLUMN IF NOT EXISTS alternative_perspective_count INTEGER DEFAULT 0;

-- 3) phase_messages.phase 체크 제약 확장
-- 기존 CHECK(phase IN ('phase1','phase3')) 를 제거하고 phase2 포함으로 교체
ALTER TABLE IF EXISTS public.phase_messages
  DROP CONSTRAINT IF EXISTS phase_messages_phase_check;

DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'phase_messages'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%phase%'
      AND pg_get_constraintdef(con.oid) ILIKE '%IN%'
  LOOP
    EXECUTE format('ALTER TABLE public.phase_messages DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE IF EXISTS public.phase_messages
  ADD CONSTRAINT phase_messages_phase_check
  CHECK (phase IN ('phase1', 'phase2', 'phase3', 'baseline'));

-- 4) 성능 인덱스(없으면 생성)
CREATE INDEX IF NOT EXISTS idx_phase_messages_response
  ON public.phase_messages (scenario_response_id, phase, message_order);

-- 5) Kappa 분석용 문장 단위 저장 테이블
CREATE TABLE IF NOT EXISTS public.probe_thought_units (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_response_id    UUID REFERENCES public.scenario_responses(id) ON DELETE CASCADE,
  source                  TEXT NOT NULL,
  unit_id                 TEXT NOT NULL,
  unit_index              INTEGER NOT NULL,
  text_unit               TEXT NOT NULL,
  aspect                  TEXT NOT NULL,
  is_elaborated           BOOLEAN NOT NULL DEFAULT FALSE,
  confidence              REAL,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- 5-1) 코더 라벨링 전 raw 저장을 위해 nullable로 변경
ALTER TABLE IF EXISTS public.probe_thought_units
  ALTER COLUMN aspect DROP NOT NULL;
ALTER TABLE IF EXISTS public.probe_thought_units
  ALTER COLUMN is_elaborated DROP NOT NULL;
ALTER TABLE IF EXISTS public.probe_thought_units
  ALTER COLUMN is_elaborated DROP DEFAULT;

CREATE INDEX IF NOT EXISTS idx_probe_units_response
  ON public.probe_thought_units (scenario_response_id, unit_index);

COMMIT;

-- ============================================================
-- 적용 후 확인 쿼리
-- ============================================================
-- SELECT column_name
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'scenario_responses'
--   AND column_name = 'phase2_exchange_count';
--
-- SELECT column_name
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'probe_metrics'
--   AND column_name = 'phase2_user_avg_length';
--
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.phase_messages'::regclass
--   AND contype = 'c';

-- ============================================================
-- Moral Mirror v2
-- Analysis-first views (participant-centric, id columns at end)
-- ============================================================

BEGIN;

-- NOTE:
-- analysis_phase_messages was re-shaped to include flow_order/phase_order.
-- DROP first to avoid "cannot change name of view column" errors on CREATE OR REPLACE.
DROP VIEW IF EXISTS public.analysis_phase_messages_flow;
DROP VIEW IF EXISTS public.analysis_phase_messages;

CREATE OR REPLACE VIEW public.analysis_experiment_sessions AS
WITH ranked_sessions AS (
  SELECT
    es.*,
    DENSE_RANK() OVER (
      PARTITION BY es.participant_id
      ORDER BY es.started_at, es.created_at, es.id
    ) AS trial_no
  FROM public.experiment_sessions es
)
SELECT
  participant_id,
  trial_no,
  started_at,
  completed_at,
  total_duration_ms,
  is_completed,
  created_at,
  id
FROM ranked_sessions;

CREATE OR REPLACE VIEW public.analysis_scenario_responses AS
WITH ranked_sessions AS (
  SELECT
    es.*,
    DENSE_RANK() OVER (
      PARTITION BY es.participant_id
      ORDER BY es.started_at, es.created_at, es.id
    ) AS trial_no
  FROM public.experiment_sessions es
)
SELECT
  rs.participant_id,
  rs.trial_no,
  sr.scenario_id,
  sr.initial_choice,
  sr.initial_reasoning,
  sr.self_rebuttal,
  sr.final_choice,
  sr.final_reflection,
  (sr.initial_choice IS DISTINCT FROM sr.final_choice) AS changed_choice,
  sr.phase1_exchange_count,
  sr.phase2_exchange_count,
  sr.phase3_exchange_count,
  sr.choice_duration_ms,
  sr.reasoning_duration_ms,
  sr.phase1_duration_ms,
  sr.phase2_duration_ms,
  sr.phase3_duration_ms,
  sr.reflection_duration_ms,
  sr.total_duration_ms,
  sr.started_at,
  sr.completed_at,
  sr.id AS scenario_response_id,
  sr.session_id
FROM public.scenario_responses sr
JOIN ranked_sessions rs ON rs.id = sr.session_id;

CREATE OR REPLACE VIEW public.analysis_phase_messages AS
WITH ranked_sessions AS (
  SELECT
    es.*,
    DENSE_RANK() OVER (
      PARTITION BY es.participant_id
      ORDER BY es.started_at, es.created_at, es.id
    ) AS trial_no
  FROM public.experiment_sessions es
),
phase_messages_with_order AS (
  SELECT
    rs.participant_id,
    rs.trial_no,
    sr.scenario_id,
    CASE pm.phase
      WHEN 'phase1' THEN 1
      WHEN 'phase2' THEN 2
      WHEN 'phase3' THEN 3
      ELSE 99
    END AS phase_order,
    pm.phase,
    pm.role,
    pm.message_order,
    pm.content,
    pm.response_time_ms,
    pm.created_at,
    pm.scenario_response_id,
    pm.id
  FROM public.phase_messages pm
  JOIN public.scenario_responses sr ON sr.id = pm.scenario_response_id
  JOIN ranked_sessions rs ON rs.id = sr.session_id
)
SELECT
  pmo.participant_id,
  pmo.trial_no,
  pmo.scenario_id,
  ROW_NUMBER() OVER (
    PARTITION BY pmo.participant_id, pmo.trial_no, pmo.scenario_id
    ORDER BY pmo.phase_order, pmo.message_order, pmo.created_at, pmo.id
  ) AS flow_order,
  pmo.phase_order,
  pmo.phase,
  pmo.role,
  pmo.message_order,
  pmo.content,
  pmo.response_time_ms,
  pmo.created_at,
  pmo.scenario_response_id,
  pmo.id
FROM phase_messages_with_order pmo;

CREATE OR REPLACE VIEW public.analysis_phase_messages_flow AS
SELECT
  participant_id,
  trial_no,
  scenario_id,
  flow_order,
  phase,
  role,
  content,
  response_time_ms,
  created_at,
  message_order,
  phase_order,
  scenario_response_id,
  id
FROM public.analysis_phase_messages
ORDER BY participant_id, trial_no, scenario_id, flow_order;

CREATE OR REPLACE VIEW public.analysis_extracted_arguments AS
WITH ranked_sessions AS (
  SELECT
    es.*,
    DENSE_RANK() OVER (
      PARTITION BY es.participant_id
      ORDER BY es.started_at, es.created_at, es.id
    ) AS trial_no
  FROM public.experiment_sessions es
)
SELECT
  rs.participant_id,
  rs.trial_no,
  sr.scenario_id,
  ea.argument_index,
  ea.content,
  ea.created_at,
  ea.scenario_response_id,
  ea.id
FROM public.extracted_arguments ea
JOIN public.scenario_responses sr ON sr.id = ea.scenario_response_id
JOIN ranked_sessions rs ON rs.id = sr.session_id;

CREATE OR REPLACE VIEW public.analysis_ethics_scores AS
WITH ranked_sessions AS (
  SELECT
    es.*,
    DENSE_RANK() OVER (
      PARTITION BY es.participant_id
      ORDER BY es.started_at, es.created_at, es.id
    ) AS trial_no
  FROM public.experiment_sessions es
)
SELECT
  rs.participant_id,
  rs.trial_no,
  sr.scenario_id,
  es.frame,
  es.initial_score,
  es.adjusted_score,
  es.delta,
  es.created_at,
  es.scenario_response_id,
  es.id
FROM public.ethics_scores es
JOIN public.scenario_responses sr ON sr.id = es.scenario_response_id
JOIN ranked_sessions rs ON rs.id = sr.session_id;

CREATE OR REPLACE VIEW public.analysis_probe_metrics AS
WITH ranked_sessions AS (
  SELECT
    es.*,
    DENSE_RANK() OVER (
      PARTITION BY es.participant_id
      ORDER BY es.started_at, es.created_at, es.id
    ) AS trial_no
  FROM public.experiment_sessions es
)
SELECT
  rs.participant_id,
  rs.trial_no,
  sr.scenario_id,
  pm.probe_breadth,
  pm.probe_depth,
  pm.ethical_stance_count,
  pm.moral_tension_count,
  pm.analogical_reasoning_count,
  pm.feeling_count,
  pm.decision_justification_count,
  pm.insight_count,
  pm.alternative_perspective_count,
  pm.reasoning_length,
  pm.rebuttal_length,
  pm.phase1_user_avg_length,
  pm.phase2_user_avg_length,
  pm.phase3_user_avg_length,
  pm.total_user_messages,
  pm.created_at,
  pm.scenario_response_id,
  pm.id
FROM public.probe_metrics pm
JOIN public.scenario_responses sr ON sr.id = pm.scenario_response_id
JOIN ranked_sessions rs ON rs.id = sr.session_id;

CREATE OR REPLACE VIEW public.analysis_probe_thought_units AS
WITH ranked_sessions AS (
  SELECT
    es.*,
    DENSE_RANK() OVER (
      PARTITION BY es.participant_id
      ORDER BY es.started_at, es.created_at, es.id
    ) AS trial_no
  FROM public.experiment_sessions es
)
SELECT
  rs.participant_id,
  rs.trial_no,
  sr.scenario_id,
  ptu.source,
  ptu.unit_id,
  ptu.unit_index,
  ptu.text_unit,
  ptu.aspect,
  ptu.is_elaborated,
  ptu.confidence,
  ptu.created_at,
  ptu.scenario_response_id,
  ptu.id
FROM public.probe_thought_units ptu
JOIN public.scenario_responses sr ON sr.id = ptu.scenario_response_id
JOIN ranked_sessions rs ON rs.id = sr.session_id;

CREATE OR REPLACE VIEW public.analysis_scenario_choices AS
WITH ranked_sessions AS (
  SELECT
    es.*,
    DENSE_RANK() OVER (
      PARTITION BY es.participant_id
      ORDER BY es.started_at, es.created_at, es.id
    ) AS trial_no
  FROM public.experiment_sessions es
)
SELECT
  rs.participant_id,
  rs.trial_no,
  sr.scenario_id,
  sr.initial_choice,
  sr.final_choice,
  (sr.initial_choice IS DISTINCT FROM sr.final_choice) AS changed_choice,
  sr.initial_reasoning,
  sr.self_rebuttal,
  sr.final_reflection,
  sr.completed_at,
  sr.id AS scenario_response_id
FROM public.scenario_responses sr
JOIN ranked_sessions rs ON rs.id = sr.session_id
ORDER BY rs.participant_id, rs.trial_no, sr.scenario_id, sr.completed_at;

COMMIT;

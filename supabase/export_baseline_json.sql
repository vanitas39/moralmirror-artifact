-- Baseline(C) 참가자 1명의 결과를 JSON으로 내보내기
-- 사용법:
-- 1) 아래 target_participant 값을 원하는 ID로 바꾼다. (예: 't01', 'P12', 'pi03')
-- 2) Supabase SQL Editor에서 실행한다.
-- 3) 결과 1행의 export_json 컬럼을 복사해 JSON 파일로 저장한다.

with target as (
  select 't01'::text as target_participant
),
target_sessions as (
  select
    es.id as session_id,
    es.participant_id,
    es.started_at,
    es.completed_at,
    es.total_duration_ms,
    es.is_completed
  from public.experiment_sessions es
  join target t on t.target_participant = es.participant_id
  order by es.started_at desc
),
target_scenarios as (
  select
    ts.participant_id,
    ts.session_id,
    ts.started_at as session_started_at,
    ts.completed_at as session_completed_at,
    ts.total_duration_ms as session_total_duration_ms,
    ts.is_completed as session_is_completed,
    sr.id as scenario_response_id,
    sr.scenario_id,
    sr.initial_choice,
    sr.initial_reasoning,
    sr.final_choice,
    sr.final_reflection,
    sr.self_rebuttal,
    sr.is_practice,
    sr.phase1_exchange_count,
    sr.phase2_exchange_count,
    sr.phase3_exchange_count,
    sr.choice_duration_ms,
    sr.reasoning_duration_ms,
    sr.phase1_duration_ms,
    sr.phase2_duration_ms,
    sr.phase3_duration_ms,
    sr.reflection_duration_ms,
    sr.total_duration_ms as scenario_total_duration_ms,
    sr.started_at as scenario_started_at,
    sr.completed_at as scenario_completed_at
  from target_sessions ts
  join public.scenario_responses sr on sr.session_id = ts.session_id
),
scenario_with_messages as (
  select
    s.*,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'phase', pm.phase,
            'role', pm.role,
            'content', pm.content,
            'message_order', pm.message_order,
            'response_time_ms', pm.response_time_ms,
            'created_at', pm.created_at
          )
          order by pm.phase, pm.message_order
        )
        from public.phase_messages pm
        where pm.scenario_response_id = s.scenario_response_id
      ),
      '[]'::jsonb
    ) as messages
  from target_scenarios s
),
scenario_json as (
  select
    participant_id,
    jsonb_agg(
      jsonb_build_object(
        'session_id', session_id,
        'session_started_at', session_started_at,
        'session_completed_at', session_completed_at,
        'session_total_duration_ms', session_total_duration_ms,
        'session_is_completed', session_is_completed,
        'scenario_response_id', scenario_response_id,
        'scenario_id', scenario_id,
        'is_practice', is_practice,
        'initial_choice', initial_choice,
        'initial_reasoning', initial_reasoning,
        'final_choice', final_choice,
        'final_reflection', final_reflection,
        'self_rebuttal', self_rebuttal,
        'phase1_exchange_count', phase1_exchange_count,
        'phase2_exchange_count', phase2_exchange_count,
        'phase3_exchange_count', phase3_exchange_count,
        'choice_duration_ms', choice_duration_ms,
        'reasoning_duration_ms', reasoning_duration_ms,
        'phase1_duration_ms', phase1_duration_ms,
        'phase2_duration_ms', phase2_duration_ms,
        'phase3_duration_ms', phase3_duration_ms,
        'reflection_duration_ms', reflection_duration_ms,
        'scenario_total_duration_ms', scenario_total_duration_ms,
        'scenario_started_at', scenario_started_at,
        'scenario_completed_at', scenario_completed_at,
        'messages', messages
      )
      order by session_started_at, scenario_id
    ) as scenarios
  from scenario_with_messages
  group by participant_id
)
select jsonb_build_object(
  'exported_at', now(),
  'participant_id', participant_id,
  'condition', 'C',
  'scenarios', scenarios
) as export_json
from scenario_json;

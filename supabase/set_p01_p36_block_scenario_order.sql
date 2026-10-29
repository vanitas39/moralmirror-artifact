-- P01~P36 시나리오 순서를 6명 블록 단위로 고정 배정
-- 규칙:
-- P01~P06   -> 1-2-3
-- P07~P12   -> 2-1-3
-- P13~P18   -> 1-3-2
-- P19~P24   -> 2-3-1
-- P25~P30   -> 3-1-2
-- P31~P36   -> 3-2-1
--
-- 주의:
-- - participant_id가 p숫자 형태인 행만 대상
-- - P37 이상, pi*, t* 등은 변경하지 않음

WITH p_targets AS (
  SELECT
    participant_id,
    (regexp_replace(lower(participant_id), '^p', ''))::int AS p_no
  FROM public.participants
  WHERE lower(participant_id) ~ '^p[0-9]+$'
)
UPDATE public.participants p
SET scenario_order = CASE
  WHEN t.p_no BETWEEN 1 AND 6 THEN '1-2-3'
  WHEN t.p_no BETWEEN 7 AND 12 THEN '2-1-3'
  WHEN t.p_no BETWEEN 13 AND 18 THEN '1-3-2'
  WHEN t.p_no BETWEEN 19 AND 24 THEN '2-3-1'
  WHEN t.p_no BETWEEN 25 AND 30 THEN '3-1-2'
  WHEN t.p_no BETWEEN 31 AND 36 THEN '3-2-1'
  ELSE p.scenario_order
END
FROM p_targets t
WHERE p.participant_id = t.participant_id
  AND t.p_no BETWEEN 1 AND 36;

-- 확인용
-- SELECT participant_id, scenario_order
-- FROM public.participants
-- WHERE lower(participant_id) ~ '^p[0-9]+$'
-- ORDER BY (regexp_replace(lower(participant_id), '^p', ''))::int;

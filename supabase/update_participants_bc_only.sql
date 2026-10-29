-- Convert existing P*/pi* participants from A (or NULL) to B/C only.
-- Run this in Supabase SQL Editor.

BEGIN;

WITH targets AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY participant_id) AS rn
  FROM public.participants
  WHERE (
    lower(participant_id) ~ '^p[0-9]+$'
    OR lower(participant_id) ~ '^pi[0-9]+$'
  )
  AND COALESCE(condition, 'A') NOT IN ('B', 'C')
)
UPDATE public.participants p
SET condition = CASE
  WHEN targets.rn % 2 = 1 THEN 'B'
  ELSE 'C'
END
FROM targets
WHERE p.id = targets.id;

COMMIT;

-- Verify: no A remains for P*/pi*
-- SELECT participant_id, condition
-- FROM public.participants
-- WHERE lower(participant_id) ~ '^p[0-9]+$' OR lower(participant_id) ~ '^pi[0-9]+$'
-- ORDER BY participant_id;

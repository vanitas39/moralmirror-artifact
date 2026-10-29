-- P01~P06은 이미 1-2-3 순서로 완료된 슬롯으로 표기
UPDATE public.participants
SET scenario_order = '1-2-3'
WHERE participant_id IN ('P01', 'P02', 'P03', 'P04', 'P05', 'P06');

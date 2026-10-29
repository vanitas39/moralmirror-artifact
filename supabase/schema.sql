-- ============================================================
-- Moral Mirror v2
-- Database schema (Supabase / PostgreSQL)
-- Exported from the database used in the study (public schema).
-- Run this file first, then analysis_views.sql.
-- ============================================================

-- Participants and their assigned condition.
-- Only conditions 'B' and 'C' were used in the study ('A' is unused; see README).
CREATE TABLE public.participants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  participant_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  is_active boolean DEFAULT true,
  condition text,
  scenario_order text DEFAULT '1-2-3'::text,
  CONSTRAINT participants_pkey PRIMARY KEY (id),
  CONSTRAINT participants_participant_id_key UNIQUE (participant_id),
  CONSTRAINT participants_condition_check CHECK ((condition = ANY (ARRAY['A'::text, 'B'::text, 'C'::text])))
);

-- One row per experiment run of a participant.
CREATE TABLE public.experiment_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  participant_id text,
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  total_duration_ms integer,
  is_completed boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT experiment_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT experiment_sessions_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.participants(participant_id)
);

-- One row per scenario within a session (choices, reasoning, reflection, timings).
CREATE TABLE public.scenario_responses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid,
  scenario_id integer NOT NULL,
  initial_choice text NOT NULL,
  initial_reasoning text NOT NULL,
  self_rebuttal text,
  final_choice text,
  final_reflection text,
  phase1_exchange_count integer DEFAULT 0,
  phase3_exchange_count integer DEFAULT 0,
  choice_duration_ms integer,
  reasoning_duration_ms integer,
  phase1_duration_ms integer,
  phase2_duration_ms integer,
  phase3_duration_ms integer,
  reflection_duration_ms integer,
  total_duration_ms integer,
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  phase2_exchange_count integer DEFAULT 0,
  is_practice boolean DEFAULT false,
  CONSTRAINT scenario_responses_pkey PRIMARY KEY (id),
  CONSTRAINT scenario_responses_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.experiment_sessions(id) ON DELETE CASCADE,
  CONSTRAINT scenario_responses_session_id_scenario_id_key UNIQUE (session_id, scenario_id)
);

-- Chat messages per phase ('baseline' is used for Condition C).
CREATE TABLE public.phase_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  scenario_response_id uuid,
  phase text NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  message_order integer NOT NULL,
  response_time_ms integer,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT phase_messages_pkey PRIMARY KEY (id),
  CONSTRAINT phase_messages_phase_check CHECK ((phase = ANY (ARRAY['phase1'::text, 'phase2'::text, 'phase3'::text, 'baseline'::text]))),
  CONSTRAINT phase_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text]))),
  CONSTRAINT phase_messages_scenario_response_id_fkey FOREIGN KEY (scenario_response_id) REFERENCES public.scenario_responses(id) ON DELETE CASCADE
);

-- Core arguments extracted by the LLM between Phase 1 and Phase 2.
CREATE TABLE public.extracted_arguments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  scenario_response_id uuid,
  argument_index integer NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT extracted_arguments_pkey PRIMARY KEY (id),
  CONSTRAINT extracted_arguments_scenario_response_id_fkey FOREIGN KEY (scenario_response_id) REFERENCES public.scenario_responses(id) ON DELETE CASCADE
);

-- Ethical frame scores before (initial) and after (adjusted) the discussion.
CREATE TABLE public.ethics_scores (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  scenario_response_id uuid,
  frame text NOT NULL,
  initial_score integer NOT NULL,
  adjusted_score integer,
  delta integer,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ethics_scores_pkey PRIMARY KEY (id),
  CONSTRAINT ethics_scores_scenario_response_id_fkey FOREIGN KEY (scenario_response_id) REFERENCES public.scenario_responses(id) ON DELETE CASCADE,
  CONSTRAINT ethics_scores_scenario_response_id_frame_key UNIQUE (scenario_response_id, frame)
);

-- Per-scenario reasoning metrics (aspect counts, breadth/depth, message lengths).
CREATE TABLE public.probe_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  scenario_response_id uuid,
  breadth integer,
  depth real,
  reasoning_length integer,
  rebuttal_length integer,
  phase1_user_avg_length real,
  phase3_user_avg_length real,
  total_user_messages integer,
  created_at timestamp with time zone DEFAULT now(),
  phase2_user_avg_length real,
  probe_breadth integer,
  probe_depth real,
  ethical_stance_count integer DEFAULT 0,
  moral_tension_count integer DEFAULT 0,
  analogical_reasoning_count integer DEFAULT 0,
  feeling_count integer DEFAULT 0,
  decision_justification_count integer DEFAULT 0,
  insight_count integer DEFAULT 0,
  alternative_perspective_count integer DEFAULT 0,
  CONSTRAINT probe_metrics_pkey PRIMARY KEY (id),
  CONSTRAINT probe_metrics_scenario_response_id_fkey FOREIGN KEY (scenario_response_id) REFERENCES public.scenario_responses(id) ON DELETE CASCADE,
  CONSTRAINT probe_metrics_scenario_response_id_key UNIQUE (scenario_response_id)
);

-- Participant text split into thought units and classified into aspects.
CREATE TABLE public.probe_thought_units (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  scenario_response_id uuid,
  source text NOT NULL,
  unit_id text NOT NULL,
  unit_index integer NOT NULL,
  text_unit text NOT NULL,
  aspect text,
  is_elaborated boolean,
  confidence real,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT probe_thought_units_pkey PRIMARY KEY (id),
  CONSTRAINT probe_thought_units_scenario_response_id_fkey FOREIGN KEY (scenario_response_id) REFERENCES public.scenario_responses(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_ethics_scores_response ON public.ethics_scores USING btree (scenario_response_id);
CREATE INDEX idx_phase_messages_response ON public.phase_messages USING btree (scenario_response_id, phase, message_order);
CREATE INDEX idx_probe_units_response ON public.probe_thought_units USING btree (scenario_response_id, unit_index);

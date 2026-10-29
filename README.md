# Moral Mirror v2 — Research Artifact

This repository contains the source code, LLM prompts, scenarios, and database schema of the interactive
prototype used in the study. It is released for **anonymous peer review**.

Moral Mirror is a Next.js web application in which participants respond to moral dilemma scenarios
(trolley-type dilemmas, Heinz dilemma, whistleblower dilemma) and then discuss their choice with an LLM
under one of three conditions.

## Experimental conditions

| Condition | Phase 1 behavior of the LLM | Phases 2–3 |
|---|---|---|
| **A** | Supports and strengthens the participant's position (argument reinforcement) | Yes |
| **B** | Challenges the participant's core premises (argument attack) | Yes |
| **C** | Baseline: free conversation with a minimally instructed LLM | No |

Each participant first completes a practice scenario (`id: 0`), then the main scenarios defined in
`constants/scenarios.js`.

## Models

| Use | Model | API | Settings | Code |
|---|---|---|---|---|
| All dialogue phases, argument extraction, ethics scoring, final reflection | `gpt-5.5` | OpenAI Responses API | `reasoning.effort = "low"`; `max_output_tokens = 1000` (Conditions A/B), unset (Condition C), `600` (ethics scoring) | `app/api/chat/route.js` |
| Thought-unit aspect classification | `gpt-4o` | OpenAI Chat Completions API | `temperature = 0`, `max_tokens = 1600` | `app/api/probe/route.js` |
| Offline ethics re-scoring (post hoc) | `gpt-5.5` (default; overridable via `ETHICS_RESCORE_MODEL`) | OpenAI Responses API | `reasoning.effort = "low"`, `max_output_tokens = 600` | `scripts/recompute-ethics-scores.mjs` |

<!-- TODO: add exact model snapshot IDs and the data-collection period (e.g., "gpt-5.5-YYYY-MM-DD, collected MM/YYYY–MM/YYYY"). -->

## Prompts and where they are used

All prompts are defined in `lib/prompts.js`.

| Prompt function | Stage | Condition | Called from |
|---|---|---|---|
| `buildPhase1Prompt` | Phase 1 — argument reinforcement | A | `app/experiment/page.js` |
| `buildPhase1BPrompt` | Phase 1 — argument attack (philosophical challenger) | B | `app/experiment/page.js` |
| `buildBaselinePrompt` | Free conversation (system prompt) | C | `app/experiment/page.js` |
| `buildBaselineFirstMessage` | Free conversation (first user turn: scenario + choice + reasoning) | C | `app/experiment/page.js` |
| `buildPracticePhase1Prompt` | Practice scenario — Phase 1 | A, B | `app/experiment/page.js` |
| `buildExtractionPrompt` | Between Phase 1 and 2 — extracts 2–3 core arguments from the participant's messages (JSON) | A, B | `app/experiment/page.js` |
| `buildPhase2Prompt` | Phase 2 — debate chatbot representing the participant's initial position | A, B | `app/experiment/page.js` |
| `buildPracticePhase2Prompt` | Practice scenario — Phase 2 | A, B | `app/experiment/page.js` |
| `buildPhase3Prompt` | Phase 3 — Socratic meta-reflection coach | A, B | `app/experiment/page.js` |
| `buildPracticePhase3Prompt` | Practice scenario — Phase 3 | A, B | `app/experiment/page.js` |
| `buildEthicsRescorePrompt` | End of each scenario — scores ethical frames before/after discussion (JSON); also used for post hoc re-scoring | All | `app/experiment/page.js`, `scripts/recompute-ethics-scores.mjs` |
| `buildReflectionPrompt` | Result page — summary of the participant's dominant ethical frame and changes across scenarios | All | `app/result/page.js` |
| `buildProbeAspectPrompt` | Analysis — classifies participant thought units into seven aspects | Analysis | `app/api/probe/route.js` |

## Repository structure

```
app/            Next.js pages and API routes (experiment, result, admin, auth, chat, probe, sessions)
components/     UI components (chat, phase indicator, radar chart, argument cards, ...)
constants/      Scenario texts (scenarios.js)
lib/            LLM prompts (prompts.js) and Supabase clients
public/images/  Scenario illustrations and avatar images
scripts/        Offline ethics re-scoring script
supabase/       Database schema, analysis views, and setup SQL
```

## Running locally

Requirements: Node.js 20+, a Supabase project, and an OpenAI API key.

1. Install dependencies: `npm install`
2. Create the database by running `supabase/schema.sql` (and `supabase/analysis_views.sql` for analysis views)
   in the Supabase SQL editor.
3. Create `.env.local` with:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   OPENAI_API_KEY=...
   ```
4. Register participant IDs in the `participants` table, then start the app: `npm run dev`
5. (Optional) Re-score ethics frames offline: `npm run ethics:rescore`

Note: because LLM outputs are non-deterministic, re-running the system will not reproduce identical dialogues.

## License

- **Source code**: MIT License (see `LICENSE`).
- **Prompts and scenario texts** (`lib/prompts.js` prompt strings, `constants/scenarios.js`):
  Creative Commons Attribution 4.0 International (CC BY 4.0), https://creativecommons.org/licenses/by/4.0/

## Citation

Citation information will be added after the review process.

// Questionnaire step definitions.
//
// Most step options are derived from the canonical taxonomy configs
// (`vibes.ts`, `budgets.ts`). The `occasion` step is hand-written because
// the UI offers 3 buckets (`date` / `friends` / `solo`) that fan out to
// the sheet-side occasion slugs at scoring time. The mapping lives in
// `OCCASION_BUCKET_TO_SHEET_SLUGS` in `lib/scoring.ts`; the Gemini
// framing lives in `OCCASION_BUCKET_TO_GEMINI_FRAMING` in `config/prompts.ts`.
//
// The `neighborhoods` step uses `NEIGHBORHOOD_GROUPS` (the 11 user-facing
// groups), NOT the full 68-slug `NEIGHBORHOODS` list. Each group id maps
// to 1+ storage slugs; expansion happens in `QuestionnaireShell` before
// state is committed, so the scoring layer always sees storage slugs.

import { QuestionStep } from "@/types";
import { NEIGHBORHOOD_GROUPS } from "@/config/neighborhoods";
import { VIBES } from "@/config/vibes";
import { BUDGETS } from "@/config/budgets";

export const questionSteps: QuestionStep[] = [
  {
    id: "occasion",
    kind: "cards",
    question: "What kind of night is this?",
    subtitle: "Who are we planning for?",
    options: [
      { value: "date", label: "Date Night", description: "Dating, partner, anything romantic" },
      { value: "friends", label: "Friends Night Out", description: "Group night with friends or family" },
      { value: "solo", label: "Solo", description: "Just me" },
    ],
  },
  {
    id: "neighborhoods",
    kind: "pills",
    question: "Where do you want to be?",
    // Values here are group IDs. QuestionnaireShell expands them to
    // storage slugs before dispatching into state.
    options: NEIGHBORHOOD_GROUPS.map((g) => ({ value: g.id, label: g.label })),
  },
  {
    id: "budget",
    kind: "cards",
    question: "What's the budget?",
    options: BUDGETS.map((b) => ({
      value: b.slug,
      label: b.label,
      description: b.description,
    })),
  },
  {
    id: "vibe",
    kind: "cards",
    question: "What's the focus?",
    options: VIBES.map((v) => ({
      value: v.slug,
      label: v.label,
      description: v.description,
    })),
  },
  {
    // Combined day + time block step. The step only reads `id` + `kind` +
    // `question` — the `day` key is the canonical field the
    // reducer/shell listens to, but the step itself sets both day and
    // timeBlock via a single onContinue callback.
    id: "day",
    kind: "when",
    question: "When?",
    options: [],
  },
];

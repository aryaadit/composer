// Questionnaire step definitions.
//
// Most step options are derived from the canonical taxonomy configs
// (`vibes.ts`, `budgets.ts`). The `occasion` step is hand-written because
// it intentionally groups the `first-date` and `second-date` taxonomy
// values into a single "First / Second Date" card — that grouping is a
// UX decision and doesn't belong in the taxonomy config.
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
      { value: "dating", label: "Dating", description: "Meeting someone new" },
      { value: "relationship", label: "Relationship", description: "Nights with my partner" },
      { value: "friends", label: "Friends Night Out", description: "No rules" },
      { value: "family", label: "Family Fun", description: "Something for everyone" },
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
    question: "What are we working with?",
    options: BUDGETS.map((b) => ({
      value: b.slug,
      label: b.label,
      description: b.description,
    })),
  },
  {
    id: "vibe",
    kind: "cards",
    question: "What's the energy?",
    options: VIBES.map((v) => ({
      value: v.slug,
      label: v.label,
      description: v.description,
    })),
  },
  {
    // Combined day + duration step. The step only reads `id` + `kind` +
    // `question` — the `day` key is the canonical field the
    // reducer/shell listens to, but the step itself sets both day and
    // duration via a single onContinue callback.
    id: "day",
    kind: "when",
    question: "When?",
    options: [],
  },
];

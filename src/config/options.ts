// Questionnaire step definitions. Most step options are derived from the
// canonical taxonomy configs (`neighborhoods.ts`, `vibes.ts`, `budgets.ts`)
// so adding a value means touching the taxonomy file, not this one.
//
// The `occasion` step is hand-written because it intentionally groups the
// `first-date` and `second-date` taxonomy values into a single "First /
// Second Date" card — that grouping is a UX decision and doesn't belong in
// the taxonomy config.

import { QuestionStep } from "@/types";
import { NEIGHBORHOODS } from "@/config/neighborhoods";
import { VIBES } from "@/config/vibes";
import { BUDGETS } from "@/config/budgets";

export const questionSteps: QuestionStep[] = [
  {
    id: "occasion",
    kind: "cards",
    question: "What kind of night is this?",
    options: [
      { value: "first-date", label: "First / Second Date", description: "Make it count" },
      { value: "dating", label: "Dating", description: "You know each other" },
      { value: "established", label: "Established Couple", description: "Surprise them" },
      { value: "friends", label: "Friends Night Out", description: "No rules" },
      { value: "solo", label: "Solo Exploration", description: "Treat yourself" },
    ],
  },
  {
    id: "neighborhoods",
    kind: "pills",
    question: "Where do you want to be?",
    options: NEIGHBORHOODS.map((n) => ({ value: n.slug, label: n.shortLabel })),
  },
  {
    id: "budget",
    kind: "cards",
    question: "How are we feeling tonight?",
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
    id: "day",
    kind: "day",
    question: "Which day?",
    options: [],
  },
  {
    id: "startTime",
    kind: "time",
    question: "When?",
    options: [],
  },
];

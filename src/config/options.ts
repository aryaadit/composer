import { QuestionStep } from "@/types";

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
      { value: "solo", label: "Solo", description: "Just me" },
    ],
  },
  {
    id: "neighborhoods",
    kind: "pills",
    question: "Where do you want to be?",
    options: [
      { value: "west-village", label: "West Village" },
      { value: "east-village-les", label: "East Village / LES" },
      { value: "soho-nolita", label: "SoHo / Nolita" },
      { value: "williamsburg", label: "Williamsburg" },
      { value: "midtown-hells-kitchen", label: "Midtown / HK" },
      { value: "upper-west-side", label: "Upper West Side" },
    ],
  },
  {
    id: "budget",
    kind: "cards",
    question: "How are we spending tonight?",
    options: [
      { value: "casual", label: "$ Casual", description: "Good times, low key" },
      { value: "nice-out", label: "$$ Nice Out", description: "A proper night" },
      { value: "splurge", label: "$$$ Splurge", description: "Go all in" },
      { value: "no-preference", label: "No Preference", description: "Surprise me" },
    ],
  },
  {
    id: "vibe",
    kind: "cards",
    question: "What's the energy?",
    options: [
      { value: "food-forward", label: "Food-Forward", description: "The meal is the move" },
      { value: "drinks-led", label: "Drinks-Led", description: "Bars & cocktails" },
      { value: "activity-food", label: "Activity + Food", description: "Do something first" },
      { value: "walk-explore", label: "Walk & Explore", description: "Wander the city" },
      { value: "mix-it-up", label: "Mix It Up", description: "A bit of everything" },
    ],
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

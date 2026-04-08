import { QuestionStep } from "@/types";

export const questionSteps: QuestionStep[] = [
  {
    id: "occasion",
    question: "What kind of night is this?",
    options: [
      { value: "first-date", label: "First Date", description: "Make it count" },
      { value: "second-date", label: "Second Date", description: "Keep the momentum" },
      { value: "dating", label: "Dating", description: "You know each other" },
      { value: "established", label: "Established Couple", description: "Surprise them" },
      { value: "friends", label: "Friends Night Out", description: "No rules" },
      { value: "solo", label: "Solo Exploration", description: "Treat yourself" },
    ],
  },
  {
    id: "neighborhood",
    question: "Where do you want to be?",
    options: [
      { value: "west-village", label: "West Village", description: "Charming & classic" },
      { value: "east-village-les", label: "East Village / LES", description: "Edgy & alive" },
      { value: "soho-nolita", label: "SoHo / Nolita", description: "Chic & curated" },
      { value: "williamsburg", label: "Williamsburg", description: "Brooklyn energy" },
      { value: "midtown-hells-kitchen", label: "Midtown / Hell's Kitchen", description: "Big night vibes" },
      { value: "upper-west-side", label: "Upper West Side", description: "Uptown elegance" },
      { value: "surprise-me", label: "Surprise Me", description: "We'll pick the best" },
    ],
  },
  {
    id: "budget",
    question: "How are we feeling tonight?",
    options: [
      { value: "casual", label: "$ Casual", description: "Good times, low key" },
      { value: "nice-out", label: "$$ Nice Out", description: "A proper night" },
      { value: "splurge", label: "$$$ Splurge", description: "Go all in" },
      { value: "no-preference", label: "Don't care", description: "Just make it great" },
    ],
  },
  {
    id: "vibe",
    question: "What's the energy?",
    options: [
      { value: "food-forward", label: "Food-Forward", description: "The meal is the move" },
      { value: "drinks-led", label: "Drinks-Led", description: "Bars & cocktails" },
      { value: "activity-food", label: "Activity + Food", description: "Do something first" },
      { value: "walk-explore", label: "Walk & Explore", description: "Wander the city" },
      { value: "mix-it-up", label: "Mix It Up", description: "A bit of everything" },
    ],
  },
];

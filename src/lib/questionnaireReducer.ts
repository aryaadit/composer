import { QuestionnaireAnswers } from "@/types";

export type Status = "answering" | "loading";

export interface State {
  currentStep: number;
  direction: 1 | -1;
  answers: Partial<QuestionnaireAnswers>;
  status: Status;
}

export type Action =
  | { type: "SET_FIELD"; field: keyof QuestionnaireAnswers; value: unknown; advance?: boolean }
  | { type: "SET_FIELDS"; values: Partial<QuestionnaireAnswers>; advance?: boolean }
  | { type: "DESELECT"; field: keyof QuestionnaireAnswers }
  | { type: "BACK" }
  | { type: "SET_LOADING" };

export const initialState: State = {
  currentStep: 0,
  direction: 1,
  answers: {},
  status: "answering",
};

export function questionnaireReducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_FIELD":
      return {
        ...state,
        answers: { ...state.answers, [action.field]: action.value },
        direction: 1,
        currentStep: action.advance ? state.currentStep + 1 : state.currentStep,
      };
    case "SET_FIELDS":
      return {
        ...state,
        answers: { ...state.answers, ...action.values },
        direction: 1,
        currentStep: action.advance ? state.currentStep + 1 : state.currentStep,
      };
    case "DESELECT": {
      const next = { ...state.answers };
      delete next[action.field];
      return { ...state, answers: next };
    }
    case "BACK":
      return {
        ...state,
        direction: -1,
        currentStep: Math.max(0, state.currentStep - 1),
      };
    case "SET_LOADING":
      return { ...state, status: "loading" };
    default:
      return state;
  }
}

export const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({
    x: direction > 0 ? -80 : 80,
    opacity: 0,
  }),
};

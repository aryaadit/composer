# Night-CTA Classification — 2026-05-22

## Goal

Generalize "night"-specific CTAs to time-block-neutral language so morning / afternoon itineraries don't read awkwardly. Preserve narrative copy, taxonomy slugs/labels, time-of-day labels, and model-facing strings.

## Method

```
rg -ni "\bnight\b" src/ -g '*.ts' -g '*.tsx'
```

Every match classified as **CHANGE** (CTA / button / action label) or **KEEP** (narrative, taxonomy, time-of-day, model-facing, code comment) with rationale.

---

## Proposed changes (5)

Single commit, gated on user approval.

| # | File | Line | Old | New |
|---|------|------|-----|-----|
| 1 | [src/components/questionnaire/WhenStep.tsx](src/components/questionnaire/WhenStep.tsx#L170) | 170 | `Build my night` | `Build my plan` |
| 2 | [src/components/itinerary/ActionBar.tsx](src/components/itinerary/ActionBar.tsx#L145) | 145 | `New Night` (button label) | `New plan` |
| 3 | [src/components/itinerary/ActionBar.tsx](src/components/itinerary/ActionBar.tsx#L123) | 123 | `New Night` (inline comment matching the label) | `New plan` |
| 4 | [src/components/itinerary/ItineraryView.tsx](src/components/itinerary/ItineraryView.tsx#L155) | 155 | `Plan a new night →` | `Plan another →` |
| 5 | [src/components/itinerary/ItineraryView.tsx](src/components/itinerary/ItineraryView.tsx#L31) | 31 | JSDoc reference to `"Plan a new night →"` | `"Plan another →"` |

Suggested commit message:

```
chore(copy): generalize "night" CTAs to time-block-neutral language
```

---

## Explicitly NOT changing

### Taxonomy labels (slugs are stable, display labels are user-chosen, do not collapse)

- [src/config/options.ts:27](src/config/options.ts#L27) — `"Date Night"` option label (preserved per 2026-05-21 copy commit).
- [src/config/options.ts:28](src/config/options.ts#L28) — `"Friends Night Out"` option label (preserved per 2026-05-21 copy commit).
- [src/config/occasions.ts:35-36](src/config/occasions.ts#L35-L36) — `OCCASION_BUCKET_LABELS` taxonomy.
- [src/config/onboarding.ts:33](src/config/onboarding.ts#L33) — deprecated `CONTEXT_OPTIONS` taxonomy whitelist.

### Narrative / brand copy (intentional voice)

- [src/components/home/HomeScreen.tsx:43](src/components/home/HomeScreen.tsx#L43) — `"Good night"` greeting (time-of-day branch).
- [src/components/home/HomeScreen.tsx:85](src/components/home/HomeScreen.tsx#L85) — `"Compose your night."` hero.
- [src/components/home/HomeScreen.tsx:114](src/components/home/HomeScreen.tsx#L114) — empty state copy.
- [src/components/questionnaire/StepLoading.tsx:28-37](src/components/questionnaire/StepLoading.tsx#L28-L37) — loading messages (narrative; rotate during compose).
- [src/lib/claude.ts:77](src/lib/claude.ts#L77) — Gemini-failure fallback title (poetic).
- [src/components/shared/SavedPlanRow.tsx:25](src/components/shared/SavedPlanRow.tsx#L25) — `"Saved night"` default title for untitled saves.
- [src/app/itinerary/saved/[id]/page.tsx:56](src/app/itinerary/saved/[id]/page.tsx#L56) — same default title.
- [src/app/itinerary/page.tsx:204](src/app/itinerary/page.tsx#L204) — regenerate error toast.
- [src/app/page.tsx:102](src/app/page.tsx#L102), [src/app/layout.tsx:26,30](src/app/layout.tsx#L26) — marketing copy (already touched in earlier copy commit).

### Time-of-day labels (literal, not framing)

- [src/lib/itinerary/time-blocks.ts:47](src/lib/itinerary/time-blocks.ts#L47) — `"Late Night"` time-block label (refers to a specific hours range, not the itinerary frame).

### Model-facing strings (not user-visible)

- [src/config/prompts.ts](src/config/prompts.ts) — Gemini system prompt + framing. Founder-signed-off (per CLAUDE.md); do not change without approval.

### Code comments

All `// …` and `/** … */` references to "night" in implementation files left as-is unless they document a string we're changing (item #3 and #5 above).

---

## Borderline — flagged for awareness, not changing this pass

- [src/config/options.ts:24](src/config/options.ts#L24) — questionnaire header `question: "What kind of night is this?"`. Reads awkward for morning users but it's a question prompt, not a CTA. Founders may want to revisit, but not in this scope.
- [src/config/prompts.ts:119](src/config/prompts.ts#L119) — Gemini user-prompt header `"NYC night-out itinerary"`. Model-facing, biases output toward night framing. Changing this would shift output voice; needs founder approval per Gemini prompt policy.

---

## Status

Awaiting user approval on the 5 changes above. Quoted gate from the user: *"Show me the file + line + old → new. I'll approve before commit. Don't commit yet. After my approval: one commit, one-line message."*

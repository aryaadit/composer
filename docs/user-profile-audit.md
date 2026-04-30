# User Profile Audit

**Date:** 2026-04-29
**Scope:** Stale data + name content review on `composer_users`
**User count:** 25

## Summary

- **Stale data: zero hits.** All `context`, `drinks`, and `dietary` values match current taxonomy.
- **`favorite_hoods` is empty for all 25 users** — wiped after the picker was hidden from onboarding/profile (2026-04-28).
- **One blank `name`** — admin user `4b341ec8` has `name = ""`. Likely an account created before name was required.
- **One profanity hit** in `name`: user `57c857e3` named "Bitch".
- **Two test/duplicate names** worth flagging for human review: `Reid2` and `Adit Phone Test`.

## Stale Data

### favorite_hoods

Total users with populated value: **0** (all empty arrays).

Audit not applicable. The picker was removed from onboarding and profile on 2026-04-28; existing data was cleared in the same pass. New users won't write to this column until the picker is re-introduced (potentially in a different form).

### context

Total users with populated value: 25 (all users)

Distinct values seen:
| Value | Users |
|---|---|
| `relationship` | 11 |
| `dating` | 8 |
| `friends` | 9 |
| `solo` | 4 |
| `family` | 0 |

**Stale values: none.** All values are in `CONTEXT_OPTIONS` ids: `dating`, `relationship`, `friends`, `family`, `solo`.

Note: `family` has zero users — every other context has selections. Worth knowing for product purposes; not a data quality issue.

### dietary

Total users with populated value: 24 (one user has empty `dietary`)

Distinct values seen:
| Value | Users |
|---|---|
| `none` | 21 |
| `vegetarian` | 4 |
| (empty) | 1 (Adit Phone Test) |

**Stale values: none.** All values are in `DIETARY_OPTIONS`: `none`, `vegetarian`, `vegan`, `halal`, `kosher`, `gluten-free`.

Note: `vegan`, `halal`, `kosher`, `gluten-free` have zero users. Either no one has those restrictions, or they're skipping past the question and defaulting to `none`.

### drinks

Total users with populated value: 25

Distinct values seen:
| Value | Users |
|---|---|
| `yes` | 11 |
| `sometimes` | 13 |
| `no` | 1 |

**Stale values: none.** All values are in `DRINK_OPTIONS`: `yes`, `sometimes`, `no`.

### Edge cases

- **Empty `name`**: User `4b341ec8-c841-48d1-ac26-14383db74f4c` (admin, created 2026-04-16) has `name = ""`. The current onboarding flow requires non-empty name; this account predates that requirement.
- **Empty `dietary` array**: User `72801110` ("Adit Phone Test") has `dietary = []` instead of `["none"]`. The onboarding flow now defaults to `["none"]` when the user picks "No restrictions"; this account either skipped the question or was created before that defaulting logic.
- **No duplicate values within arrays observed.**
- **No type anomalies** — all dietary/context arrays are strings.

## Name Content Review

### Flagged names: 7

| User ID | Name | Concern | Recommendation |
|---|---|---|---|
| `57c857e3-2d4b-46ff-b439-7bacaef417a3` | `Bitch` | Profanity | Rename to a real name (or delete account if test data) |
| `4b341ec8-c841-48d1-ac26-14383db74f4c` | `` (empty) | Empty/missing | Set a name or treat as "Friend" fallback in UI |
| `ddfa2ba2-da23-436f-8b42-27cdc538a7d3` | `R` | Single character | Likely a real but very short name. Consider raising minimum to 2 chars. Ignore if user is verified. |
| `1d2cdcad-5ad6-4b98-94e4-c9b8f3eb71cf` | `Jotain` | Suspicious — "jotain" is Finnish for "something." Possible test/throwaway. | Verify with auth records (phone vs email signup) before action |
| `6ad9bb61-dfb8-4a19-8f5c-c60f87d5332b` | `Reid2` | Numeric suffix — known test account for Reid | Ignore (Reid's secondary test account, intentional) |
| `72801110-3462-4c89-a96f-9840952c046c` | `Adit Phone Test` | Test account, named explicitly | Ignore (your own test account, intentional) |
| `7f5e15af-d1c4-49b0-88fc-c37e46770ede` | `Bilbo` | Fictional character | Ignore — could be a nickname or a friend's joke handle |

No all-caps names. No "Test User" / "John Doe" exact matches. No racial or sexual slurs.

### False-positive watch

- `R` (single character) — could be a genuine preference (some people go by their initial). Not necessarily fake.
- `Bilbo` — fictional, but plenty of real people go by handles or nicknames. Not necessarily a fake account.
- `Jotain` — translates to "something" in Finnish. Could be a placeholder; could also be a real name. Worth a glance at the associated auth record (phone? email?) before action.

## Recommended Actions

### Stale data cleanup SQL

**None required.** Every populated value matches current taxonomy. The only normalization candidate is the empty `dietary` array → `["none"]` for consistency:

```sql
-- Optional: normalize empty dietary arrays to explicit "none"
-- (matches the default behavior of new signups)
UPDATE composer_users
SET dietary = ARRAY['none']
WHERE dietary = ARRAY[]::text[] OR dietary IS NULL;
```

### Input validation gaps

The `name` field has no application-layer validation beyond non-empty (and that's not even enforced for legacy accounts). Two gaps:

1. **`src/lib/auth.ts`** (`upsertProfile`) — should reject empty name and trim whitespace. Currently `name.trim() || "Friend"` in `OnboardingFlow.tsx` — that's UI-side defaulting, not validation.
2. **`src/app/profile/_components/AccountDetails.tsx`** — name editing path (if it exists) should also enforce min length of 2 and reject all-whitespace inputs.

The `context`, `dietary`, and `drinks` fields are write-protected by the UI dropdowns (no free text), so they're hard to corrupt from the client. Server-side validation would be defense-in-depth — currently `useFieldEditor` writes whatever the draft contains to Supabase. Worth adding a whitelist check in the API path if a future user manipulates the network request.

### Content moderation

For pre-launch with 25 users, **manual review is sufficient**. Consider adding light filtering at signup if/when the user count grows:

- **Lightweight option:** `bad-words` npm package — small wordlist, minimal dependency, easy to integrate in `upsertProfile` and the profile name-edit flow.
- **Heavier option:** `obscenity` package — supports l33t-speak normalization (e.g., `b!tch` would still be caught), Trie-based, more accurate. Worth it once the scale justifies it.
- **Skip entirely** if your moderation strategy is "we delete bad-actor accounts when reported" — fine for an invite-only beta.

If filtering is added, validation should live in:
- `src/lib/auth.ts` (`upsertProfile`) — covers onboarding signup
- `src/app/profile/_components/AccountDetails.tsx` — if name editing exists there
- A new helper `src/lib/profanity.ts` (canonical) so the same check is used everywhere a name is written

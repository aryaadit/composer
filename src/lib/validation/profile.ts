// Server-side profile payload validation.
//
// The canonical entry point for profile writes is upsertProfile() in
// lib/auth.ts (called from onboarding completion). Per-field edits in
// the profile page write directly to Supabase from the browser via
// useFieldEditor — those bypass this validator. RLS or new API routes
// would be needed to close that gap; flagged but out of scope here.
//
// Field-allowed-values are read from the canonical taxonomy modules so
// this validator stays in lockstep when taxonomy changes.

import { CONTEXT_OPTIONS, DRINK_OPTIONS, DIETARY_OPTIONS } from "@/config/onboarding";
import { validateName } from "@/lib/profanity";

export interface ProfileValidationError {
  field: string;
  message: string;
}

export interface ProfilePayload {
  name?: string;
  context?: string[];
  dietary?: string[];
  drinks?: string | null;
  // favorite_hoods intentionally not validated:
  // legacy data may contain stale slugs, picker UI is hidden.
}

/**
 * Validate a partial profile update payload. Returns array of errors
 * (empty = valid). Only fields present in the payload are checked.
 *
 * @param payload - Partial profile fields to validate.
 * @returns Empty array if valid; one error per invalid field/value otherwise.
 */
export function validateProfilePayload(payload: ProfilePayload): ProfileValidationError[] {
  const errors: ProfileValidationError[] = [];

  if (payload.name !== undefined) {
    const err = validateName(payload.name);
    if (err) errors.push({ field: "name", message: err });
  }

  if (payload.context !== undefined) {
    const allowed = new Set(CONTEXT_OPTIONS.map((c) => c.id));
    for (const v of payload.context) {
      if (!allowed.has(v)) {
        errors.push({ field: "context", message: `Invalid context: ${v}` });
      }
    }
  }

  if (payload.dietary !== undefined) {
    const allowed = new Set(DIETARY_OPTIONS.map((d) => d.id));
    for (const v of payload.dietary) {
      if (!allowed.has(v)) {
        errors.push({ field: "dietary", message: `Invalid dietary value: ${v}` });
      }
    }
  }

  if (payload.drinks !== undefined && payload.drinks !== null) {
    const allowed = new Set(DRINK_OPTIONS.map((d) => d.id as string));
    if (!allowed.has(payload.drinks)) {
      errors.push({ field: "drinks", message: `Invalid drinks value: ${payload.drinks}` });
    }
  }

  return errors;
}

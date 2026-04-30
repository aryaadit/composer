// PATCH /api/profile — server-validated profile updates.
//
// The legitimate write path for composer_users field edits. Browser
// clients call this instead of writing to Supabase directly. After the
// RLS lockdown migration, direct browser writes are blocked entirely
// and only the service-role client used here can write.
//
// Auth: requires a valid session cookie. The user can only update
// their own row (id is derived from the session, never trusted from the
// payload).

import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase";
import { validateProfilePayload } from "@/lib/validation/profile";

interface ProfileUpdatePayload {
  name?: string;
  context?: string[];
  dietary?: string[];
  drinks?: string;
  favorite_hoods?: string[];
}

export async function PATCH(request: Request) {
  // 1. Authenticate via the session cookie (auth-aware client).
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse body
  let body: ProfileUpdatePayload;
  try {
    body = (await request.json()) as ProfileUpdatePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 3. Validate against current taxonomy
  const errors = validateProfilePayload(body);
  if (errors.length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  // 4. Build a partial update — only include fields the caller sent.
  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = body.name.trim();
  if (body.context !== undefined) update.context = body.context;
  if (body.dietary !== undefined) update.dietary = body.dietary;
  if (body.drinks !== undefined) update.drinks = body.drinks;
  if (body.favorite_hoods !== undefined) update.favorite_hoods = body.favorite_hoods;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // 5. Write via service role (bypasses RLS — section 3 locks user-level
  //    UPDATE down so this is the only path that succeeds).
  const serviceClient = getServiceSupabase();
  const { error: updateError } = await serviceClient
    .from("composer_users")
    .update(update)
    .eq("id", user.id);

  if (updateError) {
    console.error("[/api/profile] update failed:", updateError.message);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

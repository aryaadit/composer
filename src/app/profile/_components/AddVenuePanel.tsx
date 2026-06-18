"use client";

// Admin "Add venue" panel.
//
// Two-step state machine, same shape and styling as SyncSection
// in AdminSection.tsx:
//   1. operator pastes a Google Maps link or place_id, clicks Run
//   2. preview comes back -> read-only summary of facts + draft
//      taxonomy + draft editorial, plus low_confidence / dropped /
//      neighborhood_candidates diagnostic flags
//   3. operator clicks Apply -> POST apply, the route appends the
//      previewed row to the staging "NYC New Venues Review" tab
//      for human review in the sheet
//
// v1 keeps the preview read-only. Final edits happen in the sheet,
// where the founders have the full column context (and where
// neighborhood / vibe / curation_note voice already get reviewed
// before the row promotes into "NYC Venues").
//
// Wraps the POST in a callRoute() helper that mirrors AdminSection's
// pattern: never throws on non-2xx, always returns the typed
// response so the state machine can narrow on (ok, kind).

import { useState } from "react";

type AddVenueRequest =
  | { action: "preview"; input: string }
  | { action: "apply"; row: Record<string, string> };

interface DuplicateInCatalogResponse {
  ok: false;
  kind: "duplicate_in_catalog";
  venue_id: string;
  name: string;
}

interface DuplicateInReviewResponse {
  ok: false;
  kind: "duplicate_in_review";
  row_number: number;
  venue_id: string;
  name: string;
}

interface VocabUnavailableResponse {
  ok: false;
  kind: "vocab_unavailable";
  message: string;
}

interface PreviewSuccess {
  ok: true;
  kind: "preview";
  row: Record<string, string>;
  proposed_venue_id: string | null;
  flags: {
    dropped: Array<{ field: string; value: string; reason: string }>;
    low_confidence: string[];
    neighborhood_candidates: Array<{ slug: string; label: string; km: number }>;
    id_compute_error: string | null;
  };
  place_summary: {
    name: string;
    formatted_address: string;
    google_place_id: string;
    google_maps_uri: string;
  };
}

interface PreviewFailed {
  ok: false;
  kind: "preview_failed";
  reason: string;
  message: string;
}

interface ApplySuccess {
  ok: true;
  kind: "apply_success";
  sheet_tab: string;
  row_number: number;
  spreadsheet_url: string | null;
  venue_id_written: string;
}

interface ApplyFailed {
  ok: false;
  kind:
    | "apply_failed"
    | "sheet_write_forbidden"
    | "review_tab_missing"
    | "headers_unavailable";
  message: string;
}

interface AuthFailed {
  ok: false;
  kind: "auth_failed";
  reason: "unauthenticated" | "not_admin";
}

interface InvalidRequest {
  ok: false;
  kind: "invalid_request";
  error: string;
}

type AddVenueResponse =
  | PreviewSuccess
  | PreviewFailed
  | VocabUnavailableResponse
  | DuplicateInCatalogResponse
  | DuplicateInReviewResponse
  | ApplySuccess
  | ApplyFailed
  | AuthFailed
  | InvalidRequest;

type PanelState =
  | { kind: "idle" }
  | { kind: "loading_preview" }
  | { kind: "preview_ready"; data: PreviewSuccess }
  | { kind: "preview_failed"; data: PreviewFailed }
  | { kind: "vocab_unavailable"; data: VocabUnavailableResponse }
  | { kind: "duplicate_in_catalog"; data: DuplicateInCatalogResponse }
  | { kind: "duplicate_in_review"; data: DuplicateInReviewResponse }
  | { kind: "loading_apply"; preview: PreviewSuccess }
  | { kind: "apply_success"; data: ApplySuccess }
  | { kind: "apply_failed"; data: ApplyFailed }
  | { kind: "auth_failed"; reason: "unauthenticated" | "not_admin" };

async function callRoute(req: AddVenueRequest): Promise<AddVenueResponse> {
  const res = await fetch("/api/admin/add-venue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  // Mirror sync-venues: the route always returns the typed response
  // shape; non-2xx is expected for failed / blocked / auth states
  // and the JSON still parses cleanly.
  return (await res.json()) as AddVenueResponse;
}

// ─── Fact / editorial grouping for the preview render ────────────

const FACT_FIELDS = [
  "name",
  "address",
  "latitude",
  "longitude",
  "google_place_id",
  "maps_url",
  "google_phone",
  "google_rating",
  "google_review_count",
  "google_types",
  "business_status",
  "price_tier",
  "outdoor_seating",
  "dog_friendly",
  "kid_friendly",
  "wheelchair_accessible",
  "hours",
  "split_hours",
  "last_verified",
  "enriched",
];

const EDITORIAL_FIELDS = [
  "neighborhood",
  "category",
  "vibe_tags",
  "occasion_tags",
  "stop_roles",
  "duration_hours",
  "reservation_difficulty",
  "reservation_platform",
  "reservation_url",
  "resy_slug",
  "happy_hour",
  "quality_score",
  "awards",
  "curation_note",
  "signature_order",
];

export function AddVenuePanel() {
  const [input, setInput] = useState("");
  const [state, setState] = useState<PanelState>({ kind: "idle" });

  const handlePreview = async () => {
    setState({ kind: "loading_preview" });
    try {
      const res = await callRoute({ action: "preview", input });
      if (res.ok === true && res.kind === "preview") {
        setState({ kind: "preview_ready", data: res });
      } else if (res.ok === false && res.kind === "duplicate_in_catalog") {
        setState({ kind: "duplicate_in_catalog", data: res });
      } else if (res.ok === false && res.kind === "duplicate_in_review") {
        setState({ kind: "duplicate_in_review", data: res });
      } else if (res.ok === false && res.kind === "vocab_unavailable") {
        setState({ kind: "vocab_unavailable", data: res });
      } else if (res.ok === false && res.kind === "preview_failed") {
        setState({ kind: "preview_failed", data: res });
      } else if (res.ok === false && res.kind === "auth_failed") {
        setState({ kind: "auth_failed", reason: res.reason });
      } else if (res.ok === false && res.kind === "invalid_request") {
        setState({
          kind: "preview_failed",
          data: {
            ok: false,
            kind: "preview_failed",
            reason: "invalid_request",
            message: res.error,
          },
        });
      }
    } catch (err) {
      setState({
        kind: "preview_failed",
        data: {
          ok: false,
          kind: "preview_failed",
          reason: "network",
          message: (err as Error).message,
        },
      });
    }
  };

  const handleApply = async (preview: PreviewSuccess) => {
    setState({ kind: "loading_apply", preview });
    try {
      const res = await callRoute({ action: "apply", row: preview.row });
      if (res.ok === true && res.kind === "apply_success") {
        setState({ kind: "apply_success", data: res });
      } else if (res.ok === false && res.kind === "duplicate_in_catalog") {
        setState({ kind: "duplicate_in_catalog", data: res });
      } else if (res.ok === false && res.kind === "duplicate_in_review") {
        setState({ kind: "duplicate_in_review", data: res });
      } else if (res.ok === false && res.kind === "auth_failed") {
        setState({ kind: "auth_failed", reason: res.reason });
      } else if (
        res.ok === false &&
        (res.kind === "apply_failed" ||
          res.kind === "sheet_write_forbidden" ||
          res.kind === "review_tab_missing" ||
          res.kind === "headers_unavailable")
      ) {
        setState({ kind: "apply_failed", data: res });
      } else if (res.ok === false && res.kind === "invalid_request") {
        setState({
          kind: "apply_failed",
          data: { ok: false, kind: "apply_failed", message: res.error },
        });
      }
    } catch (err) {
      setState({
        kind: "apply_failed",
        data: {
          ok: false,
          kind: "apply_failed",
          message: (err as Error).message,
        },
      });
    }
  };

  const reset = () => {
    setInput("");
    setState({ kind: "idle" });
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-sans text-xs tracking-widest uppercase text-muted mb-1">
          Add venue
        </h3>
        <p className="font-sans text-xs text-warm-gray leading-relaxed max-w-2xl">
          Paste a Google Maps link or a Places place_id. The preview drafts
          taxonomy + editorial fields from Google Places plus Gemini, then the
          row lands in the &ldquo;NYC New Venues Review&rdquo; tab for human
          review before it promotes into the live catalog.
        </p>
      </div>

      <PanelBody
        input={input}
        setInput={setInput}
        state={state}
        onPreview={handlePreview}
        onApply={handleApply}
        onReset={reset}
      />
    </div>
  );
}

function PanelBody({
  input,
  setInput,
  state,
  onPreview,
  onApply,
  onReset,
}: {
  input: string;
  setInput: (s: string) => void;
  state: PanelState;
  onPreview: () => void;
  onApply: (preview: PreviewSuccess) => void;
  onReset: () => void;
}) {
  if (state.kind === "loading_preview") {
    return <SubduedNote>Looking up the venue…</SubduedNote>;
  }
  if (state.kind === "preview_failed") {
    return (
      <>
        <InputRow input={input} setInput={setInput} onSubmit={onPreview} />
        <ErrorBlock
          title="Preview failed"
          message={`${state.data.reason}: ${state.data.message}`}
        />
      </>
    );
  }
  if (state.kind === "vocab_unavailable") {
    return (
      <>
        <InputRow input={input} setInput={setInput} onSubmit={onPreview} />
        <ErrorBlock
          title="Master Reference unavailable"
          message={state.data.message}
        />
      </>
    );
  }
  if (state.kind === "duplicate_in_catalog") {
    return (
      <>
        <DuplicateInCatalogBanner data={state.data} />
        <button
          type="button"
          onClick={onReset}
          className="font-sans text-xs text-muted hover:text-charcoal transition-colors"
        >
          ← Start over
        </button>
      </>
    );
  }
  if (state.kind === "duplicate_in_review") {
    return (
      <>
        <DuplicateInReviewBanner data={state.data} />
        <button
          type="button"
          onClick={onReset}
          className="font-sans text-xs text-muted hover:text-charcoal transition-colors"
        >
          ← Start over
        </button>
      </>
    );
  }
  if (state.kind === "preview_ready") {
    return (
      <PreviewBlock
        preview={state.data}
        onApply={() => onApply(state.data)}
        onReset={onReset}
      />
    );
  }
  if (state.kind === "loading_apply") {
    return <SubduedNote>Adding to the review tab…</SubduedNote>;
  }
  if (state.kind === "apply_success") {
    return <ApplySuccessBlock data={state.data} onReset={onReset} />;
  }
  if (state.kind === "apply_failed") {
    return (
      <>
        <ErrorBlock
          title={failedTitle(state.data.kind)}
          message={state.data.message}
        />
        <PrimaryButton label="Start over" onClick={onReset} />
      </>
    );
  }
  if (state.kind === "auth_failed") {
    return (
      <ErrorBlock
        title="Auth failed"
        message={
          state.reason === "unauthenticated"
            ? "You're signed out. Sign back in and reload."
            : "Your account is not flagged as admin."
        }
      />
    );
  }
  // idle
  return <InputRow input={input} setInput={setInput} onSubmit={onPreview} />;
}

function failedTitle(
  kind: ApplyFailed["kind"],
): string {
  switch (kind) {
    case "sheet_write_forbidden":
      return "Sheets write forbidden";
    case "review_tab_missing":
      return "Review tab missing";
    case "headers_unavailable":
      return "Headers unavailable";
    case "apply_failed":
    default:
      return "Apply failed";
  }
}

function InputRow({
  input,
  setInput,
  onSubmit,
}: {
  input: string;
  setInput: (s: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center max-w-2xl">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="https://maps.app.goo.gl/... or ChIJ..."
        className="font-sans text-sm px-3 py-1.5 border border-border rounded-md flex-1 focus:outline-none focus:border-burgundy"
      />
      <PrimaryButton
        label="Run"
        onClick={onSubmit}
        disabled={input.trim().length === 0}
      />
    </div>
  );
}

function PreviewBlock({
  preview,
  onApply,
  onReset,
}: {
  preview: PreviewSuccess;
  onApply: () => void;
  onReset: () => void;
}) {
  const { row, flags, place_summary, proposed_venue_id } = preview;
  return (
    <div className="space-y-4">
      <div className="border border-border rounded-md p-4 bg-cream-tint/30">
        <h4 className="font-sans text-xs tracking-widest uppercase text-muted mb-2">
          Place
        </h4>
        <p className="font-serif text-base text-charcoal">
          {place_summary.name || "(no name)"}
        </p>
        <p className="font-sans text-xs text-warm-gray mt-1">
          {place_summary.formatted_address}
        </p>
        <p className="font-mono text-[10px] text-muted mt-2">
          {place_summary.google_place_id}
        </p>
      </div>

      <ProposedVenueIdBlock
        proposedVenueId={proposed_venue_id}
        idComputeError={flags.id_compute_error}
      />

      {flags.low_confidence.length > 0 && (
        <FlagBlock
          tone="warn"
          title="Low confidence fields"
          body={`${flags.low_confidence.join(", ")} — review before applying.`}
        />
      )}
      {flags.dropped.length > 0 && (
        <FlagBlock
          tone="warn"
          title="Dropped values (failed taxonomy validation)"
          body={flags.dropped
            .map((d) => `${d.field}: "${d.value}" (${d.reason})`)
            .join("\n")}
        />
      )}
      {flags.neighborhood_candidates.length > 0 && (
        <FlagBlock
          tone="info"
          title="Nearest neighborhoods by centroid"
          body={flags.neighborhood_candidates
            .map((c) => `${c.label} (${c.slug}) — ${c.km} km`)
            .join("\n")}
        />
      )}

      <FieldGroup title="Facts (from Google Places)" row={row} keys={FACT_FIELDS} />
      <FieldGroup title="Editorial (drafted by Gemini)" row={row} keys={EDITORIAL_FIELDS} />

      <div className="flex gap-3 items-center">
        <PrimaryButton label="Add to review tab" onClick={onApply} />
        <button
          type="button"
          onClick={onReset}
          className="font-sans text-xs text-muted hover:text-charcoal transition-colors"
        >
          ← Start over
        </button>
      </div>
    </div>
  );
}

function FieldGroup({
  title,
  row,
  keys,
}: {
  title: string;
  row: Record<string, string>;
  keys: string[];
}) {
  return (
    <div>
      <h4 className="font-sans text-xs tracking-widest uppercase text-muted mb-2">
        {title}
      </h4>
      <dl className="grid grid-cols-1 sm:grid-cols-[12rem_1fr] gap-x-4 gap-y-1 text-xs">
        {keys.map((k) => (
          <>
            <dt
              key={`${k}-k`}
              className="font-mono text-muted whitespace-nowrap"
            >
              {k}
            </dt>
            <dd
              key={`${k}-v`}
              className="font-sans text-charcoal whitespace-pre-wrap break-words"
            >
              {row[k] || <span className="text-muted">—</span>}
            </dd>
          </>
        ))}
      </dl>
    </div>
  );
}

/**
 * Prominent banner shown when the place_id is already in the live
 * NYC Venues tab. No Apply button is rendered in this state — the
 * operator should verify it's the same place before deciding what
 * to do next (typically nothing). Read-only.
 */
function DuplicateInCatalogBanner({
  data,
}: {
  data: DuplicateInCatalogResponse;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="border-2 border-burgundy bg-burgundy-tint rounded-md p-5"
    >
      <h4 className="font-serif text-lg text-burgundy mb-2">
        Already in the sheet
      </h4>
      <p className="font-sans text-sm text-charcoal leading-relaxed">
        The &ldquo;NYC Venues&rdquo; tab already has a row for this place_id
        as{" "}
        <span className="font-mono text-burgundy">{data.venue_id || "(no venue_id)"}</span>
        {data.name && (
          <>
            {" "}
            — <span className="font-medium">{data.name}</span>
          </>
        )}
        . Verify it&apos;s the same place before adding.
      </p>
    </div>
  );
}

/**
 * Banner for the staging tab case. A previous preview/apply already
 * staged this venue, so adding again would double-stage. Surfaces
 * the row number so the operator can jump straight to it in the
 * spreadsheet. No Apply button rendered here either.
 */
function DuplicateInReviewBanner({
  data,
}: {
  data: DuplicateInReviewResponse;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="border-2 border-burgundy bg-burgundy-tint rounded-md p-5"
    >
      <h4 className="font-serif text-lg text-burgundy mb-2">
        Already staged for review
      </h4>
      <p className="font-sans text-sm text-charcoal leading-relaxed">
        The &ldquo;NYC New Venues Review&rdquo; tab already has this place_id
        at row <span className="font-mono text-burgundy">{data.row_number}</span>
        {data.name && (
          <>
            {" "}
            ({data.name}
            {data.venue_id && (
              <>
                ,{" "}
                <span className="font-mono">{data.venue_id}</span>
              </>
            )}
            )
          </>
        )}
        . Approve or edit that row in the sheet instead of staging it again.
      </p>
    </div>
  );
}

function ApplySuccessBlock({
  data,
  onReset,
}: {
  data: ApplySuccess;
  onReset: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="border border-burgundy/30 bg-burgundy-tint rounded-md p-4">
        <h4 className="font-sans text-sm font-medium text-burgundy mb-1">
          Added to {data.sheet_tab}
        </h4>
        <p className="font-sans text-xs text-charcoal">
          {data.venue_id_written ? (
            <>
              venue_id{" "}
              <span className="font-mono text-burgundy">
                {data.venue_id_written}
              </span>{" "}
              written.{" "}
            </>
          ) : (
            <>
              venue_id was left blank (could not compute at apply); assign at
              promotion.{" "}
            </>
          )}
          Review and approve the row in the sheet, then run a normal venue
          sync to import it into the live catalog.
          {data.row_number > 0 && ` Row ${data.row_number}.`}
        </p>
        {data.spreadsheet_url && (
          <a
            href={data.spreadsheet_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 font-sans text-xs text-burgundy hover:underline"
          >
            Open spreadsheet →
          </a>
        )}
      </div>
      <PrimaryButton label="Add another" onClick={onReset} />
    </div>
  );
}

/**
 * Prominent line above the FACTS grid: "proposed venue_id: v1482"
 * plus a helper note that it's correct at staging time and may
 * need re-confirmation at promotion. When the route couldn't read
 * the venue_id columns, surfaces the typed failure message instead.
 */
function ProposedVenueIdBlock({
  proposedVenueId,
  idComputeError,
}: {
  proposedVenueId: string | null;
  idComputeError: string | null;
}) {
  if (proposedVenueId) {
    return (
      <div className="border border-burgundy/30 bg-burgundy-tint rounded-md p-3">
        <p className="font-sans text-sm text-charcoal">
          proposed venue_id:{" "}
          <span className="font-mono text-burgundy">{proposedVenueId}</span>
        </p>
        <p className="font-sans text-[11px] text-warm-gray mt-1 leading-relaxed">
          Correct as of staging. Re-confirm at promotion if this row sits in
          the review tab for a while — other applies may have advanced the
          counter in the meantime.
        </p>
      </div>
    );
  }
  return (
    <div className="border border-burgundy/30 bg-burgundy-tint rounded-md p-3">
      <p className="font-sans text-sm text-burgundy font-medium">
        Could not compute venue_id
      </p>
      <p className="font-sans text-[11px] text-warm-gray mt-1 leading-relaxed">
        {idComputeError ?? "Reading the venue_id column failed."} Assign a
        slug at promotion before importing.
      </p>
    </div>
  );
}

function FlagBlock({
  tone,
  title,
  body,
}: {
  tone: "info" | "warn";
  title: string;
  body: string;
}) {
  const cls =
    tone === "warn"
      ? "border-burgundy/30 bg-burgundy-tint"
      : "border-border bg-cream-tint/40";
  return (
    <div className={`border rounded-md p-3 ${cls}`}>
      <h5 className="font-sans text-xs font-medium text-charcoal mb-1">
        {title}
      </h5>
      <pre className="font-sans text-xs text-warm-gray whitespace-pre-wrap leading-relaxed">
        {body}
      </pre>
    </div>
  );
}

function ErrorBlock({ title, message }: { title: string; message: string }) {
  return (
    <div className="border border-burgundy/30 bg-burgundy-tint rounded-md p-4">
      <h4 className="font-sans text-sm font-medium text-burgundy mb-1">
        {title}
      </h4>
      <pre className="font-mono text-xs text-charcoal whitespace-pre-wrap">
        {message}
      </pre>
    </div>
  );
}

function SubduedNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-sans text-xs text-muted italic">{children}</p>
  );
}

function PrimaryButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="font-sans text-sm font-medium text-cream bg-burgundy hover:bg-burgundy-light transition-colors px-4 py-1.5 rounded-md disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
    >
      {label}
    </button>
  );
}

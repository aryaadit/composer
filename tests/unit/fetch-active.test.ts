// fetchActiveVenues pagination + count-cross-check.
//
// Mocks the supabase client at @/lib/supabase. The helper makes two
// distinct call shapes against from("composer_venues_v2"):
//   1. Paged reads: .select("*").eq("active", true).order("id", asc).range(lo, hi)
//   2. Head-true count: .select("*", { count: "exact", head: true }).eq("active", true)
// The chain builder in buildClient returns thenable terminals (range
// and the eq after head:true) so the helper can await each.

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  getSupabase: vi.fn(),
}));

import { getSupabase } from "@/lib/supabase";
import { fetchActiveVenues } from "@/lib/venues/fetch-active";

interface PageSpec {
  rows: { id: string }[];
  error?: { message: string } | null;
}

interface CountSpec {
  count: number | null;
  error?: { message: string } | null;
}

/**
 * Build a mock supabase client whose .from("composer_venues_v2") returns
 * a chain that:
 *   - For range queries, dequeues a page from `pages` in order.
 *   - For head:true counts, returns `countSpec`.
 *
 * The order param is captured into `captured.order` so the test can
 * assert .order("id") is applied.
 */
function buildClient(pages: PageSpec[], countSpec: CountSpec) {
  const captured: { order?: { col: string; ascending: boolean } } = {};
  const pageQueue = [...pages];

  const fromImpl = () => {
    // Two distinct chain entry points are exercised: paginated select
    // and head-true count select. The shape of supabase-js means
    // `select(arg, opts?)` is the SAME method for both; we branch on
    // whether opts.head was passed.
    return {
      select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) {
          // Count chain: select(*, {count, head:true}).eq("active", true)
          return {
            eq: () =>
              Promise.resolve({
                data: null,
                count: countSpec.count,
                error: countSpec.error ?? null,
              }),
          };
        }
        // Paged chain: select(*).eq().order().range()
        return {
          eq: () => ({
            order: (col: string, optsOrder: { ascending: boolean }) => {
              captured.order = { col, ascending: optsOrder.ascending };
              return {
                range: () => {
                  const next = pageQueue.shift();
                  if (!next) {
                    return Promise.resolve({ data: [], error: null });
                  }
                  if (next.error) {
                    return Promise.resolve({
                      data: null,
                      error: next.error,
                    });
                  }
                  return Promise.resolve({
                    data: next.rows,
                    error: null,
                  });
                },
              };
            },
          }),
        };
      },
    };
  };

  return {
    captured,
    client: { from: vi.fn(fromImpl) } as never,
  };
}

function pageOfN(n: number, start: number): { id: string }[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `id_${String(start + i).padStart(6, "0")}`,
  }));
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("fetchActiveVenues — pagination", () => {
  it("pages 1000/1000/320 → 2320 returned, .order(\"id\", asc) applied", async () => {
    // Three pages totaling 2320. Loop terminates on the partial page
    // (320 < 1000) without a final empty round-trip.
    const { client, captured } = buildClient(
      [
        { rows: pageOfN(1000, 0) },
        { rows: pageOfN(1000, 1000) },
        { rows: pageOfN(320, 2000) },
      ],
      { count: 2320 },
    );
    vi.mocked(getSupabase).mockReturnValue(client);

    const venues = await fetchActiveVenues();

    expect(venues).toHaveLength(2320);
    // Order param captured from the first page's .order() call.
    expect(captured.order).toEqual({ col: "id", ascending: true });
    // First and last IDs preserve insertion order — confirms the
    // helper appends in page order, doesn't shuffle.
    expect(venues[0].id).toBe("id_000000");
    expect(venues[venues.length - 1].id).toBe("id_002319");
  });

  it("single partial page (< PAGE_SIZE) returns immediately", async () => {
    const { client } = buildClient([{ rows: pageOfN(42, 0) }], { count: 42 });
    vi.mocked(getSupabase).mockReturnValue(client);

    const venues = await fetchActiveVenues();
    expect(venues).toHaveLength(42);
  });

  it("paged read error throws", async () => {
    const { client } = buildClient(
      [{ rows: [], error: { message: "boom" } }],
      { count: 0 },
    );
    vi.mocked(getSupabase).mockReturnValue(client);

    await expect(fetchActiveVenues()).rejects.toThrow(/boom/);
  });
});

describe("fetchActiveVenues — count cross-check", () => {
  it("count mismatch → console.error + returns fetched rows (does NOT throw)", async () => {
    // Fetched 1000 rows but count says 1320. Helper logs and proceeds.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = buildClient(
      // 1000 row page, then implicit empty page terminates the loop.
      // (Single full page → loop continues → next call returns []
      // → break.) That's the corner case where the fetched count is
      // exactly PAGE_SIZE but the catalog is larger; if the queue
      // is empty we get [] back and break, simulating the broken
      // production behavior we're guarding against here.
      [{ rows: pageOfN(1000, 0) }],
      { count: 1320 },
    );
    vi.mocked(getSupabase).mockReturnValue(client);

    const venues = await fetchActiveVenues();

    expect(venues).toHaveLength(1000);
    expect(errSpy).toHaveBeenCalledTimes(1);
    const msg = errSpy.mock.calls[0][0] as string;
    expect(msg).toContain("count mismatch");
    expect(msg).toContain("fetched=1000");
    expect(msg).toContain("count=1320");
    errSpy.mockRestore();
  });

  it("count query error → console.error + proceeds", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = buildClient(
      [{ rows: pageOfN(50, 0) }],
      { count: null, error: { message: "count failed" } },
    );
    vi.mocked(getSupabase).mockReturnValue(client);

    const venues = await fetchActiveVenues();

    expect(venues).toHaveLength(50);
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(errSpy.mock.calls[0][0]).toContain("count check failed");
    errSpy.mockRestore();
  });

  it("matching counts → no error logged", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = buildClient(
      [{ rows: pageOfN(750, 0) }],
      { count: 750 },
    );
    vi.mocked(getSupabase).mockReturnValue(client);

    const venues = await fetchActiveVenues();
    expect(venues).toHaveLength(750);
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

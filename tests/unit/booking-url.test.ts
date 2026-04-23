import { describe, it, expect } from "vitest";
import {
  buildResyBookingUrl,
  buildResySlotBookingUrl,
  parseTemplateIdFromToken,
} from "@/lib/availability/booking-url";

// ── parseTemplateIdFromToken ──────────────────────────────────

describe("parseTemplateIdFromToken", () => {
  it("extracts templateId from valid token", () => {
    expect(
      parseTemplateIdFromToken(
        "rgs://resy/69589/2518396/2/2026-04-22/2026-04-22/17:00:00/2/1"
      )
    ).toBe(2518396);
  });

  it("handles different venue/template IDs", () => {
    expect(
      parseTemplateIdFromToken(
        "rgs://resy/44872/1029844/2/2026-04-23/2026-04-23/21:00:00/2/Bar"
      )
    ).toBe(1029844);
  });

  it("throws on missing rgs:// prefix", () => {
    expect(() => parseTemplateIdFromToken("69589/2518396/2")).toThrow(
      "Invalid token prefix"
    );
  });

  it("throws on too few segments", () => {
    expect(() => parseTemplateIdFromToken("rgs://resy/69589")).toThrow(
      "too few segments"
    );
  });

  it("throws on non-numeric templateId", () => {
    expect(() =>
      parseTemplateIdFromToken("rgs://resy/69589/abc/2/2026-04-22")
    ).toThrow("Non-numeric");
  });

  it("throws on empty string", () => {
    expect(() => parseTemplateIdFromToken("")).toThrow();
  });
});

// ── buildResyBookingUrl ───────────────────────────────────────

describe("buildResyBookingUrl", () => {
  it("builds venue page URL with date and seats", () => {
    const url = buildResyBookingUrl("lelabar", "2026-04-25", 2);
    expect(url).toBe(
      "https://resy.com/cities/ny/venues/lelabar?date=2026-04-25&seats=2"
    );
  });

  it("handles different party sizes", () => {
    const url = buildResyBookingUrl("via-carota", "2026-05-01", 6);
    expect(url).toContain("seats=6");
  });
});

// ── buildResySlotBookingUrl ───────────────────────────────────

describe("buildResySlotBookingUrl", () => {
  const slot = {
    time: "2026-04-25 19:00:00",
    endTime: "2026-04-25 20:30:00",
    type: "Lounge",
    token: "rgs://resy/69589/2518396/2/2026-04-25/2026-04-25/19:00:00/2/1",
  };

  it("builds widget URL with reservation details", () => {
    const url = buildResySlotBookingUrl(
      "bibliotheque", "2026-04-25", 2, slot, "Bibliotheque", 69589
    );
    expect(url).toContain("widgets.resy.com/#/reservation-details");
    expect(url).toContain("date=2026-04-25");
    expect(url).toContain("seats=2");
    expect(url).toContain("venueId=69589");
    expect(url).toContain(encodeURIComponent("Bibliotheque"));
  });

  it("includes the slot token in tableConfigId", () => {
    const url = buildResySlotBookingUrl(
      "bibliotheque", "2026-04-25", 2, slot, "Bibliotheque", 69589
    );
    expect(url).toContain(
      "tableConfigId=" + encodeURIComponent(slot.token)
    );
  });

  it("includes reservation JSON with templateId", () => {
    const url = buildResySlotBookingUrl(
      "bibliotheque", "2026-04-25", 2, slot, "Bibliotheque", 69589
    );
    // The reservation JSON should contain templateId=2518396
    expect(url).toContain("2518396");
  });
});

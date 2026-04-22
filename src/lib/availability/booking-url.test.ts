import { describe, it, expect } from "vitest";
import { parseTemplateIdFromToken, buildResySlotBookingUrl } from "./booking-url";

describe("parseTemplateIdFromToken", () => {
  it("extracts templateId from a valid token", () => {
    expect(
      parseTemplateIdFromToken(
        "rgs://resy/69589/2518396/2/2026-04-22/2026-04-22/17:00:00/2/1"
      )
    ).toBe(2518396);
  });

  it("works with different venue and template IDs", () => {
    expect(
      parseTemplateIdFromToken(
        "rgs://resy/44872/1029844/2/2026-04-23/2026-04-23/21:00:00/2/Bar"
      )
    ).toBe(1029844);
  });

  it("throws on missing rgs:// prefix", () => {
    expect(() => parseTemplateIdFromToken("69589/2518396/2")).toThrow();
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

describe("buildResySlotBookingUrl", () => {
  it("builds a valid widget URL", () => {
    const url = buildResySlotBookingUrl(
      "bibliotheque",
      "2026-04-25",
      2,
      {
        time: "2026-04-25 19:00:00",
        endTime: "2026-04-25 20:30:00",
        type: "Lounge",
        token: "rgs://resy/69589/2518396/2/2026-04-25/2026-04-25/19:00:00/2/1",
      },
      "Bibliotheque",
      69589
    );

    expect(url).toContain("widgets.resy.com/#/reservation-details");
    expect(url).toContain("date=2026-04-25");
    expect(url).toContain("seats=2");
    expect(url).toContain("venueId=69589");
    expect(url).toContain(encodeURIComponent("Bibliotheque"));
    expect(url).toContain(encodeURIComponent("rgs://resy/69589"));
  });
});

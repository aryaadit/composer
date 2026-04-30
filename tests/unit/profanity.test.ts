import { describe, it, expect } from "vitest";
import { validateName, containsProfanity } from "@/lib/profanity";

describe("validateName", () => {
  it("accepts normal names", () => {
    expect(validateName("Adit")).toBeNull();
    expect(validateName("Reid")).toBeNull();
    expect(validateName("Mary-Jane")).toBeNull();
  });

  it("rejects empty + whitespace-only", () => {
    expect(validateName("")).toBe("Name is required");
    expect(validateName("   ")).toBe("Name is required");
  });

  it("rejects single character (after trim)", () => {
    expect(validateName("A")).toBe("Name must be at least 2 characters");
    expect(validateName(" R ")).toBe("Name must be at least 2 characters");
  });

  it("rejects profanity", () => {
    expect(validateName("Bitch")).toBe("Please choose a different name");
    expect(validateName("Shit")).toBe("Please choose a different name");
  });

  it("rejects l33t-speak profanity", () => {
    expect(validateName("b!tch")).toBe("Please choose a different name");
    expect(validateName("sh1t")).toBe("Please choose a different name");
  });
});

describe("containsProfanity", () => {
  it("returns false for empty", () => {
    expect(containsProfanity("")).toBe(false);
  });

  it("returns true for basic profanity", () => {
    expect(containsProfanity("Bitch")).toBe(true);
  });

  it("returns false for clean strings", () => {
    expect(containsProfanity("Adit")).toBe(false);
  });
});

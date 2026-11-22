import { describe, expect, it } from "vitest";
import { currentQuarter, makeTerm, parseTerm } from "../lib/format";

describe("quarter terms", () => {
  it("builds terms only from the four quarters", () => {
    expect(makeTerm("Fall", "2026")).toBe("Fall 2026");
    expect(makeTerm("Winter", "")).toBe("Winter");
    expect(makeTerm("Autumn", "2026")).toBe("");
    expect(makeTerm("Spring", "<b>")).toBe("Spring");
  });
  it("reads old free-text terms back", () => {
    expect(parseTerm("Autumn 2026")).toEqual({ quarter: "Fall", year: 2026 });
    expect(parseTerm("spring quarter 2027")).toEqual({ quarter: "Spring", year: 2027 });
    expect(parseTerm("")).toEqual({ quarter: "", year: null });
  });
  it("knows the current quarter", () => {
    expect(currentQuarter(new Date(2026, 10, 21))).toEqual({ quarter: "Fall", year: 2026 });
    expect(currentQuarter(new Date(2027, 1, 1)).quarter).toBe("Winter");
    expect(currentQuarter(new Date(2027, 4, 1)).quarter).toBe("Spring");
    expect(currentQuarter(new Date(2027, 6, 1)).quarter).toBe("Summer");
  });
});

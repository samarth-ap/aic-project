import { describe, expect, it } from "vitest";
import { fmt, parseCaptions, stampedTranscript, textBetween } from "../lib/analysis/transcript";

const VTT = `WEBVTT

1
00:00:01.000 --> 00:00:04.500
<v Prof>Hello everyone.

2
00:01:05.250 --> 00:01:08.000
Today: eigenvalues.

3
00:01:08.000 --> 00:01:09.000
Today: eigenvalues.
`;

const SRT = `1
00:00:01,000 --> 00:00:03,000
First line

2
01:00:00,000 --> 01:00:02,000
An hour in
`;

describe("parseCaptions", () => {
  it("parses WebVTT, strips tags and drops repeated lines", () => {
    const segs = parseCaptions(VTT);
    expect(segs).toEqual([
      { start_ms: 1000, end_ms: 4500, text: "Hello everyone." },
      { start_ms: 65250, end_ms: 68000, text: "Today: eigenvalues." },
    ]);
  });
  it("parses SRT with hours and applies an offset", () => {
    const segs = parseCaptions(SRT, 500);
    expect(segs[1]).toEqual({ start_ms: 3_600_500, end_ms: 3_602_500, text: "An hour in" });
  });
});

describe("helpers", () => {
  const segs = parseCaptions(VTT);
  it("textBetween returns overlapping text", () => {
    expect(textBetween(segs, 60_000, 70_000)).toBe("Today: eigenvalues.");
  });
  it("fmt formats m:ss", () => {
    expect(fmt(65_250)).toBe("1:05");
  });
  it("stampedTranscript prefixes chunks with time", () => {
    expect(stampedTranscript(segs)).toBe("[0:01] Hello everyone.\n[1:05] Today: eigenvalues.");
  });
});

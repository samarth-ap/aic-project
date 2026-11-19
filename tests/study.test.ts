import { describe, expect, it } from "vitest";
import { buildTopics, clozeQuiz, dailyMinutes, passed, planToday, topicKey, type StudyMoment } from "../lib/analysis/study";
import { groupQuestions, isResolved } from "../lib/analysis/lecture";

let id = 0;
const m = (concept: string, status: StudyMoment["status"], lecture_no: number, class_share = 0): StudyMoment => ({
  event_id: ++id,
  concept,
  status,
  t_ms: 60_000,
  created_at: lecture_no * 1000 + id,
  lecture_code: `L${lecture_no}`,
  lecture_no,
  lecture_title: `Lecture ${lecture_no}`,
  class_share,
});

describe("study topics", () => {
  const moments = [
    m("Base cases", "fuzzy", 12, 0.31),
    m("Base cases", "open", 12, 0.31),
    m("Removing a node", "fuzzy", 11),
    m("Interfaces vs classes", "got_it", 8),
  ];
  it("marks still-fuzzy or repeated topics as weak spots", () => {
    const t = buildTopics(moments, new Map());
    const by = Object.fromEntries(t.map((x) => [x.name, x]));
    expect(by["Base cases"].weak).toBe(true);
    expect(by["Removing a node"].weak).toBe(true);
    expect(by["Interfaces vs classes"].weak).toBe(false);
    expect(by["Interfaces vs classes"].needs_check).toBe(true);
  });
  it("orders today's plan: fuzzy + repeated first, then quick checks", () => {
    const plan = planToday(buildTopics(moments, new Map()), 9);
    expect(plan.map((p) => p.topic.name)).toEqual(["Base cases", "Removing a node", "Interfaces vs classes"]);
    expect(plan[0].reason).toMatch(/twice and marked it still fuzzy/);
    expect(plan[0].reason).toMatch(/third of the class/);
    expect(plan[2].kind).toBe("check");
  });
  it("clears a weak spot once its check is passed", () => {
    const progress = new Map([[topicKey("Base cases"), { status: "cleared", score: 5, updated_at: Date.now() }]]);
    const t = buildTopics(moments, progress).find((x) => x.name === "Base cases")!;
    expect(t.cleared).toBe(true);
    expect(t.standing).toBe("solid");
    expect(planToday(buildTopics(moments, progress), 9).map((p) => p.topic.name)).not.toContain("Base cases");
  });
  it("gives more time as the exam gets close", () => {
    expect(dailyMinutes(null)).toBe(20);
    expect(dailyMinutes(5)).toBe(30);
    expect(dailyMinutes(1)).toBe(40);
  });
  it("passes a check at 4 of 5", () => {
    expect(passed(4, 5)).toBe(true);
    expect(passed(3, 5)).toBe(false);
  });
});

describe("offline quiz", () => {
  it("builds fill-the-gap questions from what the professor said", () => {
    const t = [
      { start_ms: 0, end_ms: 10_000, text: "The function calls itself with a smaller argument every single time." },
      { start_ms: 10_000, end_ms: 20_000, text: "Eventually it reaches the base case which returns without recursing further." },
      { start_ms: 20_000, end_ms: 30_000, text: "Each pending call keeps its own frame on the call stack until it returns." },
    ];
    const q = clozeQuiz(t, [25_000]);
    expect(q.questions.length).toBeGreaterThan(0);
    for (const x of q.questions) {
      expect(x.q).toContain("_____");
      expect(x.options).toHaveLength(4);
      expect(x.answer).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("lecture helpers", () => {
  it("groups repeated questions", () => {
    expect(groupQuestions(["Why doesn't it loop forever?", "why doesnt it loop forever", "Can there be two base cases?"])[0]).toEqual({ text: "Why doesn't it loop forever?", count: 2 });
  });
  it("counts a moment as resolved on Got it, or closed with no follow-up", () => {
    expect(isResolved({ status: "got_it", closed_at_ms: null, followups: 3 })).toBe(true);
    expect(isResolved({ status: "open", closed_at_ms: 1000, followups: 0 })).toBe(true);
    expect(isResolved({ status: "open", closed_at_ms: 1000, followups: 2 })).toBe(false);
    expect(isResolved({ status: "fuzzy", closed_at_ms: 1000, followups: 0 })).toBe(false);
  });
});

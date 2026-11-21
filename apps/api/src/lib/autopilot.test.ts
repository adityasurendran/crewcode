import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planAction } from "./autopilot.js";

const base = {
  status: "testing",
  rescues: 0,
  requeues: 0,
  lastEventAgeMin: 0,
  ageHrs: 1,
  workdirExists: true,
  overBudget: false,
  hasPreview: false,
  lastCleanupFailAgeHrs: null as number | null,
};

describe("autopilot planAction", () => {
  it("requeues stuck testing tasks", () => {
    assert.deepEqual(planAction({ ...base, lastEventAgeMin: 15 }), ["requeue"]);
  });
  it("leaves fresh tasks alone", () => {
    assert.deepEqual(planAction({ ...base, lastEventAgeMin: 2 }), []);
  });
  it("stops requeuing after the cap", () => {
    assert.deepEqual(planAction({ ...base, lastEventAgeMin: 60, requeues: 3 }), []);
  });
  it("rescues blocked tasks with budget and workdir", () => {
    assert.deepEqual(planAction({ ...base, status: "blocked", ageHrs: 2 }), ["rescue"]);
  });
  it("never rescues budget-blocked tasks (janitor still cleans)", () => {
    assert.deepEqual(planAction({ ...base, status: "blocked", ageHrs: 2, overBudget: true }), ["cleanup"]);
  });
  it("never rescues without a workdir", () => {
    assert.deepEqual(planAction({ ...base, status: "blocked", ageHrs: 2, workdirExists: false }), []);
  });
  it("stops rescuing after the cap (janitor still cleans)", () => {
    assert.deepEqual(planAction({ ...base, status: "blocked", ageHrs: 2, rescues: 2 }), ["cleanup"]);
  });
  it("makes previews for merged work", () => {
    assert.deepEqual(planAction({ ...base, status: "merged", ageHrs: 0.5 }), ["preview"]);
  });
  it("skips preview when one exists", () => {
    assert.deepEqual(planAction({ ...base, status: "merged", ageHrs: 0.5, hasPreview: true }), []);
  });
  it("cleans old terminal worktrees", () => {
    assert.deepEqual(planAction({ ...base, status: "merged", ageHrs: 2, hasPreview: true }), ["cleanup"]);
  });
  it("cleans even ancient tasks (janitor has no 24h limit)", () => {
    assert.deepEqual(planAction({ ...base, status: "blocked", ageHrs: 30, rescues: 2 }), ["cleanup"]);
  });
  it("never spends on ancient tasks", () => {
    assert.deepEqual(planAction({ ...base, status: "blocked", ageHrs: 30, rescues: 0 }), ["cleanup"]);
    assert.deepEqual(planAction({ ...base, status: "testing", ageHrs: 30, lastEventAgeMin: 999 }), []);
    assert.deepEqual(planAction({ ...base, status: "merged", ageHrs: 30 }), ["cleanup"]);
  });
  it("backs off after a recent cleanup failure", () => {
    assert.deepEqual(planAction({ ...base, status: "merged", ageHrs: 5, hasPreview: true, lastCleanupFailAgeHrs: 1 }), []);
  });
  it("retries cleanup after the backoff window", () => {
    assert.deepEqual(
      planAction({ ...base, status: "merged", ageHrs: 9, hasPreview: true, lastCleanupFailAgeHrs: 7 }),
      ["cleanup"]
    );
  });
});

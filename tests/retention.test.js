/**
 * The retention arithmetic: what a screen pays, which day it pays on, and when a streak moves.
 *
 * These three rules decide numbers a learner will notice — a total, a day boundary, a run of days —
 * and every one of them has an edge where a plausible implementation is quietly wrong: the award
 * based on a client-supplied score, the day taken from the server's UTC clock, the streak reset by a
 * timezone change. The functions are pure, so this file imports them instead of restating them.
 *
 * `tests/db/retention.spec.js` proves the same rules hold through the RPC against a real Postgres;
 * this file proves them without one.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DAILY_CAP,
  awardForLesson,
  capDailyPoints,
  dayKey,
  parseLessonNumber,
  pointsAward,
} from "../lib/retention/points.js";
import { addDays, daysBetween, streakAfter } from "../lib/retention/streak.js";

describe("parseLessonNumber", () => {
  it("reads the number out of a local lesson id", () => {
    assert.equal(parseLessonNumber("01-sum-basics"), 1);
    assert.equal(parseLessonNumber("12-nested-if"), 12);
    assert.equal(parseLessonNumber("88-capstone"), 88);
  });

  it("reads the number out of a track-prefixed id", () => {
    assert.equal(parseLessonNumber("sql-04-lookups"), 4);
    assert.equal(parseLessonNumber("project-ufo"), null);
  });

  it("refuses ids that carry no number, and non-strings", () => {
    assert.equal(parseLessonNumber("capstone"), null);
    assert.equal(parseLessonNumber(""), null);
    assert.equal(parseLessonNumber(null), null);
    assert.equal(parseLessonNumber(7), null);
    assert.equal(parseLessonNumber("00-zero"), null);
  });
});

describe("pointsAward", () => {
  it("pays a multiple of the lesson number between 1x and 5x", () => {
    const draws = [0, 0.199, 0.2, 0.399, 0.4, 0.599, 0.6, 0.799, 0.8, 0.999];
    for (const draw of draws) {
      const award = pointsAward(7, () => draw);
      assert.equal(award % 7, 0, `draw ${draw} paid ${award}, which is not a multiple of 7`);
      assert.ok(award >= 7 && award <= 35, `draw ${draw} paid ${award}`);
    }
  });

  it("walks all five units as the draw crosses each fifth", () => {
    const paid = [0.1, 0.3, 0.5, 0.7, 0.9].map((draw) => pointsAward(1, () => draw));
    assert.deepEqual(paid, [1, 2, 3, 4, 5]);
  });

  it("pays the late-lesson maximum the phase doc implies", () => {
    assert.equal(pointsAward(88, () => 0.99), 440);
    assert.equal(pointsAward(88, () => 0), 88);
  });

  it("pays an unnumbered lesson nothing", () => {
    assert.equal(pointsAward(null, () => 0.5), 0);
    assert.equal(pointsAward(0, () => 0.5), 0);
    assert.equal(pointsAward(-3, () => 0.5), 0);
    assert.equal(awardForLesson("project-ufo", () => 0.5), 0);
  });

  it("survives a draw that is not a number", () => {
    assert.equal(pointsAward(4, () => Number.NaN), 4);
    assert.equal(pointsAward(4, () => "nonsense"), 4);
    assert.equal(pointsAward(4, () => 1), 20);
  });

  it("never lets one screen pay the whole day", () => {
    assert.ok(pointsAward(88, () => 0.999) < DAILY_CAP);
  });
});

describe("capDailyPoints", () => {
  it("pays in full while the day has room", () => {
    assert.equal(capDailyPoints(0, 88), 88);
    assert.equal(capDailyPoints(400, 88), 88);
  });

  it("pays only the remainder at the ceiling", () => {
    assert.equal(capDailyPoints(DAILY_CAP - 10, 88), 10);
  });

  it("pays nothing once the day is full, without throwing", () => {
    assert.equal(capDailyPoints(DAILY_CAP, 88), 0);
    assert.equal(capDailyPoints(DAILY_CAP + 500, 88), 0);
  });

  it("treats a corrupt total or award as zero rather than as a negative", () => {
    assert.equal(capDailyPoints(Number.NaN, 10), 10);
    assert.equal(capDailyPoints(-100, 10), 10);
    assert.equal(capDailyPoints(10, Number.NaN), 0);
    assert.equal(capDailyPoints(10, -5), 0);
  });
});

describe("dayKey", () => {
  it("uses the learner's calendar date, not the server's", () => {
    const instant = "2026-06-01T12:30:00.000Z";
    assert.equal(dayKey(instant, "UTC"), "2026-06-01");
    assert.equal(dayKey(instant, "Pacific/Auckland"), "2026-06-02");
    assert.equal(dayKey(instant, "America/New_York"), "2026-06-01");
  });

  it("resets at local midnight, which is a different instant everywhere", () => {
    // 11:30pm and 00:30 the next day in Auckland, twelve hours before UTC notices either.
    assert.equal(dayKey("2026-06-01T11:30:00.000Z", "Pacific/Auckland"), "2026-06-01");
    assert.equal(dayKey("2026-06-01T12:30:00.000Z", "Pacific/Auckland"), "2026-06-02");
  });

  it("follows DST in both directions", () => {
    // New York springs forward on 2026-03-08: 04:30Z is still the 7th locally, 07:30Z is the 8th.
    assert.equal(dayKey("2026-03-08T04:30:00.000Z", "America/New_York"), "2026-03-07");
    assert.equal(dayKey("2026-03-08T07:30:00.000Z", "America/New_York"), "2026-03-08");
    // And falls back on 2026-11-01, where the local day has 25 hours.
    assert.equal(dayKey("2026-11-01T04:30:00.000Z", "America/New_York"), "2026-11-01");
    assert.equal(dayKey("2026-11-02T04:30:00.000Z", "America/New_York"), "2026-11-01");
  });

  it("falls back to UTC for a profile the database should not have accepted", () => {
    const instant = "2026-06-01T12:30:00.000Z";
    for (const zone of ["Mars/Olympus", "", null, undefined, 7]) {
      assert.equal(dayKey(instant, zone), "2026-06-01", `zone ${String(zone)}`);
    }
  });

  it("defaults to UTC with no zone at all", () => {
    assert.equal(dayKey("2026-06-01T23:30:00.000Z"), "2026-06-01");
    assert.equal(dayKey(new Date("2026-06-02T00:30:00.000Z")), "2026-06-02");
  });

  it("returns null for an instant it cannot read", () => {
    assert.equal(dayKey("not a date"), null);
    assert.equal(dayKey(new Date("nope")), null);
  });
});

describe("daysBetween and addDays", () => {
  it("counts whole calendar days, DST included", () => {
    assert.equal(daysBetween("2026-03-07", "2026-03-08"), 1);
    assert.equal(daysBetween("2026-03-07", "2026-03-09"), 2);
    assert.equal(daysBetween("2026-03-08", "2026-03-07"), -1);
    assert.equal(daysBetween("2026-11-01", "2026-11-02"), 1);
    assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
  });

  it("refuses anything that is not a real date", () => {
    assert.equal(daysBetween("2026-02-30", "2026-03-01"), null);
    assert.equal(daysBetween("2026-3-1", "2026-03-02"), null);
    assert.equal(daysBetween(null, "2026-03-01"), null);
    assert.equal(addDays("2026-02-30", 1), null);
  });

  it("shifts a day key by whole days across month and year ends", () => {
    assert.equal(addDays("2026-03-01", -1), "2026-02-28");
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2026-03-07", 1), "2026-03-08");
  });
});

describe("streakAfter", () => {
  const empty = { current: 0, longest: 0, last_day: null };

  it("starts at one on the first day", () => {
    assert.deepEqual(streakAfter(empty, "2026-03-07"), {
      current: 1,
      longest: 1,
      last_day: "2026-03-07",
      changed: true,
    });
  });

  it("counts the same day once", () => {
    const state = { current: 4, longest: 6, last_day: "2026-03-07" };
    assert.deepEqual(streakAfter(state, "2026-03-07"), {
      current: 4,
      longest: 6,
      last_day: "2026-03-07",
      changed: false,
    });
  });

  it("continues a run on the next day", () => {
    const state = { current: 4, longest: 6, last_day: "2026-03-07" };
    assert.deepEqual(streakAfter(state, "2026-03-08"), {
      current: 5,
      longest: 6,
      last_day: "2026-03-08",
      changed: true,
    });
  });

  it("raises longest when the run passes it", () => {
    const state = { current: 6, longest: 6, last_day: "2026-03-07" };
    assert.equal(streakAfter(state, "2026-03-08").longest, 7);
  });

  it("ends the run after a gap of two days, keeping the best", () => {
    const state = { current: 12, longest: 12, last_day: "2026-03-07" };
    assert.deepEqual(streakAfter(state, "2026-03-09"), {
      current: 1,
      longest: 12,
      last_day: "2026-03-09",
      changed: true,
    });
  });

  it("continues across a DST change instead of seeing a short day", () => {
    const state = { current: 3, longest: 3, last_day: "2026-03-07" };
    assert.equal(streakAfter(state, "2026-03-08").current, 4);
    const autumn = { current: 3, longest: 3, last_day: "2026-10-31" };
    assert.equal(streakAfter(autumn, "2026-11-01").current, 4);
  });

  it("does not end a run because the calendar moved backwards", () => {
    const state = { current: 9, longest: 9, last_day: "2026-03-07" };
    assert.deepEqual(streakAfter(state, "2026-03-06"), {
      current: 9,
      longest: 9,
      last_day: "2026-03-07",
      changed: false,
    });
  });

  it("leaves the streak alone when the day key is unreadable", () => {
    const state = { current: 2, longest: 2, last_day: "2026-03-07" };
    for (const bad of [null, "", "yesterday", "2026-02-30"]) {
      assert.deepEqual(streakAfter(state, bad), { current: 2, longest: 2, last_day: "2026-03-07", changed: false });
    }
  });

  it("treats a missing or corrupt state as the first day", () => {
    for (const state of [undefined, null, {}, { current: "nonsense", longest: -5, last_day: 7 }]) {
      assert.deepEqual(streakAfter(state, "2026-03-07"), {
        current: 1,
        longest: 1,
        last_day: "2026-03-07",
        changed: true,
      });
    }
  });

  it("does not rewrite last_day with a corrupt state", () => {
    assert.equal(streakAfter({ current: 3, longest: 3, last_day: "not a day" }, "2026-03-07").current, 1);
  });
});

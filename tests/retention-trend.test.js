// Phase 5, unit 5g — the week's accuracy as the page will draw it.
//
// The SQL half is proved in `tests/db/retention.spec.js`; what is proved here is the shaping that has
// to be right for the 0-day, 1-day and 7-day cases the acceptance criterion names, and the geometry of
// a sparkline that is otherwise only visible to a person looking at it.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TREND_DAYS,
  accuracyOf,
  shiftDay,
  sparkPath,
  sparkPoints,
  todayKey,
  trendSeries,
  trendTotals,
  weekView,
} from "../lib/retention/trend.js";

const TODAY = "2026-11-05";

describe("shiftDay", () => {
  it("walks backwards and forwards across a month and a year", () => {
    assert.equal(shiftDay("2026-11-01", -1), "2026-10-31");
    assert.equal(shiftDay("2026-01-01", -1), "2025-12-31");
    assert.equal(shiftDay("2026-02-28", 1), "2026-03-01");
    assert.equal(shiftDay(TODAY, 0), TODAY);
  });

  it("refuses anything that is not a calendar date", () => {
    assert.equal(shiftDay("5 November 2026", -1), null);
    assert.equal(shiftDay(null, -1), null);
    assert.equal(shiftDay("2026-11-05", Number.NaN), null);
  });
});

describe("accuracyOf", () => {
  it("has no accuracy for a day nobody studied", () => {
    assert.equal(accuracyOf(0, 0), null);
    assert.equal(accuracyOf(null, null), null);
  });

  it("reports a percentage to one decimal place", () => {
    assert.equal(accuracyOf(2, 1), 50);
    assert.equal(accuracyOf(3, 2), 66.7);
    assert.equal(accuracyOf(7, 7), 100);
  });

  it("cannot report more than everything", () => {
    assert.equal(accuracyOf(2, 5), 100);
  });
});

describe("trendSeries", () => {
  it("is a week of empty days when nothing was attempted", () => {
    const series = trendSeries([], { today: TODAY });
    assert.equal(series.length, TREND_DAYS);
    assert.equal(series[0].day, "2026-10-30");
    assert.equal(series.at(-1).day, TODAY);
    assert.ok(series.every((day) => day.screens === 0 && day.accuracy === null));
  });

  it("keeps a single day of work and leaves the rest empty", () => {
    const series = trendSeries([{ day: TODAY, screens: 4, firstTry: 3 }], { today: TODAY });
    assert.equal(series.length, 7);
    assert.deepEqual(
      series.filter((day) => day.screens > 0).map((day) => day.day),
      [TODAY],
    );
    assert.equal(series.at(-1).accuracy, 75);
  });

  it("keeps every day of a full week, in order", () => {
    const rows = [
      { day: "2026-11-01", screens: 10, firstTry: 5 },
      { day: "2026-11-02", screens: 2, firstTry: 2 },
      { day: "2026-11-03", screens: 4, firstTry: 1 },
      { day: "2026-11-04", screens: 6, firstTry: 6 },
      { day: "2026-11-05", screens: 8, firstTry: 4 },
      { day: "2026-10-31", screens: 1, firstTry: 0 },
      { day: "2026-10-30", screens: 3, firstTry: 3 },
    ];
    const series = trendSeries(rows, { today: TODAY });
    assert.deepEqual(
      series.map((day) => day.day),
      ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"],
    );
    assert.deepEqual(
      series.map((day) => day.accuracy),
      [100, 0, 50, 100, 25, 100, 50],
    );
  });

  it("drops rows from outside the window instead of stretching it", () => {
    const series = trendSeries([{ day: "2026-10-01", screens: 9, firstTry: 9 }], { today: TODAY });
    assert.equal(series.length, 7);
    assert.equal(trendTotals(series).screens, 0);
  });

  it("adds up two rows for the same day", () => {
    const series = trendSeries(
      [
        { day: TODAY, screens: 2, firstTry: 1 },
        { day: TODAY, screens: 2, firstTry: 1 },
      ],
      { today: TODAY },
    );
    assert.equal(series.at(-1).screens, 4);
    assert.equal(series.at(-1).accuracy, 50);
  });

  it("ignores a day it cannot read and a negative count", () => {
    const series = trendSeries(
      [
        { day: "yesterday", screens: 4, firstTry: 4 },
        { screens: 4, firstTry: 4 },
        { day: TODAY, screens: -3, firstTry: 1 },
      ],
      { today: TODAY },
    );
    assert.equal(trendTotals(series).screens, 0);
  });

  it("clamps the window the database clamps", () => {
    assert.equal(trendSeries([], { days: 0, today: TODAY }).length, 1);
    assert.equal(trendSeries([], { days: 100, today: TODAY }).length, 30);
    assert.equal(trendSeries([], { days: "seven", today: TODAY }).length, TREND_DAYS);
  });

  it("ends at the day the database named, not at the device's clock", () => {
    assert.equal(trendSeries([], { today: "2026-03-01" }).at(-1).day, "2026-03-01");
  });

  it("falls back to today when it is given no day", () => {
    assert.equal(trendSeries([]).at(-1).day, todayKey());
  });
});

describe("trendTotals", () => {
  it("is empty over an empty week", () => {
    assert.deepEqual(trendTotals(trendSeries([], { today: TODAY })), {
      screens: 0,
      firstTry: 0,
      activeDays: 0,
      accuracy: null,
    });
  });

  it("counts the days that had work, not the days in the window", () => {
    const series = trendSeries(
      [
        { day: TODAY, screens: 5, firstTry: 4 },
        { day: "2026-11-02", screens: 5, firstTry: 1 },
      ],
      { today: TODAY },
    );
    assert.deepEqual(trendTotals(series), {
      screens: 10,
      firstTry: 5,
      activeDays: 2,
      accuracy: 50,
    });
  });
});

describe("weekView", () => {
  it("renders a week from nothing at all", () => {
    const week = weekView(null);
    assert.equal(week.empty, true);
    assert.equal(week.series.length, TREND_DAYS);
    assert.equal(week.accuracy, null);
    assert.deepEqual(week.streak, { current: 0, longest: 0, lastDay: null });
  });

  it("keeps the points and the streak the database sent", () => {
    const week = weekView({
      day: TODAY,
      pointsToday: 12,
      pointsTotal: 340,
      streakCurrent: 4,
      streakLongest: 9,
      streakLastDay: TODAY,
      series: [{ day: TODAY, screens: 4, firstTry: 4 }],
    });
    assert.equal(week.pointsToday, 12);
    assert.equal(week.pointsTotal, 340);
    assert.deepEqual(week.streak, { current: 4, longest: 9, lastDay: TODAY });
    assert.equal(week.empty, false);
    assert.equal(week.activeDays, 1);
  });

  it("pads a short series to a week even when the payload forgot the gaps", () => {
    const week = weekView({ day: TODAY, series: [{ day: TODAY, screens: 2, firstTry: 1 }] });
    assert.equal(week.series.length, 7);
    assert.equal(week.series.at(-1).screens, 2);
  });

  it("survives numbers arriving as strings", () => {
    const week = weekView({ day: TODAY, pointsTotal: "40", series: [{ day: TODAY, screens: "2", firstTry: "1" }] });
    assert.equal(week.pointsTotal, 40);
    assert.equal(week.screens, 2);
    assert.equal(week.accuracy, 50);
  });
});

describe("sparkPoints", () => {
  const series = trendSeries(
    [
      { day: "2026-10-30", screens: 4, firstTry: 4 },
      { day: "2026-11-01", screens: 4, firstTry: 2 },
      { day: TODAY, screens: 4, firstTry: 3 },
    ],
    { today: TODAY },
  );

  it("has nothing to draw for an empty week", () => {
    assert.deepEqual(sparkPoints(trendSeries([], { today: TODAY })), []);
  });

  it("draws one point for a single day of work", () => {
    const points = sparkPoints(trendSeries([{ day: TODAY, screens: 4, firstTry: 2 }], { today: TODAY }));
    assert.equal(points.length, 1);
    assert.equal(points[0].day, TODAY);
  });

  it("skips the empty days rather than plotting them at zero", () => {
    assert.deepEqual(
      sparkPoints(series).map((point) => point.day),
      ["2026-10-30", "2026-11-01", TODAY],
    );
  });

  it("puts 100% at the top and 0% at the bottom", () => {
    const [top, bottom] = [
      sparkPoints([{ day: TODAY, accuracy: 100 }], { width: 100, height: 20, pad: 2 })[0],
      sparkPoints([{ day: TODAY, accuracy: 0 }], { width: 100, height: 20, pad: 2 })[0],
    ];
    assert.equal(top.y, 2);
    assert.equal(bottom.y, 18);
  });

  it("moves left to right across the window", () => {
    const points = sparkPoints(series, { width: 100, height: 20, pad: 0 });
    const xs = points.map((point) => point.x);
    assert.deepEqual(xs, [...xs].sort((a, b) => a - b));
    assert.equal(xs[0], 0);
    assert.equal(xs.at(-1), 100);
  });
});

describe("sparkPath", () => {
  it("is empty when there is nothing to draw", () => {
    assert.equal(sparkPath([]), "");
    assert.equal(sparkPath(null), "");
  });

  it("starts with a move and continues with lines", () => {
    assert.equal(
      sparkPath([
        { x: 0, y: 10 },
        { x: 5, y: 4 },
      ]),
      "M0 10 L5 4",
    );
  });
});

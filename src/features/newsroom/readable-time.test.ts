import { describe, expect, it } from "vitest";

import { readableTime } from "./readable-time";

describe("showing a recorded instant to a person", () => {
  it("writes an ISO timestamp as a date and a time, named with its zone", () => {
    expect(readableTime("2026-08-26T14:54:49.395Z")).toBe("26 Aug 2026, 14:54:49 UTC");
  });

  // Not every recorded timestamp is an instant, and "Invalid Date" tells an operator less than
  // the value that was actually recorded.
  it("shows what was recorded when the record is not a time at all", () => {
    expect(readableTime("opaque-completed")).toBe("opaque-completed");
  });
});

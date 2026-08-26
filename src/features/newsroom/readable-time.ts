/**
 * A recorded instant, written for a person.
 *
 * Timestamps are stored and audited as ISO strings and stay that way in the audit panels, where
 * an exact machine-comparable value is the point. In an operator-facing panel the same string is
 * something to decode rather than read, so it is formatted here — in UTC, and labelled as such,
 * because a time shown without its zone is a time an operator has to guess at.
 */
const READABLE_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function readableTime(value: string): string {
  const parsed = new Date(value);
  // Not every recorded timestamp is an instant: the test fixtures and some older records carry
  // opaque strings, and showing "Invalid Date" would be worse than showing what was recorded.
  if (Number.isNaN(parsed.getTime())) return value;
  return `${READABLE_TIME.format(parsed)} UTC`;
}

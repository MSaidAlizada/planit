// "YYYY-MM-DD" for a Date's *local* calendar day. Never use
// `date.toISOString().split('T')[0]` for this — toISOString() converts to
// UTC first, so near local midnight (any time the local day hasn't caught
// up to UTC's) it silently returns the wrong day.
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// The backend serializes datetimes as naive UTC — no trailing "Z" or offset
// (e.g. "2026-08-12T19:05:52.302259"). Per the JS spec, `new Date(str)` on a
// date-*time* string with no timezone marker is parsed as LOCAL time, not
// UTC — silently misinterpreting every task/event/deadline timestamp from
// the API by the browser's UTC offset. Always parse backend timestamps
// through this instead of a bare `new Date(...)`.
export function parseUTC(iso: string): Date {
  return new Date(/[Z]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
}

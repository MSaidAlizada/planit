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

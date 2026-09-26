// Date helpers for "date-only" values (e.g. Postgres DATE: YYYY-MM-DD).
// JS `new Date('YYYY-MM-DD')` parses as UTC, which can shift the local day in some timezones.

export function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateOnlyToLocalDate(dateStr: string): Date | null {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(y, mo - 1, d);
}

export function parseAnyDateToLocalDate(dateStr: string): Date | null {
  const s = String(dateStr || "").trim();
  if (!s) return null;

  // Prefer explicit parsing for date-only values (Postgres DATE: YYYY-MM-DD).
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const dateOnly = parseDateOnlyToLocalDate(s);
    if (dateOnly) return dateOnly;
  }

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function saleDateToLocalKey(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const d = parseAnyDateToLocalDate(dateStr);
  return d ? toLocalDateKey(d) : null;
}

export function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

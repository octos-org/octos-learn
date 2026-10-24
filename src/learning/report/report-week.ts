const DAY_MS = 86_400_000;
const VISIBILITY_KEY = "octos-learn-weekly-report";

/** Local calendar day (YYYY-MM-DD) of a time. */
export const localDayOf = (time: Date) => new Date(time.getTime() - time.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

/** The Monday of the week containing a local day; matches the service rule. */
export function weekStartOf(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  return new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
}

export const shiftWeek = (weekStart: string, weeks: number) =>
  new Date(Date.parse(`${weekStart}T00:00:00.000Z`) + weeks * 7 * DAY_MS).toISOString().slice(0, 10);

/** "10月13日–10月19日" for the Monday-to-Sunday week. */
export function weekLabel(weekStart: string): string {
  const day = (iso: string) => { const [, m, d] = iso.split("-").map(Number); return `${m}月${d}日`; };
  const sunday = new Date(Date.parse(`${weekStart}T00:00:00.000Z`) + 6 * DAY_MS).toISOString().slice(0, 10);
  return `${day(weekStart)}–${day(sunday)}`;
}

/** Learners can hide the weekly report; nothing is computed while hidden. */
export function weeklyReportShown(): boolean {
  try { return localStorage.getItem(VISIBILITY_KEY) !== "hidden"; } catch { return true; }
}
export function showWeeklyReport(shown: boolean) {
  try { if (shown) localStorage.removeItem(VISIBILITY_KEY); else localStorage.setItem(VISIBILITY_KEY, "hidden"); } catch { /* applies to this page */ }
}

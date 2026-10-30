import { localizedCatalog, tr } from "@/i18n";
import { MID_AUTUMN, SPRING_FESTIVAL } from "@/learning/academy/achievement-catalog";

/** Gold and starlight achievements carry painted centre art; the rest show
 * their category's seal character. */
export const BADGE_ART = new Set([
  "hundred-stars", "three-schools", "thirty-days", "twelve-weeks", "fifty-alone", "fifty-questions", "five-constellations", "one-domain",
  "ten-ring-max", "alan-30", "doudou-30", "sufei-30", "hundredth", "pi-day", "summer", "many-stars", "hundred-days", "two-hundred",
  "qiming-full", "xinghui-full", "xingqiong-full", "old-friend", "leap-day",
]);

export const RARITY_NAME = localizedCatalog({ b: "铜", s: "银", g: "金", x: "星耀" } as const);

export interface SeasonWindow { id: string; label: string; year: number; start: string; end: string }

const DAY = 86_400_000;
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/** The seasonal windows of one calendar year, in the same local dates the
 * history service uses. A lunar festival missing from the table is left out. */
export function seasonWindows(year: number): SeasonWindow[] {
  const at = (md: string) => `${year}-${md}`;
  const list: SeasonWindow[] = [
    { id: "new-year", label: tr("元旦 · 新年第一课"), year, start: at("01-01"), end: at("01-03") },
    { id: "winter", label: tr("寒假星旅"), year, start: at("01-15"), end: at("02-20") },
    { id: "pi-day", label: tr("π 日"), year, start: at("03-14"), end: at("03-14") },
    { id: "summer", label: tr("暑期星旅"), year, start: at("07-01"), end: at("08-31") },
    { id: "school-start", label: tr("开学季"), year, start: at("09-01"), end: at("09-14") },
    { id: "national-day", label: tr("国庆 · 长假星旅"), year, start: at("10-01"), end: at("10-07") },
  ];
  if ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) list.push({ id: "leap-day", label: tr("闰日"), year, start: at("02-29"), end: at("02-29") });
  const autumn = MID_AUTUMN[year];
  if (autumn) list.push({ id: "mid-autumn", label: tr("中秋 · 月下观星"), year, start: shift(at(autumn), -3), end: shift(at(autumn), 3) });
  const spring = SPRING_FESTIVAL[year];
  if (spring) {
    list.push({ id: "spring-festival", label: tr("春节 · 星灯守岁"), year, start: shift(at(spring), -1), end: shift(at(spring), 6) });
    list.push({ id: "lantern", label: tr("元宵 · 灯谜之夜"), year, start: shift(at(spring), 13), end: shift(at(spring), 15) });
  }
  return list.sort((a, b) => a.start.localeCompare(b.start));
}

/** Windows that are open now or open within the coming year, soonest first. */
export function upcomingSeasons(today: string, limit = 8): (SeasonWindow & { open: boolean; daysAway: number })[] {
  const year = Number(today.slice(0, 4));
  return [...seasonWindows(year), ...seasonWindows(year + 1)]
    .filter((window) => window.end >= today && window.start <= shift(today, 366))
    .slice(0, limit)
    .map((window) => ({ ...window, open: window.start <= today, daysAway: Math.max(0, Math.round((Date.parse(window.start) - Date.parse(today)) / DAY)) }));
}

export function localToday(now = new Date()): string {
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** 早上好 / 下午好 … by the learner's clock. */
export function timeGreeting(hour: number): string {
  if (hour < 5) return tr("夜深了");
  if (hour < 9) return tr("早上好");
  if (hour < 11) return tr("上午好");
  if (hour < 13) return tr("中午好");
  if (hour < 18) return tr("下午好");
  return tr("晚上好");
}

/** Monday to Sunday of the learner's current week, as local dates. */
export function currentWeek(today: string): string[] {
  const date = new Date(`${today}T00:00:00Z`);
  const monday = date.getTime() - ((date.getUTCDay() + 6) % 7) * 86_400_000;
  return Array.from({ length: 7 }, (_, i) => new Date(monday + i * 86_400_000).toISOString().slice(0, 10));
}

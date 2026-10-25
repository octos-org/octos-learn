import { TEACHERS, type TeacherDefinition } from "../teachers/teachers";

/** One block of Octos `MEMORY.md`: `text (updated: 2026-10-23) ^mabc234`.
 * Blocks without an id (a legacy file) are shown but cannot be targeted by
 * correct/forget requests. */
export interface MemoryEntry {
  id: string | null;
  text: string;
  updated: string | null;
}

export function parseMemoryEntries(longTerm: string): MemoryEntry[] {
  return longTerm.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean).map((block) => {
    const id = block.match(/\s(\^m[a-z2-7]{6})$/);
    const body = id ? block.slice(0, id.index).trim() : block;
    const updated = [...body.matchAll(/\(updated:\s*([^,)]+)/g)].at(-1)?.[1]?.trim();
    return {
      id: id?.[1] ?? null,
      text: body.replace(/\s*\((?:updated|imported):[^)]*\)/g, "").trim(),
      updated: updated && updated !== "unknown" ? updated : null,
    };
  });
}

export type MemoryGroup = "all" | TeacherDefinition["id"] | "me" | "other";

const EVERY_TEACHER = /所有老师|每位老师|全部老师/;
const TEACHING = /老师|讲题|讲解|讲课|举例|例子|比喻|推导|结论|解释|节奏/;
const LEARNER = /学|课|题|数学|物理|化学|生物|英语|语文|历史|地理|考试|期中|期末|作业|练习|复习|年级|函数|方程|几何|喜欢|爱好|兴趣|擅长|目标/;

/** Octos memory is plain text, so the group is read from the wording: a named
 * preset teacher, teaching in general, the learner, or anything else (folded
 * away as unrelated to learning). This is a display hint, never a scope rule. */
export function memoryGroup(text: string): MemoryGroup {
  const named = TEACHERS.filter((teacher) => [teacher.name, ...(teacher.formerNames ?? [])].some((name) => text.includes(name)));
  if (named.length === 1 && !EVERY_TEACHER.test(text)) return named[0].id;
  if (named.length > 1 || EVERY_TEACHER.test(text) || TEACHING.test(text)) return "all";
  return LEARNER.test(text) ? "me" : "other";
}

export function memoryGroupLabel(group: MemoryGroup): string {
  if (group === "all") return "所有老师";
  if (group === "me") return "关于我";
  if (group === "other") return "其他";
  return TEACHERS.find((teacher) => teacher.id === group)?.name ?? group;
}

/** Prefix that keeps the learner's chosen scope in the request text, in the
 * same wording Octos extraction uses for participant scope. */
export function scopedContent(group: Exclude<MemoryGroup, "other">, content: string): string {
  const text = content.trim();
  if (group === "all") return `对所有老师：${text}`;
  if (group === "me") return text;
  return `只对${memoryGroupLabel(group)}老师：${text}`;
}

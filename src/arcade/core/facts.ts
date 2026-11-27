// Skills, facts and the forms they are asked in (plan §4.1, §4.2).
// Every answer is computed here, never by a model.

export type Operation = "add" | "sub" | "mul" | "div";

export interface Fact {
  /** Canonical id: add:3:4, sub:7:4, mul:6:7, div:42:7. */
  id: string;
  op: Operation;
  /** The two operands as written: a + b, c − b, a × b, c ÷ d. */
  left: number;
  right: number;
  answer: number;
  /**
   * Facts that share a number triple, for display and later analysis. The
   * operation group is part of the id, because 2 + 2 and 2 × 2 share numbers.
   */
  family: string;
}

/**
 * - `result`: a + b = □
 * - `missing-left`: □ + b = c
 * - `missing-right`: a + □ = c
 */
export type FactForm = "result" | "missing-left" | "missing-right";

export type SkillId = "add-sub-5" | "add-sub-10" | "add-sub-20" | "mul-2-5-10" | "mul-3-4-8" | "mul-div-100";

export interface Skill {
  id: SkillId;
  /** Chinese source text for `tr()`. */
  name: string;
  /** Who the skill suits, in plain words (Chinese source text for `tr()`). */
  ages: string;
  standard: string;
  /** Star map topic, used from M5. */
  topicId: string;
  facts: readonly Fact[];
  /** Missing-addend forms appear in about 20% of addition items. */
  missingAddend: boolean;
}

export const OPERATION_GLYPH: Record<Operation, string> = { add: "+", sub: "−", mul: "×", div: "÷" };

const INTERNED = new Map<string, Fact>();

/** One object per fact id, shared by every skill that contains it. */
export function makeFact(op: Operation, left: number, right: number): Fact {
  const id = `${op}:${left}:${right}`;
  const known = INTERNED.get(id);
  if (known) return known;
  const fact = buildFact(op, left, right);
  INTERNED.set(id, fact);
  return fact;
}

function buildFact(op: Operation, left: number, right: number): Fact {
  const answer = op === "add" ? left + right : op === "sub" ? left - right : op === "mul" ? left * right : left / right;
  if (!Number.isInteger(answer) || answer < 0) throw new Error(`Not a whole-number fact: ${op}:${left}:${right}`);
  const group = op === "add" || op === "sub" ? "as" : "md";
  // The family is named by its two parts and their total or product.
  const [x, y, whole] = op === "add" || op === "mul" ? [left, right, answer] : [answer, right, left];
  return { id: `${op}:${left}:${right}`, op, left, right, answer, family: `fam:${group}:${Math.min(x, y)}:${Math.max(x, y)}:${whole}` };
}

function addSubWithin(n: number): Fact[] {
  const facts: Fact[] = [];
  for (let a = 0; a <= n; a++) for (let b = 0; a + b <= n; b++) facts.push(makeFact("add", a, b));
  for (let c = 0; c <= n; c++) for (let b = 0; b <= c; b++) facts.push(makeFact("sub", c, b));
  return facts;
}

function addSubOneDigit(): Fact[] {
  const facts: Fact[] = [];
  for (let a = 0; a <= 9; a++) for (let b = 0; b <= 9; b++) facts.push(makeFact("add", a, b));
  for (let a = 0; a <= 9; a++) for (let b = 0; b <= 9; b++) facts.push(makeFact("sub", a + b, b));
  return facts;
}

/** Products of 0–10 by 0–10 where a factor is in `tables` (all when omitted), and their divisions. */
function mulDiv(tables?: readonly number[]): Fact[] {
  const products: Fact[] = [];
  for (let a = 0; a <= 10; a++) {
    for (let b = 0; b <= 10; b++) {
      if (!tables || tables.includes(a) || tables.includes(b)) products.push(makeFact("mul", a, b));
    }
  }
  const divisions = products.filter(fact => fact.right !== 0).map(fact => makeFact("div", fact.answer, fact.right));
  return [...products, ...divisions];
}

export const SKILLS: readonly Skill[] = [
  { id: "add-sub-5", name: "5 以内加减", ages: "幼儿园", standard: "K.OA.A.5", topicId: "mt_ghF3Vv6taM", facts: addSubWithin(5), missingAddend: false },
  { id: "add-sub-10", name: "10 以内加减", ages: "一年级", standard: "1.OA.C.6", topicId: "mt__we2TDqnJx", facts: addSubWithin(10), missingAddend: true },
  { id: "add-sub-20", name: "20 以内加减", ages: "一、二年级", standard: "2.OA.B.2", topicId: "mt__t4afSyZRm", facts: addSubOneDigit(), missingAddend: true },
  { id: "mul-2-5-10", name: "2、5、10 的乘除", ages: "三年级", standard: "3.OA.C.7", topicId: "mt_HhuSDxwDNM", facts: mulDiv([2, 5, 10]), missingAddend: false },
  { id: "mul-3-4-8", name: "3、4、8 的乘除", ages: "三年级", standard: "3.OA.C.7", topicId: "mt_wQ89AEXhz3", facts: mulDiv([3, 4, 8]), missingAddend: false },
  { id: "mul-div-100", name: "10×10 以内乘除", ages: "三、四年级", standard: "3.OA.C.7", topicId: "mt_K5jM7vlVhA", facts: mulDiv(), missingAddend: false },
];

export function skillById(id: string): Skill | undefined {
  return SKILLS.find(skill => skill.id === id);
}

const FACTS_BY_ID = new Map(SKILLS.flatMap(skill => skill.facts).map(fact => [fact.id, fact]));
export function factById(id: string): Fact | undefined {
  return FACTS_BY_ID.get(id);
}

export interface Item {
  fact: Fact;
  form: FactForm;
}

/** What the child must give for this item. */
export function expectedAnswer(item: Item): number {
  if (item.form === "missing-left") return item.fact.left;
  if (item.form === "missing-right") return item.fact.right;
  return item.fact.answer;
}

/** The fact strip as tokens; `null` is the blank the child fills. */
export function promptTokens(item: Item): (string | null)[] {
  const { fact, form } = item;
  const glyph = OPERATION_GLYPH[fact.op];
  if (form === "missing-left") return [null, glyph, String(fact.right), "=", String(fact.answer)];
  if (form === "missing-right") return [String(fact.left), glyph, null, "=", String(fact.answer)];
  return [String(fact.left), glyph, String(fact.right), "=", null];
}

export function promptText(item: Item, blank = "□"): string {
  return promptTokens(item).map(token => token ?? blank).join(" ");
}

/**
 * Rough ease, for introducing new facts easiest first (plan §4.5): smaller
 * numbers first; for tables, ×0, ×1, ×2, ×5 and ×10 before the others.
 */
export function factEase(fact: Fact): number {
  if (fact.op === "add" || fact.op === "sub") {
    const whole = fact.op === "add" ? fact.answer : fact.left;
    return whole * 2 + (fact.op === "sub" ? 1 : 0);
  }
  const easyTables = [0, 1, 2, 10, 5];
  const factors = fact.op === "mul" ? [fact.left, fact.right] : [fact.answer, fact.right];
  const rank = (n: number) => (easyTables.includes(n) ? easyTables.indexOf(n) : 10 + n);
  return Math.min(...factors.map(rank)) * 200 + Math.max(...factors.map(rank)) * 2 + (fact.op === "div" ? 1 : 0);
}

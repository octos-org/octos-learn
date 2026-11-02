// Personal details in what a learner says on their cards. A lesson is narrated
// from these words, so before it is shared the learner removes anything that
// says who or where they are. These rules catch the clear patterns; Octo's
// review looks for the rest (such as a friend's name) and the learner decides.

export type PersonalDetailKind = "email" | "phone" | "link" | "address" | "school" | "name" | "age" | "birthday" | "home";

export interface PersonalDetail {
  kind: PersonalDetailKind;
  /** The words as they appear, so the learner can find and change them. */
  quote: string;
}

/** A plain word (letters only) in any letter case, for rules whose other parts must keep their case. */
const anyCase = (words: string) => words.replace(/[a-z]/gi, (letter) => `[${letter.toUpperCase()}${letter.toLowerCase()}]`);

const STREET = "(?:street|st\\.?|avenue|ave\\.?|road|rd\\.?|boulevard|blvd\\.?|lane|ln\\.?|drive|dr\\.?|court|ct\\.?|way|place|pl\\.?|circle|terrace|parkway)";
const SCHOOL = `(?:${["elementary", "middle", "high", "primary", "junior high", "charter"].map((word) => word.split(" ").map(anyCase).join("\\s+")).join("|")})\\s+${anyCase("school")}|${anyCase("academy")}|${anyCase("school")}\\s+${anyCase("district")}`;
const CAPITALIZED = "[A-Z][a-z'’-]+(?:\\s+[A-Z][a-z'’-]+){0,2}";

const RULES: Array<{ kind: PersonalDetailKind; pattern: RegExp }> = [
  { kind: "email", pattern: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g },
  { kind: "link", pattern: /\b(?:https?:\/\/|www\.)\S+|\b[\w-]+\.(?:com|net|org|edu|io|me)\b(?:\/\S*)?/gi },
  { kind: "link", pattern: /(?:^|\s)@[A-Za-z_][\w.]{2,}/g },
  // Phone numbers: 10-digit US forms and 11-digit mainland mobiles, not lone math numbers.
  { kind: "phone", pattern: /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g },
  { kind: "phone", pattern: /(?<!\d)1[3-9]\d{9}(?!\d)/g },
  { kind: "address", pattern: new RegExp(`\\b\\d{1,5}\\s+(?:[A-Z][a-z]+\\s+){1,3}${STREET}\\b`, "gi") },
  { kind: "home", pattern: /\bI\s+live\s+(?:in|on|at|near)\s+[^.,!?]+/gi },
  { kind: "school", pattern: new RegExp(`\\b(?:${CAPITALIZED}\\s+)(?:${SCHOOL})\\b`, "g") },
  { kind: "school", pattern: /\b(?:my|our)\s+school\s+is\s+[^.,!?]+/gi },
  { kind: "name", pattern: new RegExp(`\\b(?:${anyCase("my name is")}|${anyCase("my name's")}|${anyCase("call me")})\\s+${CAPITALIZED}`, "g") },
  { kind: "name", pattern: new RegExp(`\\bI(?:'m| am)\\s+(?!a\\b|an\\b|the\\b|going\\b|not\\b|so\\b|now\\b|done\\b|here\\b|sure\\b|ready\\b|[0-9])${CAPITALIZED}\\b(?=[.,!?]|\\s+and\\b|$)`, "g") },
  { kind: "name", pattern: new RegExp(`\\b(?:Mr|Mrs|Ms|Miss|Dr)\\.?\\s+${CAPITALIZED}`, "g") },
  { kind: "age", pattern: /\bI(?:'m| am)\s+\d{1,2}\s*(?:years?\s*old|yrs?\b)|\bI(?:'m| am)\s+(?:in\s+)?(?:\d{1,2}(?:st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\s+grade\b/gi },
  { kind: "birthday", pattern: /\bmy\s+birthday\s+is\s+[^.,!?]+/gi },
  // Chinese
  { kind: "name", pattern: /我叫[一-鿿]{1,4}|我的名字(?:是|叫)[一-鿿]{1,4}/g },
  { kind: "school", pattern: /[一-鿿]{2,10}(?:小学|中学|初中|高中|学校)/g },
  { kind: "home", pattern: /我(?:家)?住在[^，。！？,.!?]+/g },
  { kind: "age", pattern: /我(?:今年)?[0-9一二三四五六七八九十]{1,3}岁/g },
];

/** The personal details these rules find in some words, each once, in order of appearance. */
export function findPersonalDetails(text: string): PersonalDetail[] {
  const found: Array<PersonalDetail & { at: number }> = [];
  for (const { kind, pattern } of RULES) {
    for (const match of text.matchAll(pattern)) {
      const quote = match[0].trim();
      const at = (match.index ?? 0) + match[0].indexOf(quote);
      // A longer finding already covering this text wins.
      if (found.some((item) => at >= item.at && at + quote.length <= item.at + item.quote.length)) continue;
      for (let index = found.length - 1; index >= 0; index -= 1) {
        const item = found[index]!;
        if (item.at >= at && item.at + item.quote.length <= at + quote.length) found.splice(index, 1);
      }
      found.push({ kind, quote, at });
    }
  }
  return found.sort((a, b) => a.at - b.at).map(({ kind, quote }) => ({ kind, quote }));
}

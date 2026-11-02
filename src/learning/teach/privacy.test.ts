import { describe, expect, it } from "vitest";

import { findPersonalDetails } from "./privacy";

const kinds = (text: string) => findPersonalDetails(text).map((detail) => [detail.kind, detail.quote]);

describe("findPersonalDetails", () => {
  it.each([
    ["Hi, my name is Jordan Lee and this is slope.", [["name", "my name is Jordan Lee"]]],
    ["I'm Maya, and today we learn fractions.", [["name", "I'm Maya"]]],
    ["I am 10 years old.", [["age", "I am 10 years old"]]],
    ["I'm in 5th grade.", [["age", "I'm in 5th grade"]]],
    ["I go to Lincoln Elementary School.", [["school", "Lincoln Elementary School"]]],
    ["Our school is the one by the park.", [["school", "Our school is the one by the park"]]],
    ["My teacher Ms. Garcia showed us this.", [["name", "Ms. Garcia"]]],
    ["I live on Maple Street, so", [["home", "I live on Maple Street"]]],
    ["Come to 42 Oak Hill Road!", [["address", "42 Oak Hill Road"]]],
    ["Email me at jordan.lee@gmail.com", [["email", "jordan.lee@gmail.com"]]],
    ["Call 555-123-4567 for help.", [["phone", "555-123-4567"]]],
    ["Text (415) 555 0199 anytime", [["phone", "(415) 555 0199"]]],
    ["Follow @mathkid_42 on there.", [["link", "@mathkid_42"]]],
    ["Watch www.example.com/me", [["link", "www.example.com/me"]]],
    ["My birthday is May 3rd.", [["birthday", "My birthday is May 3rd"]]],
    ["我叫李明，今天讲斜率。", [["name", "我叫李明"]]],
    ["我在光明小学上学。", [["school", "我在光明小学"]]],
    ["我今年十岁。", [["age", "我今年十岁"]]],
    ["我家住在人民路。", [["home", "我家住在人民路"]]],
    ["电话13812345678", [["phone", "13812345678"]]],
  ])("finds %s", (text, expected) => {
    expect(kinds(text)).toEqual(expected);
  });

  it.each([
    "Point A is at 1 comma 2 and point B is at 4 comma 8.",
    "Rise over run is 6 over 3, so the slope is 2.",
    "I'm going to draw the line now.",
    "I am not sure, so let's check it on the graph.",
    "The answer is 1234567890 divided by 10.",
    "A box that is 4 by 3 by 2 has volume 24.",
    "y = 2x + 1 passes through (0, 1).",
    "I am ready. Let's start with the unit circle.",
    "Sine of pi over 2 is 1.",
    "斜率就是有多陡，比如三分之六等于二。",
  ])("leaves math and ordinary speech alone: %s", (text) => {
    expect(findPersonalDetails(text)).toEqual([]);
  });
});

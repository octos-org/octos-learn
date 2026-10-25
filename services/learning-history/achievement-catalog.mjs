// The achievement catalog, shared by the history service (which decides awards
// from recorded facts) and the app (which shows names, conditions and titles).
// Conditions state only what is recorded; nothing here means mastery.
// Rarity: b bronze, s silver, g gold, x starlight. `hidden` stays "？？？"
// until earned. `title` is unlocked by earning it. `season` awards repeat
// once per calendar year (scope = the year), so a missed one comes back.

export const ACHIEVEMENT_CATEGORIES = Object.freeze([
  { id: "trail", name: "足迹", seal: "迹", description: "在星图上走过的地方" },
  { id: "keep", name: "坚持", seal: "恒", description: "一次次回来，不计较中断" },
  { id: "hand", name: "亲手", seal: "手", description: "动手做练习，由程序判定是否达成" },
  { id: "ask", name: "好问题", seal: "问", description: "提问、框选、追问" },
  { id: "sky", name: "星图", seal: "星", description: "连成星座、点亮星域、星环升级" },
  { id: "bond", name: "老师羁绊", seal: "缘", description: "和每位老师一起上的课" },
  { id: "hidden", name: "隐藏", seal: "隐", description: "获得之前不会告诉你是什么" },
  { id: "season", name: "限时", seal: "时", description: "每年固定的日子，错过了明年还有" },
]);

const A = (id, category, name, condition, rarity, extra = {}) => Object.freeze({ id, category, name, condition, rarity, ...extra });

export const ACHIEVEMENTS = Object.freeze([
  A("first-footprint", "trail", "第一个脚印", "第一次听完一段讲解", "b"),
  A("first-star", "trail", "初见星光", "点亮第 1 颗星（不看提示做出一个练习）", "b"),
  A("ten-stars", "trail", "十星成列", "点亮 10 颗星", "b", { target: 10 }),
  A("fifty-stars", "trail", "五十星图", "点亮 50 颗星", "s", { target: 50 }),
  A("hundred-stars", "trail", "百星观测者", "点亮 100 颗星", "g", { target: 100, title: "观测者" }),
  A("many-stars", "trail", "群星之主", "点亮 300 颗星", "x", { target: 300, title: "星图之主" }),
  A("new-domain", "trail", "新领域", "在第 2 个星域留下足迹", "b", { target: 2 }),
  A("three-domains", "trail", "星图旅人", "在 3 个星域留下足迹", "s", { target: 3, title: "星图旅人" }),
  A("five-domains", "trail", "五域行者", "在 5 个星域留下足迹", "s", { target: 5 }),
  A("three-schools", "trail", "跨越学部", "在启明、星辉、星穹三个学部各点亮至少 1 颗星", "g", { target: 3 }),

  A("regular-guest", "keep", "常客", "同一个知识点，在第 3 个不同的日子回来", "b", { scoped: "topic" }),
  A("reunion", "keep", "重逢", "隔了两周以上，又回到一个知识点", "b", { scoped: "topic" }),
  A("three-days", "keep", "三日之约", "在 3 个不同的日子来学习", "b", { target: 3 }),
  A("seven-days", "keep", "七日星灯", "累计 7 个不同的日子来学习", "s", { target: 7 }),
  A("thirty-days", "keep", "守灯人", "累计 30 个不同的日子来学习", "g", { target: 30, title: "守灯人" }),
  A("hundred-days", "keep", "百日星守", "累计 100 个不同的日子来学习", "x", { target: 100, title: "百日星守" }),
  A("four-weeks", "keep", "周周相见", "连续 4 周，每周至少来学习 1 次", "s", { target: 4 }),
  A("twelve-weeks", "keep", "一学期的星", "连续 12 周，每周至少来学习 1 次", "g", { target: 12 }),
  A("return-30", "keep", "故人归来", "隔了 30 天以上，又回来学习", "s"),

  A("did-it-alone", "hand", "亲手搞定", "没有打开提示，完成一个练习", "b"),
  A("first-try", "hand", "一次就中", "第一次尝试就达成练习目标", "b"),
  A("try-again", "hand", "越挫越勇", "没达成后再试，然后达成", "b"),
  A("five-tries", "hand", "百折不挠", "同一个练习试了 5 次以上，最后达成", "s"),
  A("hint-wise", "hand", "会用提示", "看了提示后达成练习，累计 5 次", "b", { target: 5 }),
  A("ten-alone", "hand", "熟练的手", "不看提示完成 10 个练习", "s", { target: 10 }),
  A("fifty-alone", "hand", "精确测绘员", "不看提示完成 50 个练习", "g", { target: 50, title: "精确测绘员" }),
  A("full-board", "hand", "满堂彩", "一节课里做了至少 2 个练习，全部达成", "s"),
  A("two-hundred", "hand", "千锤百炼", "累计达成 200 个练习", "x", { target: 200 }),

  A("first-question", "ask", "第一个问题", "第一次向老师提问", "b"),
  A("first-circle", "ask", "圈出疑问", "第一次在白板上框选一块提问", "b"),
  A("interrupt", "ask", "举手的勇气", "老师讲到一半时打断，提出问题", "b"),
  A("first-image", "ask", "看图提问", "第一次用照片或图片提问", "b"),
  A("ten-questions", "ask", "好奇心", "累计提问 10 次", "s", { target: 10 }),
  A("fifty-questions", "ask", "问题收藏家", "累计提问 50 次", "g", { target: 50, title: "问题收藏家" }),
  A("five-in-lesson", "ask", "为什么之王", "同一块白板上，一天里提问 5 次", "s"),
  A("follow-up", "ask", "追问到底", "在同一块白板上连续追问 3 次（每次相隔不超过 10 分钟）", "s"),

  A("first-constellation", "sky", "第一个星座", "连成一个星座：一颗星和它的全部前置星都点亮", "s"),
  A("five-constellations", "sky", "星座猎人", "连成 5 个星座", "g", { target: 5 }),
  A("one-domain", "sky", "一域通明", "一个星域的星全部点亮", "g"),
  A("ring-max", "sky", "星环满盈", "一颗点亮的星，在 5 个不同的日子学过", "s"),
  A("ten-ring-max", "sky", "十颗金星", "10 颗点亮的星，各在 5 个不同的日子学过", "g", { target: 10 }),
  A("qiming-full", "sky", "启明满天", "启明部（小学）数学的星全部点亮", "x"),
  A("xinghui-full", "sky", "星辉满天", "星辉部（初中）数学的星全部点亮", "x"),
  A("xingqiong-full", "sky", "星穹满天", "星穹部（高中）数学的星全部点亮", "x"),

  A("alan-1", "bond", "初次夜课", "和阿澜上第一节课", "b", { teacher: "alan" }),
  A("alan-10", "bond", "值得收藏", "和阿澜上 10 节课", "s", { teacher: "alan", target: 10 }),
  A("alan-30", "bond", "观星同道", "和阿澜上 30 节课", "g", { teacher: "alan", target: 30, title: "观星同道" }),
  A("doudou-1", "bond", "第一个戏法", "和窦鸢上第一节课", "b", { teacher: "doudou" }),
  A("doudou-10", "bond", "幻象搭档", "和窦鸢上 10 节课", "s", { teacher: "doudou", target: 10 }),
  A("doudou-30", "bond", "幻象学徒", "和窦鸢上 30 节课", "g", { teacher: "doudou", target: 30, title: "幻象学徒" }),
  A("sufei-1", "bond", "第一次核对", "和苏绯上第一节课", "b", { teacher: "sufei" }),
  A("sufei-10", "bond", "有来有据", "和苏绯上 10 节课", "s", { teacher: "sufei", target: 10 }),
  A("sufei-30", "bond", "测绘助手", "和苏绯上 30 节课", "g", { teacher: "sufei", target: 30, title: "测绘助手" }),
  A("three-teachers", "bond", "三师同堂", "和三位老师都上过课", "s", { target: 3, title: "学院学徒" }),

  A("night-owl", "hidden", "星夜学者", "晚上 9 点以后听完一段讲解", "s", { hidden: true, title: "星夜学者" }),
  A("early-star", "hidden", "晨星", "早上 4 点到 7 点之间开始学习", "s", { hidden: true, title: "晨星" }),
  A("three-a-day", "hidden", "一日三课", "一天里上了 3 节课", "s", { hidden: true }),
  A("weekend", "hidden", "周末不打烊", "同一个周末，周六和周日都来学习", "b", { hidden: true }),
  A("revisit", "hidden", "重温旧课", "隔了一周以上，回到一节学过的课继续", "b", { hidden: true }),
  A("first-voice", "hidden", "开口问", "第一次用语音提问", "b", { hidden: true }),
  A("two-teachers-topic", "hidden", "兼听则明", "同一个知识点，和两位老师都学过", "s", { hidden: true }),
  A("hundredth", "hidden", "整整一百", "达成的第 100 个练习，没有看提示", "g", { hidden: true }),
  A("three-stars-day", "hidden", "一夜三星", "一天里点亮 3 颗新星", "s", { hidden: true }),
  A("old-friend", "hidden", "老友", "和同一位老师上满 100 节课", "x", { hidden: true, title: "老友" }),

  A("school-start", "season", "开学季", "9 月 1 日至 14 日，学一节课", "b", { season: "9/1–9/14" }),
  A("mid-autumn", "season", "月下观星", "中秋节前后三天，学一节课", "s", { season: "中秋 ±3 天" }),
  A("national-day", "season", "长假星旅", "10 月 1 日至 7 日，有 3 天来学习", "s", { season: "10/1–10/7" }),
  A("new-year", "season", "新年第一课", "1 月 1 日至 3 日，学一节课", "b", { season: "1/1–1/3" }),
  A("winter", "season", "寒假星旅", "1 月 15 日至 2 月 20 日，有 7 天来学习", "s", { season: "1/15–2/20" }),
  A("spring-festival", "season", "星灯守岁", "除夕到初七，学一节课", "s", { season: "除夕–初七" }),
  A("lantern", "season", "灯谜之夜", "元宵节前后一天，达成一个练习", "s", { season: "元宵 ±1 天" }),
  A("pi-day", "season", "π 日", "3 月 14 日，学一节和圆有关的课", "g", { season: "3/14", title: "π 的朋友" }),
  A("summer", "season", "暑期星旅", "7 月 1 日至 8 月 31 日，有 10 天来学习", "g", { season: "7/1–8/31" }),
  A("leap-day", "season", "闰日旅人", "2 月 29 日（四年一次），学一节课", "x", { season: "2/29", title: "闰日旅人" }),
]);

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map(item => [item.id, item]));

/** Titles: a default one plus one per titled achievement; the id is the
 * granting achievement's id. */
export const DEFAULT_TITLE = Object.freeze({ id: "default", name: "启明学徒" });
export const TITLES = Object.freeze([DEFAULT_TITLE, ...ACHIEVEMENTS.filter(item => item.title).map(item => Object.freeze({ id: item.id, name: item.title }))]);

// Lunar festivals by Gregorian date. Spring Festival 2026–2035 and Mid-Autumn
// 2026–2032 were checked against published calendars on 2026-10-25; extend
// this table before 2033. A year missing here simply offers no such award.
export const SPRING_FESTIVAL = Object.freeze({ 2026: "02-17", 2027: "02-06", 2028: "01-26", 2029: "02-13", 2030: "02-03", 2031: "01-23", 2032: "02-11", 2033: "01-31", 2034: "02-19", 2035: "02-08" });
export const MID_AUTUMN = Object.freeze({ 2026: "09-25", 2027: "09-15", 2028: "10-03", 2029: "09-22", 2030: "09-12", 2031: "10-01", 2032: "09-21" });

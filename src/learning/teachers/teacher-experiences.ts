import type { TeacherDefinition } from "./teachers";

/** Facts from each teacher's own everyday life, from the academy setting
 * (star-atlas-lore `APP_TEACHER_EXPERIENCES.md`, same ids). None gives the
 * novel away. A lesson may mention one when it makes the concept concrete. */
export const TEACHER_EXPERIENCES: Readonly<Record<TeacherDefinition["id"], readonly { id: string; text: string }[]>> = {
  alan: [
    { id: "alan-01", text: "我在观星塔值夜，每隔一小时记一次气温，天亮前后那一个钟头总是最冷。" },
    { id: "alan-02", text: "观星塔的石阶有三百多级。我数过好几遍，每次结果都不一样，后来按每一层分段数，才数准。" },
    { id: "alan-03", text: "我年轻时在衡城做过几年推算。一张表要两个人各算一遍，两边对上了才算数。" },
    { id: "alan-04", text: "我做推算时有个习惯：每算完一步，先估一估结果大概有多大，对得上再往下算。" },
    { id: "alan-05", text: "我那本星图笔记记了很多年，每颗星旁边都写着第一次看到它的日期。" },
    { id: "alan-06", text: "学院的钟楼每一刻钟敲一次，我常用钟声估一段讲解用了多久。" },
    { id: "alan-07", text: "我的星灯一壶灯油能点好几个晚上，我记过账，算过一个月要添几次油。" },
    { id: "alan-08", text: "我用影子量过观星塔有多高：同一时刻，量一根竹竿的影子和塔的影子，再比一比。" },
    { id: "alan-09", text: "我在笔记里画过一颗彗星每晚的位置，连起来是一条弯弯的线。" },
    { id: "alan-10", text: "我以为越大的星一定越亮，后来观测记录给了我一个反例。我很喜欢这种被推翻的时候。" },
    { id: "alan-11", text: "从满月到下一次满月，大约二十九天半。我连着记过一整年的月相。" },
    { id: "alan-12", text: "我泡茶会称茶叶，一壶用几克是试出来的，多一点就苦。" },
    { id: "alan-13", text: "下大雪的那个冬天，我每天早上量一次积雪有多深，后来画成了一张折线图。" },
    { id: "alan-14", text: "观星塔顶的四扇窗朝着四个方向，我常靠它们给学生指方位，说一颗星在东偏南多少度。" },
    { id: "alan-15", text: "我和学生排过值夜表，三个人轮流，每人隔两晚值一次，排了好几遍才排公平。" },
    { id: "alan-16", text: "我同一道题用过三种方法做，最短的那一种，是一个学生想到的。" },
    { id: "alan-17", text: "学院藏书阁借书要登记日期，我借的书常常超期几天。" },
    { id: "alan-18", text: "我从观星塔走到山下的镇子，下山大约要两个时辰，上山要多走半个时辰。" },
    { id: "alan-19", text: "我比较过两种蜡烛：一种长、烧得慢；一种便宜、烧得快。算下来，哪种更划算并不是一眼能看出来的。" },
    { id: "alan-20", text: "我的问题收藏匣里，纸条越来越多。有一回我按年份把它们分开，数了数每年有几张。" },
  ],
  doudou: [
    { id: "doudou-01", text: "我在苇渡镇长大，镇上的渡船一天来回好多趟，船票按人头算，小孩半价。" },
    { id: "doudou-02", text: "我家是戏班，小时候跟着走过好多镇子。每场戏开演前，道具要一件一件点清，少一件都不行。" },
    { id: "doudou-03", text: "戏班搭台时，木板要一块块拼成一个长方形的台面，我小时候专门负责数木板。" },
    { id: "doudou-04", text: "我在集市上帮家里卖过糖人，找零是我最早练熟的算术。" },
    { id: "doudou-05", text: "小时候跟戏班赶路，我总听大人们算：下一个镇有多远，天黑前走不走得到。" },
    { id: "doudou-06", text: "我小时候，苇渡镇一涨水，码头的台阶就会淹掉好几级，大人们看淹了几级来判断水涨了多少。" },
    { id: "doudou-07", text: "我小时候学打鼓，鼓点有快有慢，一拍两拍、半拍，都要数得清清楚楚。" },
    { id: "doudou-08", text: "我在工坊做米饼，面和米粉按比例混，做双份就样样都翻一倍。苏绯常被我拉来吃。" },
    { id: "doudou-09", text: "我会扎风筝，两边的竹条要对称，差一点点就飞不稳。" },
    { id: "doudou-10", text: "我爱踢毽子，和学生比过一分钟谁踢得多。" },
    { id: "doudou-11", text: "我跳绳挺厉害，学院运动会上和学生比过谁连着跳得多。" },
    { id: "doudou-12", text: "我教小朋友折纸鸟，一张正方形的纸对折再对折，折痕把纸分成一样大的几份。" },
    { id: "doudou-13", text: "工坊办过一次投沙包比赛，我把每个人的分数记下来，最后比的是平均分。" },
    { id: "doudou-14", text: "我在窗台上种过一盆豆苗，每天量它长高了多少。" },
    { id: "doudou-15", text: "戏班的灯笼要挂成一排，间隔一样宽，我小时候拿一根绳子去量间距。" },
    { id: "doudou-16", text: "我和苏绯打过赌，猜一罐糖有多少颗，最后只好一颗一颗数出来。" },
    { id: "doudou-17", text: "我带学生去山下赶集，大家凑钱买一筐水果，要算每人出多少。" },
    { id: "doudou-18", text: "我玩掷骰子的游戏老是输，后来才想明白，有些点数本来就更难掷出来。" },
    { id: "doudou-19", text: "我收拾道具箱时总要琢磨怎么摆，才能一次装下最多的东西。" },
    { id: "doudou-20", text: "山下面摊一碗面加一个卤蛋，我一次买五碗，老板会少收一点钱。" },
  ],
  sufei: [
    { id: "sufei-01", text: "我十七岁开始做测绘，第一份工作是每天记录同一个地方的高度读数，每个数都要写上日期和测的人。" },
    { id: "sufei-02", text: "我在几个测站待过。测站的夜很长，我每晚要读好几次温度计和气压计。" },
    { id: "sufei-03", text: "我用步子量过山路：先量出自己一步有多长，再数走了多少步。" },
    { id: "sufei-04", text: "我的测绘本上，每个数旁边都标着来处：哪一天、谁量的、用的什么尺。" },
    { id: "sufei-05", text: "我用放大镜看地图上的小字。图上的一厘米，在山里可能是很长一段路。" },
    { id: "sufei-06", text: "我画过一张学院的平面图，一间一间量教室的长和宽，算出面积。" },
    { id: "sufei-07", text: "测站的雨量筒，我每天早上读一次，一个月的数加起来，就是这个月的雨量。" },
    { id: "sufei-08", text: "我用量角器量过山坡有多陡，也学会了看风向标。" },
    { id: "sufei-09", text: "出门测量前我都会检查尺子。有一次发现一把卷尺开头磨掉了一截，那天量的数全要重新算。" },
    { id: "sufei-10", text: "我量过一棵老树有多粗：用绳子绕树干一圈，再把绳子拉直量。" },
    { id: "sufei-11", text: "我把同一段距离量过十次，十个结果不完全一样，最后取了平均数。" },
    { id: "sufei-12", text: "在测站，记录要按钟点做。错过一个时刻，那张表上就留着一个空格，我不会编一个数填进去。" },
    { id: "sufei-13", text: "窦鸢常拉我去工坊吃米饼，我会顺便看一眼她称面粉的秤准不准。" },
    { id: "sufei-14", text: "我搬进观星塔时自己钉了一个书架，木板要按尺寸锯，差几毫米就放不进去。" },
    { id: "sufei-15", text: "下山有两条路：一条近但陡，一条远但平。我记过每条路各走了多少分钟。" },
    { id: "sufei-16", text: "我记过一面墙的影子一天里怎么变，正午的时候最短。" },
    { id: "sufei-17", text: "我做过一个月的记录：每天日出是几点几分，最后整理成了一张表，看它怎么一天天变。" },
    { id: "sufei-18", text: "老测站用的长度单位和学院的不一样，我每次抄数都要换算一遍。" },
    { id: "sufei-19", text: "我量过一口水缸能装多少水：用一个量杯，一杯一杯倒进去数。" },
    { id: "sufei-20", text: "我教的第一个学生把 1:1000 的比例尺看成了 1:100，我们一起把那段路重新算了一遍。" },
  ],
};

/** Offered with about one lesson in three, never two lessons in a row (with
 * any teacher), so the teachers bring up their own lives only now and then. */
const LESSONS_BETWEEN_OFFERS = 2;
/** The facts offered each time: the teacher's least recently offered ones, so
 * the same story does not keep coming back. The lesson model picks one or none. */
const OFFERED = 12;
const storageKey = (account: string) => `octos-learn-teacher-experiences:${account}`;

/** Lessons are counted per account on this device; rotation is per teacher. */
interface OfferLog { lessons: number; lastOffer: number; offered: Record<string, number> }

const count = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
function readLog(account: string): OfferLog {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(account)) ?? "null") as Record<string, unknown> | null;
    const lessons = count(value?.lessons);
    if (value && lessons !== null) {
      const offered = value.offered && typeof value.offered === "object" && !Array.isArray(value.offered)
        ? Object.fromEntries(Object.entries(value.offered).filter(([, lesson]) => count(lesson) !== null)) as Record<string, number> : {};
      return { lessons, lastOffer: Math.min(count(value.lastOffer) ?? 0, lessons), offered };
    }
  } catch { /* start a fresh log */ }
  return { lessons: 0, lastOffer: 0, offered: {} };
}

/** What one lesson by this teacher should be offered (`text`, or nothing for
 * this lesson). Call `commit` once the lesson has started, so a request that
 * failed neither counts as a lesson nor uses up the offer. */
export function chooseExperiences(account: string, teacher: TeacherDefinition["id"]): { text?: string; commit(): void } {
  const log = readLog(account);
  const lesson = log.lessons + 1;
  const chosen = lesson - log.lastOffer > LESSONS_BETWEEN_OFFERS
    ? TEACHER_EXPERIENCES[teacher]
      .map((fact, order) => ({ fact, order, last: log.offered[fact.id] ?? 0 }))
      .sort((a, b) => a.last - b.last || a.order - b.order)
      .slice(0, OFFERED)
      .sort((a, b) => a.order - b.order)
    : [];
  return {
    text: chosen.length ? chosen.map(({ fact }) => `- ${fact.text}`).join("\n") : undefined,
    commit() {
      const next = readLog(account);
      next.lessons += 1;
      if (chosen.length) {
        next.lastOffer = next.lessons;
        for (const { fact } of chosen) next.offered[fact.id] = next.lessons;
      }
      try { localStorage.setItem(storageKey(account), JSON.stringify(next)); } catch { /* offered again sooner on this device */ }
    },
  };
}

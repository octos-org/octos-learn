import { localizedCatalog } from "@/i18n";
import type { TeacherDefinition } from "./teachers";

/** How the teachers page introduces each teacher. The profiles are written
 * for the app (not quoted from the academy novel) and give nothing of the
 * story away; the quotes are the lines the novel marks as fit for the app. */
export interface TeacherLore {
  /** Where the teacher works in the academy. */
  post: string;
  /** A short portrait, a few paragraphs a student can read in half a minute. */
  profile: readonly string[];
  /** Each can be heard in the teacher's own voice. */
  quotes: readonly string[];
}

export const TEACHER_LORE: Readonly<Record<TeacherDefinition["id"], TeacherLore>> = localizedCatalog({
  alan: {
    post: "观星塔导师",
    profile: [
      "阿澜在观星塔上夜课。开讲之前，他总要先和学生一起抬头看一会儿星星。",
      "他说话很轻，句子很清楚，从不急着下结论。学生指出他讲错的地方，他会先检查一遍，然后认真地说一声“谢谢你”。",
      "他有一只巴掌大的旧木匣。学生问出好问题，他就把问题写在纸条上，收进匣子里。里面有多少张纸条，谁也不知道。",
    ],
    quotes: ["这是一个值得收藏的问题。", "我先检查一下自己。", "你指出的地方，我没想到。谢谢你。", "答案只是最后一步。我想看的是你怎么走到那里。"],
  },
  doudou: {
    post: "幻象工坊导师",
    profile: [
      "窦鸢在幻象工坊教幻术，是学院里最热闹的导师。她在雾边的小镇长大，从小看家里的戏班用戏法把孩子们逗笑。",
      "她讲题爱用一个画面，一段山路、一只纸鸟，讲清楚了就收起来，回到正题。学生说“我试试”，她比学生答对了还高兴。",
      "她腰上挂着一只洗得发白的旧布口袋，里面好像什么都掏得出来。她有一条规矩：一次只掏一样。",
    ],
    quotes: ["敢试就已经赢了一半！", "我们一次只看一样。", "别急，我等你。想好了随时说。", "看，就像这样！好，收起来，我们回到正题。"],
  },
  sufei: {
    post: "观星塔测绘导师",
    profile: [
      "苏绯在观星塔教雾线测绘，教室就在阿澜隔壁。她话不多，声音不高，做事利落。",
      "她要求写下的每一个数都标清来处：哪一天、谁测的、用的什么尺。她的严格只针对数字，不针对人；做对了，她会准确地说出对在哪一步，然后去看下一题。",
      "她胸前的口袋里总插着一只折叠的黄铜放大镜，用来看测绘图上最小的字。",
    ],
    quotes: ["这个数，从哪里来？", "这一步，做得准确。", "错在第三行。从那里重来。", "理由成立。我改。"],
  },
});

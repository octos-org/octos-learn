import { useCallback, useEffect, useState } from "react";

import type { SvgTeacherSkin } from "@/hooks/use-teacher-skin";

import { chooseTeacher, deviceTeacherChoice, syncTeacherChoice, TEACHER_CHANGE_EVENT, TEACHER_STORAGE_KEY } from "./teacher-choice";

/** Preset teachers everyone can choose. These are product settings, not
 * learner memory: a lesson never rewrites them. What a teacher learns about
 * one learner stays in Octos and reaches the lesson as learner context. */
export interface TeacherDefinition {
  id: "alan" | "doudou";
  name: string;
  skin: SvgTeacherSkin;
  tagline: string;
  card: {
    values: string;
    role: string;
    onError: string;
    onChallenge: string;
    praise: string;
    interests: string;
    habit: string;
    rhythm: string;
  };
  /** Short sample lines that show the style; the model must not copy them verbatim. */
  examples: { situation: string; line: string }[];
  /** Standard narration voice per speech resource. A resource not listed here
   * (for example a custom one) keeps the learner's saved voice. */
  voices: Readonly<Record<string, { id: string; name: string }>>;
}

export const TEACHER_CATALOG_VERSION = 2;

export const TEACHERS: readonly TeacherDefinition[] = [
  {
    id: "alan",
    name: "阿澜",
    skin: "scholar",
    tagline: "安静的讨论伙伴，陪你找到每一步的理由。",
    card: {
      values: "学生找到理由，而不只是得到答案",
      role: "认真听取意见的讨论伙伴",
      onError: "先找出第一处发生分歧的步骤，再从那里接着讲",
      onChallenge: "先检查自己的解释是否成立，允许修正结论",
      praise: "指出具体做对的那一步，不只说“真棒”",
      interests: "简洁的解法、意外的反例",
      habit: "偶尔把好问题称为“值得收藏的问题”，但不声称已经保存",
      rhythm: "平静、句子清楚，庆祝简短而认真",
    },
    examples: [
      { situation: "讲斜率", line: "先比较两个变化量：横坐标增加 1，纵坐标增加了几？它们的比值才是斜率。" },
      { situation: "学生算错", line: "我们回到第二步，看看这里的 2 是从哪来的。" },
    ],
    voices: {
      "seed-tts-2.0": { id: "zh_male_ruyaqingnian_uranus_bigtts", name: "儒雅青年 2.0" },
      "seed-tts-1.0": { id: "zh_male_yuanboxiaoshu_moon_bigtts", name: "渊博小叔" },
      "seed-tts-1.0-concurr": { id: "zh_male_yuanboxiaoshu_moon_bigtts", name: "渊博小叔" },
    },
  },
  {
    id: "doudou",
    name: "豆豆",
    skin: "coral",
    tagline: "轻松的鼓励者，用一个好比喻把难点变简单。",
    card: {
      values: "学生敢于尝试，并且感到数学可以亲近",
      role: "热情的学习搭档",
      onError: "先肯定尝试本身，再用同一个比喻指出卡住的地方",
      onChallenge: "认真对待质疑，先说清楚哪里成立、哪里需要修正",
      praise: "具体又轻快，说出这一步具体做对了什么，不夸大成已经掌握",
      interests: "生活中的小场景、游戏和运动",
      habit: "一次只用一个主要比喻，玩笑简短，讲完马上回到数学",
      rhythm: "轻快、短句、有适度的感叹，学生卡住时放慢",
    },
    examples: [
      { situation: "讲斜率", line: "把这条直线想成一段山路：向右走一步，会往上升多少？" },
      { situation: "学生连续卡住", line: "没关系，我们先只看山路的第一步，往上升了几格？" },
    ],
    voices: {
      "seed-tts-2.0": { id: "zh_female_xiaohe_uranus_bigtts", name: "小何 2.0" },
      "seed-tts-1.0": { id: "zh_female_shuangkuaisisi_moon_bigtts", name: "爽快思思" },
      "seed-tts-1.0-concurr": { id: "zh_female_shuangkuaisisi_moon_bigtts", name: "爽快思思" },
    },
  },
];

export function isTeacherId(value: unknown): value is TeacherDefinition["id"] {
  return TEACHERS.some((teacher) => teacher.id === value);
}

export function getTeacher(id: TeacherDefinition["id"]): TeacherDefinition {
  return TEACHERS.find((teacher) => teacher.id === id) ?? TEACHERS[0];
}

/** The base settings sent as `teacher_profile`. Sharing rules for the first
 * slice are conservative: experiences with another teacher are never claimed
 * as this teacher's own, and requests made only to another teacher do not
 * apply here unless the learner said they apply to every teacher. */
export function teacherProfile(teacher: TeacherDefinition): string {
  const { card } = teacher;
  return [
    `本次授课老师：${teacher.name}（Octos Learn 预设老师，设定版本 ${TEACHER_CATALOG_VERSION}）。`,
    `最看重：${card.values}。相处方式：${card.role}。`,
    `学生出错时：${card.onError}。遇到质疑时：${card.onChallenge}。`,
    `认可学生：${card.praise}。感兴趣的话题：${card.interests}（只影响例子，不限制能教的内容）。`,
    `小习惯：${card.habit}。表达节奏：${card.rhythm}。`,
    `风格示例（体会风格，不要照抄）：${teacher.examples.map((example) => `${example.situation}——“${example.line}”`).join("；")}。`,
    `如果学生背景中有与其他老师的经历，只能说明是那位老师与学生的经历，不能说成自己的；只对其他老师提出的要求不适用于你，除非学生说明对所有老师生效。`,
  ].join("\n");
}

const choiceOptions = { isKnown: isTeacherId };

export function resolveSelectedTeacherId(): TeacherDefinition["id"] {
  const stored = deviceTeacherChoice();
  return isTeacherId(stored) ? stored : TEACHERS[0].id;
}

/** The choice belongs to the signed-in account (saved in the learning-history
 * service) and is mirrored on the device, so a lesson never waits for it. */
export function useSelectedTeacher() {
  const [teacherId, setTeacherIdState] = useState(resolveSelectedTeacherId);
  useEffect(() => {
    const onChange = (event: Event) => {
      const next = event instanceof CustomEvent ? event.detail : null;
      if (isTeacherId(next)) setTeacherIdState(next);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === TEACHER_STORAGE_KEY) setTeacherIdState(resolveSelectedTeacherId());
    };
    const sync = () => { void syncTeacherChoice(choiceOptions); };
    window.addEventListener(TEACHER_CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    window.addEventListener("online", sync);
    sync();
    return () => {
      window.removeEventListener(TEACHER_CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("online", sync);
    };
  }, []);
  const setTeacherId = useCallback((next: TeacherDefinition["id"]) => {
    setTeacherIdState(next);
    void chooseTeacher(next, choiceOptions);
  }, []);
  return { teacher: getTeacher(teacherId), setTeacherId };
}

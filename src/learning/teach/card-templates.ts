import { tr } from "@/i18n";

/** Card titles a learner starts from; every one can be renamed or removed. */
export function defaultCardTitles(): string[] {
  return [tr("题目是什么"), tr("我的方法"), tr("试一试"), tr("为什么对")];
}

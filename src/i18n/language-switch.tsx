import { setLocale } from "./index";
import { useLocale } from "./use-locale";

export function LanguageSwitch() {
  const locale = useLocale();
  return <div className="language-switch" role="group" aria-label={locale === "zh-CN" ? "界面语言" : "Interface language"}>
    <button type="button" lang="zh-CN" aria-pressed={locale === "zh-CN"} onClick={() => setLocale("zh-CN")}>中文</button>
    <span aria-hidden="true">|</span>
    <button type="button" lang="en" aria-pressed={locale === "en-US"} onClick={() => setLocale("en-US")}>English</button>
  </div>;
}

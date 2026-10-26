import { TeacherPicker } from "@/settings/learning-companion-tab";

import { AcademyHeader } from "./academy-header";

/** Meet the academy's teachers and choose who teaches the next lesson. */
export function TeachersPage() {
  return (
    <main className="course-launcher academy-page">
      <div className="course-launcher-inner academy-wide">
        <AcademyHeader />
        <section className="academy-teachers" aria-labelledby="academy-teachers-title">
          <h1 id="academy-teachers-title" className="academy-title">我的老师</h1>
          <p className="academy-muted">选一位老师陪你上课。讲课风格和朗读音色从下一节新课开始生效。</p>
          <TeacherPicker />
        </section>
      </div>
    </main>
  );
}

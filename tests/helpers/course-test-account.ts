import { readFile } from "node:fs/promises";
import { localCoursePackFile } from "../../build/local-course-pack-server";
import type { Page } from "@playwright/test";

export async function installTestAccount(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("octos_session_token", "curated-course-e2e");
    localStorage.setItem("selected_profile", "curated-learner");
    localStorage.setItem("octos-learn:setup-skipped:curated-learner", "yes");
  });
  await page.routeWebSocket((url) => url.pathname.startsWith("/api/"), (socket) => socket.close());
  await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.startsWith("/api/learn/course-packs")) {
      const root = process.env.OCTOS_TEST_COURSE_CACHE;
      if (!root) return route.continue();
      const file = localCoursePackFile(root, pathname);
      return file ? route.fulfill({ status: 200, body: await readFile(file), contentType: file.endsWith('.json') ? 'application/json' : 'application/octet-stream' }) : route.fulfill({ status: 404 });
    }
    const responses: Record<string, unknown> = {
      "/api/auth/status": { bootstrap_mode: false, email_login_enabled: true },
      "/api/auth/me": {
        user: { id: "curated-learner", email: "learner@example.test", name: "Learner" },
        portal: { accessible_profiles: [{ id: "curated-learner", name: "Learner" }], home_profile_id: "curated-learner", can_access_admin_portal: false },
      },
      "/api/my/profile": { id: "curated-learner", name: "Learner", config: { llm: { primary: { family_id: "", model_id: "" } } } },
    };
    await route.fulfill({ status: pathname in responses ? 200 : 503, contentType: "application/json", body: JSON.stringify(responses[pathname] ?? {}) });
  });
}


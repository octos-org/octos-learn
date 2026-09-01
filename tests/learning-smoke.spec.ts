import { expect, test, type Page } from "@playwright/test";

async function installLearningMocks(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("octos_session_token", "octos-learn-e2e");
    localStorage.setItem("selected_profile", "learner");
    localStorage.setItem("octos_learning_auto_camera", "false");
    localStorage.setItem("octos_learning_input_mode", "text");
  });

  await page.route("**/api/auth/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        bootstrap_mode: false,
        email_login_enabled: true,
        admin_token_login_enabled: true,
        allow_self_registration: false,
      }),
    });
  });

  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "learner",
          email: "learner@example.test",
          name: "Learner",
        },
        portal: {
          accessible_profiles: [{ id: "learner", name: "Learner" }],
          can_access_admin_portal: false,
          home_profile_id: "learner",
        },
      }),
    });
  });
}

test("opens the standalone learning canvas at the product root", async ({ page }) => {
  await installLearningMocks(page);
  await page.goto("/?oll-fixture=unit-circle-sine");

  await expect(page.getByText("Octos Learning Canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: "打开学习会话列表" })).toBeVisible();
  await expect(page).toHaveTitle("Octos Learn");
});

test("redirects the inherited /learn URL to the standalone root", async ({ page }) => {
  await installLearningMocks(page);
  await page.goto("/learn?oll-fixture=geometry-v2");

  await expect(page).toHaveURL(/\/?(?:\?.*)?$/);
  await expect(page.getByText("Octos Learning Canvas")).toBeVisible();
});

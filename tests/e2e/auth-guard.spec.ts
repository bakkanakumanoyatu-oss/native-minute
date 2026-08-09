import { expect, test } from "@playwright/test";

test.describe("protected route guards", () => {
  test.use({
    storageState: {
      cookies: [],
      origins: []
    }
  });

  test("unauthenticated user is redirected to login before opening protected routes", async ({ page }) => {
    for (const targetPath of ["/scripts", "/setup/voice", "/progress"]) {
      const response = await page.goto(targetPath);

      expect(response).not.toBeNull();
      await expect(page).toHaveURL(/\/login\?/);
      const currentUrl = new URL(page.url());
      expect(currentUrl.pathname).toBe("/login");
      expect(currentUrl.searchParams.get("error")).toBe("login_required");
      expect(currentUrl.searchParams.get("next")).toBe(targetPath);
      await expect(page.getByText("続けるにはメールリンクでログインしてください。")).toBeVisible();
      await expect(page.getByText("ログイン後に練習へ戻ります")).toBeVisible();
    }
  });
});

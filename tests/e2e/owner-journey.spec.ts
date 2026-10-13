import { expect, test, type Page } from "@playwright/test";

const OWNER = "owner@e2e.ph";

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  const res = await page.request.get(`/api/dev/mailbox?to=${encodeURIComponent(email)}`, { headers: { accept: "application/json" } });
  const mails = (await res.json()) as { url: string }[];
  expect(mails.length).toBeGreaterThan(0);
  await page.goto(mails[0]!.url);
}

/** A real JPEG, different every call (so receipts aren't byte-identical duplicates). */
async function receiptPhoto(page: Page, label: string): Promise<Buffer> {
  const p = await page.context().newPage();
  await p.setContent(`<div style="width:420px;height:600px;background:#fff;font:20px monospace;padding:20px">OFFICIAL RECEIPT<br>${label}<br>${Date.now()}<br>TOTAL 1,120.00</div>`);
  const buf = await p.screenshot({ type: "jpeg", quality: 80 });
  await p.close();
  return buf;
}

test.describe.configure({ mode: "serial" });

test("owner: sign in → onboard → roadmap → price lookup → receipt → dashboard → CSV", async ({ page }) => {
  await signIn(page, OWNER);

  // Onboarding (first owner bootstraps the workspace).
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Restaurant name").fill("Kusina sa Port Barton");
  await page.getByText("Building", { exact: true }).click();
  await page.getByLabel("Target opening date").fill("2027-03-01");
  await page.getByLabel("Total you can spend to open").fill("3,500,000");
  await page.getByRole("button", { name: "Build my roadmap" }).click();

  // Overview answers the two questions.
  await expect(page.getByText("Cash on hand", { exact: true })).toBeVisible();
  await expect(page.getByText("Due in the next 14 days", { exact: true })).toBeVisible();
  await expect(page.getByText("Kusina sa Port Barton").first()).toBeVisible();
  await expect(page.getByText(/Port Barton, San Vicente, Palawan/).first()).toBeVisible();
  const plannedBefore = await page.locator("section").filter({ hasText: "○Planned" }).first().innerText();

  // The total shows on the Overview; editing it keeps what was typed when it's refused,
  // and takes the way people write budgets ("3m").
  const totalCard = page.locator("section").filter({ hasText: "Total you can spend" });
  await expect(totalCard).toContainText("₱3,500,000");
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/settings\/profile$/);
  const total = page.getByLabel("Total you can spend to open");
  await expect(total).toHaveValue("3500000");
  await total.fill("abc");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.locator("#f-totalBudget-err")).toContainText("2,500,000 or 2.5m");
  await expect(total).toHaveValue("abc");
  await total.fill("3m");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await expect(page.locator("#f-totalBudget-err")).toHaveCount(0);
  await page.goto("/");
  await expect(totalCard).toContainText("₱3,000,000");

  // Roadmap: building → permits are blocked in the right order.
  await page.getByRole("link", { name: "Roadmap" }).last().click();
  const mayors = page.getByRole("link", { name: /^Mayor.s \/ business permit/ });
  await expect(mayors).toContainText("Waiting");
  await expect(page.getByText("Unverified").first()).toBeVisible();

  // Price lookup on a task, then apply it as the estimate.
  await page.getByRole("link", { name: /^Buy kitchen and refrigeration equipment/ }).click();
  await page.getByRole("button", { name: "Look up prices" }).click();
  await expect(page.getByText("Found online — confirm").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Sample Palawan Trading", { exact: true })).toBeVisible();
  await expect(page.getByText("Unsourced Seller")).toHaveCount(0);
  await page.getByRole("button", { name: "Use this as the estimate" }).click();
  await expect(page.getByText("Applied — the budget moved with it.")).toBeVisible();
  await expect(page.getByText("Prices found online").first()).toBeVisible();

  await page.getByRole("link", { name: "Overview" }).last().click();
  const plannedAfter = await page.locator("section").filter({ hasText: "○Planned" }).first().innerText();
  expect(plannedAfter).not.toEqual(plannedBefore);

  // Receipt: capture → AI (fake) reads it → confirm → it's a payment.
  await page.goto("/receipts/capture");
  await page.getByTestId("gallery-input").setInputFiles({ name: "or.jpg", mimeType: "image/jpeg", buffer: await receiptPhoto(page, "first") });
  await expect(page).toHaveURL(/\/receipts$/);
  const toReview = page.locator("section").filter({ hasText: "To review" });
  await expect(toReview.getByRole("link").first()).toBeVisible({ timeout: 45_000 });
  await toReview.getByRole("link").first().click();

  await expect(page.getByRole("heading", { name: "Check this receipt" })).toBeVisible();
  const save = page.getByRole("button", { name: "Save as payment" });
  await expect(save).toBeDisabled();
  await page.getByRole("button", { name: /high-confidence field/ }).click();
  for (const label of ["How it was paid", "Budget line"]) {
    const btn = page.getByRole("button", { name: `Confirm ${label}` });
    if (await btn.isVisible()) await btn.click();
  }
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText("Saved — the payment is on the budget.")).toBeVisible();

  await page.getByRole("link", { name: "Overview" }).last().click();
  await expect(page.locator("section").filter({ hasText: "✓Paid" }).first()).toContainText("₱1,120");

  const csv = await page.request.get("/api/export/payments");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("1120.00");
});

test("offline: two receipts wait on the phone and upload once when signal returns", async ({ page, context }) => {
  await signIn(page, OWNER);
  await page.goto("/receipts");
  const before = await page.locator("section").filter({ hasText: "To review" }).getByRole("link").count();

  await page.goto("/receipts/capture");
  const a = await receiptPhoto(page, "offline A");
  const b = await receiptPhoto(page, "offline B");
  await context.setOffline(true);
  await page.getByTestId("gallery-input").setInputFiles([
    { name: "a.jpg", mimeType: "image/jpeg", buffer: a },
    { name: "b.jpg", mimeType: "image/jpeg", buffer: b },
  ]);
  await expect(page.getByText("Saved on this phone (2).")).toBeVisible();
  await expect(page.getByRole("heading", { name: "On this phone (2)" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Offline · 2 waiting/ })).toBeVisible();

  await context.setOffline(false);
  await page.getByRole("button", { name: "Send now" }).click();
  await expect(page.getByRole("heading", { name: /On this phone/ })).toHaveCount(0, { timeout: 30_000 });

  // Exactly two new receipts on the server — retries never double-upload.
  await page.goto("/receipts");
  const section = page.locator("section").filter({ hasText: "To review" });
  await expect(async () => {
    await page.reload();
    expect(await section.getByRole("link").count()).toBe(before + 2);
  }).toPass({ timeout: 45_000 });
});

/** Opt-in: SCREENSHOTS=1 pnpm e2e — phone-width screenshots of the main screens. */
test("screenshots", async ({ page }) => {
  test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1");
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, OWNER);
  const shot = (name: string) => page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });

  // Funding so cash on hand means something.
  await page.goto("/funding");
  await page.getByLabel("Name").fill("Donnrick's savings");
  await page.getByLabel("Amount promised").fill("2,000,000");
  await page.getByRole("button", { name: "Add funding source" }).click();
  await page.getByText("＋ Money received").click();
  await page.getByLabel("Amount received").fill("1,200,000");
  await page.getByRole("button", { name: "Record money received" }).click();
  await expect(page.getByText("Money received — cash on hand updated.")).toBeVisible();

  // A deposit due soon, partly paid, and a fridge that went over plan.
  for (const [cat, desc, planned, committed] of [
    ["Site", "Lease deposit + advance", "120,000", "120,000"],
    ["Equipment", "Two-door chiller", "45,000", "52,500"],
  ] as const) {
    await page.goto("/budget/new");
    await page.getByLabel("Category").selectOption({ label: cat });
    await page.getByLabel("What is it").fill(desc);
    await page.getByLabel("Planned").fill(planned);
    await page.getByLabel("Committed (optional)").fill(committed);
    await page.getByLabel("Due date (optional)").fill(new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10));
    await page.getByRole("button", { name: "Add line" }).click();
    await expect(page.getByRole("heading", { name: desc })).toBeVisible();
    if (desc.startsWith("Lease")) {
      await page.getByLabel("Amount paid").fill("60,000");
      await page.getByRole("button", { name: "Log payment" }).click();
      await expect(page.getByText("Payment logged.")).toBeVisible();
    }
  }
  await shot("line-detail");

  await page.goto("/");
  await shot("overview");
  await page.goto("/budget");
  await shot("budget");
  await page.goto("/roadmap");
  await shot("roadmap");
  await page.getByRole("link", { name: /^Buy kitchen and refrigeration equipment/ }).click();
  await shot("task-with-prices");

  await page.goto("/receipts/capture");
  await page.getByTestId("gallery-input").setInputFiles({ name: "or.jpg", mimeType: "image/jpeg", buffer: await receiptPhoto(page, "screenshot") });
  const toReview = page.locator("section").filter({ hasText: "To review" });
  await expect(toReview.getByRole("link").first()).toBeVisible({ timeout: 45_000 });
  await shot("receipts");
  await toReview.getByRole("link").first().click();
  await expect(page.getByRole("heading", { name: "Check this receipt" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 2200 });
  await shot("receipt-review");
});

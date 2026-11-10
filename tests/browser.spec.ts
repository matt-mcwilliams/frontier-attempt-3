import { test, expect } from "@playwright/test";
import { simplePdf } from "./fixtures";

test("desktop shell, real local API, source upload, learning continuity and themes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "One score. Many abilities." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/margin-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sources", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Research library" }),
  ).toBeVisible();
  await expect(
    page.getByText("Abstract available · full text needed", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("I may store and use this source locally").check();
  await page
    .locator('input[type=file][accept="application/pdf,.pdf"]')
    .setInputFiles({
      name: "original-test.pdf",
      mimeType: "application/pdf",
      buffer: simplePdf(),
    });
  await expect(
    page.getByText("Full text imported", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close sources" }).click();
  await page.reload();
  await expect(page.getByText("Full text", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Connect camera", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Notebook camera" }),
  ).toBeVisible();
  await expect(
    page.getByAltText("QR code to pair your phone camera"),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/margin-camera-setup.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close camera", exact: true }).click();
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: "test-results/margin-dark.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Learning record", exact: true })
    .click();
  await expect(
    page.getByText("No evidence yet.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close learning record" }).click();
  await page
    .getByRole("textbox", { name: "Message the tutor" })
    .fill("My unsent research question.");
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Message the tutor" }),
  ).toHaveValue("My unsent research question.");
  expect(errors).toEqual([]);
});
test("actual WebRTC peer negotiation carries synthetic camera video; selected source pixels attach without sending a model request", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let modelRequests = 0;
  page.on("request", (r) => {
    if (r.url().includes("/messages")) modelRequests++;
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Connect camera", exact: true })
    .click();
  await expect(
    page.getByAltText("QR code to pair your phone camera"),
  ).toBeVisible();
  const href = await page.locator(".pairing-link").getAttribute("href");
  expect(href).toBeTruthy();
  const phoneContext = await browser.newContext({
    ignoreHTTPSErrors: true,
    permissions: ["camera"],
    viewport: { width: 390, height: 844 },
  });
  const phone = await phoneContext.newPage();
  try {
    await phone.goto(href!);
    await phone.getByRole("button", { name: "Enable notebook camera" }).click();
    await expect(
      page.locator(".camera-bottom .connection-status"),
    ).toContainText("Live notebook", { timeout: 15000 });
    const frame = page.locator(".camera-frame");
    await expect(frame).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator(".camera-frame canvas")
          .evaluate((c: HTMLCanvasElement) => c.width),
      )
      .toBeGreaterThan(300);
    const bounds = (await frame.boundingBox())!;
    await page.mouse.move(
      bounds.x + bounds.width * 0.25,
      bounds.y + bounds.height * 0.3,
    );
    await page.mouse.down();
    await page.mouse.move(
      bounds.x + bounds.width * 0.75,
      bounds.y + bounds.height * 0.7,
      { steps: 6 },
    );
    await page.mouse.up();
    await expect(page.getByText("FROZEN FRAME", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Attach selection" }).click();
    const captured = page.getByAltText("Notebook attachment ready to submit");
    await expect(captured).toBeVisible();
    await expect
      .poll(() =>
        captured.evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBeGreaterThan(200);
    await page.getByRole("button", { name: "Rotate camera frame" }).click();
    await page.getByRole("button", { name: "Capture full frame" }).click();
    await expect(
      page.getByAltText("Notebook attachment ready to submit"),
    ).toHaveCount(2);
    await page.screenshot({
      path: "test-results/margin-live-camera.png",
      fullPage: true,
    });
    expect(modelRequests).toBe(0);
    await page.getByRole("button", { name: "Disconnect", exact: true }).click();
    await expect(
      page.locator(".camera-bottom .connection-status"),
    ).toContainText("Camera disconnected");
    expect(errors).toEqual([]);
  } finally {
    await phoneContext.close();
  }
});
test("phone has a real camera permission path and an understandable unpaired state", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/phone");
  await page.getByRole("button", { name: "Enable notebook camera" }).click();
  await expect(page.getByRole("alert")).toContainText("fresh pairing QR code");
  await page.screenshot({
    path: "test-results/margin-phone.png",
    fullPage: true,
  });
});

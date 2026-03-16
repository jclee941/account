import path from 'node:path';

function matchesCallback(url, callbackUrlPattern) {
  if (!callbackUrlPattern) {
    return false;
  }
  if (callbackUrlPattern instanceof RegExp) {
    return callbackUrlPattern.test(url);
  }
  return url.includes(String(callbackUrlPattern));
}

function createDefaultScreenshotPath({ screenshotDir, screenshotPrefix, index, label }) {
  const nn = String(index).padStart(2, '0');
  return path.join(screenshotDir, `${screenshotPrefix}-${nn}-${label}.png`);
}

export async function automateGoogleAuth(page, {
  authUrl,
  email,
  password,
  callbackUrlPattern,
  screenshotDir,
  screenshotPrefix,
  maxConsentAttempts = 12,
  screenshotPathBuilder,
  callbackSuccessMatcher,
  includeSignInButtons = true,
  skipInitialGoto = false,
} = {}) {
  let screenshotIndex = 0;
  const makeScreenshotPath = screenshotPathBuilder
    || ((meta) => createDefaultScreenshotPath({ screenshotDir, screenshotPrefix, ...meta }));

  const capture = async (label) => {
    screenshotIndex += 1;
    await page.screenshot({ path: makeScreenshotPath({ index: screenshotIndex, label }), fullPage: true }).catch(() => {});
  };

  if (!skipInitialGoto) {
    await page.goto(authUrl, { waitUntil: 'networkidle', timeout: 30_000 });
  }

  const emailInput = page.locator('input[type="email"]');
  await emailInput.waitFor({ timeout: 10_000 });
  await emailInput.fill(email);
  await page.locator('#identifierNext button, button:has-text("다음"), button:has-text("Next")').first().click();
  await page.waitForTimeout(4_000);
  await capture('after-email');

  const pwInput = page.locator('input[type="password"]');
  await pwInput.waitFor({ timeout: 10_000 });
  await pwInput.fill(password);
  await page.locator('#passwordNext button, button:has-text("다음"), button:has-text("Next")').first().click();
  await page.waitForTimeout(6_000);
  await capture('after-password');

  const allowSelectorBase = [
    'button:has-text("허용")',
    'button:has-text("Allow")',
    'button:has-text("계속")',
    'button:has-text("Continue")',
  ];

  if (includeSignInButtons) {
    allowSelectorBase.push('button:has-text("로그인")', 'button:has-text("Sign in")', 'button:has-text("Log in")');
  }

  const allowSelector = allowSelectorBase.join(', ');

  for (let attempt = 0; attempt < maxConsentAttempts; attempt += 1) {
    const currentUrl = page.url();
    await capture(`consent-${attempt}`);

    if (matchesCallback(currentUrl, callbackUrlPattern)) {
      break;
    }

    if (typeof callbackSuccessMatcher === 'function' && callbackSuccessMatcher(currentUrl)) {
      break;
    }

    const advancedLink = page.locator('a:has-text("고급"), a:has-text("Advanced"), button:has-text("Advanced")');
    if (await advancedLink.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      await advancedLink.first().click().catch(() => {});
      await page.waitForTimeout(2_000);
    }

    const goToLink = page.locator('a#proceed-link, a:has-text("Go to"), a:has-text("(unsafe)"), a:has-text("이동")');
    if (await goToLink.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      await goToLink.first().click().catch(() => {});
      await page.waitForTimeout(3_000);
      continue;
    }

    const checkboxes = page.locator('input[type="checkbox"]:not(:checked)');
    const checkCount = await checkboxes.count().catch(() => 0);
    if (checkCount > 0) {
      for (let i = 0; i < checkCount; i += 1) {
        await checkboxes.nth(i).check().catch(() => {});
      }
      await page.waitForTimeout(1_000);
    }

    const allowBtn = page.locator(allowSelector);
    if (await allowBtn.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      await allowBtn.first().click().catch(() => {});
      try {
        await page.waitForURL((url) => {
          const urlString = url.toString();
          if (typeof callbackSuccessMatcher === 'function' && callbackSuccessMatcher(urlString)) {
            return true;
          }
          if (matchesCallback(urlString, callbackUrlPattern)) {
            return true;
          }
          return urlString.includes('accounts.google.com');
        }, { timeout: 20_000 });
      } catch {
      }
      await page.waitForTimeout(2_000);
      continue;
    }

    await page.waitForTimeout(2_500);
  }

  await capture('final');
}

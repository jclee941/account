export async function launchBrowser({
  headed = false,
  playwrightModule = 'rebrowser-playwright',
  userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  locale,
  viewport,
  extraArgs = [],
} = {}) {
  const { chromium } = await import(playwrightModule);

  const defaultArgs = [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
  ];

  const browser = await chromium.launch({
    headless: !headed,
    args: [...defaultArgs, ...extraArgs],
  });

  const contextOptions = { userAgent };
  if (locale) {
    contextOptions.locale = locale;
  }
  if (viewport) {
    contextOptions.viewport = viewport;
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  return { browser, context, page };
}

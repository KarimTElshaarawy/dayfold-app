import { expect, test } from '@playwright/test';

// A fixed Monday morning, so the demo plan does not depend on when (or in which time zone) the tests run. Only the date
// is shifted: timers and animation frames stay real (a fully fake clock froze the sheet animations).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const RealDate = Date;
    const offset = RealDate.parse('2026-10-26T09:00:00Z') - RealDate.now();
    class ShiftedDate extends RealDate {
      constructor(...args: unknown[]) {
        super(...((args.length === 0 ? [RealDate.now() + offset] : args) as [number]));
      }
      static now(): number {
        return RealDate.now() + offset;
      }
    }
    window.Date = ShiftedDate as unknown as DateConstructor;
  });
});

test('set up with demo data, tick a task, reload, then check every screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Who is studying?' })).toBeVisible();
  await page.getByLabel('Your name').fill('Sam');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Your day.' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Morning plan.' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Use demo data' }).click();
  await expect(page.getByText('11 added')).toBeVisible();
  await page.getByRole('button', { name: 'Start planning' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

  const boxes = page.getByRole('checkbox');
  await expect(boxes.first()).toBeVisible();
  await boxes.first().click();
  await expect(boxes.first()).toHaveAttribute('aria-checked', 'true');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.getByRole('checkbox').first()).toHaveAttribute('aria-checked', 'true');

  // every screen, no login or email UI, backup round trip
  for (const name of ['Exams', 'Week', 'Stats', 'Settings']) {
    await page.getByRole('navigation', { name: 'Main' }).last().getByRole('link', { name }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  await expect(page.getByText('Sign out')).toHaveCount(0);
  await expect(page.getByText('Daily email')).toHaveCount(0);
  await page.getByRole('button', { name: 'Backup and restore' }).click();
  await page.getByRole('button', { name: 'Copy backup' }).click();
  await expect(page.getByLabel('Backup data')).toHaveValue(/"v":1/);

  await page.keyboard.press('Escape');

  // fields behave like app fields: no spell check, no suggestion bar, a Done key
  const nameField = page.getByLabel('Name', { exact: true });
  await expect(nameField).toHaveAttribute('autocorrect', 'off');
  await expect(nameField).toHaveAttribute('enterkeyhint', 'done');
  await expect(nameField).toHaveAttribute('spellcheck', 'false');
  await page.getByRole('button', { name: 'Backup and restore' }).click();
  await expect(page.getByLabel('Backup data')).toHaveAttribute('autocapitalize', 'none');
  await page.keyboard.press('Escape');

  // accent color: choose blue, see the CSS variable change, keep it after a reload
  const strong = (): Promise<string> => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent-strong').trim());
  const red = await strong();
  await page.locator('button.swatch[aria-label="Blue"]').click();
  await expect.poll(strong).not.toBe(red);
  const blue = await strong();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect.poll(strong).toBe(blue);

  // session reminders: toggle and lead time are there
  await expect(page.getByText('When a study session starts')).toBeVisible();
  await page.getByRole('button', { name: '10 min' }).click();
  await expect(page.getByRole('button', { name: '10 min' })).toHaveAttribute('aria-pressed', 'true');

  // import a class schedule from the template
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByRole('button', { name: 'Use a template' }).click();
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByRole('button', { name: 'Add 3' })).toBeVisible();
  await page.getByRole('button', { name: 'Add 3' }).click();
  await expect(page.getByRole('button', { name: /^Gym/ })).toBeVisible();
});

test('with the keyboard up, buttons still work and the tab bar gets out of the way', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByLabel('Your name').fill('Sam');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Use demo data' }).click();
  await page.getByRole('button', { name: 'Start planning' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Main' }).last().getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Backup and restore' }).click();

  // a text field has focus: the tab bar is hidden so it cannot ride above the keyboard
  const box = page.getByLabel('Backup data');
  await box.click();
  await expect(box).toBeFocused();
  await expect(page.locator('html')).toHaveClass(/kb-open/);
  await expect(page.locator('nav.tabbar')).toBeHidden();

  // pressing a button must not dismiss the keyboard first (that moved the button and lost the tap): the copy happens
  await page.getByRole('button', { name: 'Copy backup' }).click();
  await expect(box).toHaveValue(/"v":1/);
  await expect(page.getByText('Backup copied')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/"v":1/);

  // tapping empty space inside the sheet closes the keyboard and brings the tab bar back after the sheet closes
  await page.getByRole('heading', { name: 'Backup and restore' }).click();
  await expect(box).not.toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('nav.tabbar')).toBeVisible();
});

/**
 * A phone's keyboard, imitated: a tap on a button does not move focus out of a text field (iOS), and when a field
 * loses focus the screen grows by a keyboard's height (native resize), which moves whatever the finger is on.
 */
const pretendPhoneKeyboard = (page: import('@playwright/test').Page) =>
  page.addInitScript(() => {
    document.addEventListener('mousedown', (e) => {
      if ((e.target as Element).closest('button, a')) e.preventDefault();
    }, true);
    const isField = (el: EventTarget | null): boolean => (el instanceof HTMLInputElement && !['checkbox', 'radio'].includes(el.type)) || el instanceof HTMLTextAreaElement;
    document.addEventListener('focusout', (e) => {
      if (!isField(e.target) || document.querySelector('[data-kb-gap]')) return;
      const gap = document.createElement('div');
      gap.setAttribute('data-kb-gap', '');
      gap.style.cssText = 'height:320px;pointer-events:none';
      document.body.prepend(gap);
    });
    document.addEventListener('focusin', () => document.querySelector('[data-kb-gap]')?.remove());
  });

test('a typed time is kept when the next tap is a button, and a button tap is not lost to the keyboard closing', async ({ page }) => {
  await pretendPhoneKeyboard(page);
  await page.goto('/');
  await page.getByLabel('Your name').fill('Sam');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Your day.' })).toBeVisible();
  // typed, then straight to Continue: the value must be saved by that tap
  await page.getByLabel('Wake up').fill('06:15');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Morning plan.' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Use demo data' }).click();
  await page.getByRole('button', { name: 'Start planning' }).click();
  await page.getByRole('navigation', { name: 'Main' }).last().getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByLabel('Wake up')).toHaveValue('06:15');

  // the backup copy, with a text field focused, through the same phone keyboard
  await page.getByRole('button', { name: 'Backup and restore' }).click();
  await page.getByLabel('Backup data').click();
  await page.getByRole('button', { name: 'Copy backup' }).click();
  await expect(page.getByLabel('Backup data')).toHaveValue(/"v":1/);
});

test('a renamed meal survives Add meal, and adding a topic keeps the keyboard on the topic field', async ({ page }) => {
  await pretendPhoneKeyboard(page);
  await page.goto('/');
  await page.getByLabel('Your name').fill('Sam');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Use demo data' }).click();
  await page.getByRole('button', { name: 'Start planning' }).click();
  await page.getByRole('navigation', { name: 'Main' }).last().getByRole('link', { name: 'Settings' }).click();

  await page.getByLabel('Meal name').first().fill('Brunch');
  await page.getByRole('button', { name: 'Add meal' }).click();
  await page.reload();
  await expect(page.getByLabel('Meal name').first()).toHaveValue('Brunch');

  await page.getByRole('button', { name: /CSC230/ }).first().click();
  const topic = page.getByLabel('New topic');
  await topic.fill('Hash tables');
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(sheet.getByLabel('Topic', { exact: true }).last()).toHaveValue('Hash tables');
  await expect(topic).toBeFocused();
  await expect(topic).toHaveValue('');
});

test('a setting the app rejects is put back, and the chosen accent is kept across launches', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Your name').fill('Sam');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Use demo data' }).click();
  await page.getByRole('button', { name: 'Start planning' }).click();
  await page.getByRole('navigation', { name: 'Main' }).last().getByRole('link', { name: 'Settings' }).click();

  // a 5 minute session is below the 20 minute minimum: the field goes back to what is really saved
  const session = page.getByLabel('Session (min)');
  const before = await session.inputValue();
  await session.fill('5');
  await page.getByRole('heading', { name: 'Your day' }).click();
  await expect(session).toHaveValue(before);

  // meals stop at six: wait for each added row to show up before the next tap (a slow machine otherwise taps a button that just went disabled)
  let rows = await page.getByLabel('Meal name').count();
  while (rows < 6) {
    await page.getByRole('button', { name: 'Add meal' }).click();
    rows += 1;
    await expect(page.getByLabel('Meal name')).toHaveCount(rows);
  }
  await expect(page.getByLabel('Meal name')).toHaveCount(6);
  await expect(page.getByRole('button', { name: 'Add meal' })).toBeDisabled();

  // the start-up screen reads the accent from storage, and nothing at launch may overwrite it
  await page.locator('button.swatch[aria-label="Blue"]').click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('dayfold-accent'))).toBe('#2f7df6');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('dayfold-accent'))).toBe('#2f7df6');
});

test('swiping left and right moves between the tabs and stops at the ends', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  const swipe = async (fromX: number, toX: number, y = 400): Promise<void> => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fromX, y }] });
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: fromX + ((toX - fromX) * i) / 6, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await page.goto('/');
  await page.getByLabel('Your name').fill('Sam');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Use demo data' }).click();
  await page.getByRole('button', { name: 'Start planning' }).click();
  await expect(page).toHaveURL(/\/today$/);

  // (each swipe waits for the new page to be on screen first: a touch whose page is swapped out mid-swipe is lost by the browser)
  const onPage = async (name: string): Promise<void> => {
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await page.waitForTimeout(450);
  };
  await onPage('Today');
  await swipe(320, 80); // swipe left: next tab
  await expect(page).toHaveURL(/\/exams$/);
  await onPage('Exams');
  await swipe(320, 80);
  await expect(page).toHaveURL(/\/week$/);
  await onPage('Week');
  await swipe(80, 320); // swipe right: back
  await expect(page).toHaveURL(/\/exams$/);
  await onPage('Exams');
  await swipe(80, 320);
  await expect(page).toHaveURL(/\/today$/);
  await onPage('Today');
  await swipe(80, 320); // already the first tab: nothing happens
  await expect(page).toHaveURL(/\/today$/);

  // a mostly vertical drag is a scroll, not a swipe
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 300 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 560 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page).toHaveURL(/\/today$/);

  // the last tab: swiping on does nothing
  await page.getByRole('navigation', { name: 'Main' }).last().getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await onPage('Settings');
  await swipe(320, 80);
  await expect(page).toHaveURL(/\/settings$/);
});

test('holding the tab bar and sliding along it picks the page, with a bubble naming it; a plain tap still works', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await page.goto('/');
  await page.getByLabel('Your name').fill('Sam');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Use demo data' }).click();
  await page.getByRole('button', { name: 'Start planning' }).click();
  await expect(page).toHaveURL(/\/today$/);
  await page.waitForTimeout(500);

  const bar = page.getByRole('navigation', { name: 'Main' }).last();
  const centre = async (name: string): Promise<{ x: number; y: number }> => {
    const b = (await bar.getByRole('link', { name }).boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const today = await centre('Today');
  const stats = await centre('Stats');
  const exams = await centre('Exams');

  // press on Today, slide right to Stats: the bubble follows, and nothing opens until the finger lifts
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [today] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: today.x + ((stats.x - today.x) * i) / 8, y: today.y }] });
  await expect(page.locator('.tab-bubble')).toHaveText('Stats');
  await expect(bar).toHaveClass(/scrubbing/);
  await expect(page).toHaveURL(/\/today$/);
  // slide back to Exams before letting go: that one opens
  for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: stats.x + ((exams.x - stats.x) * i) / 6, y: stats.y }] });
  await expect(page.locator('.tab-bubble')).toHaveText('Exams');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page).toHaveURL(/\/exams$/);
  await expect(bar).not.toHaveClass(/scrubbing/);

  // a plain tap is still a tap
  await page.waitForTimeout(450);
  await bar.getByRole('link', { name: 'Week' }).tap();
  await expect(page).toHaveURL(/\/week$/);

  // a hold that does not move also starts it, and letting go on the same tab stays put
  const week = await centre('Week');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [week] });
  await expect(page.locator('.tab-bubble')).toHaveText('Week');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page).toHaveURL(/\/week$/);
});


test('a sideways drag over a field, with a pop-up open, or that just closed the keyboard is not a page swipe', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  const drag = async (from: { x: number; y: number }, dx: number): Promise<void> => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (dx * i) / 6, y: from.y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await page.goto('/');
  await page.getByLabel('Your name').fill('Sam');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Use demo data' }).click();
  await page.getByRole('button', { name: 'Start planning' }).click();
  await page.getByRole('navigation', { name: 'Main' }).last().getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await page.waitForTimeout(500);
  // swiping right goes to Stats from Settings: all of the cases below must stay on Settings
  const centreOf = async (loc: import('@playwright/test').Locator): Promise<{ x: number; y: number }> => {
    const b = (await loc.boundingBox())!;
    return { x: b.x + 40, y: b.y + b.height / 2 };
  };

  // over a text field
  await drag(await centreOf(page.getByLabel('Name', { exact: true })), 220);
  await expect(page).toHaveURL(/\/settings$/);

  // with the keyboard up (a field has focus): the drag that closes it is not a swipe
  await page.getByLabel('Name', { exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/kb-open/);
  await drag(await centreOf(page.getByRole('heading', { level: 1, name: 'Settings' })), 220);
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/settings$/);

  // with a pop-up open
  await page.getByRole('button', { name: 'Backup and restore' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(400);
  await drag({ x: 60, y: 200 }, 220);
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('dialog')).toBeVisible();
});

test.describe('with motion on', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('a tap skips the start-up animation, and a swipe plays the page animation once', async ({ page, context }) => {
    const cdp = await context.newCDPSession(page);
    await page.goto('/');
    // the start-up screen is up (it plays for startupSeconds): a tap skips it
    await expect(page.locator('.boot-name')).toBeVisible();
    const t0 = Date.now();
    await page.locator('.boot').click();
    await expect(page.getByLabel('Your name')).toBeVisible({ timeout: 4000 });
    expect(Date.now() - t0).toBeLessThan(4000);

    await page.getByLabel('Your name').fill('Sam');
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Use demo data' }).click();
    await page.getByRole('button', { name: 'Start planning' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await page.waitForTimeout(1200);

    await page.evaluate(() => {
      (window as unknown as { __rise: string[] }).__rise = [];
      document.addEventListener('animationstart', (e) => (window as unknown as { __rise: string[] }).__rise.push((e as AnimationEvent).animationName), true);
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 320, y: 400 }] });
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 320 - (240 * i) / 6, y: 400 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page).toHaveURL(/\/exams$/);
    await page.waitForTimeout(1600);
    const { starts, children } = await page.evaluate(() => ({
      starts: (window as unknown as { __rise: string[] }).__rise.filter((n) => n === 'rise').length,
      children: document.querySelectorAll('.page > :not(.scrim):not(.sheet-wrap):not(.page-loading)').length,
    }));
    // each page block animates in once: no second round when the swipe direction clears
    expect(starts).toBeGreaterThan(0);
    expect(starts).toBeLessThanOrEqual(children);
  });
});

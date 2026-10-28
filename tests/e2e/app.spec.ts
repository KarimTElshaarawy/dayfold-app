import { expect, test } from '@playwright/test';

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
  await page.getByRole('button', { name: 'Blue' }).click();
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

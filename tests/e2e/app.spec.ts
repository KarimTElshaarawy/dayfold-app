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
  await expect(page.getByText('Morning notification')).toBeVisible();
  await expect(page.getByText('Sign out')).toHaveCount(0);
  await expect(page.getByText('Daily email')).toHaveCount(0);
  await page.getByRole('button', { name: 'Backup and restore' }).click();
  await page.getByRole('button', { name: 'Copy backup' }).click();
  await expect(page.getByLabel('Backup data')).toHaveValue(/"v":1/);
});

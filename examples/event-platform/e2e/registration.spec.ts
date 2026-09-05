// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based browser-test boundary.
import { expect, test } from '@playwright/test';

import { observeBrowserErrors } from './support/browser-errors';

test('registers an attendee and manages the issued ticket', async ({ page }, testInfo) => {
  const browserErrors = observeBrowserErrors(page);
  const attendeeName = 'Grace Hopper';
  const attendeeEmail = `grace-${testInfo.project.name}@example.test`;

  await page.goto('/events/runtime-collective/effect-systems-summit-2026/register');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Register for Effect Systems Summit' }),
  ).toBeVisible();
  await page.getByRole('radio', { name: 'Choose Community' }).check();
  await page.getByLabel('Name', { exact: true }).fill(attendeeName);
  await page.getByLabel('Email', { exact: true }).fill(attendeeEmail);
  await page.getByLabel('Discount code').fill('community20');
  await page.getByLabel('What is your role?').fill('Platform engineer');
  await page.getByLabel('Dietary preference').selectOption('Vegetarian');
  await page.getByRole('radio', { name: 'Decline payment' }).check();
  const checkout = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Complete registration' }) });
  const attemptKey = checkout.locator('input[name="idempotencyKey"]');
  const firstAttemptKey = await attemptKey.inputValue();
  await page.getByRole('button', { name: 'Complete registration' }).click();
  await expect(
    page.getByText('The simulated payment was declined. No ticket was issued.'),
  ).toBeVisible();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(attendeeName);
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(attendeeEmail);
  await expect(page.getByLabel('What is your role?')).toHaveValue('Platform engineer');
  await expect(attemptKey).not.toHaveValue(firstAttemptKey);
  await page.getByRole('radio', { name: 'Approve payment' }).check();
  await page.getByRole('button', { name: 'Complete registration' }).click();

  await expect(page.getByRole('heading', { name: 'You’re registered' })).toBeVisible();
  await expect(page.getByText(`A ticket was issued to ${attendeeEmail}.`)).toBeVisible();
  await expect(page.getByText('COMMUNITY20 saved €11.80')).toBeVisible();
  await page.getByRole('link', { name: 'Open your attendee hub' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Your attendee hub' })).toBeVisible();
  await expect(page.getByText(attendeeEmail)).toBeVisible();
  await expect(page.getByText('Effect Systems Summit', { exact: true })).toBeVisible();
  await expect(page.getByText('Your event ticket', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Open ticket' }).click();

  await expect(
    page.getByRole('heading', { level: 1, name: 'Effect Systems Summit' }),
  ).toBeVisible();
  await expect(page.getByAltText(/QR credential for ticket GTH-/)).toBeVisible();
  await page.getByLabel('Ticket holder').fill('Rear Admiral Grace Hopper');
  await page.getByRole('button', { name: 'Update holder' }).click();
  await expect(page.getByText('Ticket holder updated.')).toBeVisible();

  expect(browserErrors).toEqual([]);
});

test('joins a sold-out waitlist and receives an organizer update', async ({ page }, testInfo) => {
  const browserErrors = observeBrowserErrors(page);
  const attendeeEmail = `waitlist-${testInfo.project.name}@example.test`;

  await page.goto('/events/runtime-collective/effect-systems-summit-2026/register');
  await page.getByLabel('Ticket', { exact: true }).selectOption('ticket-summit-lab');
  await page.getByLabel('Waitlist name').fill('Katherine Johnson');
  await page.getByLabel('Waitlist email').fill(attendeeEmail);
  await page.getByRole('button', { name: 'Join waitlist' }).click();
  await expect(page.getByText('You are on the Architecture lab waitlist.')).toBeVisible();

  await page.goto('/');
  await page.context().addCookies([
    {
      name: 'gather-organizer',
      url: page.url(),
      value: 'user-maya',
    },
  ]);
  await page.goto('/organizer');
  await page.getByRole('link', { name: 'Waitlist' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Effect Systems Summit waitlist' }),
  ).toBeVisible();
  const entry = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByText('Katherine Johnson', { exact: true }) });
  const entryIdInput = entry.locator('input[name="entryId"]');
  const entryId = await entryIdInput.inputValue();
  await entryIdInput.evaluate((input: HTMLInputElement) => {
    input.value = 'missing-entry';
  });
  await entry.getByRole('button', { name: 'Send update' }).click();
  await expect(
    entry.getByText('That attendee was already notified or is unavailable.'),
  ).toBeVisible();
  await entryIdInput.evaluate((input: HTMLInputElement, value) => {
    input.value = value;
  }, entryId);
  await entry.getByRole('button', { name: 'Send update' }).click();
  await expect(page.getByText(`Update sent to ${attendeeEmail}.`)).toBeVisible();
  await expect(entry.getByText('notified', { exact: true })).toBeVisible();

  expect(browserErrors).toEqual([]);
});

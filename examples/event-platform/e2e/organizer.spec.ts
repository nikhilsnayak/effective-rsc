// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based browser-test boundary.
import { expect, test } from '@playwright/test';

import { observeBrowserErrors } from './support/browser-errors';

test('authors, publishes, discovers, and registers for an event', async ({ page }, testInfo) => {
  const browserErrors = observeBrowserErrors(page);
  const eventName = `Typed Workflows ${testInfo.project.name}`;
  const eventSlug = `typed-workflows-${testInfo.project.name}`;
  const sessionTitle = `Operating durable workflows ${testInfo.project.name}`;

  await page.goto('/organizer');
  await expect(page.getByRole('heading', { level: 1, name: 'Organizer studio' })).toBeVisible();
  await page.getByRole('link', { name: 'Create event' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Create an event' })).toBeVisible();

  await page.getByLabel('Event name').fill(eventName);
  await page.getByLabel('URL slug').fill(eventSlug);
  await page.getByLabel('Tagline').fill('A practical gathering for typed workflow builders.');
  await page
    .getByLabel('Description')
    .fill('A fictional event created by the product journey suite to verify organizer authoring.');
  await page.getByLabel('Starts').fill('2099-02-11T09:00');
  await page.getByLabel('Ends').fill('2099-02-11T17:00');
  await page.getByLabel('Venue').fill('Bangalore International Centre');
  await page.getByLabel('City or locality').fill('Bengaluru');
  await page.getByRole('button', { name: 'Create draft event' }).click();

  await expect(page.getByText('Draft event created.')).toBeVisible();
  await page.getByRole('link', { name: 'Open event editor' }).click();
  await expect(page.getByRole('heading', { level: 1, name: eventName })).toBeVisible();
  await expect(page.getByText('draft', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ticket types' })).toBeVisible();

  const ticketForm = page
    .locator('form')
    .filter({ has: page.getByRole('heading', { name: 'New ticket type' }) });
  await ticketForm.getByLabel('Name').fill('Standard admission');
  await ticketForm.getByLabel('Description').fill('Admission to the complete event programme.');
  await ticketForm.getByLabel('Price in minor units').fill('4900');
  await ticketForm.getByLabel('Currency').selectOption('INR');
  await ticketForm.getByLabel('Quantity').fill('50');
  await ticketForm.getByLabel('Sales start').fill('2026-01-01T00:00');
  await ticketForm.getByLabel('Sales end').fill('2099-02-11T08:00');
  await ticketForm.getByRole('button', { name: 'Add ticket' }).click();
  await expect(page.getByRole('heading', { name: 'Standard admission' })).toBeVisible();

  const authoredTicket = page
    .locator('form')
    .filter({ has: page.getByRole('heading', { name: 'Standard admission' }) });
  await authoredTicket.getByRole('button', { name: 'Hide from sale' }).click();
  await expect(authoredTicket.getByText('Ticket is hidden.')).toBeVisible();
  await authoredTicket.getByLabel('Quantity').fill('101');
  await authoredTicket.getByRole('button', { name: 'Save ticket' }).click();
  await expect(
    authoredTicket.getByText('Capacity cannot be lower than allocated, sold, or reserved tickets.'),
  ).toBeVisible();
  await expect(authoredTicket.getByLabel('Quantity')).toHaveValue('101');
  await authoredTicket.getByLabel('Quantity').fill('50');
  await authoredTicket.getByRole('button', { name: 'Put on sale' }).click();
  await expect(authoredTicket.getByText('Ticket is on sale.')).toBeVisible();

  await page.getByRole('link', { name: 'Manage programme' }).click();
  const roomForm = page
    .locator('form')
    .filter({ has: page.getByRole('heading', { name: 'Add a room' }) });
  await roomForm.getByLabel('Room name').fill('Main room');
  await roomForm.getByLabel('Capacity').fill('50');
  await roomForm.getByRole('button', { name: 'Add room' }).click();
  await expect(page.getByRole('heading', { name: 'Main room' })).toBeVisible();

  const speakerForm = page
    .locator('form')
    .filter({ has: page.getByRole('heading', { name: 'Add a speaker' }) });
  await speakerForm.getByLabel('Name').fill('Dana Scully');
  await speakerForm.getByLabel('Role').fill('Principal investigator');
  await speakerForm.getByLabel('Organization').fill('Typed Systems Lab');
  await speakerForm
    .getByLabel('Bio')
    .fill('Dana studies reliable systems through evidence and repeatable operational practice.');
  await speakerForm.getByRole('button', { name: 'Add speaker' }).click();
  await expect(page.getByRole('heading', { name: 'Dana Scully' })).toBeVisible();

  const sessionForm = page
    .locator('form')
    .filter({ has: page.getByRole('heading', { name: 'Add a session' }) });
  await sessionForm.getByLabel('Title').fill(sessionTitle);
  await sessionForm
    .getByLabel('Summary')
    .fill('A practical field guide to typed failures, retries, and interruption.');
  await sessionForm.getByLabel('Room').selectOption({ label: 'Main room · 50' });
  await sessionForm.getByLabel('Speaker').selectOption({ label: 'Dana Scully' });
  await sessionForm.getByLabel('Starts').fill('2099-02-11T10:00');
  await sessionForm.getByLabel('Ends').fill('2099-02-11T11:00');
  await sessionForm.getByLabel('Capacity').fill('50');
  await sessionForm.getByRole('button', { name: 'Add draft session' }).click();

  const authoredSession = page
    .locator('form')
    .filter({ has: page.getByRole('heading', { name: sessionTitle }) });
  await expect(authoredSession).toBeVisible();
  await authoredSession.getByRole('button', { name: 'Publish session' }).click();
  await expect(page.getByText('Session published.')).toBeVisible();
  await authoredSession.getByRole('button', { name: 'Save session' }).click();
  await expect(authoredSession.getByText('Session saved.')).toBeVisible();
  await authoredSession.getByRole('button', { name: 'Move to draft' }).click();
  await expect(authoredSession.getByText('Session moved to draft.')).toBeVisible();
  await authoredSession.getByRole('button', { name: 'Publish session' }).click();
  await expect(authoredSession.getByText('Session published.')).toBeVisible();

  await page.goto('/organizer');
  const authoredEvent = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByText(eventName, { exact: true }) });
  await authoredEvent.getByRole('button', { name: 'Publish event' }).click();
  await expect(authoredEvent.getByText('published', { exact: true })).toBeVisible();
  await expect(authoredEvent.getByRole('button', { name: 'Mark completed' })).toBeVisible();

  await page.goto(`/events/effective-rsc/${eventSlug}`);
  await expect(page.getByRole('heading', { level: 1, name: eventName })).toBeVisible();
  await page.getByRole('link', { name: 'View programme' }).click();
  await expect(page.getByText(sessionTitle, { exact: true })).toBeVisible();
  await page.goto(`/events/effective-rsc/${eventSlug}/register`);
  await page.getByLabel('Name', { exact: true }).fill('Fox Mulder');
  await page
    .getByLabel('Email', { exact: true })
    .fill(`mulder-${testInfo.project.name}@example.test`);
  await page.getByRole('button', { name: 'Complete registration' }).click();
  await expect(page.getByRole('heading', { name: 'You’re registered' })).toBeVisible();

  expect(browserErrors).toEqual([]);
});

test('reviews event sales and attendance as an organization owner', async ({ page }) => {
  const browserErrors = observeBrowserErrors(page);

  await page.goto('/');
  await page.context().addCookies([
    {
      name: 'gather-organizer',
      url: page.url(),
      value: 'user-maya',
    },
  ]);
  await page.goto('/organizer');

  await expect(page.getByRole('heading', { level: 1, name: 'Organizer studio' })).toBeVisible();
  await page.getByRole('link', { name: 'Reports' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Effect Systems Summit report' }),
  ).toBeVisible();
  await expect(page.getByText('€59.00').first()).toBeVisible();
  await expect(page.getByText('1 / 240')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ticket mix' })).toBeVisible();
  const communityTicket = page.getByRole('row', { name: /Community/ });
  await expect(communityTicket).toContainText('€59.00');
  await expect(communityTicket).toContainText('1');
  await expect(communityTicket).toContainText('60');
  await expect(page.getByText('1 order')).toBeVisible();

  expect(browserErrors).toEqual([]);
});

test('drafts and delivers a targeted attendee announcement', async ({ page }, testInfo) => {
  const browserErrors = observeBrowserErrors(page);
  const subject = `Arrival update ${testInfo.project.name}`;

  await page.goto('/');
  await page.context().addCookies([
    {
      name: 'gather-organizer',
      url: page.url(),
      value: 'user-maya',
    },
  ]);
  await page.goto('/organizer');
  await page.getByRole('link', { name: 'Communications' }).click();

  await expect(
    page.getByRole('heading', { level: 1, name: 'Effect Systems Summit communications' }),
  ).toBeVisible();
  await page.getByLabel('Subject').fill(subject);
  await page.getByLabel('Audience', { exact: true }).selectOption('not_checked_in');
  await page.getByLabel('Message').fill('Doors open at 08:30. Bring your ticket code.');
  const announcementId = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Save draft' }) })
    .locator('input[name="announcementId"]');
  const draftId = await announcementId.inputValue();
  await page.getByRole('button', { name: 'Save draft' }).click();

  await expect(page.getByText('Announcement draft saved.')).toBeVisible();
  await expect(page.getByLabel('Subject')).toHaveValue('');
  await expect(page.getByLabel('Message')).toHaveValue('');
  await expect(announcementId).not.toHaveValue(draftId);
  const announcement = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByText(subject, { exact: true }) });
  await expect(announcement.getByText('draft', { exact: true })).toBeVisible();
  await announcement.getByRole('button', { name: 'Send now' }).click();
  await expect(page.getByText('Announcement delivered to 1 attendee.')).toBeVisible();
  await expect(page.getByText('1 delivered · 0 pending')).toBeVisible();

  await page.goto('/attendee');
  await expect(page.getByRole('heading', { level: 1, name: 'Your attendee hub' })).toBeVisible();
  await expect(page.getByText(subject)).toBeVisible();

  expect(browserErrors).toEqual([]);
});

test('refunds an attendee order and returns its inventory', async ({ page }) => {
  const browserErrors = observeBrowserErrors(page);

  await page.goto('/');
  await page.context().addCookies([
    {
      name: 'gather-organizer',
      url: page.url(),
      value: 'user-maya',
    },
  ]);
  await page.goto('/organizer');
  await page.getByRole('link', { name: 'Orders' }).click();

  await expect(
    page.getByRole('heading', { level: 1, name: 'Effect Systems Summit orders' }),
  ).toBeVisible();
  const order = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByText('Ada Lovelace', { exact: true }) });
  await expect(order.getByText('paid', { exact: true })).toBeVisible();
  await order.getByRole('button', { name: 'Refund order' }).click();
  await page.getByLabel('Refund reason').fill('Attendee requested cancellation');
  const orderIdInput = page.getByRole('alertdialog').locator('input[name="orderId"]');
  const orderId = await orderIdInput.inputValue();
  await orderIdInput.evaluate((input: HTMLInputElement) => {
    input.value = 'missing-order';
  });
  await page.getByRole('button', { name: 'Confirm refund' }).click();
  await expect(page.getByText('That order is unavailable or was already refunded.')).toBeAttached();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await expect(page.getByLabel('Refund reason')).toHaveValue('Attendee requested cancellation');
  await expect(page.getByRole('button', { name: 'Confirm refund' })).toBeEnabled();
  await orderIdInput.evaluate((input: HTMLInputElement, value) => {
    input.value = value;
  }, orderId);
  await page.getByRole('button', { name: 'Confirm refund' }).click();

  await expect(page.getByText('Order refunded and attendee notified.')).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(order.getByText('refunded', { exact: true })).toBeVisible();
  await expect(order.getByRole('button', { name: 'Refund order' })).toHaveCount(0);

  await page.goto('/attendee');
  await expect(page.getByText('Your event order was refunded')).toBeVisible();

  expect(browserErrors).toEqual([]);
});

test('configures and archives a custom registration question', async ({ page }, testInfo) => {
  const browserErrors = observeBrowserErrors(page);
  const question = `Experience level ${testInfo.project.name}`;

  await page.goto('/');
  await page.context().addCookies([
    {
      name: 'gather-organizer',
      url: page.url(),
      value: 'user-maya',
    },
  ]);
  await page.goto('/organizer');
  await page.getByRole('link', { name: 'Registration' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Effect Systems Summit registration' }),
  ).toBeVisible();

  await page.getByLabel('Question', { exact: true }).fill(question);
  await page.getByLabel('Help text').fill('Used to tailor the programme.');
  await page.getByLabel('Answer type').selectOption('select');
  await page.getByLabel('Requirement').selectOption('true');
  const questionId = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add question' }) })
    .locator('input[name="questionId"]');
  const firstQuestionId = await questionId.inputValue();
  await page.getByLabel('Select options').fill('New to Effect');
  await page.getByRole('button', { name: 'Add question' }).click();
  await expect(
    page.locator('[aria-live="polite"]').filter({
      hasText: 'Select questions need at least two distinct options.',
    }),
  ).toBeVisible();
  await expect(page.getByLabel('Question', { exact: true })).toHaveValue(question);
  await expect(page.getByLabel('Select options')).toHaveValue('New to Effect');
  await expect(questionId).toHaveValue(firstQuestionId);
  await page.getByLabel('Select options').fill('New to Effect\nUsing Effect in production');
  await page.getByRole('button', { name: 'Add question' }).click();
  await expect(page.getByText('Registration question created.')).toBeVisible();
  await expect(page.getByLabel('Question', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Select options')).toHaveValue('');
  await expect(questionId).not.toHaveValue(firstQuestionId);

  const card = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByText(question, { exact: true }) });
  await expect(card.getByText('required', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByText('Registration question archived.')).toBeVisible();
  await expect(card).toHaveCount(0);

  expect(browserErrors).toEqual([]);
});

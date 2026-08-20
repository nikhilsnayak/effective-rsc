import path from 'node:path';
import { type Build, type Dev, expect, test } from '@e2e/helper';
import type { Page } from 'playwright';

const PROJECT_DIR = path.resolve(
  import.meta.dirname,
  '../../../examples/server',
);

const setup = async (dev: Dev, build: Build, page: Page) => {
  const rsbuild =
    process.env.TEST_MODE === 'dev'
      ? await dev({ cwd: PROJECT_DIR })
      : await build({ cwd: PROJECT_DIR, runServer: true });

  await page.goto(`http://localhost:${rsbuild.port}`);
  return rsbuild;
};

const createTodo = async (
  page: Page,
  title: string,
  description: string,
  dueDate = '2025-12-31',
) => {
  await page.click('header button:has-text("+")');

  const dialog = page.locator('dialog[open]');
  await expect(dialog).toBeVisible();

  await page.fill('input[name="title"]', title);
  await page.fill('textarea[name="description"]', description);
  if (dueDate) {
    await page.fill('input[name="dueDate"]', dueDate);
  }

  await page.click('dialog[open] button:has-text("Add todo")');

  // Wait for dialog to close instead of hardcoded timeout
  await expect(dialog).not.toBeVisible();

  // Wait for todo to appear in list
  const newTodo = page.locator('.todo-column ul li a', { hasText: title });
  await expect(newTodo).toBeVisible();
};

const waitForTodoInList = async (
  page: Page,
  title: string,
  shouldBeVisible = true,
) => {
  const todo = page.locator('.todo-column ul li a', { hasText: title });
  if (shouldBeVisible) {
    await expect(todo).toBeVisible();
  } else {
    await expect(todo).not.toBeVisible();
  }
};

const verifyTodoDetailPage = async (page: Page) => {
  // Verify the URL changed
  expect(page.url()).toMatch(/\/todos\/\d+/);

  // Verify the todo item is marked as selected
  const selectedTodo = page.locator('.todo-column ul li[data-selected]');
  await expect(selectedTodo).toBeVisible();

  // Verify detail content is visible
  const detailForm = page.locator('form.todo');
  await expect(detailForm).toBeVisible();
};

test('should load the page and display the title', async ({
  page,
  dev,
  build,
}) => {
  await setup(dev, build, page);

  // Check page title
  await expect(page).toHaveTitle('Todos');

  // Check header is visible
  const header = page.locator('header h1');
  await expect(header).toBeVisible();
  await expect(header).toHaveText('Todos');

  // Check "Add todo" button is visible
  const addButton = page.locator('header button', { hasText: '+' });
  await expect(addButton).toBeVisible();

  const links = page.locator('link[rel="stylesheet"]');
  await expect(links).toHaveCount(1);
});

test('should create a new todo', async ({ page, dev, build }) => {
  await setup(dev, build, page);

  const timestamp = Date.now();
  const todoTitle = `Test Todo ${timestamp}`;
  const todoDescription = `Description for test todo ${timestamp}`;

  await createTodo(page, todoTitle, todoDescription);
});

test('should mark a todo as complete and incomplete', async ({
  page,
  dev,
  build,
}) => {
  await setup(dev, build, page);

  // Create a todo first
  await createTodo(page, 'Test Complete Todo', 'Test description');

  // Get the first todo item
  const firstTodo = page.locator('.todo-column ul li').first();
  const checkbox = firstTodo.locator('input[type="checkbox"]');

  // Get initial state
  const initialChecked = await checkbox.isChecked();

  // Toggle the checkbox
  await checkbox.click();

  // Wait for the state to update
  await page.waitForLoadState('networkidle');

  // Verify the state changed
  if (initialChecked) {
    await expect(checkbox).not.toBeChecked();
  } else {
    await expect(checkbox).toBeChecked();
  }

  // Toggle back
  await checkbox.click();
  await page.waitForLoadState('networkidle');

  // Verify it's back to the original state
  if (initialChecked) {
    await expect(checkbox).toBeChecked();
  } else {
    await expect(checkbox).not.toBeChecked();
  }
});

test('should delete a todo', async ({ page, dev, build }) => {
  await setup(dev, build, page);

  const timestamp = Date.now();
  const todoTitle = `Delete Me ${timestamp}`;

  await createTodo(page, todoTitle, 'This will be deleted');

  const todoItem = page.locator('.todo-column ul li', {
    has: page.locator('a', { hasText: todoTitle }),
  });
  const deleteButton = todoItem.locator('button:has-text("x")');

  await deleteButton.click();

  // Wait for todo to disappear
  await waitForTodoInList(page, todoTitle, false);
});

test('should navigate to todo detail page', async ({ page, dev, build }) => {
  await setup(dev, build, page);

  // Create a todo first
  await createTodo(page, 'Detail Test Todo', 'Test description for details');

  const firstTodoLink = page.locator('.todo-column ul li a').first();
  await firstTodoLink.click();

  await verifyTodoDetailPage(page);
});

test('should update a todo from detail page', async ({ page, dev, build }) => {
  await setup(dev, build, page);

  // Create a todo to update
  const timestamp = Date.now();
  const originalTitle = `Update Test ${timestamp}`;
  await createTodo(page, originalTitle, 'Original description', '2025-12-25');

  const updatedTitle = `Updated ${timestamp}`;
  const updatedDescription = 'Updated description';

  const todoLink = page.locator('.todo-column ul li a', {
    hasText: originalTitle,
  });
  await todoLink.click();

  // Wait for navigation
  await page.waitForURL(/\/todos\/\d+/);

  const detailForm = page.locator('form.todo');
  await detailForm.locator('input[name="title"]').fill(updatedTitle);
  await detailForm
    .locator('textarea[name="description"]')
    .fill(updatedDescription);
  await detailForm.locator('input[name="dueDate"]').fill('2025-12-31');

  await detailForm.locator('button[type="submit"]').click();

  // Wait for update to complete
  await page.waitForLoadState('networkidle');

  await waitForTodoInList(page, updatedTitle);
  await waitForTodoInList(page, originalTitle, false);
});

test('should handle client-side navigation', async ({ page, dev, build }) => {
  await setup(dev, build, page);

  // Create multiple todos for navigation testing
  for (let count = 0; count < 3; count++) {
    await createTodo(page, `Nav Test Todo ${count + 1}`, 'Description');
  }

  // Click on the first todo
  const firstTodoLink = page.locator('.todo-column ul li a').first();
  await firstTodoLink.click();
  await page.waitForURL(/\/todos\/\d+/);

  const firstUrl = page.url();
  expect(firstUrl).toMatch(/\/todos\/\d+/);

  // Click on the second todo
  const secondTodoLink = page.locator('.todo-column ul li a').nth(1);
  await secondTodoLink.click();
  await page.waitForURL(/\/todos\/\d+/);

  const secondUrl = page.url();
  expect(secondUrl).toMatch(/\/todos\/\d+/);
  expect(secondUrl).not.toBe(firstUrl);

  // Use browser back button
  await page.goBack();
  await page.waitForURL(firstUrl);

  expect(page.url()).toBe(firstUrl);

  // Use browser forward button
  await page.goForward();
  await page.waitForURL(secondUrl);

  expect(page.url()).toBe(secondUrl);
});

test('should show "Select a todo" message when no todo is selected', async ({
  page,
  dev,
  build,
}) => {
  await setup(dev, build, page);

  // Verify the "Select a todo" message is visible
  const selectMessage = page.locator('main p:has-text("Select a todo")');
  await expect(selectMessage).toBeVisible();
});

test('should close dialog after form submission', async ({
  page,
  dev,
  build,
}) => {
  await setup(dev, build, page);

  // Open the dialog
  await page.click('header button:has-text("+")');

  const dialog = page.locator('dialog[open]');
  await expect(dialog).toBeVisible();

  // Fill and submit the form
  await page.fill('input[name="title"]', 'Dialog Close Test');
  await page.fill('textarea[name="description"]', 'Testing dialog close');
  await page.click('dialog[open] button:has-text("Add todo")');

  // Wait for the dialog to close using proper wait condition
  await expect(dialog).not.toBeVisible();
});

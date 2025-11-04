import { test, expect, devices, chromium } from '@playwright/test';

test.use({
  ...devices['iPhone 12'],
  browserName: 'chromium',
});

test('mobile stepper controls - before and after Add click', async ({ page }) => {
  // Navigate to the products page
  await page.goto('http://localhost:5000/');
  
  // Wait for products to load
  await page.waitForSelector('[data-testid^="product-card-"]');
  
  console.log('\n========== BEFORE CLICKING ADD ==========');
  
  // Find the first product card with an Add button
  const firstProduct = page.locator('[data-testid^="product-card-"]').first();
  const addButton = firstProduct.locator('[data-testid^="button-add-to-cart-"]');
  
  // Capture state before clicking
  const addButtonHTML = await addButton.innerHTML();
  console.log('Add Button HTML:', addButtonHTML);
  
  // Get the control container
  const controlContainer = firstProduct.locator('.ml-auto');
  const beforeHTML = await controlContainer.innerHTML();
  console.log('\nControl Container HTML (BEFORE):\n', beforeHTML);
  
  // Get bounding box
  const beforeBox = await controlContainer.boundingBox();
  console.log('\nControl Container Dimensions (BEFORE):', beforeBox);
  
  // Take screenshot before
  await page.screenshot({ path: 'mobile-before-add.png', fullPage: true });
  console.log('\nScreenshot saved: mobile-before-add.png');
  
  console.log('\n========== CLICKING ADD BUTTON ==========');
  
  // Click the Add button
  await addButton.click();
  
  // Wait for stepper to appear
  await page.waitForTimeout(500);
  
  console.log('\n========== AFTER CLICKING ADD ==========');
  
  // Capture state after clicking
  const afterHTML = await controlContainer.innerHTML();
  console.log('\nControl Container HTML (AFTER):\n', afterHTML);
  
  // Get bounding box after
  const afterBox = await controlContainer.boundingBox();
  console.log('\nControl Container Dimensions (AFTER):', afterBox);
  
  // Check if stepper is visible
  const minusButton = firstProduct.locator('[data-testid^="button-decrease-quantity-"]');
  const plusButton = firstProduct.locator('[data-testid^="button-increase-quantity-"]');
  const quantitySpan = firstProduct.locator('[data-testid^="cart-quantity-"]');
  
  // Get stepper element details
  const stepperContainer = firstProduct.locator('.flex.items-center').first();
  const stepperHTML = await stepperContainer.innerHTML();
  console.log('\nStepper HTML:\n', stepperHTML);
  
  // Get button dimensions
  const minusBox = await minusButton.boundingBox();
  const quantityBox = await quantitySpan.boundingBox();
  const plusBox = await plusButton.boundingBox();
  
  console.log('\nMinus Button (-) Dimensions:', minusBox);
  console.log('Quantity Span Dimensions:', quantityBox);
  console.log('Plus Button (+) Dimensions:', plusBox);
  
  // Get computed styles
  const minusStyles = await minusButton.evaluate((el) => {
    const computed = window.getComputedStyle(el);
    return {
      width: computed.width,
      height: computed.height,
      color: computed.color,
      backgroundColor: computed.backgroundColor,
    };
  });
  
  const quantityStyles = await quantitySpan.evaluate((el) => {
    const computed = window.getComputedStyle(el);
    return {
      width: computed.width,
      color: computed.color,
    };
  });
  
  const plusStyles = await plusButton.evaluate((el) => {
    const computed = window.getComputedStyle(el);
    return {
      width: computed.width,
      height: computed.height,
      color: computed.color,
      backgroundColor: computed.backgroundColor,
    };
  });
  
  console.log('\nMinus Button Computed Styles:', minusStyles);
  console.log('Quantity Span Computed Styles:', quantityStyles);
  console.log('Plus Button Computed Styles:', plusStyles);
  
  // Check icon colors
  const minusIcon = minusButton.locator('svg');
  const plusIcon = plusButton.locator('svg');
  
  const minusIconClass = await minusIcon.getAttribute('class');
  const plusIconClass = await plusIcon.getAttribute('class');
  
  console.log('\nMinus Icon Classes:', minusIconClass);
  console.log('Plus Icon Classes:', plusIconClass);
  
  // Take screenshot after
  await page.screenshot({ path: 'mobile-after-add.png', fullPage: true });
  console.log('\nScreenshot saved: mobile-after-add.png');
  
  // Verify stepper is visible
  await expect(minusButton).toBeVisible();
  await expect(plusButton).toBeVisible();
  await expect(quantitySpan).toBeVisible();
  await expect(quantitySpan).toHaveText('1');
  
  console.log('\n========== TEST COMPLETE ==========\n');
});

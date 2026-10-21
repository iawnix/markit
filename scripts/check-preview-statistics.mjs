import assert from 'node:assert/strict';

export async function checkPreviewStatistics(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.locator('.empty-state .primary-command').click();
    const content = page.locator('.cm-content');
    const sourceMode = page.locator('.status-mode-option[aria-label="源码"]');
    const previewMode = page.locator('.status-mode-option[aria-label="预览"]');
    const count = page.locator('.statusbar-right > span').first();
    const expectCount = async words => {
      try {
        await page.waitForFunction(words => document.querySelector('.statusbar-right > span')?.textContent === `${words} 字`, words, { timeout: 5000 });
      } catch {
        assert.equal(await count.textContent(), `${words} 字`, `Count for ${await content.textContent()}`);
      }
    };

    for (const mode of [previewMode, sourceMode]) {
      await mode.click();
      await content.focus();
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await expectCount(0);
      for (const [index, character] of [...'中文测试'].entries()) {
        await page.keyboard.insertText(character);
        await expectCount(index + 1);
      }
      await page.keyboard.insertText('   ');
      await expectCount(4);
      await page.keyboard.insertText('hello');
      await expectCount(5);
      await page.keyboard.insertText('world');
      await expectCount(5);
      await page.keyboard.insertText(' next');
      await expectCount(6);
      for (let index = 0; index < 4; index++) await page.keyboard.press('Backspace');
      await expectCount(5);
    }
    assert.match(await count.getAttribute('title'), /中文逐字、英文按词/);

    const source = '#   CorAgent测试 Case\n\n## **小标题** ##  \n\n正文';
    await content.focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.insertText(source);
    await previewMode.click();
    await expectCount(9);
    assert.equal(await page.locator('.cm-live-heading-1').textContent(), 'CorAgent测试 Case');
    assert.equal(await page.locator('.cm-live-heading-2').textContent(), '小标题');
    const alignment = await page.evaluate(() => {
      function textLeft(selector) {
        const element = document.querySelector(selector);
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent.trim()) continue;
          const range = document.createRange();
          range.setStart(node, 0);
          range.setEnd(node, 1);
          return range.getBoundingClientRect().left;
        }
        throw new Error(`Missing text in ${selector}`);
      }
      return [textLeft('.cm-live-heading-1'), textLeft('.cm-live-heading-2'), textLeft('.cm-line:last-child')];
    });
    assert.ok(alignment.every(left => Math.abs(left - alignment[2]) < 1), `Heading text must align with the paragraph: ${alignment}`);
    await content.focus();
    await page.keyboard.press('Control+Home');
    assert.equal(await page.locator('.cm-live-heading-1').textContent(), '#   CorAgent测试 Case');
    await page.keyboard.press('Control+End');
    assert.equal(await page.locator('.cm-live-heading-1').textContent(), 'CorAgent测试 Case');
    await sourceMode.click();
    assert.equal((await content.locator('.cm-line').allTextContents()).join('\n'), source);
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
}

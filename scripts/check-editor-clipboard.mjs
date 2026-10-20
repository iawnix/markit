import assert from 'node:assert/strict';

export async function checkEditorClipboard(browser, url) {
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const content = page.locator('.cm-content');
  const sourceText = async () => (await content.locator('.cm-line').allTextContents()).join('\n');
  const sourceMode = page.locator('.status-mode-option[aria-label="源码"]');
  const previewMode = page.locator('.status-mode-option[aria-label="预览"]');
  const readClipboard = () => page.evaluate(async () => {
    const item = (await navigator.clipboard.read())[0];
    return { text: await (await item.getType('text/plain')).text(), html: item.types.includes('text/html') ? await (await item.getType('text/html')).text() : '' };
  });
  async function document(source) {
    await sourceMode.click();
    await content.focus();
    await page.keyboard.press('Control+a');
    await page.keyboard.insertText(source);
    await page.keyboard.press('Control+Home');
    await previewMode.click();
    await page.evaluate(async () => { await window.document.fonts.ready; await new Promise(requestAnimationFrame); });
  }
  async function drag(text, reverse = false, endOffset = 2) {
    const p = await content.evaluate((el, text) => {
      const walker = window.document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.textContent === text) {
        const range = window.document.createRange(); range.selectNodeContents(node);
        const rect = range.getBoundingClientRect();
        return { left: rect.left, right: rect.right, y: rect.top + rect.height / 2 };
      }
      throw new Error(`Missing clipboard target: ${text}`);
    }, text);
    await page.mouse.move(reverse ? p.right + endOffset : p.left + 1, p.y);
    await page.mouse.down();
    await page.mouse.move(reverse ? p.left + 1 : p.right + endOffset, p.y, { steps: 10 });
    await page.mouse.up();
  }
  async function copy(key = 'Control+c') {
    await page.keyboard.press(key);
    return readClipboard();
  }
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.locator('.empty-state .primary-command').click();
    const source = 'Anchor\n\n**你好***\n\nEnd';
    for (const reverse of [false, true]) {
      await document(source);
      await drag('你好', reverse);
      const plain = await copy();
      assert.equal(plain.text, '你好');
      assert.match(plain.html, /<strong>你好<\/strong>/);
      assert.equal((await copy('Control+Shift+c')).text, '**你好**');
      // Copying and changing copy format must not change the source or selection.
      assert.equal(await page.evaluate(() => getSelection().toString()), '你好');
      await sourceMode.click();
      assert.equal(await sourceText(), source);
    }

    await document('Anchor\n\n[**你好**](https://example.com "标题")\n\nEnd');
    await drag('你好');
    const link = await copy();
    assert.equal(link.text, '你好');
    assert.match(link.html, /href="https:\/\/example.com\/?"/);
    assert.equal((await copy('Control+Shift+c')).text, '[**你好**](https://example.com "标题")');

    // A genuine clipboard paste into the preview keeps the copied formatting.
    await copy();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+v');
    await sourceMode.click();
    assert.ok((await sourceText()).endsWith('\n[**你好**](https://example.com "标题")'));
    await previewMode.click();
    await content.focus();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+Shift+v');
    await sourceMode.click();
    assert.ok((await sourceText()).endsWith('\n你好'), 'Paste as plain text must not restore the rich fragment');

    await document(source);
    await content.focus();
    await page.keyboard.press('Control+a');
    assert.equal((await copy()).text, 'Anchor\n\n你好*\n\nEnd');
    assert.equal((await copy('Control+Shift+c')).text, source);

    await sourceMode.click();
    await content.focus();
    await page.keyboard.press('Control+a');
    const raw = await copy();
    assert.equal(raw.text, source);
    assert.equal(raw.html, '');
    assert.equal((await copy('Control+Shift+c')).text, source);

    await document(source);
    await drag('你好');
    await page.locator('.menu-trigger').click();
    await page.locator('.command-menu').getByText('复制为 Markdown', { exact: true }).click();
    assert.equal((await readClipboard()).text, '**你好**');
    await page.locator('.menu-trigger').click();
    await page.locator('.command-menu').getByText(/^设置…?$/).click();
    await page.getByRole('checkbox', { name: '复制纯文本时使用 Markdown 源码' }).check();
    await page.locator('.settings-modal').getByRole('button', { name: 'Close' }).click();
    await content.focus();
    assert.equal((await copy()).text, '**你好**');
    assert.equal(await page.evaluate(() => localStorage.getItem('markit.copyMarkdown')), 'true');
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.menu-trigger').click();
    await page.locator('.command-menu').getByText(/^设置…?$/).click();
    assert.equal(await page.getByRole('checkbox', { name: '复制纯文本时使用 Markdown 源码' }).isChecked(), true);
    await page.getByRole('checkbox', { name: '复制纯文本时使用 Markdown 源码' }).uncheck();
    await page.locator('.settings-modal').getByRole('button', { name: 'Close' }).click();
    if (await page.locator('.empty-state').count()) await page.locator('.empty-state .primary-command').click();

    await document(source);
    await drag('你好');
    assert.equal((await copy('Control+x')).text, '你好');
    await sourceMode.click();
    assert.equal(await sourceText(), 'Anchor\n\n*\n\nEnd');
    await content.focus();
    await page.keyboard.press('Control+z');
    assert.equal(await sourceText(), source);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}

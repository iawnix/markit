import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { markdownSelection } from '../apps/desktop/src/editor-clipboard';

function copy(source: string, from: number, to: number, remove = false) {
  return markdownSelection(EditorState.create({ doc: source, extensions: [markdown({ base: markdownLanguage })] }), from, to, remove);
}

describe('preview clipboard selection', () => {
  it('balances hidden delimiters regardless of which side the mouse lands on', () => {
    for (const [from, to] of [[0, 4], [2, 4], [2, 6], [0, 6]]) expect(copy('**你好***', from, to)).toBe('**你好**');
    expect(copy('**你好***', 2, 7)).toBe('**你好***');
    expect(copy('**你好***', 0, 7)).toBe('**你好***');
  });

  it('preserves formatting around partial and nested text without copying other words', () => {
    expect(copy('**你好**', 2, 3)).toBe('**你**');
    expect(copy('***你好***', 3, 4)).toBe('***你***');
    expect(copy('~~你好~~', 2, 3)).toBe('~~你~~');
    expect(copy('**first** and *second*', 4, 18)).toBe('**rst** and *sec*');
    expect(copy('前 **你好** 后', 4, 10)).toBe('**你好** 后');
    expect(copy('**one two**', 5, 9)).toBe(' **two**');
    expect(copy('**one two**', 5, 6)).toBe(' ');
    expect(copy('**one two**', 2, 5, true)).toBe(' **two**');
  });

  it('retains link destinations, titles and nested formatting', () => {
    const link = '[**你好**](https://example.com "标题")';
    expect(copy(link, 3, 4)).toBe('[**你**](https://example.com "标题")');
    expect(copy(link, 3, link.length)).toBe('[**你好**](https://example.com "标题")');
    expect(copy('<https://example.com>', 9, 16)).toBe('[example](<https://example.com>)');
  });

  it('includes the definitions needed by reference links, including partial shortcuts', () => {
    const ref = '[你好][ref]\n\n[ref]: https://example.com "title"';
    expect(copy(ref, 1, 2)).toBe('[你][ref]\n\n[ref]: https://example.com "title"');
    expect(copy(ref, 0, 9)).toBe(ref);
    const shortcut = '[你好]\n\n[你好]: https://example.com';
    expect(copy(shortcut, 1, 2)).toBe('[你][你好]\n\n[你好]: https://example.com');
    expect(copy(ref, 0, ref.length)).toBe(ref);
    const image = '![图片][img]\n\n[img]: a.png';
    expect(copy(image, 2, 4)).toBe(image);
  });

  it('preserves literal code, image source, heading context and multiline selections', () => {
    expect(copy('`**literal**`', 1, 12)).toBe('`**literal**`');
    const code = '```js\nconst x = "**";\n```';
    expect(copy(code, 6, 11)).toBe('```js\nconst\n```');
    expect(copy('![你好](assets/a.png)', 2, 4)).toBe('![你好](assets/a.png)');
    expect(copy('## 标题', 3, 5)).toBe('## 标题');
    expect(copy('标题\n===', 1, 2)).toBe('题\n===');
    expect(copy('> 引用内容', 3, 5)).toBe('> 用内');
    expect(copy('\\*literal\\*', 1, 10)).toBe('\\*literal\\*');
    expect(copy('**你好**\n\n*世界*', 3, 10)).toBe('**好**\n\n*世*');
  });

  it('repairs cut boundaries without deleting unselected content', () => {
    expect(copy('**你好***', 2, 6, true)).toBe('*');
    expect(copy('**你好**', 3, 6, true)).toBe('**你**');
    expect(copy('**你好**', 0, 3, true)).toBe('**好**');
    expect(copy('***你好***', 3, 4, true)).toBe('***好***');
    expect(copy('[你好](https://example.com)', 2, 25, true)).toBe('[你](https://example.com)');
    expect(copy('**abc** def', 3, 10, true)).toBe('**a**f');
    expect(copy('before\n\n**你好**\n\nafter', 0, 21, true)).toBe('');
  });
});

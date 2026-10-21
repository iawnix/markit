import { describe, expect, it } from 'vitest';
import { analyzeMarkdown } from '../src/shared/markdown';
import { countMarkdownWords } from '../packages/markdown/src/statistics';

describe('desktop word count', () => {
  it('updates for every Chinese character without waiting for a space', () => {
    expect(['', '中', '中文', '中文测', '中文测试'].map(countMarkdownWords)).toEqual([0, 1, 2, 3, 4]);
    expect(countMarkdownWords('中文测试   \n\t')).toBe(4);
  });

  it('counts mixed Chinese and English, including adjacent scripts', () => {
    expect(countMarkdownWords('# CorAgent测试 Case')).toBe(4);
    expect(countMarkdownWords("中文，测试！ hello, world don't l’esprit 42")).toBe(9);
    expect(countMarkdownWords('𠀀中文')).toBe(3);
  });

  it('excludes formatting and destinations while counting visible content', () => {
    expect(countMarkdownWords('# 标题\n\n**正文** [链接](https://example.com/path) ![图片](image.png)')).toBe(8);
    expect(countMarkdownWords('---\n\n#\n\n>\n\n***\n\n，。！')).toBe(0);
    expect(countMarkdownWords('```js\nconst value = 42\n```')).toBe(3);
    expect(countMarkdownWords('hello**world**')).toBe(1);
  });
});

describe('statistics match original Markdown behavior', () => {
  it('counts CJK characters separately and keeps apostrophes within Latin words', () => {
    expect(analyzeMarkdown("中文测试 don't l’esprit 日本語").words).toBe(9);
  });
  it('counts visible text and image alt, excluding link destinations and raw HTML', () => {
    expect(analyzeMarkdown('**hello** [world](https://example.com/path) ![photo](image.png) <b>visible</b>\n\n<script>hidden words</script>').words).toBe(4);
  });
  it('counts code content but not the fenced language marker', () => {
    expect(analyzeMarkdown('```javascript\nconst hello = 42\n```').words).toBe(3);
  });
  it('uses grapheme counts, zero lines for empty text and 200 words per minute', () => {
    expect(analyzeMarkdown('e\u0301👩‍👩‍👧‍👦').characters).toBe(2);
    expect(analyzeMarkdown('').lines).toBe(0);
    expect(analyzeMarkdown('a\nb\n').lines).toBe(3);
    expect(analyzeMarkdown('word '.repeat(201)).readingMinutes).toBe(2);
  });
});

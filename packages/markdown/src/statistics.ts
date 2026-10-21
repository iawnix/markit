import MarkdownIt from 'markdown-it';

const statisticsParser = new MarkdownIt({ html: true });
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Count CJK characters individually and other words without Markdown delimiters. */
export function countMarkdownWords(source: string): number {
  // Statistics parse HTML tokens only to omit markup; this parser never renders it.
  const visible: string[] = [];
  const collect = (items: ReturnType<typeof statisticsParser.parse>) => {
    for (const token of items) {
      if (token.type === 'html_block' || token.type === 'html_inline') continue;
      if (token.type === 'image' || token.type === 'code_inline' || token.type === 'code_block' || token.type === 'fence') visible.push(' ', token.content, ' ');
      else if (token.children) collect(token.children);
      else if (token.type === 'text') visible.push(token.content);
      else if (token.block || token.type === 'softbreak' || token.type === 'hardbreak') visible.push(' ');
    }
  };
  collect(statisticsParser.parse(source, {}));
  const cjk = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u{20000}-\u{2ebef}\u3040-\u30ff\u31f0-\u31ff\uac00-\ud7af]/u;
  let words = 0;
  let insideWord = false;
  for (const { segment } of segmenter.segment(visible.join(''))) {
    if (cjk.test(segment)) { words++; insideWord = false; }
    else if (/[\p{L}\p{N}]/u.test(segment)) { if (!insideWord) words++; insideWord = true; }
    else if (!((segment === "'" || segment === '’') && insideWord)) insideWord = false;
  }
  return words;
}

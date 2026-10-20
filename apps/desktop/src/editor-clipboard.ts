import { markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { Transaction, type EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { renderMarkdown } from '../../../packages/markdown/src/index';

interface Bounds { from: number; to: number }
interface Shell extends Bounds { open: string; close: string; literal?: boolean; trim?: boolean }

/** Copy semantic content, including the formatting surrounding a partial selection.
 * DOM text cannot do this: preview decorations hide delimiters, URLs and widgets.
 */
export function markdownSelection(state: EditorState, from: number, to: number, remove = false): string {
  const source = state.doc.toString();
  const tree = ensureSyntaxTree(state, state.doc.length, 100) || markdownLanguage.parser.parse(source);
  const references = new Map<string, SyntaxNode>();
  const needed = new Set<string>();
  const key = (label: string) => label.replace(/^\[|\]$/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
  tree.iterate({ enter(node) {
    if (node.name === 'LinkReference') {
      const label = node.node.getChild('LinkLabel');
      if (label) references.set(key(source.slice(label.from, label.to)), node.node);
      return false;
    }
  } });

  function shell(node: SyntaxNode): Shell | undefined {
    if (['StrongEmphasis', 'Emphasis', 'Strikethrough', 'InlineCode'].includes(node.name)) {
      const first = node.firstChild, last = node.lastChild;
      if (first && last && first.from !== last.from) return {
        from: first.to, to: last.from, open: source.slice(node.from, first.to), close: source.slice(last.from, node.to), literal: node.name === 'InlineCode', trim: node.name !== 'InlineCode',
      };
    }
    if (node.name === 'Link' || node.name === 'Image') {
      const marks = node.getChildren('LinkMark');
      if (marks.length < 2) return;
      const start = marks[0].to, end = marks[1].from;
      let close = source.slice(end, node.to);
      if (!node.getChild('URL')) {
        const label = node.getChild('LinkLabel');
        const explicit = label && source.slice(label.from + 1, label.to - 1);
        const name = explicit || source.slice(start, end);
        if (references.has(key(name))) {
          needed.add(key(name));
          // A partial shortcut/collapsed reference needs the original label.
          close = `][${name}]`;
        }
      }
      return { from: start, to: end, open: '[', close };
    }
    if (node.name === 'Autolink') {
      const url = source.slice(node.from + 1, node.to - 1);
      return { from: node.from + 1, to: node.to - 1, open: '[', close: `](<${url.includes('@') && !url.includes(':') ? 'mailto:' : ''}${url}>)`, literal: true };
    }
    if (node.name === 'FencedCode') {
      const code = node.getChild('CodeText');
      if (code) return { from: code.from, to: code.to, open: source.slice(node.from, code.from), close: source.slice(code.to, node.to) || '\n' + source.slice(node.from, node.firstChild!.to), literal: true };
    }
    if (/^SetextHeading/.test(node.name)) {
      const marker = node.getChild('HeaderMark');
      if (marker) return { from: node.from, to: marker.from - 1, open: '', close: source.slice(marker.from - 1, node.to) };
    }
    if (/^ATXHeading/.test(node.name) || node.name === 'ListItem' || node.name === 'Blockquote') {
      const marker = node.firstChild;
      if (marker && /^(HeaderMark|ListMark|QuoteMark)$/.test(marker.name)) {
        let start = marker.to;
        while (source[start] === ' ' || source[start] === '\t') start++;
        return { from: start, to: node.to, open: source.slice(node.from, start), close: '' };
      }
    }
  }

  function text(start: number, end: number): string {
    return remove
      ? source.slice(start, Math.max(start, Math.min(end, from))) + source.slice(Math.min(end, Math.max(start, to)), end)
      : source.slice(Math.max(start, from), Math.max(Math.max(start, from), Math.min(end, to)));
  }
  function children(node: SyntaxNode, start: number, end: number): string {
    let result = '', position = start;
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.from < start || child.to > end) continue;
      result += text(position, child.from) + visit(child);
      position = child.to;
    }
    return result + text(position, end);
  }
  function visit(node: SyntaxNode): string {
    if (node.to <= from || node.from >= to) return remove ? source.slice(node.from, node.to) : '';
    const wrapper = shell(node);
    // Images and escaped characters are indivisible semantic content.
    if (['Image', 'Escape', 'Entity'].includes(node.name)) return remove ? '' : source.slice(node.from, node.to);
    if (from <= node.from && to >= node.to) {
      // Visit links to collect any reference definitions needed outside the range.
      if (!remove) children(node, node.from, node.to);
      return remove ? '' : source.slice(node.from, node.to);
    }
    if (wrapper) {
      if (to <= wrapper.from || from >= wrapper.to) return remove ? source.slice(node.from, node.to) : '';
      const content = wrapper.literal ? text(wrapper.from, wrapper.to) : children(node, wrapper.from, wrapper.to);
      if (!content) return '';
      if (wrapper.trim) {
        const [, before, body, after] = /^(\s*)([\s\S]*?)(\s*)$/.exec(content)!;
        return body ? before + wrapper.open + body + wrapper.close + after : content;
      }
      if (node.name === 'InlineCode' && !remove) {
        const padding = /^`|`$/.test(content) || /^ .* $/.test(content) && /\S/.test(content) ? ' ' : '';
        return wrapper.open + padding + content + padding + wrapper.close;
      }
      // Cutting preserves the original syntax around the remaining content.
      return (remove ? source.slice(node.from, wrapper.from) : wrapper.open) + content + (remove ? source.slice(wrapper.to, node.to) : wrapper.close);
    }
    return children(node, node.from, node.to);
  }
  let result = visit(tree.topNode);
  if (!remove) for (const label of needed) {
    const reference = references.get(label)!;
    if (from > reference.from || to < reference.to) result += '\n\n' + source.slice(reference.from, reference.to);
  }
  return result;
}

/** HTML is produced by the application's HTML-disabled Markdown renderer. */
export function clipboardFormats(markdown: string): { text: string; html: string } {
  const template = document.createElement('template');
  template.innerHTML = renderMarkdown(markdown);
  function plain(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (!(node instanceof Element)) return Array.from(node.childNodes, plain).join('');
    if (node.tagName === 'BR') return '\n';
    if (node.tagName === 'IMG') return node.getAttribute('alt') || '';
    if (node.tagName === 'PRE') return (node.textContent || '').replace(/\n$/, '') + '\n\n';
    const children = Array.from(node.childNodes).filter(child => child.nodeType !== Node.TEXT_NODE || child.textContent?.trim() || !/^(UL|OL|TABLE|THEAD|TBODY|TR)$/.test(node.tagName));
    const value = children.map(plain).join('');
    if (/^(P|H[1-6]|BLOCKQUOTE)$/.test(node.tagName)) return value.replace(/\n+$/, '') + '\n\n';
    if (node.tagName === 'LI') return value.replace(/\n+$/, '') + '\n';
    if (/^(TD|TH)$/.test(node.tagName)) return value + '\t';
    if (node.tagName === 'TR') return value.replace(/\t$/, '') + '\n';
    return value;
  }
  const text = Array.from(template.content.childNodes).filter(node => node.nodeType !== Node.TEXT_NODE || node.textContent?.trim()).map(plain).join('').replace(/\n+$/, '');
  const wrapper = document.createElement('div');
  // Preserve formatting for pastes back into Markit even when plain text is preferred.
  wrapper.dataset.markitMarkdown = markdown;
  wrapper.append(template.content);
  return { text, html: wrapper.outerHTML };
}

export function pastedMarkdown(html: string): string | undefined {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content.querySelector<HTMLElement>('[data-markit-markdown]')?.dataset.markitMarkdown;
}

export function editorClipboard(options: { sourceMode(): boolean; markdownByDefault(): boolean; onError(): void }) {
  let forceMarkdown = false;
  let pastePlain = false;
  function copyAsMarkdown(view: EditorView): boolean {
    view.focus();
    forceMarkdown = true;
    try {
      // Use a real copy event so desktop webviews need no async clipboard permission.
      if (!view.dom.ownerDocument.execCommand('copy')) options.onError();
    } catch { options.onError(); }
    finally { forceMarkdown = false; }
    return true;
  }
  function copy(event: ClipboardEvent, view: EditorView): boolean {
    if (options.sourceMode() || !event.clipboardData) return false;
    const { state } = view;
    const selected = state.selection.ranges.filter(range => !range.empty);
    const ranges: Bounds[] = selected.length ? selected : [state.doc.lineAt(state.selection.main.head)];
    const markdown = ranges.map(range => markdownSelection(state, range.from, range.to)).join('\n');
    const formats = clipboardFormats(markdown);
    event.clipboardData.clearData();
    event.clipboardData.setData('text/plain', forceMarkdown || options.markdownByDefault() ? markdown : formats.text);
    event.clipboardData.setData('text/html', formats.html);
    event.preventDefault();
    if (event.type === 'cut' && !state.readOnly) {
      // Repair only the boundaries of the removed fragment. A partial cut must
      // not delete the closing markers needed by the text left in the document.
      let remaining = state.doc.toString();
      let nextState = state;
      for (const range of [...ranges].reverse()) {
        const to = selected.length ? range.to : Math.min(state.doc.length, range.to + 1);
        remaining = markdownSelection(nextState, range.from, to, true);
        nextState = nextState.update({ changes: { from: 0, to: nextState.doc.length, insert: remaining } }).state;
      }
      const original = state.doc.toString();
      let start = 0, end = original.length, nextEnd = remaining.length;
      while (start < end && start < nextEnd && original[start] === remaining[start]) start++;
      while (end > start && nextEnd > start && original[end - 1] === remaining[nextEnd - 1]) { end--; nextEnd--; }
      view.dispatch({ changes: { from: start, to: end, insert: remaining.slice(start, nextEnd) }, selection: { anchor: Math.min(ranges[0].from, start) }, annotations: Transaction.userEvent.of('delete.cut'), scrollIntoView: true });
    }
    return true;
  }
  return {
    copyAsMarkdown,
    extension: [
      keymap.of([{ key: 'Mod-Shift-c', run: copyAsMarkdown }]),
      EditorView.domEventHandlers({
        copy, cut: copy,
        keydown(event) { pastePlain = event.shiftKey && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v'; return false; },
        paste(event, view) {
          const plain = pastePlain;
          pastePlain = false;
          if (plain || options.sourceMode()) return false;
          const markdown = pastedMarkdown(event.clipboardData?.getData('text/html') || '');
          if (markdown === undefined) return false;
          event.preventDefault();
          view.dispatch(view.state.replaceSelection(markdown), { annotations: Transaction.userEvent.of('input.paste'), scrollIntoView: true });
          return true;
        },
      }),
    ],
  };
}

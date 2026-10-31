import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

type Point = { offset: number; column: number };
type Node = { type: string; value?: string; checked?: boolean | null; children?: Node[]; position: { start: Point; end: Point } };
/** One checkbox in a report. `box` counts from 1 in document order, which holds because a report's text never changes. A box the report itself wrote as [x] is `written`: it stays as written and is not the owner's tick. */
export type Box = { box: number; offset: number; written: boolean; text: string; markdown: string };

const parser = unified().use(remarkParse).use(remarkGfm);
const plain = (node?: Node): string => node?.value ?? node?.children?.map(plain).join('') ?? '';

// The same parser that draws the report, so a "- [ ]" inside a code block is not a box. A box's markdown runs up to the next box or heading.
export function reportBoxes(markdown: string): Box[] {
  const stops: Node[] = [], rules: Node[] = [];
  const walk = (node: Node) => { if (typeof node.checked === 'boolean' || node.type === 'heading') stops.push(node); if (node.type === 'thematicBreak') rules.push(node); node.children?.forEach(walk); };
  walk(parser.parse(markdown) as unknown as Node);
  const lineStart = (offset: number) => markdown.lastIndexOf('\n', offset - 1) + 1;
  const boxes: Box[] = [];
  stops.forEach((node, i) => {
    if (typeof node.checked !== 'boolean') return;
    const { offset, column } = node.position.start, next = stops[i + 1];
    let end = next ? lineStart(next.position.start.offset) : markdown.length;
    // A --- that only separates this box from what follows is not part of it.
    for (const rule of [...rules].reverse()) if (rule.position.start.offset > offset && rule.position.end.offset <= end && !markdown.slice(rule.position.end.offset, end).trim()) end = lineStart(rule.position.start.offset);
    let text = markdown.slice(offset, end).trimEnd();
    if (column > 1) text = text.replace(new RegExp(`\\n {1,${column - 1}}`, 'g'), '\n');
    boxes.push({ box: boxes.length + 1, offset, written: node.checked, text: plain(node.children?.[0]).trim(), markdown: text.replace(/^((?:[-*+]|\d+[.)])[ \t]+)\[[ xX]\]/, '$1[x]') });
  });
  return boxes;
}

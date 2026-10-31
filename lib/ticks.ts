import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

type Point = { offset: number; column: number };
type Node = { type: string; value?: string; checked?: boolean | null; children?: Node[]; position: { start: Point; end: Point } };
/** One checkbox in a report. `box` counts from 1 in document order, which holds because a report's text never changes (a changed payload is a 409, and there is no edit) and the parser is pinned in package-lock.json; the smoke test fails if a parser update moves a box. A box the report itself wrote as [x] is `written`: it stays as written and is not the owner's tick. */
export type Box = { box: number; offset: number; written: boolean; text: string; markdown: string };

const parser = unified().use(remarkParse).use(remarkGfm);
const plain = (node?: Node): string => node?.value ?? node?.children?.map(plain).join('') ?? '';
/** How much of a box's text the browser sends with a tick, to prove it means the same box. Short enough for any box to fit the request limit. */
export const boxLabel = (box: Box) => box.text.slice(0, 200);
// What sat before the box on its own line: quote marks stay out, and list markers or indent count as spaces. Lazy lines have less of it, and keep what they have.
const unprefix = (line: string, prefix: string) => { let at = 0; for (const c of prefix) if (line[at] === (c === '>' ? '>' : ' ')) at++; return line.slice(at); };

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
    // Only the box's own lines move out one level. What follows its list is at the top level already, and its indent can mean a code block.
    if (column > 1) { const prefix = markdown.slice(lineStart(offset), offset), inside = node.position.end.offset - offset; let at = 0; text = text.split('\n').map((line, i) => { const start = at; at += line.length + 1; return i && start <= inside ? unprefix(line, prefix) : line; }).join('\n').trimEnd(); }
    boxes.push({ box: boxes.length + 1, offset, written: node.checked, text: plain(node.children?.[0]).trim(), markdown: text.replace(/^((?:[-*+]|\d+[.)])[ \t]+)\[[ xX]\]/, '$1[x]') });
  });
  return boxes;
}

/** What Copy checked puts on the clipboard: one line naming the report, then each ticked box whole. */
export function tickedText(report: { title: string; published_at: string; markdown: string }, ticks: number[]) {
  const date = new Date(report.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const picked = reportBoxes(report.markdown).filter(b => !b.written && ticks.includes(b.box)).map(b => b.markdown);
  return `Ticked in Feed: ${report.title} (${date})\n\n${picked.join('\n\n')}\n`;
}

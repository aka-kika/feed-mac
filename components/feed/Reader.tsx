'use client';
import AgentIcon from './AgentIcon';
import { createContext, useContext, useEffect, useMemo, useState, useRef, type ComponentProps } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CodeBlock from './CodeBlock';
import { Archive, ArchiveRestore, ArrowLeft, Bookmark, BookmarkMinus, Check, Copy, Star, MessageSquare, MoreHorizontal, Send, Download, Circle, Trash2, Paperclip, Menu, List, ListChecks, ClipboardCheck } from 'lucide-react';
import type { Kind } from '@/lib/kinds';
import { type Report, type Comment, sourceName } from '@/lib/types';
import { api, post, dayLabel } from '@/lib/client';
import { boxLabel, reportBoxes, tickedText, type Box } from '@/lib/ticks';

// The tick state reaches each box by context, so a tick redraws the box and not the whole report.
const Ticks = createContext<{ boxes: Box[]; ticks: number[]; toggle: (box: number) => void } | null>(null), ThisBox = createContext<Box | undefined>(undefined);
type Rendered = { node?: { position?: { start: { offset?: number } } } };
function TaskItem({ node, children, ...props }: ComponentProps<'li'> & Rendered) {
  const box = useContext(Ticks)?.boxes.find(b => b.offset === node?.position?.start.offset);
  return <li {...props}><ThisBox.Provider value={box}>{children}</ThisBox.Provider></li>;
}
function TickBox({ checked }: ComponentProps<'input'> & Rendered) {
  const state = useContext(Ticks), box = useContext(ThisBox);
  if (!state || !box || box.written) return <input type="checkbox" checked={!!checked} disabled readOnly/>;
  return <label className="tick"><input type="checkbox" aria-label={box.text} checked={state.ticks.includes(box.box)} onChange={() => state.toggle(box.box)}/></label>;
}
const markdownParts = { li: TaskItem, input: TickBox, pre: ({ children }: ComponentProps<'pre'>) => <CodeBlock>{children}</CodeBlock>, a: ({ href, children }: ComponentProps<'a'>) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>, img: ({ src, alt }: ComponentProps<'img'>) => <img src={src} alt={alt ?? ''} loading="lazy" referrerPolicy="no-referrer"/> };

export default function Reader({ report, comments, setComments, onBack, onChange, onMove, showError, focus, onToggleFocus }: { report: Report; comments: Comment[]; setComments: (comments: Comment[]) => void; onBack: () => void; onChange: (patch: Partial<Report>) => Promise<void>; onMove: (kind: Kind) => Promise<void>; showError: (message: string) => void; focus?: boolean; onToggleFocus?: () => void }) {
  const draftKey = `feed-comment-${report.id}`;
  const [draft, setDraft] = useState(() => { try { return sessionStorage.getItem(draftKey) ?? ''; } catch { return ''; } });
  const [saving, setSaving] = useState(false), [menu, setMenu] = useState(false), [starBusy, setStarBusy] = useState(false), [archiveBusy, setArchiveBusy] = useState(false), [idCopied, setIdCopied] = useState(false);
  const commentRef = useRef<HTMLTextAreaElement>(null), pending = useRef<{ id: string; body: string } | null>(null);
  function updateDraft(value: string) { setDraft(value); try { sessionStorage.setItem(draftKey, value); } catch {} }
  async function addComment() {
    if (!draft.trim() || saving) return;
    const text = draft.trim(); if (pending.current?.body !== text) pending.current = { id: crypto.randomUUID(), body: text };
    setSaving(true);
    try { const result = await api<{ comment: Comment }>('/comments', post({ ...pending.current, report_id: report.id })); setComments([...comments.filter(c => c.id !== result.comment.id), result.comment]); updateDraft(''); pending.current = null; }
    catch (e) { showError((e as Error).message); } finally { setSaving(false); }
  }
  async function removeComment(id: string) { if (!confirm('Delete this comment?')) return; try { await api(`/comments/${id}`, { method: 'DELETE' }); setComments(comments.filter(c => c.id !== id)); } catch (e) { showError((e as Error).message); } }
  async function copyId() { try { await navigator.clipboard.writeText(report.id); setIdCopied(true); setTimeout(() => { setIdCopied(false); setMenu(false); }, 1200); } catch { setMenu(false); showError(`Could not copy. The Feed ID is ${report.id}`); } }
  const boxes = useMemo(() => reportBoxes(report.markdown), [report.markdown]);
  const [ticks, setTicks] = useState(report.ticks), [ticksCopied, setTicksCopied] = useState(false);
  const ticking = useRef(new Set<number>()), tickEdits = useRef(0);
  useEffect(() => setTicks(report.ticks), [report.ticks]);
  async function toggleTick(box: number) {
    if (ticking.current.has(box)) return;
    const on = !ticks.includes(box), flip = (list: number[], add: boolean) => add ? [...list, box] : list.filter(b => b !== box);
    ticking.current.add(box); tickEdits.current++; setTicks(list => flip(list, on));
    const drawn = boxes.find(b => b.box === box);
    try { await api('/ticks', post({ report_id: report.id, box, ticked: on, ...(drawn ? { label: boxLabel(drawn) } : {}) })); }
    catch (e) { setTicks(list => flip(list, !on)); showError((e as Error).message); }
    finally { ticking.current.delete(box); }
  }
  // Ticks made on another device show up when this one comes back, or within 30 seconds, like the list. A refresh that crosses a tick here is dropped.
  useEffect(() => {
    if (!boxes.length) return;
    const refresh = async () => { if (document.visibilityState !== 'visible' || ticking.current.size) return; const edits = tickEdits.current; try { const result = await api<{ ticks: number[] }>(`/reports/${report.id}/ticks`); if (edits === tickEdits.current && !ticking.current.size) setTicks(result.ticks); } catch {} };
    const timer = setInterval(refresh, 30000); document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [report.id, boxes.length]);
  // Copies what is on screen, without a fetch first: Safari only allows the clipboard straight from the press.
  async function copyTicked() { try { await navigator.clipboard.writeText(tickedText(report, ticks)); setTicksCopied(true); setTimeout(() => { setTicksCopied(false); setMenu(false); }, 1200); } catch { setMenu(false); showError('Could not copy in this browser. Download Markdown has the whole report.'); } }
  const rendered = useMemo(() => <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={url => /^https?:\/\//i.test(url) || url.startsWith('#') ? url : ''} components={markdownParts}>{report.markdown}</ReactMarkdown>, [report.markdown]);
  const readingTime = Math.max(1, Math.ceil(report.markdown.split(/\s+/).length / 220));
  return <section className="reader" aria-label="Report reader">
    <header className="reader-toolbar"><button className="back-button" onClick={onBack}><ArrowLeft size={18}/><span>Feed</span></button>{onToggleFocus && <button className="icon-button focus-toggle" aria-label={focus ? 'Show feed list' : 'Focus on this report'} aria-pressed={!!focus} onClick={onToggleFocus}><Menu size={20}/></button>}<span className="toolbar-source"><AgentIcon source={report.source}/>{sourceName(report.source)}<span> · {report.routine}</span></span><div className="toolbar-actions">
      <button className={`icon-button ${report.favourite ? 'starred' : ''}`} disabled={starBusy} aria-label={report.favourite ? 'Remove from favourites' : 'Add to favourites'} aria-pressed={!!report.favourite} onClick={async () => { setStarBusy(true); try { await onChange({ favourite: report.favourite ? 0 : 1 }); } finally { setStarBusy(false); } }}><Star size={21} fill={report.favourite ? 'currentColor' : 'none'}/></button>
      <button className="icon-button comment-shortcut" aria-label="Write a comment" onClick={() => { commentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); commentRef.current?.focus(); }}><MessageSquare size={20}/></button>
      <div className="more-wrap"><button className="icon-button" aria-label="More report actions" aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreHorizontal size={21}/></button>{menu && <><button className="menu-dismiss" aria-label="Close report actions" onClick={() => setMenu(false)}/><div className="action-menu">{ticks.length > 0 && <button onClick={() => void copyTicked()}>{ticksCopied ? <Check size={16}/> : <ListChecks size={16}/>}<span aria-live="polite">{ticksCopied ? 'Copied' : `Copy checked (${ticks.length})`}</span></button>}<button onClick={async () => { await onChange({ saved: report.saved ? 0 : 1 }); setMenu(false); }}>{report.saved ? <BookmarkMinus size={16}/> : <Bookmark size={16}/>}{report.saved ? 'Remove from Saved' : 'Save for later'}</button><button onClick={() => void copyId()}>{idCopied ? <Check size={16}/> : <Copy size={16}/>}<span aria-live="polite">{idCopied ? 'Copied' : 'Copy Feed ID'}</span></button><a href={`/api/reports/${report.id}?download=markdown`}><Download size={16}/>Download Markdown</a><button onClick={async () => { await onChange({ is_read: report.is_read ? 0 : 1 }); setMenu(false); }}><Circle size={16}/>{report.is_read ? 'Mark unread' : 'Mark read'}</button><button disabled={archiveBusy} onClick={async () => { setArchiveBusy(true); try { await onChange({ archived: report.archived ? 0 : 1 }); setMenu(false); } finally { setArchiveBusy(false); } }}>{report.archived ? <ArchiveRestore size={16}/> : <Archive size={16}/>}{report.archived ? 'Restore to feed' : 'Archive'}</button><button onClick={async () => { await onMove(report.kind === 'report' ? 'news' : 'report'); setMenu(false); }}>{report.kind === 'report' ? <List size={16}/> : <ClipboardCheck size={16}/>}{report.kind === 'report' ? 'Move this routine to Feed' : 'Move this routine to Reports'}</button></div></>}</div>
    </div></header>
    <div className="reader-scroll" key={report.id}><article className="article"><div className="mobile-source"><AgentIcon source={report.source}/>{sourceName(report.source)} · {report.routine}</div><h1>{report.title}</h1><p className="article-meta">{dayLabel(report.published_at)}, {new Date(report.published_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} <span>·</span> {readingTime} min read</p>
      <div className="markdown" dir="auto"><Ticks.Provider value={{ boxes, ticks, toggle: box => void toggleTick(box) }}>{rendered}</Ticks.Provider></div>
      {!!report.attachments?.length && <section className="attachments"><h2>Attachments</h2>{report.attachments.map(file => <a key={file.id} href={`/api/attachments/${file.id}`}><Paperclip size={17}/><span>{file.name}</span><small>{Math.ceil(file.size / 1000)} KB</small><Download size={16}/></a>)}</section>}
      <section className="comments" aria-label="Your comments"><h2>Your comments {comments.length > 0 && <span>{comments.length}</span>}</h2>{comments.map(c => <div className="comment" key={c.id}><div className="avatar">K</div><div className="comment-main"><p className="comment-author">You <span>· {new Date(c.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, {new Date(c.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span></p><p className="comment-body" dir="auto">{c.body}</p></div><button className="icon-button delete-comment" aria-label="Delete comment" onClick={() => removeComment(c.id)}><Trash2 size={15}/></button></div>)}
      <form className="comment-form" onSubmit={e => { e.preventDefault(); void addComment(); }}><div className="avatar">K</div><div className="comment-input"><textarea ref={commentRef} value={draft} onChange={e => updateDraft(e.target.value)} placeholder="Add a comment…" aria-label="Your comment" maxLength={10000} disabled={saving} rows={2} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void addComment(); } }}/><button className="icon-button" type="submit" disabled={!draft.trim() || saving} aria-label={saving ? 'Saving comment' : 'Save comment'}><Send size={19}/></button></div></form>
      </section>
    </article></div>
  </section>;
}

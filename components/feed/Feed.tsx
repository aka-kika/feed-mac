'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { List, MessageCircle, Archive, Circle, Star, MessageSquare, Search, Settings as SettingsIcon, Menu, X, RefreshCw, ArrowRight, Inbox, SlidersHorizontal } from 'lucide-react';
import { api, excerpt, dayLabel, post } from '@/lib/client';
import { SOURCES, sourceName, type Report, type Comment, type SourcePrefs, type Theme } from '@/lib/types';
import Reader from './Reader';
import AgentIcon from './AgentIcon';
import { validPalette, type Palette } from '@/lib/palettes';
import Settings, { type SettingsTab } from './Settings';
import Modal from './Modal';

type ListResult = { reports: Report[]; routines: { source: string; routine: string }[]; counts: { total: number; unread: number }; cursor: string | null };
const views = [{ id: 'feed', label: 'Feed', icon: List }, { id: 'unread', label: 'Unread', icon: Circle }, { id: 'favourites', label: 'Favourites', icon: Star }, { id: 'commented', label: 'Commented', icon: MessageCircle }, { id: 'archive', label: 'Archive', icon: Archive }];
export default function Feed() {
  const [palette, setPalette] = useState<Palette>('original');
  const [theme, updateTheme] = useState<Theme>('system'), [ready, setReady] = useState(false);
  const [view, setView] = useState('feed'), [source, setSource] = useState(''), [routine, setRoutine] = useState(''), [query, setQuery] = useState('');
  const [list, setList] = useState<ListResult>({ reports: [], routines: [], counts: { total: 0, unread: 0 }, cursor: null });
  const [selected, setSelected] = useState<Report | null>(null), [comments, setComments] = useState<Comment[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [focus, setFocus] = useState(false);
  const [loading, setLoading] = useState(true), [reading, setReading] = useState(false), [moreLoading, setMoreLoading] = useState(false), [error, setError] = useState('');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('appearance');
  const [sourcePrefs, setSourcePrefs] = useState<SourcePrefs>({});
  const [sidebar, setSidebar] = useState(false), [settings, setSettings] = useState(false), [search, setSearch] = useState(false), [searchDraft, setSearchDraft] = useState('');
  const cleanupRequest = useRef<Promise<unknown> | null>(null);
  const selectionVersion = useRef(0), firstLoad = useRef(true), listVersion = useRef(0);
  const selectedRef = useRef(selected); selectedRef.current = selected;
  const showError = useCallback((message: string) => setError(message), []);

  useEffect(() => { try { const savedPalette = localStorage.getItem('feed-palette'); if (validPalette(savedPalette)) setPalette(savedPalette); const saved = localStorage.getItem('feed-theme'); if (saved === 'light' || saved === 'soft-dark' || saved === 'system') updateTheme(saved); const prefs = JSON.parse(localStorage.getItem('feed-sources') || '{}'); if (prefs && typeof prefs === 'object') setSourcePrefs(Object.fromEntries(Object.entries(prefs).filter(([, v]) => typeof v === 'boolean')) as SourcePrefs); } catch {} setReady(true); if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {}); }, []);
  useEffect(() => {
    if (!ready) return;
    const media = matchMedia('(prefers-color-scheme: dark)');
    function apply() { const resolved = theme === 'system' ? media.matches ? 'soft-dark' : 'light' : theme; document.documentElement.dataset.theme = resolved; document.documentElement.dataset.palette = palette; document.documentElement.style.colorScheme = resolved === 'soft-dark' ? 'dark' : 'light'; document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()); }
    apply(); media.addEventListener('change', apply); try { localStorage.setItem('feed-theme', theme); localStorage.setItem('feed-palette', palette); } catch {}
    return () => media.removeEventListener('change', apply);
  }, [theme, palette, ready]);
  const setTheme = (value: Theme) => updateTheme(value);
  function setSourcePref(id: string, shown: boolean | null) { setSourcePrefs(previous => { const next = { ...previous }; if (shown === null) delete next[id]; else next[id] = shown; try { localStorage.setItem('feed-sources', JSON.stringify(next)); } catch {} return next; }); }

  const openReport = useCallback(async (id: string, push = true) => {
    const version = ++selectionVersion.current; setReading(true); setError('');
    try {
      const result = await api<{ report: Report; comments: Comment[] }>(`/reports/${id}`);
      if (version !== selectionVersion.current) return;
      setSelected(result.report); setComments(result.comments);
      if (push) history.pushState({}, '', `/?report=${id}`);
      if (!result.report.is_read) {
        await api(`/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ is_read: true }) });
        if (version !== selectionVersion.current) return;
        setSelected(r => r?.id === id ? { ...r, is_read: 1 } : r);
        setList(l => ({ ...l, reports: l.reports.map(r => r.id === id ? { ...r, is_read: 1 } : r), counts: { ...l.counts, unread: Math.max(0, l.counts.unread - (result.report.archived ? 0 : 1)) } }));
      }
    } catch (e) { if (version === selectionVersion.current) showError((e as Error).message); }
    finally { if (version === selectionVersion.current) setReading(false); }
  }, [showError]);

  const loadList = useCallback(async (silent = false, cursor?: string) => {
    const version = ++listVersion.current;
    if (!silent && !cursor) setLoading(true);
    if (cursor) setMoreLoading(true);
    try {
      const params = new URLSearchParams({ view, source, routine, q: query }); if (cursor) params.set('cursor', cursor);
      const result = await api<ListResult>(`/reports?${params}`);
      if (version !== listVersion.current) return;
      setList(previous => cursor ? { ...result, reports: [...previous.reports, ...result.reports.filter(r => !previous.reports.some(p => p.id === r.id))] } : result);
      if (firstLoad.current) { firstLoad.current = false; const id = new URLSearchParams(location.search).get('report'); if (id) void openReport(id, false); else if (matchMedia('(min-width: 760px)').matches && result.reports[0]) void openReport(result.reports[0].id, false); }
    } catch (e) { if (version === listVersion.current) showError((e as Error).message); }
    finally { if (version === listVersion.current) { setLoading(false); setMoreLoading(false); } }
  }, [view, source, routine, query, openReport, showError]);
  useEffect(() => { cleanupRequest.current ??= api('/demo/cleanup', post({})); void cleanupRequest.current.then(() => loadList()).catch(e => { showError((e as Error).message); void loadList(); }); const onFocus = () => { if (document.visibilityState === 'visible') void loadList(true); }; const timer = setInterval(onFocus, 30000); document.addEventListener('visibilitychange', onFocus); return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onFocus); }; }, [loadList]);
  useEffect(() => { function onPop() { const id = new URLSearchParams(location.search).get('report'); if (id) void openReport(id, false); else { ++selectionVersion.current; setSelected(null); setReading(false); } } addEventListener('popstate', onPop); return () => removeEventListener('popstate', onPop); }, [openReport]);
  useEffect(() => { if (!selected && !reading) setFocus(false); }, [selected, reading]);
  useEffect(() => { const keydown = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchDraft(query); setSearch(true); } if (e.key === 'Escape') { const tag = (e.target as HTMLElement).tagName; if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return; if (focus) { e.preventDefault(); setFocus(false); return; } setSidebar(false); } }; addEventListener('keydown', keydown); return () => removeEventListener('keydown', keydown); }, [query, focus]);
  async function refreshReports() {
    if (refreshing) return;
    setRefreshing(true);
    const started = Date.now();
    try { await loadList(true); }
    finally {
      const remain = Math.max(0, 550 - (Date.now() - started));
      if (remain) await new Promise(r => setTimeout(r, remain));
      setRefreshing(false);
    }
  }
  function back() { ++selectionVersion.current; setReading(false); setSelected(null); history.pushState({}, '', '/'); }
  function choose(viewId: string, sourceId = '') { setView(viewId); setSource(sourceId); setRoutine(''); setSidebar(false); setError(''); if (matchMedia('(max-width: 759px)').matches) back(); }
  async function changeReport(patch: Partial<Report>) {
    const target = selectedRef.current; if (!target) return;
    const data = Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, !!value]));
    try { await api(`/reports/${target.id}`, { method: 'PATCH', body: JSON.stringify(data) }); setSelected(r => r?.id === target.id ? { ...r, ...patch } : r); setList(l => ({ ...l, reports: patch.archived !== undefined ? l.reports.filter(r => r.id !== target.id) : l.reports.map(r => r.id === target.id ? { ...r, ...patch } : r) })); if (patch.archived !== undefined && selectedRef.current?.id === target.id) back(); void loadList(true); }
    catch (e) { showError((e as Error).message); }
  }
  function updateComments(next: Comment[]) { if (!selected) return; const id = selected.id; if (selectedRef.current?.id === id) { setComments(next); setSelected(current => current?.id === id ? { ...current, comment_count: next.length } : current); } setList(l => ({ ...l, reports: l.reports.map(r => r.id === id ? { ...r, comment_count: next.length } : r) })); }
  const title = source ? sourceName(source) : views.find(v => v.id === view)?.label ?? 'Feed';
  const routines = list.routines.filter(r => !source || source === r.source);
  const activeSources = new Set(list.routines.map(r => r.source));
  const visibleSources = SOURCES.filter(s => sourcePrefs[s.id] ?? (activeSources.has(s.id) || s.id === source));
  let previousDay = '';
  return <main className={`feed-app ${selected || reading ? 'has-selection' : ''} ${sidebar ? 'sidebar-open' : ''} ${focus && selected ? 'focus-mode' : ''}`}>
    <a className="skip-link" href="#feed-list">Skip to reports</a>
    {sidebar && <button className="sidebar-scrim" aria-label="Close sources" onClick={() => setSidebar(false)}/>}
    <aside className="sidebar" aria-label="Feed navigation"><div className="sidebar-top"><span>Feed</span><button className="icon-button" aria-label="Close navigation" onClick={() => setSidebar(false)}><X size={20}/></button></div><nav>
      {views.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${view === id && !source ? 'active' : ''}`} onClick={() => choose(id)} aria-current={view === id && !source ? 'page' : undefined}><span className="navigation-symbol"><Icon size={16}/></span><span>{label}</span>{id === 'unread' && list.counts.unread > 0 && <small>{list.counts.unread}</small>}</button>)}
    </nav><div className="source-section"><p className="nav-section-label"><span>Sources</span><button className="section-edit" aria-label="Choose sidebar sources" title="Choose sidebar sources" onClick={() => { setSettingsTab('sources'); setSettings(true); setSidebar(false); }}><SlidersHorizontal size={13}/></button></p><nav>{visibleSources.map(s => <button key={s.id} className={`nav-item source-item ${source === s.id ? 'active' : ''}`} onClick={() => choose('feed', s.id)} aria-current={source === s.id ? 'page' : undefined}><AgentIcon source={s.id}/><span>{s.name}</span></button>)}</nav></div><div className="sidebar-bottom"><button className="nav-item settings-button" onClick={() => { setSettingsTab('appearance'); setSettings(true); setSidebar(false); }}><SettingsIcon size={19}/><span>Settings</span></button></div></aside>
    <section className="feed-list" id="feed-list" aria-label="Reports"><header className="list-header"><button className="icon-button menu-button" aria-label="Open navigation" onClick={() => setSidebar(true)}><Menu size={20}/></button><h1>{title}</h1><button className="icon-button" aria-label="Search reports" onClick={() => { setSearchDraft(query); setSearch(true); }}><Search size={21}/></button></header>
      {(query || routines.length > 0) && <div className="list-filters">{query ? <button className="query-filter" onClick={() => setQuery('')}><Search size={14}/><span>{query}</span><X size={14}/></button> : <label className="routine-filter"><span className="sr-only">Filter by routine</span><select value={routine} onChange={e => setRoutine(e.target.value)}><option value="">All routines</option>{Array.from(new Set(routines.map(r => r.routine))).map(r => <option key={r}>{r}</option>)}</select></label>}<button className="icon-button small refresh-button" aria-label={refreshing ? 'Refreshing reports' : 'Refresh reports'} aria-busy={refreshing} disabled={refreshing} onClick={() => void refreshReports()}><span className={`refresh-icon${refreshing ? ' is-spinning' : ''}`} aria-hidden="true"><RefreshCw size={15}/></span></button></div>}
      <div className="report-rows" aria-busy={loading}>
        {loading && !list.reports.length ? <div className="list-empty"><span className="loading-dot"/><p>Loading your reports…</p></div> : list.reports.length ? list.reports.map(report => { const day = dayLabel(report.published_at), heading = day !== previousDay; previousDay = day; return <div key={report.id}>{heading && <h2 className="date-heading">{day}</h2>}<button className={`report-row ${report.is_read ? 'is-read' : 'is-unread'} ${selected?.id === report.id ? 'selected' : ''}`} onClick={() => void openReport(report.id)} aria-current={selected?.id === report.id ? 'true' : undefined}>
          <span className={`unread-dot ${report.is_read ? 'read' : ''}`} aria-label={report.is_read ? 'Read' : 'Unread'}/><div className="row-content"><div className="row-meta"><span><AgentIcon source={report.source}/>{sourceName(report.source)}<span className="row-routine"> · {report.routine}</span></span><time>{new Date(report.published_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</time></div><h3>{report.title}{!!report.is_read && <span className="read-label">Read</span>}</h3><p>{excerpt(report.markdown)}</p>{report.comment_count > 0 ? <div className="row-foot">{report.comment_count > 0 && <span><MessageSquare size={12}/>{report.comment_count}</span>}</div> : null}</div>{!!report.favourite && <Star className="row-star" size={14} fill="currentColor"/>}
        </button></div>; }) : <div className="list-empty"><Inbox size={28} strokeWidth={1.4}/><h2>{list.counts.total ? 'Nothing here yet.' : 'Your agents’ work, together.'}</h2><p>{list.counts.total ? query ? 'Try another search or clear your filters.' : view === 'favourites' ? 'Star a report to keep it here.' : view === 'commented' ? 'Reports you comment on will appear here.' : view === 'archive' ? 'Archived reports will appear here. You can restore them anytime.' : view === 'unread' ? 'You’re all caught up.' : source ? 'Reports from this source will appear here.' : 'New reports will appear here. Find saved reports in Archive.' : 'Reports will arrive here after you connect your agents.'}</p>{!list.counts.total && <><button className="primary-button" onClick={() => { setSettingsTab('agents'); setSettings(true); }}>Connect your agents <ArrowRight size={16}/></button></>}</div>}
        {list.cursor && <button className="load-more" disabled={moreLoading} onClick={() => void loadList(false, list.cursor!)}>{moreLoading ? 'Loading…' : 'Load earlier reports'}</button>}
      </div><footer className="list-footer"><span>{list.counts.total} {list.counts.total === 1 ? 'report' : 'reports'}</span><span>Private feed</span></footer>
    </section>
    {selected ? <Reader key={selected.id} report={selected} comments={comments} setComments={updateComments} onBack={back} onChange={changeReport} showError={showError} focus={focus} onToggleFocus={() => setFocus(v => !v)}/> : <section className="reader reader-placeholder"><button className="back-button" onClick={back}><ArrowRight size={18}/>Feed</button><div>{reading ? <><span className="loading-dot"/><p>Opening report…</p></> : <><div className="empty-glyph"><List size={28} strokeWidth={1.3}/></div><h2>A little space to catch up.</h2><p>Choose a report and settle in.</p><span className="keyboard-hint"><kbd>⌘</kbd> <kbd>K</kbd> to find something</span></>}</div></section>}
    {error && <div className="error-toast" role="alert"><p>{error}</p><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><X size={17}/></button></div>}
    {settings && <Settings palette={palette} setPalette={setPalette} initialTab={settingsTab} theme={theme} setTheme={setTheme} onClose={() => setSettings(false)} showError={showError} sourcePrefs={sourcePrefs} setSourcePref={setSourcePref} activeSources={activeSources}/>}
    {search && <Modal title="Search reports" className="search-modal" onClose={() => setSearch(false)}><form onSubmit={e => { e.preventDefault(); setQuery(searchDraft.trim()); setSource(''); setRoutine(''); setView('feed'); setSearch(false); if (matchMedia('(max-width: 759px)').matches) back(); }}><label className="search-field"><Search size={21}/><input autoFocus value={searchDraft} onChange={e => setSearchDraft(e.target.value)} placeholder="Titles, content, routines…" aria-label="Search query" maxLength={200}/></label><div className="search-footer"><span>Search across all your agents.</span><button className="primary-button" type="submit">Search <ArrowRight size={16}/></button></div></form></Modal>}
  </main>;
}

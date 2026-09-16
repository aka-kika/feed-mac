'use client';
import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor, Check, Copy, KeyRound, Trash2, ArrowUpRight, Download } from 'lucide-react';
import Modal from './Modal';
import AgentIcon from './AgentIcon';
import About from './About';
import { PALETTES, type Palette } from '@/lib/palettes';
import { api, post } from '@/lib/client';
import { SOURCES, SOURCES_BY_NAME, sourceName, type AgentKey, type SourceId, type SourcePrefs, type Theme } from '@/lib/types';

export type SettingsTab = 'appearance' | 'sources' | 'agents' | 'about';
type Props = { palette: Palette; setPalette: (palette: Palette) => void; theme: Theme; setTheme: (theme: Theme) => void; onClose: () => void; showError: (message: string) => void; initialTab?: SettingsTab; sourcePrefs: SourcePrefs; setSourcePref: (id: string, shown: boolean | null) => void; activeSources: Set<string> };

export default function Settings({ palette, setPalette, theme, setTheme, onClose, initialTab = 'appearance', sourcePrefs, setSourcePref, activeSources }: Props) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [keys, setKeys] = useState<AgentKey[]>([]), [source, setSource] = useState<SourceId>('claude');
  const [instructions, setInstructions] = useState(''), [deliveryReady, setDeliveryReady] = useState(false), [showInstructions, setShowInstructions] = useState(false), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false), [loadError, setLoadError] = useState('');
  const [origin, setOrigin] = useState(''), [guideCopied, setGuideCopied] = useState(false);
  const showError = (message: string) => setLoadError(message);
  useEffect(() => { setOrigin(location.origin); api<{ keys: AgentKey[]; delivery_ready: boolean }>('/keys').then(d => { setKeys(d.keys); setDeliveryReady(d.delivery_ready); }).catch(e => setLoadError(e.message)); }, []);
  async function create() { setBusy(true); setLoadError(''); try { const d = await api<{ instructions: string; key: AgentKey }>('/keys', post({ source, label: sourceName(source) })); setKeys(k => [d.key, ...k]); setInstructions(d.instructions); setShowInstructions(false); setCopied(false); } catch (e) { showError((e as Error).message); } finally { setBusy(false); } }
  async function revoke(key: AgentKey) { if (!confirm(`Revoke this ${key.label} key? Agents using it will no longer be able to publish.`)) return; setBusy(true); try { await api(`/keys/${key.id}`, { method: 'DELETE' }); setKeys(k => k.filter(x => x.id !== key.id)); setInstructions(''); } catch (e) { showError((e as Error).message); } finally { setBusy(false); } }
  async function copyGuide() { try { const text = await (await fetch('/downloads/LOCAL-PUBLISHING.md', { cache: 'no-store' })).text(); await navigator.clipboard.writeText(text); setGuideCopied(true); setTimeout(() => setGuideCopied(false), 1800); } catch { showError('Could not copy the guide. Use the download link instead.'); } }
  async function copy(text: string) { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setShowInstructions(true); showError('Select the instructions below to copy them in this browser.'); } }
  const overrides = Object.keys(sourcePrefs).length;
  const tabs: { id: SettingsTab; label: string }[] = [{ id: 'appearance', label: 'Appearance' }, { id: 'sources', label: 'Sidebar' }, { id: 'agents', label: 'Agent connections' }, { id: 'about', label: 'About' }];
  return <Modal title="Settings" onClose={onClose}>
    <div className="settings-tabs" role="tablist" aria-label="Settings sections">{tabs.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'selected' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}</div>
    {tab === 'appearance' ? <section className="appearance"><h3>Make yourself comfortable.</h3><p className="muted">Choose how Feed looks on this device.</p><div className="theme-options">
      {([{ id: 'light', name: 'Light', icon: Sun }, { id: 'soft-dark', name: 'Soft Dark', icon: Moon }, { id: 'system', name: 'System', icon: Monitor }] as const).map(({ id, name, icon: Icon }) => <button key={id} className={`theme-option ${theme === id ? 'chosen' : ''}`} onClick={() => setTheme(id)} aria-pressed={theme === id}>
        <span className={`theme-preview preview-${id}`} aria-hidden="true"><span className="preview-nav"/><span className="preview-list"><i/><i/><i/></span><span className="preview-article"><b/><i/><i/><i/></span></span>
        <span className="theme-caption"><Icon size={17}/>{name}{theme === id && <Check size={16}/>}</span></button>)}
    </div><p className="settings-note">System follows your device. When it switches to dark, Feed uses Soft Dark.</p>
    <details className="palette-details"><summary><span className="palette-heading">Color palette</span><span className="palette-current"><span className="palette-swatches" aria-hidden="true">{PALETTES.find(p => p.id === palette)?.colors.map((color, i) => <i key={i} style={{ background: color }}/>)}</span>{PALETTES.find(p => p.id === palette)?.name}</span></summary><div className="palette-options">{PALETTES.map(p => <button key={p.id} className={`palette-option ${palette === p.id ? 'chosen' : ''}`} aria-pressed={palette === p.id} onClick={() => setPalette(p.id)}><span className="palette-swatches" aria-hidden="true">{p.colors.map((color, i) => <i key={i} style={{ background: color }}/>)}</span><span>{p.name}</span>{palette === p.id && <Check size={14}/>}</button>)}</div></details><div className="settings-footer"><span>Feed</span><span>Your agents’ routines, in one quiet place.</span></div></section>
    : tab === 'sources' ? <section className="sources"><h3>Choose who sits in the sidebar.</h3><p className="muted">A source appears on its own once it has reports. Switch one off to hide it, or on to show it before its first report. Saved on this device.</p>
      <div className="source-toggles" role="list">{SOURCES.map(s => { const pref = sourcePrefs[s.id]; const shown = pref ?? activeSources.has(s.id); const state = pref === undefined ? (shown ? 'Automatic, has reports' : 'Automatic, no reports yet') : pref ? 'Always shown' : 'Hidden'; return <div className="source-toggle" role="listitem" key={s.id}><AgentIcon source={s.id}/><div className="source-text"><strong>{s.name}</strong><small>{state}</small></div><button type="button" role="switch" className="switch" aria-checked={shown} aria-label={`${shown ? 'Hide' : 'Show'} ${s.name} in the sidebar`} onClick={() => setSourcePref(s.id, !shown)}/></div>; })}</div>
      {overrides > 0 && <button type="button" className="sources-reset" onClick={() => { for (const id of Object.keys(sourcePrefs)) setSourcePref(id, null); }}>Back to automatic for every source</button>}
      <p className="settings-note">To connect a new agent, open Agent connections and prepare its instructions. Its reports place it in the sidebar automatically.</p></section>
    : tab === 'about' ? <About/>
    : <section className="connections">
      <h3>A home for every routine.</h3><p className="muted">Choose an agent and copy everything it needs to connect. Paste the instructions into that agent’s private conversation.</p>
      {loadError && <p role="alert" className="inline-error">{loadError}</p>}
      <div className="create-key"><label>Source<select disabled={busy} value={source} onChange={e => { setSource(e.target.value as SourceId); setInstructions(''); }}>{SOURCES_BY_NAME.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><button className="primary-button" disabled={busy || !deliveryReady} onClick={create}><KeyRound size={16}/>{busy ? 'Preparing…' : 'Prepare instructions'}</button></div>
      {instructions && <div className="new-key"><strong>{sourceName(source)} is ready to connect.</strong><p>Includes both credentials, the publishing tool, and a connection check. Copy before closing; credentials are only shown once.</p><button className="primary-button copy-instructions" onClick={() => copy(instructions)}>{copied ? <Check size={17}/> : <Copy size={17}/>}<span aria-live="polite">{copied ? 'Copied — paste into your agent' : 'Copy connection instructions'}</span></button><details open={showInstructions} onToggle={e => setShowInstructions(e.currentTarget.open)}><summary>View instructions</summary><textarea aria-label="Complete private connection instructions" readOnly value={instructions} onFocus={e => e.currentTarget.select()} spellCheck={false}/></details></div>}
      {!deliveryReady && !loadError && <p className="settings-note">Checking agent access…</p>}
      <div className="skill-download"><h4>Publishing guide</h4><p>Give your agent the publishing guide and its private connection instructions above. Publish the complete report from the routine itself.</p><div className="guide-actions"><button type="button" className="guide-copy" onClick={() => void copyGuide()}>{guideCopied ? <Check size={15}/> : <Copy size={15}/>}<span aria-live="polite">{guideCopied ? 'Copied' : 'Copy publishing guide'}</span></button><a href="/downloads/LOCAL-PUBLISHING.md" download><Download size={15}/>Download</a></div></div><div className="key-list">{keys.map(key => <div className="key-row" key={key.id}><span><strong className="key-name"><AgentIcon source={key.source}/>{key.label}</strong><small>{key.last_used_at ? `Last delivery ${new Date(key.last_used_at).toLocaleString()}` : 'No deliveries yet'}</small></span><button className="icon-button" disabled={busy} aria-label={`Revoke ${key.label} key`} onClick={() => revoke(key)}><Trash2 size={17}/></button></div>)}</div>
      <details className="delivery-details"><summary>Connect an agent <ArrowUpRight size={15}/></summary>
      <p>Prepare instructions above, copy them, and paste them into your agent. The instructions include the credentials and ask the agent to send one connection-check report. A last-delivery time below its name confirms a report reached Feed.</p>
      <label>MCP endpoint<code className="endpoint">{origin}/api/mcp</code></label><label>HTTP endpoint<code className="endpoint">POST {origin}/api/publish</code></label>
      <p>Each agent gets its own publishing key. It can submit reports but cannot read your reports or comments. Revoke a key to stop that connection.</p><p>Existing keys cannot be displayed again. Prepare a new set of instructions if you need to reconnect, then revoke the old key when you no longer need it.</p>
      </details>
    </section>}
  </Modal>;
}

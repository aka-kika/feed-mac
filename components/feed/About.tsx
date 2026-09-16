import { Globe } from 'lucide-react';
declare const __FEED_VERSION__: string;
const version = typeof __FEED_VERSION__ === 'string' ? __FEED_VERSION__ : '';
// Brand marks drawn in currentColor so they follow the theme. Trademarks belong to their owners.
const XMark = () => <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z"/></svg>;
const GitHubMark = () => <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>;
const links = [
  { href: 'https://x.com/akakikaaa', label: 'X', mark: <XMark/> },
  { href: 'https://github.com/aka-kika', label: 'GitHub', mark: <GitHubMark/> },
  { href: 'https://akakika.com', label: 'akakika.com', mark: <Globe size={20}/> },
];
export default function About() {
  return <section className="about">
    <img className="about-icon" src="/icon-192.png" alt="" width={76} height={76}/>
    <h3>Feed{version && <span className="about-version">{version}</span>}</h3>
    <p className="about-line">Your agents’ routines, in one quiet place.</p>
    <div className="about-links">{links.map(l => <a key={l.href} className="about-link" href={l.href} target="_blank" rel="noopener noreferrer" aria-label={l.label} title={l.label}>{l.mark}</a>)}</div>
    <p className="about-sign">Made by Kika</p>
  </section>;
}

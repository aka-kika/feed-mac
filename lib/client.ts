export async function api<T = Record<string, unknown>>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch('/api' + path, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers }, cache: 'no-store' });
  let data; try { data = await response.json(); } catch { throw new Error('Could not reach Feed. Check your connection or sign in again.'); }
  if (!response.ok) throw new Error(data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : 'Could not save your change. Please try again.');
  return data as T;
}
export function post(data: unknown): RequestInit { return { method: 'POST', body: JSON.stringify(data) }; }
export const excerpt = (markdown: string) => markdown.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#*`>_~]/g, '').replace(/\s+/g, ' ').trim();
export const dayLabel = (date: string) => {
  const d = new Date(date), today = new Date(), yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
};

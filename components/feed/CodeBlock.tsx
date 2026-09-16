'use client';
import { Children, isValidElement, useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';

export default function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false), [error, setError] = useState(false);
  const child = Children.toArray(children).find(isValidElement);
  const props = child?.props as { className?: string; children?: ReactNode } | undefined;
  const language = props?.className?.match(/language-([^\s]+)/)?.[1] ?? 'Code';
  const content = Children.toArray(props?.children).filter(c => typeof c === 'string' || typeof c === 'number').join('');
  async function copy() { try { await navigator.clipboard.writeText(content); setError(false); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setError(true); } }
  return <div className="code-block"><div className="code-toolbar"><span>{language}</span><button onClick={copy} aria-label="Copy code">{copied ? <Check size={14}/> : <Copy size={14}/>}<span>{copied ? 'Copied' : 'Copy'}</span></button></div><pre>{children}</pre>{error && <p role="status" className="code-copy-error">Select the code to copy it in this browser.</p>}</div>;
}

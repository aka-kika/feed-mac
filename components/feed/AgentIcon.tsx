// One entry per source. A string is a single file; a pair swaps with the theme (light file on light, dark file on Soft Dark).
// Flat SVG marks sit on a transparent plate; site favicons keep the white plate they were drawn for.
type Icon = { file: string; plate?: 'white' } | { light: string; dark: string };
const icons: Record<string, Icon> = {
  hermes: { file: 'hermes.png', plate: 'white' }, claude: { file: 'claude.ico', plate: 'white' }, gpt: { file: 'gpt.svg', plate: 'white' },
  'grok-bots': { file: 'grok-bots.png' }, 'grok-web': { file: 'grok.svg' }, goose: { file: 'goose.ico', plate: 'white' }, minimax: { file: 'minimax.png' }, muse: { file: 'meta.ico', plate: 'white' },
  gemini: { file: 'gemini.svg' }, copilot: { file: 'copilot.svg' }, perplexity: { file: 'perplexity.svg' }, deepseek: { file: 'deepseek.svg' }, qwen: { file: 'qwen.svg' }, mistral: { file: 'mistral.svg' },
  cursor: { light: 'cursor-light.svg', dark: 'cursor-dark.svg' }, kimi: { light: 'kimi-light.svg', dark: 'kimi-dark.svg' }, ollama: { light: 'ollama-light.svg', dark: 'ollama-dark.svg' },
  windsurf: { light: 'windsurf-light.svg', dark: 'windsurf-dark.svg' }, codex: { light: 'codex-light.svg', dark: 'codex-dark.svg' }, opencode: { light: 'opencode-light.svg', dark: 'opencode-dark.svg' },
};
export default function AgentIcon({ source }: { source: string }) {
  if (source === 'aka') return <span className="agent-icon aka-icon" aria-hidden="true"/>;
  const icon = icons[source];
  if (!icon) return <span className="agent-icon agent-placeholder" data-source={source} aria-hidden="true">{(source[0] ?? 'A').toUpperCase()}</span>;
  if ('light' in icon) return <span className="agent-icon plain" data-source={source} aria-hidden="true"><img className="icon-light" src={`/agents/${icon.light}`} alt="" width={20} height={20}/><img className="icon-dark" src={`/agents/${icon.dark}`} alt="" width={20} height={20}/></span>;
  return <span className={`agent-icon ${icon.plate === 'white' ? '' : 'plain'}`} data-source={source} aria-hidden="true"><img src={`/agents/${icon.file}`} alt="" width={20} height={20}/></span>;
}

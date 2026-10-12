/** News (the sidebar's Feed tab) is what you read; reports are the automated "all good" runs (wraps, syncs, checks). Split per routine. */
export type Kind = 'news' | 'report';
/** A routine whose name holds one of these words starts in Reports. Moving a routine by hand overrides this. */
export const REPORT_WORDS = ['scribe', 'wrap', 'sync', 'health', 'check', 'audit', 'test', 'connection', 'maintenance', 'trail', 'setup', 'review', 'retrospective', 'smoke', 'status', 'backup'] as const;
/** SQL for a report row's kind, for a query that names the reports table `r`. */
export const KIND_SQL = `coalesce((SELECT k.kind FROM routine_kinds k WHERE k.owner = r.owner AND k.source = r.source AND k.routine = r.routine), CASE WHEN ${REPORT_WORDS.map(w => `lower(r.routine) LIKE '%${w}%'`).join(' OR ')} THEN 'report' ELSE 'news' END)`;

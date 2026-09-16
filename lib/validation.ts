import { z } from 'zod';
import { SOURCE_IDS } from './types';
export const sourceSchema = z.enum(SOURCE_IDS);
export const publishShape = {
  run_id: z.string().trim().min(1).max(160),
  routine: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(240),
  markdown: z.string().min(1).max(500_000),
  published_at: z.string().datetime({ offset: true }).optional(),
  attachments: z.array(z.object({ name: z.string().min(1).max(160).refine(s => !/[\x00-\x1f/\\]/.test(s), 'Use a filename without path separators'), type: z.string().max(100).default('application/octet-stream'), base64: z.string().max(2_800_000) })).max(5).default([]),
};
export const publishSchema = z.object(publishShape).strict();
export type PublishInput = z.input<typeof publishSchema>;

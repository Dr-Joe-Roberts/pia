import { preferences, preferenceSchema } from "./planning";
import { z } from 'zod';
import { AppError, idSchema, kinds, normalizeData, parse } from '../lib/domain';
import { exportData } from '../lib/data';
import { assertKind } from '../lib/workspace';
import { boundedBody, json, readJson } from '../lib/data-http';
import { sha256, MAX_MANIFEST_BYTES, MAX_FILE_BYTES, MAX_BACKUP_BYTES } from '../lib/backup-archive';
import { DEFAULT_REMINDERS } from '../lib/reminders';
import type { WorkerEnv } from './index';
const fileSchema = z.object({ id: idSchema.max(94), name: z.string().min(1).max(240).regex(/^[^\x00-\x1f/\\]+$/), content_type: z.string().min(1).max(240).regex(/^[\x20-\x7e]+$/), size: z.number().int().nonnegative().max(MAX_FILE_BYTES), sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(), created_at: z.string().datetime({ offset: true }).optional() });
const manifestSchema = z.object({ reminder_settings: preferenceSchema.optional(), format: z.string().optional(), version: z.number().optional(), records: z.array(z.object({ id: idSchema, kind: z.enum(kinds), data: z.record(z.unknown()), deleted_at: z.string().datetime({ offset: true }).nullish(), created_at: z.string().datetime({ offset: true }).optional() })).max(2000), links: z.array(z.object({ project_id: idSchema, student_id: idSchema })).max(5000).default([]), files: z.array(fileSchema).max(1000).default([]) });
const keyFor = (user: string, file: { id: string; object_key?: string | null }) => file.object_key || `private/${encodeURIComponent(user)}/${file.id}`;
type FileRow = { id: string; name: string; content_type: string; size: number; created_at: string; object_key: string | null };
function checkPrivateAttachments(records: { data: Record<string, unknown> }[], files: { id: string }[]) {
  const ids = new Set(files.map(file => file.id));
  for (const record of records) for (const field of ['files', 'links', 'sources']) {
    const entries = record.data[field];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const match = typeof entry?.url === 'string' && entry.url.match(/^\/api\/files\/([A-Za-z0-9_-]+)$/);
      if (match && !ids.has(match[1])) throw new AppError(409, 'incomplete_backup', 'A record refers to a private attachment missing from this archive. Repair the attachment or its link before making or restoring a complete backup.');
    }
  }
}

export async function backupApi(request: Request, env: WorkerEnv, user: string) {
  const path = new URL(request.url).pathname, db = env.DB;
  if (path === '/api/backups/manifest' && request.method === 'GET') {
    const data = await exportData(user, false);
    if (data.records.length > 2000) throw new AppError(413, 'backup_limit', 'This archive supports up to 2,000 records. Use the records export and a managed attachment backup for a larger workspace.');
    const rows = await db.prepare('SELECT * FROM files WHERE user_id=?').bind(user).all<FileRow>();
    if (rows.results.length > 1000 || rows.results.reduce((sum, f) => sum + f.size, 0) > MAX_BACKUP_BYTES - MAX_MANIFEST_BYTES) throw new AppError(413, 'backup_limit', 'The complete archive exceeds its 100 MB / 1,000 attachment limit. No incomplete backup was prepared.');
    const files = [];
    for (const file of rows.results) {
      if (!env.BUCKET) throw new AppError(503, 'files_unavailable', 'Connect private attachment storage before making a complete backup.');
      const object = await env.BUCKET.get(keyFor(user, file));
      if (!object || object.size !== file.size || object.size > MAX_FILE_BYTES) throw new AppError(409, 'incomplete_backup', 'An attachment is missing or has an unexpected size. Repair it before making a complete backup.');
      files.push({ id: file.id, name: file.name, content_type: file.content_type, size: file.size, created_at: file.created_at, sha256: await sha256(await object.arrayBuffer()) });
    }
    checkPrivateAttachments(data.records, files);
    const reminderSettings = (await preferences(db, user)).settings;
    const manifest = { reminder_settings: reminderSettings, format: 'pia-complete-backup', version: 2, app: 'lab', exported_at: data.exported_at, records: data.records, links: data.links, files };
    if (new TextEncoder().encode(JSON.stringify(manifest)).length > MAX_MANIFEST_BYTES) throw new AppError(413, 'backup_limit', 'The manifest exceeds 7 MB. No incomplete backup was prepared.');
    return json(manifest);
  }
  if (path === '/api/backups/completed' && request.method === 'POST') {
    const at = new Date().toISOString();
    await db.prepare('INSERT INTO pia_preferences(user_id,data_json,last_backup_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET last_backup_at=excluded.last_backup_at').bind(user, JSON.stringify(DEFAULT_REMINDERS), at).run();
    return json({ prepared_at: at });
  }
  if (path === '/api/backups/preview' && request.method === 'POST') {
    const input = parse(manifestSchema, await readJson(request, MAX_MANIFEST_BYTES));
    if (new Set(input.records.map(r => r.id)).size !== input.records.length || new Set(input.files.map(f => f.id)).size !== input.files.length) throw new AppError(400, 'duplicate_id', 'The backup contains duplicate record or attachment IDs.');
    for (const r of input.records) { assertKind(r.kind); normalizeData(r.kind, r.data); }
    if (input.format === 'pia-complete-backup' && input.version === 2) checkPrivateAttachments(input.records, input.files);
    const existing = await db.prepare('SELECT id,kind,data_json,deleted_at FROM records WHERE user_id=?').bind(user).all<{ id: string; kind: string; data_json: string; deleted_at: string | null }>();
    const ids = new Set(existing.results.map(r => r.id));
    const pairs = new Set(existing.results.filter(r => r.kind === 'deadline_target' && !r.deleted_at).map(r => { const d = JSON.parse(r.data_json); return JSON.stringify([d.project_id, d.deadline_id]); }));
    for (const r of input.records.filter(r => !ids.has(r.id) && r.kind === 'deadline_target' && !r.deleted_at)) { const pair = JSON.stringify([r.data.project_id, r.data.deadline_id]); if (pairs.has(pair)) throw new AppError(409, 'target_already_linked', 'This backup would duplicate a project/deadline relationship. Nothing has been restored.'); pairs.add(pair); }
    const restoreFiles: string[] = [];
    for (const file of input.files) {
      const row = await db.prepare('SELECT * FROM files WHERE user_id=? AND id=?').bind(user, file.id).first<FileRow>();
      const object = row && env.BUCKET ? await env.BUCKET.get(keyFor(user, row)) : null;
      if (!object) restoreFiles.push(file.id);
      else if (file.sha256 && await sha256(await object.arrayBuffer()) !== file.sha256) throw new AppError(409, 'file_conflict', 'An existing attachment with the same ID has different contents. It will not be overwritten.');
    }
    return json({ add: input.records.filter(r => !ids.has(r.id)).length, keep: input.records.filter(r => ids.has(r.id)).length, archived: input.records.filter(r => !ids.has(r.id) && r.deleted_at).length, restore_files: restoreFiles, complete: input.format === 'pia-complete-backup' && input.version === 2, links: input.links.length });
  }
  const match = path.match(/^\/api\/backups\/file\/([A-Za-z0-9_-]{1,120})$/);
  if (match && request.method === 'POST') {
    if (!env.BUCKET) throw new AppError(503, 'files_unavailable', 'Connect private attachment storage before restoring files.');
    let metadata: unknown;
    try { metadata = JSON.parse(decodeURIComponent(request.headers.get('X-PIA-File') || '')); } catch { throw new AppError(400, 'invalid_file', 'Attachment metadata could not be read.'); }
    const file = parse(fileSchema.extend({ sha256: z.string().regex(/^[a-f0-9]{64}$/) }), metadata);
    if (file.id !== match[1]) throw new AppError(400, 'invalid_file', 'Attachment ID does not match.');
    const bytes = await boundedBody(request, MAX_FILE_BYTES);
    if (bytes.byteLength !== file.size || await sha256(bytes.buffer as ArrayBuffer) !== file.sha256) throw new AppError(400, 'checksum_failed', 'The attachment checksum failed. Nothing was overwritten.');
    const prior = await db.prepare('SELECT * FROM files WHERE user_id=? AND id=?').bind(user, file.id).first<FileRow>();
    const priorObject = prior ? await env.BUCKET.get(keyFor(user, prior)) : null;
    if (priorObject) {
      if (await sha256(await priorObject.arrayBuffer()) !== file.sha256) throw new AppError(409, 'file_conflict', 'An existing attachment has different contents and was preserved.');
      return json({ restored: false, id: file.id });
    }
    const objectKey = `private/${encodeURIComponent(user)}/restore/${crypto.randomUUID()}`;
    await env.BUCKET.put(objectKey, bytes, { httpMetadata: { contentType: file.content_type } });
    try {
      const result = prior
        ? await db.prepare('UPDATE files SET name=?,content_type=?,size=?,object_key=? WHERE user_id=? AND id=? AND object_key IS ?').bind(file.name, file.content_type, file.size, objectKey, user, file.id, prior.object_key).run()
        : await db.prepare('INSERT OR IGNORE INTO files(id,user_id,name,content_type,size,created_at,object_key) VALUES(?,?,?,?,?,?,?)').bind(file.id, user, file.name, file.content_type, file.size, file.created_at || new Date().toISOString(), objectKey).run();
      if (!result.meta.changes) throw new AppError(409, 'file_conflict', 'Attachment storage changed during restore. Refresh the preview and retry; existing data was preserved.');
    } catch (e) { await env.BUCKET.delete(objectKey); throw e; }
    return json({ restored: true, id: file.id });
  }
  return new Response(null, { status: 405 });
}

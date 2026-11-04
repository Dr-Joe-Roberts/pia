import { z } from 'zod';
import { AppError, parse } from '../lib/domain';
import { readJson, json } from '../lib/data-http';
import { DEFAULT_REMINDERS, reminderNotices, type ReminderPreferences } from '../lib/reminders';
import { OWNER_ID, type AuthEnv } from './auth';
export const preferenceSchema = z.object({ reminders_enabled: z.boolean(), reminder_hour: z.number().int().min(0).max(23), days_before: z.number().int().min(0).max(7), weekly_digest: z.boolean(), digest_day: z.number().int().min(0).max(6), digest_hour: z.number().int().min(0).max(23) }).strict();
export async function preferences(db: D1Database, user: string) {
  const row = await db.prepare('SELECT revision,data_json,last_backup_at FROM pia_preferences WHERE user_id=?').bind(user).first<{ revision: number; data_json: string; last_backup_at: string | null }>();
  return { settings: row ? parse(preferenceSchema, JSON.parse(row.data_json)) : { ...DEFAULT_REMINDERS }, revision: row?.revision || 0, last_backup_at: row?.last_backup_at || null };
}
export async function runReminders(env: Pick<AuthEnv, 'DB'>, now = new Date()) {
  const db = env.DB, user = OWNER_ID;
  const { settings } = await preferences(db, user);
  if (!settings.reminders_enabled && !settings.weekly_digest) return;
  const rows = await db.prepare("SELECT id,data_json FROM records WHERE user_id=? AND kind='task' AND deleted_at IS NULL").bind(user).all<{ id: string; data_json: string }>();
  const notices = reminderNotices(rows.results.map(row => ({ id: row.id, data: JSON.parse(row.data_json) })), settings, now);
  for (let i = 0; i < notices.length; i += 40) await db.batch(notices.slice(i, i + 40).map(n => db.prepare('INSERT OR IGNORE INTO pia_notifications(user_id,id,title,body,task_id,created_at) VALUES(?,?,?,?,?,?)').bind(user, n.id, n.title, n.body, n.task_id || null, now.toISOString())));
}
export async function planningApi(request: Request, env: Pick<AuthEnv, 'DB'>, user: string) {
  const db = env.DB;
  if (request.method === 'GET') {
    const preference = await preferences(db, user);
    const notices = await db.prepare('SELECT id,title,body,task_id,created_at,read_at FROM pia_notifications WHERE user_id=? ORDER BY (read_at IS NULL) DESC,created_at DESC LIMIT 50').bind(user).all();
    const count = await db.prepare('SELECT COUNT(*) AS count FROM pia_notifications WHERE user_id=? AND read_at IS NULL').bind(user).first<{ count: number }>();
    return json({ ...preference, notices: notices.results, unread: count?.count || 0 });
  }
  if (request.method === 'POST') {
    const input = parse(z.object({ settings: preferenceSchema, expected_revision: z.number().int().nonnegative() }).strict(), await readJson(request));
    const result = input.expected_revision === 0
      ? await db.prepare('INSERT OR IGNORE INTO pia_preferences(user_id,data_json,revision) VALUES(?,?,1)').bind(user, JSON.stringify(input.settings)).run()
      : await db.prepare('UPDATE pia_preferences SET data_json=?,revision=revision+1 WHERE user_id=? AND revision=?').bind(JSON.stringify(input.settings), user, input.expected_revision).run();
    if (!result.meta.changes) throw new AppError(409, 'revision_conflict', 'Settings changed in another tab. Reload Settings before saving.');
    await runReminders(env); return json(await preferences(db, user));
  }
  if (request.method === 'PATCH') {
    const { ids } = parse(z.object({ ids: z.array(z.string().max(240)).min(1).max(50) }).strict(), await readJson(request));
    await db.prepare(`UPDATE pia_notifications SET read_at=? WHERE user_id=? AND id IN (${ids.map(() => '?').join(',')})`).bind(new Date().toISOString(), user, ...ids).run();
    return json({ updated: true });
  }
  return new Response(null, { status: 405, headers: { Allow: 'GET, POST, PATCH' } });
}

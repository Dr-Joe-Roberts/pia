import { addDays, weekStart } from './task-planning.ts';
import { taskToday } from './tasks.ts';
export const DEFAULT_REMINDERS = { reminders_enabled: false, reminder_hour: 8, days_before: 1, weekly_digest: false, digest_day: 1, digest_hour: 8 };
export type ReminderPreferences = typeof DEFAULT_REMINDERS;
export type Notice = { id: string; title: string; body: string; task_id?: string | null; created_at?: string; read_at?: string | null };
export function reminderNotices(tasks: { id: string; data: Record<string, any>; deleted_at?: string | null }[], settings: ReminderPreferences, now = new Date()): Notice[] {
  const today = taskToday(now), hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Europe/London' }).format(now));
  const active = tasks.filter(t => !t.deleted_at && t.data.status !== 'completed'), out: Notice[] = [];
  if (settings.reminders_enabled && hour >= settings.reminder_hour) for (const task of active) {
    const d = task.data;
    const push = (type: string, date: string, title: string, body: string) => out.push({ id: `${type}:${task.id}:${date}`, title, body, task_id: task.id });
    if (d.due_date && d.due_date <= addDays(today, settings.days_before)) push('due', d.due_date, 'Task deadline', `${d.name} · due ${d.due_date}`);
    if (d.status === 'waiting' && d.follow_up_date && d.follow_up_date <= today) push('follow', d.follow_up_date, 'Follow up', `${d.name}${d.waiting_for ? ` · ${d.waiting_for}` : ''}`);
    if (d.remind_on && d.remind_on <= today) push('remind', d.remind_on, 'Task reminder', d.name);
  }
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  if (settings.weekly_digest && weekday === settings.digest_day && hour >= settings.digest_hour) {
    const start = weekStart(today), end = addDays(start, 6);
    const planned = active.filter(t => t.data.planned_date >= start && t.data.planned_date <= end);
    const due = active.filter(t => t.data.due_date >= start && t.data.due_date <= end);
    const overdue = active.filter(t => t.data.due_date && t.data.due_date < today);
    out.push({ id: `digest:${start}`, title: 'Your week in PIA', body: `${planned.length} planned tasks (${planned.reduce((sum, t) => sum + (t.data.estimated_minutes || 0), 0)} estimated minutes); ${due.length} deadlines this week; ${overdue.length} overdue tasks.` });
  }
  return out;
}

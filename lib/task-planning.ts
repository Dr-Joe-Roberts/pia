export type ChecklistItem = { id: string; text: string; done: boolean };
export type RepeatRule = { unit: 'day' | 'week' | 'month' | 'year'; interval: number; until?: string | null; anchor?: string; index?: number };
export type PlanningData = { planned_date?: string | null; estimated_minutes?: number | null; module?: string; academic_year?: string; inbox?: boolean; waiting_for?: string; follow_up_date?: string | null; remind_on?: string | null; checklist?: ChecklistItem[]; repeat?: RepeatRule | null };
export function addDays(date: string, days: number) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
export function weekStart(date: string) { const day = new Date(`${date}T12:00:00Z`).getUTCDay(); return addDays(date, -((day + 6) % 7)); }
export function repeatDate(anchor: string, rule: RepeatRule, index: number) {
  if (rule.unit === 'day' || rule.unit === 'week') return addDays(anchor, index * rule.interval * (rule.unit === 'week' ? 7 : 1));
  const d = new Date(`${anchor}T12:00:00Z`), day = d.getUTCDate(); d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + index * rule.interval * (rule.unit === 'year' ? 12 : 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last)); return d.toISOString().slice(0, 10);
}
export function nextRecurringTask(data: Record<string, unknown>): Record<string, unknown> | null {
  const rule = data.repeat as RepeatRule | null;
  const base = (data.due_date || data.planned_date) as string | undefined;
  if (!rule || !base) return null;
  let anchor = rule.anchor || base, index = (rule.index || 0) + 1;
  // Rescheduling an occurrence explicitly starts a new cadence from that date.
  if (repeatDate(anchor, rule, index - 1) !== base) { anchor = base; index = 1; }
  if (index > 10000) return null;
  const next = repeatDate(anchor, rule, index);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next) || next > '9999-12-31' || rule.until && next > rule.until) return null;
  const delta = Math.round((Date.parse(next) - Date.parse(base)) / 86400000);
  const shift = (field: string) => {
    if (typeof data[field] !== 'string' || !data[field]) return null;
    const shifted = addDays(data[field] as string, delta);
    return /^\d{4}-\d{2}-\d{2}$/.test(shifted) ? shifted : null;
  };
  return { ...data, status: 'todo', completed_at: null, inbox: false, waiting_for: '', follow_up_date: null,
    due_date: shift('due_date'), planned_date: shift('planned_date'), remind_on: shift('remind_on'),
    repeat: { ...rule, anchor, index }, checklist: ((data.checklist || []) as ChecklistItem[]).map(item => ({ ...item, done: false })) };
}
export const TEACHING_TEMPLATES = [
  { id: 'practical', name: 'Prepare a practical', estimated_minutes: 120, steps: ['Confirm learning outcomes and protocol', 'Check risk assessment and required approvals', 'Book space and prepare equipment', 'Prepare student instructions and materials', 'Check accessibility and contingency arrangements'] },
  { id: 'lecture', name: 'Prepare a teaching session', estimated_minutes: 90, steps: ['Review learning outcomes', 'Update slides and examples', 'Prepare an activity or knowledge check', 'Upload materials to Moodle'] },
  { id: 'marking', name: 'Mark an assessment', estimated_minutes: 120, steps: ['Review rubric and assessment guidance', 'Mark submissions and write feedback', 'Complete moderation', 'Release marks and feedback through the approved process'] },
  { id: 'module', name: 'Update a module', estimated_minutes: 120, steps: ['Review module outcomes and schedule', 'Update reading and teaching materials', 'Check assessment dates and guidance', 'Review the Moodle page and accessibility'] },
] as const;
export function templateData(template: typeof TEACHING_TEMPLATES[number]) {
  return { name: template.name, category: 'Teaching', estimated_minutes: template.estimated_minutes, checklist: template.steps.map((text, i) => ({ id: `${template.id}-${i}`, text, done: false })) };
}

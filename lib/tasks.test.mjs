import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeData } from './domain.ts';
import { filterTasks, sortTasks, taskInView, taskToday, taskCompletion } from './tasks.ts';
const task = (id, data, deleted_at = null) => ({ id, kind: 'task', data: { name: id, status: 'todo', category: 'General', priority: 'normal', ...data }, updated_at: '2026-11-04T09:00:00Z', deleted_at });
const today = '2026-11-04';

test('a title is sufficient for a standalone task and empty optional values are normalised', () => {
  const result = normalizeData('task', { name: ' Prepare a practical ', project_id: '', due_date: '', category: ' ' });
  assert.equal(result.name, 'Prepare a practical');
  assert.equal(result.project_id, null); assert.equal(result.due_date, null);
  assert.equal(result.status, 'todo'); assert.equal(result.priority, 'normal'); assert.equal(result.category, 'General');
  assert.equal(result.completed_at, null);
  assert.equal(normalizeData('task', { name: 'Plan', category: 'Committee work' }).category, 'Committee work');
});
test('invalid titles, dates, states and project identifiers are rejected', () => {
  for (const data of [{ name: ' ' }, { name: 'Task', due_date: '2026-02-30' }, { name: 'Task', status: 'submitted' }, { name: 'Task', priority: 'urgent' }, { name: 'Task', project_id: '../../other' }]) assert.throws(() => normalizeData('task', data));
});
test('views distinguish undated, overdue, today, future, waiting, completed and archived tasks', () => {
  const tasks = [task('undated', {}), task('late', { due_date: '2026-11-03' }), task('now', { due_date: today }), task('future', { due_date: '2026-11-05' }), task('waiting', { status: 'waiting' }), task('done', { status: 'completed', due_date: '2026-10-01' }), task('archived', { due_date: today }, today)];
  const ids = view => tasks.filter(t => taskInView(t, view, today)).map(t => t.id);
  assert.deepEqual(ids('all'), ['undated', 'late', 'now', 'future', 'waiting']);
  assert.deepEqual(ids('today'), ['now']); assert.deepEqual(ids('overdue'), ['late']);
  assert.deepEqual(ids('upcoming'), ['future']); assert.deepEqual(ids('waiting'), ['waiting']); assert.deepEqual(ids('completed'), ['done']);
  assert.deepEqual(ids('archived'), ['archived']);
});
test('category, text, priority, status and optional-project filters compose', () => {
  const tasks = [task('mark', { category: 'Teaching', notes: 'Poster feedback', priority: 'high' }), task('prepare', { category: 'Teaching', project_id: 'p1' }), task('other', { category: 'Research' })];
  assert.deepEqual(filterTasks(tasks, { view: 'all', today, category: 'Teaching', priority: 'high', query: 'poster feedback', status: 'todo', project: 'unlinked' }).map(t => t.id), ['mark']);
  assert.deepEqual(filterTasks(tasks, { view: 'all', today, project: 'p1' }).map(t => t.id), ['prepare']);
  assert.deepEqual(filterTasks(tasks, { view: 'all', today, query: 'poster absent' }), []);
});
test('sorting is stable, puts completed tasks last and never mutates the source', () => {
  const tasks = [task('undated', { priority: 'high' }), task('normal', { due_date: today }), task('high', { due_date: today, priority: 'high' }), task('done', { status: 'completed', due_date: '2020-01-01' })];
  assert.deepEqual(sortTasks(tasks).map(t => t.id), ['high', 'normal', 'undated', 'done']);
  assert.deepEqual(sortTasks(tasks, 'priority').map(t => t.id), ['high', 'undated', 'normal', 'done']);
  assert.equal(tasks[0].id, 'undated');
});
test('task dates follow the UK calendar across midnight and BST changes', () => {
  assert.equal(taskToday(new Date('2026-07-01T23:30:00Z')), '2026-07-02');
  assert.equal(taskToday(new Date('2026-11-04T23:30:00Z')), '2026-11-04');
  assert.equal(taskToday(new Date('2026-03-29T00:30:00Z')), '2026-03-29');
});
test('completion time changes only on a new completion, and is cleared on reopening', () => {
  const now = '2026-11-04T10:00:00Z', earlier = '2026-11-03T10:00:00Z';
  assert.equal(taskCompletion({ status: 'completed', completed_at: 'invented' }, { status: 'todo' }, now), now);
  assert.equal(taskCompletion({ status: 'completed' }, { status: 'completed', completed_at: earlier }, now), earlier);
  assert.equal(taskCompletion({ status: 'waiting', completed_at: earlier }, { status: 'completed', completed_at: earlier }, now), null);
});


test('completion, archiving, restoration and reopening keep distinct task views', () => {
  const record = task('history', { status: 'completed', notes: 'Retained notes', module: 'Insect Biology' });
  assert.equal(taskInView(record, 'all', today), false);
  assert.equal(taskInView(record, 'completed', today), true);
  const archived = { ...record, deleted_at: today };
  assert.equal(taskInView(archived, 'completed', today), false);
  assert.deepEqual(filterTasks([archived], { view: 'archived', today, query: 'retained', module: 'Insect Biology' }), [archived]);
  const restored = { ...archived, deleted_at: null };
  assert.equal(taskInView(restored, 'completed', today), true);
  assert.equal(taskInView(restored, 'all', today), false);
  const reopened = { ...restored, data: { ...restored.data, status: 'todo' } };
  assert.equal(taskInView(reopened, 'all', today), true);
  assert.equal(taskInView(reopened, 'completed', today), false);
});

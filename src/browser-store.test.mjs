import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from '../demo/fictional-lab.json' with { type: 'json' };
import { createBrowserStore, DEMO_STORAGE_KEY } from './browser-store.ts';
function sandbox() { const values = new Map(); const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; return { store: createBrowserStore(fixture, storage), storage }; }
const write = (data, method = 'POST') => ({ method, body: JSON.stringify(data) });
test('fictional sample, relationships, visitor isolation, persistence and reset', async () => {
  const a = sandbox(), b = sandbox();
  const { records } = await a.store.request('/api/records?kind=project');
  assert.equal(records.length, 12); assert.ok(records.some(r => r.data.connected_students.length));
  const original = records[0];
  await a.store.request(`/api/records/${original.id}`, write({ data: { ...original.data, name: 'Edited locally' }, expected_revision: 1 }, 'PATCH'));
  assert.equal((await createBrowserStore(fixture, a.storage).request(`/api/records/${original.id}`)).record.data.name, 'Edited locally');
  assert.equal((await b.store.request(`/api/records/${original.id}`)).record.data.name, original.data.name);
  await assert.rejects(a.store.request(`/api/records/${original.id}`, write({ data: original.data, expected_revision: 1 }, 'PATCH')), /another tab/);
  a.store.reset(); assert.equal(a.storage.getItem(DEMO_STORAGE_KEY), null);
  assert.equal((await a.store.request(`/api/records/${original.id}`)).record.data.name, original.data.name);
});
test('create, link, archive, restore, export and import preserve records and relationships', async () => {
  const { store } = sandbox();
  const { record: person } = await store.request('/api/records', write({ kind: 'student', data: { name: 'Demo Person' } }));
  const { records: projects } = await store.request('/api/records?kind=project');
  const project = projects[0];
  const linked = await store.request('/api/lab/link', write({ project_id: project.id, student_id: person.id, linked: true }));
  assert.ok(linked.project.data.connected_students.includes(person.id)); assert.ok(linked.student.data.connected_projects.includes(project.id));
  await store.request(`/api/records/${person.id}`, write({ expected_revision: linked.student.revision }, 'DELETE'));
  assert.ok((await store.request('/api/records?kind=student&archived=true')).records.some(r => r.id === person.id));
  assert.ok(!(await store.request(`/api/records/${project.id}`)).record.data.connected_students.includes(person.id));
  await store.request(`/api/records/${person.id}/restore`, write({ expected_revision: 3 }));
  assert.ok((await store.request(`/api/records/${project.id}`)).record.data.connected_students.includes(person.id));
  const backup = await store.request('/api/export');
  const fresh = sandbox();
  const imported = await fresh.store.request('/api/import', write(backup));
  assert.equal(imported.created, 1); assert.equal(imported.skipped, fixture.records.length);
  assert.ok((await fresh.store.request(`/api/records/${project.id}`)).record.data.connected_students.includes(person.id));
});
test('failed imports and storage failures never report a successful save', async () => {
  const { store, storage } = sandbox();
  await assert.rejects(store.request('/api/import', write({ records: [{ id: 'invalid', kind: 'deadline_target', data: { project_id: 'missing' } }] })), /active project/);
  assert.equal(storage.getItem(DEMO_STORAGE_KEY), null);
  const broken = createBrowserStore(fixture, { ...storage, setItem() { throw new Error('Quota'); } });
  await assert.rejects(broken.request('/api/records', write({ kind: 'student', data: { name: 'Demo Person' } })), /could not save/);
  await assert.rejects(store.request('/api/files', { method: 'POST' }), /own PIA deployment/);
});

test('standalone tasks persist, complete, reopen and round-trip in browser backups', async () => {
  const { store, storage } = sandbox();
  const { record: task } = await store.request('/api/records', write({ kind: 'task', data: { name: 'Prepare teaching', category: 'Teaching', due_date: '' } }));
  assert.equal(task.data.project_id, null); assert.equal(task.data.due_date, null);
  const { record: done } = await store.request(`/api/records/${task.id}`, write({ data: { ...task.data, status: 'completed' }, expected_revision: task.revision }, 'PATCH'));
  assert.ok(done.data.completed_at);
  const { record: edited } = await store.request(`/api/records/${task.id}`, write({ data: { ...done.data, notes: 'Saved completion', completed_at: null }, expected_revision: done.revision }, 'PATCH'));
  assert.equal(edited.data.completed_at, done.data.completed_at);
  assert.equal((await createBrowserStore(fixture, storage).request(`/api/records/${task.id}`)).record.data.notes, 'Saved completion');
  const { record: reopened } = await store.request(`/api/records/${task.id}`, write({ data: { ...edited.data, status: 'waiting' }, expected_revision: edited.revision }, 'PATCH'));
  assert.equal(reopened.data.completed_at, null);
  const backup = await store.request('/api/export'), fresh = sandbox();
  await fresh.store.request('/api/import', write(backup));
  assert.equal((await fresh.store.request(`/api/records/${task.id}`)).record.data.category, 'Teaching');
  await assert.rejects(store.request('/api/records', write({ kind: 'task', data: { name: 'Invalid', due_date: '2026-02-30' } })), /calendar date/);
  await assert.rejects(store.request(`/api/records/${task.id}`, write({ data: task.data, expected_revision: 1 }, 'PATCH')), /another tab/);
});


test('archiving and restoring a completed repeating task retains its history without another successor', async () => {
  const { store } = sandbox();
  const { record } = await store.request('/api/records', write({ kind: 'task', data: {
    name: 'Weekly teaching preparation', planned_date: '2026-11-04', repeat: { unit: 'week', interval: 1 },
    notes: 'Keep these teaching notes', checklist: [{ id: 'slides', text: 'Update slides', done: true }],
  } }));
  const { record: completed } = await store.request(`/api/records/${record.id}`, write({ data: { ...record.data, status: 'completed' }, expected_revision: record.revision }, 'PATCH'));
  const { record: archived } = await store.request(`/api/records/${record.id}`, write({ expected_revision: completed.revision }, 'DELETE'));
  assert.equal((await store.request('/api/records?kind=task')).records.some(r => r.id === record.id), false);
  const saved = (await store.request('/api/records?kind=task&archived=true')).records.find(r => r.id === record.id);
  assert.deepEqual(saved.data, completed.data);
  const { record: restored } = await store.request(`/api/records/${record.id}/restore`, write({ expected_revision: archived.revision }));
  assert.equal(restored.deleted_at, null);
  assert.equal(restored.data.status, 'completed');
  assert.equal(restored.data.completed_at, completed.data.completed_at);
  assert.equal(restored.data.notes, 'Keep these teaching notes');
  assert.equal(restored.data.checklist[0].done, true);
  const occurrences = (await store.request('/api/records?kind=task')).records.filter(r => r.data.name === record.data.name);
  assert.equal(occurrences.length, 2);
  assert.equal(occurrences.filter(r => r.data.status !== 'completed').length, 1);
});

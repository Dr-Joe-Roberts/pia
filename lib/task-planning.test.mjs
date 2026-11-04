import test from 'node:test';
import assert from 'node:assert/strict';
import { nextRecurringTask, repeatDate, weekStart, templateData, TEACHING_TEMPLATES } from './task-planning.ts';
import { taskInView, filterTasks } from './tasks.ts';
import { normalizeData } from './domain.ts';
import { DEFAULT_REMINDERS, reminderNotices } from './reminders.ts';
const task = data => ({ id:'example', updated_at:'2026-11-04T09:00:00Z', data:{ name:'Prepare a lecture', status:'todo', ...data } });
test('planned days and weeks are independent of deadlines, including undated work', () => {
  const t=task({ planned_date:'2026-11-04', due_date:'2026-11-20', estimated_minutes:60 });
  assert.equal(taskInView(t,'my_day','2026-11-04'),true);
  assert.equal(taskInView(t,'today','2026-11-04'),false);
  assert.equal(taskInView(t,'my_week','2026-11-08'),true);
  assert.equal(taskInView(t,'my_week','2026-11-09'),false);
  assert.equal(weekStart('2027-01-03'),'2026-12-28');
  assert.equal(taskInView(task({inbox:true}), 'inbox','2026-11-04'),true);
  assert.equal(taskInView(task({status:'completed',planned_date:'2026-11-04'}),'my_day','2026-11-04'),false);
});
test('teaching and follow-up filters preserve tasks without projects', () => {
  const t=task({module:'Insect Biology',academic_year:'2026/27',status:'waiting',waiting_for:'Fictional colleague',follow_up_date:'2026-11-03'});
  assert.equal(filterTasks([t],{view:'follow_up',today:'2026-11-04',module:'Insect Biology',year:'2026/27',query:'colleague'}).length,1);
  assert.equal(filterTasks([t],{view:'all',today:'2026-11-04',year:'2027/28'}).length,0);
});
test('monthly and leap-year repeat dates retain the original calendar anchor', () => {
  assert.equal(repeatDate('2027-01-31',{unit:'month',interval:1},1),'2027-02-28');
  assert.equal(repeatDate('2027-01-31',{unit:'month',interval:1},2),'2027-03-31');
  assert.equal(repeatDate('2024-02-29',{unit:'year',interval:1},4),'2028-02-29');
  let d={name:'Monthly review',due_date:'2027-01-31',planned_date:'2027-01-28',repeat:{unit:'month',interval:1},checklist:[{id:'step',text:'Review',done:true}],status:'completed',completed_at:'2027-01-31T10:00:00Z'};
  d=nextRecurringTask(d); assert.equal(d.due_date,'2027-02-28');assert.equal(d.planned_date,'2027-02-25');assert.equal(d.checklist[0].done,false);assert.equal(d.completed_at,null);
  assert.equal(nextRecurringTask(d).due_date,'2027-03-31');
});
test('repeat ends, rescheduling and upper date boundary are handled', () => {
  assert.equal(nextRecurringTask({due_date:'2026-11-04',repeat:{unit:'week',interval:1,until:'2026-11-05'}}),null);
  assert.equal(nextRecurringTask({due_date:'2026-12-01',repeat:{unit:'week',interval:1,anchor:'2026-11-04',index:0}}).due_date,'2026-12-08');
  assert.equal(nextRecurringTask({due_date:'9999-12-31',repeat:{unit:'year',interval:1}}),null);
});
test('planning validates dates, estimate limits, repeat rules and checklist IDs', () => {
  for(const data of [{planned_date:'2026-02-30'},{estimated_minutes:-1},{repeat:{unit:'week',interval:1}},{repeat:{unit:'day',interval:0},due_date:'2026-11-04'},{checklist:[{id:'same',text:'A',done:false},{id:'same',text:'B',done:false}]}]) assert.throws(()=>normalizeData('task',{name:'Invalid',...data}));
  for(const template of TEACHING_TEMPLATES) assert.equal(normalizeData('task_template',templateData(template)).category,'Teaching');
});
test('reminders are opt-in, ignore completed work, and respect London daylight saving', () => {
  const tasks=[task({due_date:'2026-07-14',remind_on:'2026-07-13'})];
  assert.equal(reminderNotices(tasks,DEFAULT_REMINDERS,new Date('2026-07-13T07:00:00Z')).length,0);
  const settings={...DEFAULT_REMINDERS,reminders_enabled:true};
  assert.equal(reminderNotices(tasks,settings,new Date('2026-07-13T06:59:00Z')).length,0);
  assert.equal(reminderNotices(tasks,settings,new Date('2026-07-13T07:00:00Z')).length,2);
  assert.equal(reminderNotices([task({status:'completed',due_date:'2026-07-14'})],settings,new Date('2026-07-13T09:00:00Z')).length,0);
  assert.equal(reminderNotices([task({due_date:'2026-11-05'})],settings,new Date('2026-11-04T07:00:00Z')).length,0);
});
test('weekly digest includes planned effort, deadlines and overdue work', () => {
  const notices=reminderNotices([task({planned_date:'2026-11-03',estimated_minutes:60,due_date:'2026-11-06'}),{...task({due_date:'2026-11-01'}),id:'overdue'}],{...DEFAULT_REMINDERS,weekly_digest:true},new Date('2026-11-02T08:00:00Z'));
  assert.equal(notices.length,1);assert.equal(notices[0].id,'digest:2026-11-02');assert.match(notices[0].body,/60 estimated minutes/);assert.match(notices[0].body,/1 overdue/);
});

"use client";

import { recordId } from "../../lib/record-id.ts";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, CheckSquare2, Circle, Clock3, Flag, FolderKanban, LoaderCircle, Plus, Search } from "lucide-react";
import { api, formatDate, recordName, type LabRecord, type LabState } from "./model";
import { filterTasks, sortTasks, taskInView, taskToday, TASK_CATEGORIES, TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_STATUSES, TASK_STATUS_LABELS, TASK_VIEWS, type TaskView } from "../../lib/tasks";
import "./tasks.css";

export default function TaskWorkspace({ state, open, add, refresh, notify }: {
  state: LabState; open: (record: LabRecord) => void; add: () => void;
  refresh: () => Promise<void>; notify: (message: string) => void;
}) {
  const [view, setView] = useState<TaskView>("all");
  const [query, setQuery] = useState(""), [category, setCategory] = useState("");
  const [status, setStatus] = useState(""), [priority, setPriority] = useState("");
  const [project, setProject] = useState(""), [sort, setSort] = useState("due");
  const [today, setToday] = useState(taskToday), [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const pending = useRef(false), actionKeys = useRef(new Map<string, string>());
  useEffect(() => {
    const update = () => setToday(taskToday());
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);
  const active = state.tasks.filter(task => !task.deleted_at);
  const count = (id: TaskView) => active.filter(task => taskInView(task, id, today)).length;
  const categories = [...new Set([...TASK_CATEGORIES, ...active.map(task => task.data.category || "General")])];
  const filtered = sortTasks(filterTasks(active, { view, today, query, category, status, priority, project }), sort);
  const hasFilters = Boolean(query || category || status || priority || project);
  const reset = () => { setQuery(""); setCategory(""); setStatus(""); setPriority(""); setProject(""); };
  const chooseView = (next: TaskView) => { setView(next); setStatus(""); };
  const toggle = async (task: LabRecord) => {
    if (pending.current) return;
    pending.current = true; setBusy(task.id); setError("");
    const next = task.data.status === "completed" ? "todo" : "completed";
    const action = `${task.id}:${task.revision}:${next}`;
    if (!actionKeys.current.has(action)) actionKeys.current.set(action, recordId());
    try {
      await api(`/api/records/${task.id}`, { method: "PATCH", body: JSON.stringify({
        data: { ...task.data, status: next }, expected_revision: task.revision,
        idempotency_key: actionKeys.current.get(action),
      }) });
      await refresh();
      notify(next === "completed" ? `${recordName(task)} completed.` : `${recordName(task)} reopened.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this task.");
      await refresh();
    } finally { pending.current = false; setBusy(""); }
  };
  return <section className="pia-tasks" aria-label="Personal task tracker">
    <div className="lab-content-heading"><div><h2>My tasks</h2><p>Teaching, research, admin and everything else you need to do.</p></div><button className="lab-button lab-primary" onClick={add}><Plus size={16} />New task</button></div>
    <div className="pia-task-summary">
      <button onClick={() => { reset(); chooseView("all"); setStatus("todo"); }}><CheckSquare2 size={19} /><span><strong>{active.filter(task => task.data.status === "todo").length}</strong>To do</span></button>
      <button onClick={() => { reset(); chooseView("today"); }}><CalendarDays size={19} /><span><strong>{count("today")}</strong>Due today</span></button>
      <button className={count("overdue") ? "has-overdue" : ""} onClick={() => { reset(); chooseView("overdue"); }}><Clock3 size={19} /><span><strong>{count("overdue")}</strong>Overdue</span></button>
    </div>
    <div className="pia-task-views" role="group" aria-label="Task views">{TASK_VIEWS.map(item => <button key={item.id} aria-pressed={view === item.id} onClick={() => chooseView(item.id)}>{item.label}<span>{count(item.id)}</span></button>)}</div>
    <div className="pia-task-filters">
      <label className="pia-task-search"><Search size={16} /><input aria-label="Search tasks" placeholder="Search tasks or notes…" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <select aria-label="Filter tasks by category" value={category} onChange={e => setCategory(e.target.value)}><option value="">All categories</option>{categories.map(value => <option key={value}>{value}</option>)}</select>
      <select aria-label="Filter tasks by status" value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{TASK_STATUSES.map(value => <option key={value} value={value}>{TASK_STATUS_LABELS[value]}</option>)}</select>
      <select aria-label="Filter tasks by priority" value={priority} onChange={e => setPriority(e.target.value)}><option value="">All priorities</option>{TASK_PRIORITIES.map(value => <option key={value} value={value}>{TASK_PRIORITY_LABELS[value]}</option>)}</select>
      <select aria-label="Filter tasks by project" value={project} onChange={e => setProject(e.target.value)}><option value="">All projects / standalone</option><option value="unlinked">Standalone tasks</option>{state.projects.map(item => <option value={item.id} key={item.id}>{recordName(item)}</option>)}</select>
    </div>
    <div className="pia-task-list-heading"><span>{filtered.length} {filtered.length === 1 ? "task" : "tasks"}{hasFilters ? " match your filters" : ""}</span><div>{hasFilters && <button className="lab-text-button" onClick={reset}>Clear filters</button>}<select aria-label="Sort tasks" value={sort} onChange={e => setSort(e.target.value)}><option value="due">Due date, then priority</option><option value="priority">Priority, then due date</option><option value="updated">Recently updated</option></select></div></div>
    {error && <div className="lab-alert lab-alert-error" role="alert">{error}</div>}
    {filtered.length ? <ul className="pia-task-list">{filtered.map(task => {
      const d = task.data, done = d.status === "completed";
      const overdue = !done && Boolean(d.due_date && d.due_date < today);
      const linked = state.projects.find(item => item.id === d.project_id);
      return <li key={task.id} className={`pia-task-row ${done ? "is-complete" : ""}`}>
        <button className="pia-task-check" disabled={Boolean(busy)} onClick={() => void toggle(task)} aria-label={`${done ? "Reopen" : "Complete"} task: ${recordName(task)}`} aria-pressed={done}>{busy === task.id ? <LoaderCircle size={21} className="lab-spin" /> : done ? <Check size={21} /> : <Circle size={21} />}</button>
        <button className="pia-task-main" onClick={() => open(task)}><strong>{recordName(task)}</strong><span className="pia-task-meta"><span className="pia-task-category">{d.category || "General"}</span>{d.project_id && <span><FolderKanban size={12} />{linked ? recordName(linked) : "Archived or unavailable project"}</span>}{d.notes && <span className="pia-task-note">{d.notes.replace(/\s+/g, " ").slice(0, 120)}</span>}</span></button>
        <span className={`pia-task-status status-${d.status || "todo"}`}>{TASK_STATUS_LABELS[d.status || "todo"]}</span>
        <span className={`pia-task-priority priority-${d.priority || "normal"}`}><Flag size={12} />{TASK_PRIORITY_LABELS[d.priority || "normal"]}</span>
        <span className={`pia-task-due ${overdue ? "is-overdue" : ""}`}><CalendarDays size={14} />{d.due_date ? `${overdue ? "Overdue · " : ""}${d.due_date === today ? "Today" : formatDate(d.due_date)}` : "No due date"}</span>
      </li>;
    })}</ul> : <div className="lab-empty pia-task-empty"><span className="lab-empty-icon"><CheckSquare2 size={27} /></span><h3>{active.length ? "No tasks in this view" : "A place for everything you need to do"}</h3><p>{active.length ? "Choose another view or clear your filters." : "Add a lecture to prepare, marking to finish, or a personal reminder. You only need a title."}</p>{active.length ? <button className="lab-button" onClick={() => { reset(); chooseView("all"); }}>Show all tasks</button> : <button className="lab-button lab-primary" onClick={add}><Plus size={16} />Add your first task</button>}</div>}
    <p className="pia-task-footnote">Tasks can stand alone or link to a project. Dates use UK time. Completed tasks stay available to reopen.</p>
  </section>;
}

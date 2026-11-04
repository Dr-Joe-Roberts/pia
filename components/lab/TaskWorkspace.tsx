"use client";

import { recordId } from "../../lib/record-id.ts";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, CheckSquare2, Circle, Flag, LoaderCircle, MoreHorizontal, Plus, Search, SlidersHorizontal } from "lucide-react";
import { api, recordName, type LabRecord, type LabState } from "./model";
import { filterTasks, sortTasks, taskInView, taskToday, TASK_CATEGORIES, TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_STATUSES, TASK_STATUS_LABELS, TASK_VIEWS, type TaskView } from "../../lib/tasks";
import "./tasks.css";
import { addDays, weekStart } from "../../lib/task-planning";

export default function TaskWorkspace({ state, open, add, refresh, notify }: {
  state: LabState; open: (record: LabRecord) => void; add: () => void;
  refresh: () => Promise<void>; notify: (message: string) => void;
}) {
  const [view, setView] = useState<TaskView>("all");
  const [query, setQuery] = useState(""), [category, setCategory] = useState("");
  const [status, setStatus] = useState(""), [priority, setPriority] = useState("");
  const [project, setProject] = useState(""), [sort, setSort] = useState("due");
  const [module, setModule] = useState(""), [year, setYear] = useState(""), [planDay, setPlanDay] = useState("");
  const [today, setToday] = useState(taskToday), [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false), [newTitle, setNewTitle] = useState("");
  const workspace = useRef<HTMLElement>(null);
  const captureInput = useRef<HTMLInputElement>(null);
  const captureAttempt = useRef<{ title: string; key: string } | null>(null);
  const pending = useRef(false), actionKeys = useRef(new Map<string, string>());
  useEffect(() => {
    const update = () => setToday(taskToday());
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);
  useEffect(() => { const start = weekStart(today); setPlanDay(day => day && (day < start || day > addDays(start, 6)) ? "" : day); }, [today]);
  const active = state.tasks.filter(task => !task.deleted_at);
  const count = (id: TaskView) => active.filter(task => taskInView(task, id, today)).length;
  const categories = [...new Set([...TASK_CATEGORIES, ...active.map(task => task.data.category || "General")])];
  const matches = sortTasks(filterTasks(active, { view, today, query, category, status, priority, project, module, year }), sort);
  const filtered = matches.filter(task => view !== "my_week" || !planDay || task.data.planned_date === planDay);
  const filterCount = [category, status, priority, project, module, year].filter(Boolean).length;
  const hasFilters = Boolean(query || filterCount);
  const primaryViews: TaskView[] = ["all", "my_day", "my_week", "inbox"];
  const reset = () => { setQuery(""); setCategory(""); setStatus(""); setPriority(""); setProject(""); setModule(""); setYear(""); setPlanDay(""); };
  const chooseView = (next: TaskView) => { setView(next); setStatus(""); setPlanDay(""); };
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
  const plan = async (task: LabRecord, date: string) => {
    if (pending.current) return; pending.current = true; setBusy(task.id); setError("");
    try { await api(`/api/records/${task.id}`, { method: "PATCH", body: JSON.stringify({ data: { ...task.data, planned_date: date || null, inbox: false }, expected_revision: task.revision, idempotency_key: recordId() }) }); await refresh(); notify("Plan updated; the deadline is unchanged."); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not plan this task."); await refresh(); }
    finally { pending.current = false; setBusy(""); requestAnimationFrame(() => { if (document.activeElement === document.body) workspace.current?.querySelector<HTMLButtonElement>('.pia-task-views button[aria-pressed="true"]')?.focus(); }); }
  };
  const capture = async (event: FormEvent) => {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title || pending.current) return;
    pending.current = true; setBusy("capture"); setError("");
    if (captureAttempt.current?.title !== title) captureAttempt.current = { title, key: recordId() };
    try {
      await api("/api/records", { method: "POST", body: JSON.stringify({ kind: "task", data: { name: title, inbox: true }, idempotency_key: captureAttempt.current.key }) });
      await refresh(); setNewTitle(""); captureAttempt.current = null;
      reset(); chooseView("inbox"); notify("Task added to Inbox. Open it whenever you are ready to add details.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not add this task."); }
    finally { pending.current = false; setBusy(""); requestAnimationFrame(() => captureInput.current?.focus()); }
  };
  const minutes = filtered.reduce((sum, task) => sum + (task.data.status === "completed" ? 0 : task.data.estimated_minutes || 0), 0);
  const duration = (value: number) => value >= 60 ? `${Math.floor(value / 60)}h${value % 60 ? ` ${value % 60}m` : ""}` : `${value}m`;
  const dateLabel = (date: string) => date === today ? "today" : date === addDays(today, 1) ? "tomorrow" : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", ...(date.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" as const } : {}), timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  return <section ref={workspace} className="pia-tasks pia-task-list-view" aria-label="Personal task tracker">
    <header className="pia-tasks-heading"><div><h2>My tasks</h2><p>Teaching, research and everything else.</p></div><button className="lab-button" onClick={add}><Plus size={16} />New task with details</button></header>
    <nav className="pia-task-views" aria-label="Task views">{primaryViews.map(id => <button key={id} aria-pressed={view === id} onClick={() => chooseView(id)}>{TASK_VIEWS.find(item => item.id === id)!.label}{id === "inbox" && count(id) > 0 && <span>{count(id)}</span>}</button>)}<select aria-label="More task views" className={primaryViews.includes(view) ? "" : "is-selected"} value={primaryViews.includes(view) ? "" : view} onChange={e => chooseView(e.target.value as TaskView)}><option value="" disabled>More views</option>{TASK_VIEWS.filter(item => !primaryViews.includes(item.id)).map(item => <option key={item.id} value={item.id}>{item.label}{count(item.id) ? ` (${count(item.id)})` : ""}</option>)}</select></nav>
    <form className="pia-task-capture" onSubmit={capture}><Plus size={19} aria-hidden="true" /><input ref={captureInput} aria-label="Quick add task" placeholder="Add a task to your Inbox…" maxLength={240} value={newTitle} disabled={busy === "capture"} onChange={e => setNewTitle(e.target.value)} /><button type="submit" className="lab-button lab-primary" disabled={Boolean(busy) || !newTitle.trim()}>{busy === "capture" ? "Adding…" : "Add task"}</button></form>
    <div className="pia-task-toolbar"><label className="pia-task-search"><Search size={16} /><input aria-label="Search tasks" placeholder="Search tasks…" value={query} onChange={e => setQuery(e.target.value)} /></label><button className="lab-button pia-filter-toggle" aria-expanded={filtersOpen} aria-controls="pia-task-filters" onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={15} />Filters{filterCount ? ` (${filterCount})` : ""}</button>{hasFilters && <button className="lab-text-button" onClick={reset}>Clear filters</button>}<select aria-label="Sort tasks" value={sort} onChange={e => setSort(e.target.value)}><option value="due">Deadline first</option><option value="priority">Priority first</option><option value="updated">Recently updated</option></select></div>
    {filtersOpen && <div id="pia-task-filters" className="pia-task-filters">
      <select aria-label="Filter tasks by category" value={category} onChange={e => setCategory(e.target.value)}><option value="">All categories</option>{categories.map(value => <option key={value}>{value}</option>)}</select>
      <select aria-label="Filter tasks by status" value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{TASK_STATUSES.map(value => <option key={value} value={value}>{TASK_STATUS_LABELS[value]}</option>)}</select>
      <select aria-label="Filter tasks by priority" value={priority} onChange={e => setPriority(e.target.value)}><option value="">All priorities</option>{TASK_PRIORITIES.map(value => <option key={value} value={value}>{TASK_PRIORITY_LABELS[value]}</option>)}</select>
      <select aria-label="Filter tasks by project" value={project} onChange={e => setProject(e.target.value)}><option value="">All projects / standalone</option><option value="unlinked">Standalone tasks</option>{state.projects.map(item => <option value={item.id} key={item.id}>{recordName(item)}</option>)}</select>
      <select aria-label="Filter tasks by module" value={module} onChange={e => setModule(e.target.value)}><option value="">All modules</option>{[...new Set(active.map(t => t.data.module).filter(Boolean))].sort().map(value => <option key={value}>{value}</option>)}</select>
      <select aria-label="Filter tasks by academic year" value={year} onChange={e => setYear(e.target.value)}><option value="">All academic years</option>{[...new Set(active.map(t => t.data.academic_year).filter(Boolean))].sort().map(value => <option key={value}>{value}</option>)}</select>
    </div>}
    {view === "my_week" && <div className="pia-week-strip" aria-label="Weekly plan"><button className="pia-whole-week" aria-pressed={!planDay} onClick={() => setPlanDay("")}>Whole week</button><div>{Array.from({ length: 7 }, (_, i) => addDays(weekStart(today), i)).map(day => { const tasks = matches.filter(t => t.data.planned_date === day); return <button key={day} aria-pressed={planDay === day} onClick={() => setPlanDay(day)}><span>{new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(day + "T12:00:00Z"))}</span><small>{tasks.length ? `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}` : "—"}</small></button>; })}</div></div>}
    <div className="pia-task-list-heading"><span>{filtered.length} {filtered.length === 1 ? "task" : "tasks"}{hasFilters ? " matching filters" : ""}{(view === "my_day" || view === "my_week") && minutes > 0 ? ` · ${duration(minutes)} estimated` : ""}</span>{count("overdue") > 0 && view !== "overdue" && <button className="pia-overdue-link" onClick={() => { reset(); chooseView("overdue"); }}>{count("overdue")} overdue</button>}</div>
    {error && <div className="lab-alert lab-alert-error" role="alert">{error}</div>}
    {filtered.length ? <ul className="pia-task-list">{filtered.map(task => {
      const d = task.data, done = d.status === "completed";
      const overdue = !done && Boolean(d.due_date && d.due_date < today);
      const linked = state.projects.find(item => item.id === d.project_id);
      const context = [d.category && d.category !== "General" ? d.category : "", d.module || (linked ? recordName(linked) : "")].filter(Boolean).join(" · ");
      const contextDetail = d.status === "waiting" ? `Waiting${d.waiting_for ? ` for ${d.waiting_for}` : ""}${d.follow_up_date ? ` · Follow up ${dateLabel(d.follow_up_date)}` : ""}` : d.status === "in_progress" ? "In progress" : "";
      return <li key={task.id} className={`pia-task-row ${done ? "is-complete" : ""}`}>
        <button className="pia-task-check" disabled={Boolean(busy)} onClick={() => void toggle(task)} aria-label={`${done ? "Reopen" : "Complete"} task: ${recordName(task)}`} aria-pressed={done}>{busy === task.id ? <LoaderCircle size={21} className="lab-spin" /> : done ? <Check size={21} /> : <Circle size={21} />}</button>
        <button className="pia-task-main" onClick={() => open(task)}><strong>{recordName(task)}{d.priority === "high" && !done && <Flag className="pia-high-priority" size={13} aria-label="High priority" />}</strong>{(context || contextDetail) && <span className="pia-task-context">{context}{context && contextDetail ? " · " : ""}{contextDetail}</span>}</button>
        <div className="pia-task-timing">{d.due_date && <span className={overdue ? "is-overdue" : ""}>{overdue ? "Overdue · " : "Due "}{dateLabel(d.due_date)}</span>}{d.planned_date && !done && <small>Planned {dateLabel(d.planned_date)}</small>}{d.estimated_minutes && !done && <small>{duration(d.estimated_minutes)} estimated</small>}</div>
        <details className="pia-row-actions" onKeyDown={e => { if (e.key === "Escape") { e.currentTarget.open = false; e.currentTarget.querySelector("summary")?.focus(); } }} onBlur={e => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) e.currentTarget.open = false; }}><summary aria-label={`Actions for ${recordName(task)}`}><MoreHorizontal size={19} /></summary><div className="pia-row-action-menu" onClick={e => { const menu = e.currentTarget.closest("details")!; menu.open = false; menu.querySelector("summary")?.focus(); }}><button onClick={() => open(task)}>Open task details</button>{!done && <><button disabled={Boolean(busy)} onClick={() => void plan(task, today)}>Plan for today</button><button disabled={Boolean(busy)} onClick={() => void plan(task, addDays(today, 1))}>Plan for tomorrow</button><button disabled={Boolean(busy)} onClick={() => void plan(task, addDays(weekStart(today), 7))}>Plan for next Monday</button>{d.planned_date && <button disabled={Boolean(busy)} onClick={() => void plan(task, "")}>Clear planned date</button>}</>}</div></details>
      </li>;
    })}</ul> : <div className="lab-empty pia-task-empty"><span className="lab-empty-icon"><CheckSquare2 size={27} /></span><h3>{active.length ? view === "my_day" ? "Nothing planned for today" : "No tasks in this view" : "What would you like to get done?"}</h3><p>{hasFilters ? "Try clearing your filters or searching for something else." : view === "my_day" ? "Choose a task from All tasks and use its actions to plan it for today." : "Capture a task above, or open All tasks to see your work."}</p>{active.length > 0 && <button className="lab-button" onClick={() => { reset(); chooseView("all"); }}>Show all tasks</button>}</div>}
  </section>;
}

import { weekStart, addDays, type PlanningData } from "./task-planning.ts";
/** Personal tasks can exist independently of a research project. */
export const TASK_STATUSES = ["todo", "in_progress", "waiting", "completed"] as const;
export const TASK_PRIORITIES = ["low", "normal", "high"] as const;
export const TASK_CATEGORIES = ["General", "Teaching", "Research", "Supervision", "Administration", "Personal"] as const;
export const TASK_STATUS_LABELS: Record<string, string> = { todo: "To do", in_progress: "In progress", waiting: "Waiting", completed: "Completed" };
export const TASK_PRIORITY_LABELS: Record<string, string> = { low: "Low", normal: "Normal", high: "High" };
export type TaskView = "my_day" | "my_week" | "inbox" | "follow_up" | "all" | "today" | "upcoming" | "overdue" | "waiting" | "completed";
export const TASK_VIEWS: { id: TaskView; label: string }[] = [
  { id: "my_day", label: "My day" }, { id: "my_week", label: "My week" }, { id: "inbox", label: "Inbox" }, { id: "follow_up", label: "Follow up" }, { id: "all", label: "All tasks" }, { id: "today", label: "Due today" },
  { id: "upcoming", label: "Upcoming" }, { id: "overdue", label: "Overdue" },
  { id: "waiting", label: "Waiting" }, { id: "completed", label: "Completed" },
];
type TaskLike = { id: string; deleted_at?: string | null; updated_at: string; data: PlanningData & {
  name?: string; notes?: string; category?: string; status?: string; priority?: string;
  due_date?: string | null; project_id?: string | null;
} };
export function taskToday(now = new Date(), timezone = "Europe/London") {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return ["year", "month", "day"].map(key => parts.find(part => part.type === key)?.value).join("-");
}
export function taskInView(task: TaskLike, view: TaskView, today: string) {
  if (task.deleted_at) return false;
  const done = task.data.status === "completed", due = task.data.due_date;
  if (view === "all") return true;
  if (view === "completed") return done;
  if (done) return false;
  if (view === "my_day") return task.data.planned_date === today;
  if (view === "my_week") { const start = weekStart(today); return Boolean(task.data.planned_date && task.data.planned_date >= start && task.data.planned_date <= addDays(start, 6)); }
  if (view === "inbox") return Boolean(task.data.inbox);
  if (view === "follow_up") return task.data.status === "waiting" && Boolean(task.data.follow_up_date && task.data.follow_up_date <= today);
  if (view === "waiting") return task.data.status === "waiting";
  if (!due) return false;
  return view === "today" ? due === today : view === "overdue" ? due < today : due > today;
}
export function filterTasks<T extends TaskLike>(tasks: T[], filters: {
  view: TaskView; today: string; query?: string; category?: string; status?: string;
  priority?: string; project?: string; module?: string; year?: string;
}) {
  const words = (filters.query || "").trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return tasks.filter(task => {
    const d = task.data;
    return taskInView(task, filters.view, filters.today)
      && (!filters.category || (d.category || "General") === filters.category)
      && (!filters.status || (d.status || "todo") === filters.status)
      && (!filters.priority || (d.priority || "normal") === filters.priority)
      && (!filters.project || (filters.project === "unlinked" ? !d.project_id : d.project_id === filters.project))
      && (!filters.module || d.module === filters.module)
      && (!filters.year || d.academic_year === filters.year)
      && words.every(word => [d.name, d.notes, d.category, d.module, d.academic_year, d.waiting_for].filter(Boolean).join(" ").toLocaleLowerCase().includes(word));
  });
}
export function sortTasks<T extends TaskLike>(tasks: T[], sort = "due"): T[] {
  const ranks: Record<string, number> = { high: 0, normal: 1, low: 2 };
  const priority = (task: T) => ranks[task.data.priority || "normal"] ?? 1;
  return [...tasks].sort((a, b) => {
    const done = Number(a.data.status === "completed") - Number(b.data.status === "completed");
    if (done) return done;
    if (sort === "updated") return b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id);
    const date = (a.data.due_date || "9999-12-31").localeCompare(b.data.due_date || "9999-12-31");
    return (sort === "priority" ? priority(a) - priority(b) || date : date || priority(a) - priority(b))
      || (a.data.name || "").localeCompare(b.data.name || "") || a.id.localeCompare(b.id);
  });
}
/** Only an actual completion transition changes its timestamp; imports retain history. */
export function taskCompletion(data: Record<string, unknown>, previous: Record<string, unknown> | null, now: string) {
  return data.status === "completed" ? previous?.status === "completed" ? previous.completed_at ?? now : now : null;
}

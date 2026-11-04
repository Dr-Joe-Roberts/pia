import { Check, Circle, RotateCcw } from "lucide-react";
import { Modal } from "./RecordEditor";
import { recordName, type LabRecord, type LabState } from "./model";
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "../../lib/tasks";

export default function TaskArchiveDetails({ task, state, busy, error, close, restore }: {
  task: LabRecord; state: LabState; busy: boolean; error: string;
  close: () => void; restore: () => void;
}) {
  const d = task.data;
  const date = (value?: string | null) => value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Europe/London" }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value)) : "Not set";
  const project = state.projects.find(item => item.id === d.project_id);
  const fields = [
    ["Status", TASK_STATUS_LABELS[d.status || "todo"] || d.status], ["Category", d.category || "General"],
    ["Priority", TASK_PRIORITY_LABELS[d.priority || "normal"] || d.priority], ["Completed", date(d.completed_at)],
    ["Due date", date(d.due_date)], ["Planned date", date(d.planned_date)],
    ["Module", d.module || "Not set"], ["Academic year", d.academic_year || "Not set"],
    ["Project", project ? recordName(project) : d.project_id ? "Archived or unavailable project" : "Standalone task"],
    ["Estimated effort", d.estimated_minutes ? `${d.estimated_minutes} minutes` : "Not set"],
    ["Waiting for", d.waiting_for || "Not set"], ["Follow-up date", date(d.follow_up_date)],
    ["Reminder date", date(d.remind_on)], ["Inbox", d.inbox ? "Yes" : "No"],
    ["Repeat", d.repeat ? `Every ${d.repeat.interval} ${d.repeat.unit}${d.repeat.interval === 1 ? "" : "s"}${d.repeat.until ? ` until ${date(d.repeat.until)}` : ""}` : "Does not repeat"],
    ["Archived", date(task.deleted_at)], ["Created", date(task.created_at)], ["Last updated", date(task.updated_at)],
  ];
  return <Modal title="Archived task" subtitle="Read-only history. Restoring keeps its existing completion status." onClose={close}>
    <div className="lab-dialog-body pia-task-archive-details">
      <h3>{recordName(task)}</h3>
      {error && <div className="lab-alert lab-alert-error" role="alert">{error}</div>}
      <dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <section><h4>Notes</h4><p className="pia-archive-notes">{d.notes || "No notes."}</p></section>
      <section><h4>Checklist</h4>{d.checklist?.length ? <ul className="pia-archive-checklist">{d.checklist.map(item => <li key={item.id}>{item.done ? <Check size={17} aria-label="Completed" /> : <Circle size={17} aria-label="Not completed" />}<span>{item.text}</span></li>)}</ul> : <p>No checklist.</p>}</section>
    </div>
    <footer className="lab-dialog-footer"><button className="lab-button" disabled={busy} onClick={close}>Close</button><button className="lab-button lab-primary" disabled={busy} onClick={restore}><RotateCcw size={16} />{busy ? "Restoring…" : "Restore task"}</button></footer>
  </Modal>;
}

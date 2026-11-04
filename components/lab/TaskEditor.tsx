"use client";

import { recordId } from "../../lib/record-id.ts";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Archive, ArrowLeft, ArrowUpRight, LoaderCircle, Save } from "lucide-react";
import { Modal } from "./RecordEditor";
import { api, ApiError, formatDate, recordName, type LabData, type LabRecord, type LabState } from "./model";
import { TASK_CATEGORIES, TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_STATUSES, TASK_STATUS_LABELS } from "../../lib/tasks";
import "./tasks.css";
import { TEACHING_TEMPLATES, templateData } from "../../lib/task-planning";

export default function TaskEditor({ record, state, onClose, onSaved, onRefresh, onNavigate, history, onBack }: {
  record?: LabRecord; state: LabState; onClose: () => void; onSaved: (record: LabRecord) => void;
  onRefresh: () => Promise<void>; onNavigate: (record: LabRecord, from?: LabRecord) => void;
  history: LabRecord[]; onBack: (index: number) => void;
}) {
  const initial: LabData = record?.data || { name: "", category: "General", status: "todo", priority: "normal", due_date: null, project_id: null, notes: "" };
  const [base, setBase] = useState(record), [draft, setDraft] = useState<LabData>(initial);
  const [snapshot, setSnapshot] = useState(JSON.stringify(initial));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [templateMessage, setTemplateMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const dirty = JSON.stringify(draft) !== snapshot;
  const categories = [...new Set([...TASK_CATEGORIES, ...state.tasks.map(task => task.data.category || "General")])];
  const project = state.projects.find(item => item.id === draft.project_id);
  const update = (field: string, value: unknown) => { setDraft(previous => ({ ...previous, [field]: value })); setError(""); };
  const discard = () => !dirty || window.confirm("Discard your unsaved task changes?");
  const close = () => { if (!busy && discard()) onClose(); };
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const useTemplate = (id: string) => {
    const builtIn = TEACHING_TEMPLATES.find(item => item.id === id);
    const saved = state.templates?.find(item => item.id === id);
    const source = builtIn ? templateData(builtIn) : saved?.data;
    if (source) setDraft(previous => ({ ...previous, ...source, checklist: (source.checklist || []).map(item => ({ ...item, done: false })), inbox: false }));
  };
  const saveTemplate = async () => {
    if (!draft.name?.trim() || busy) return;
    setBusy(true); setError("");
    try {
      await api("/api/records", { method: "POST", body: JSON.stringify({ kind: "task_template", data: { name: draft.name, category: draft.category, module: draft.module, notes: draft.notes, estimated_minutes: draft.estimated_minutes ?? null, checklist: (draft.checklist || []).map(item => ({ ...item, done: false })) }, idempotency_key: `template:${recordId()}` }) });
      await onRefresh(); setTemplateMessage("Template saved. Choose it when creating a new task.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save the template."); }
    finally { setBusy(false); }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      if (!draft.name?.trim()) throw new Error("Enter a task title.");
      const data = { ...draft, name: draft.name.trim(), category: draft.category?.trim() || "General", due_date: draft.due_date || null, project_id: draft.project_id || null };
      const body = base ? { data, expected_revision: base.revision } : { kind: "task", data };
      const payload = JSON.stringify(body);
      if (attempt.current?.payload !== payload) attempt.current = { payload, key: recordId() };
      const result = await api<{ record: LabRecord }>(base ? `/api/records/${base.id}` : "/api/records", {
        method: base ? "PATCH" : "POST", body: JSON.stringify({ ...body, idempotency_key: attempt.current.key }),
      });
      setBase(result.record); setDraft(result.record.data); setSnapshot(JSON.stringify(result.record.data));
      setConflict(false); attempt.current = null; onSaved(result.record); await onRefresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save your task."); setConflict(err instanceof ApiError && err.status === 409 || err instanceof Error && /another tab/.test(err.message)); }
    finally { setBusy(false); }
  };
  const reload = async () => {
    if (!base || busy || !discard()) return;
    setBusy(true);
    try {
      const result = await api<{ record: LabRecord }>(`/api/records/${base.id}`);
      if (result.record.deleted_at) { await onRefresh(); onClose(); return; }
      setBase(result.record); setDraft(result.record.data); setSnapshot(JSON.stringify(result.record.data));
      setConflict(false); setError(""); attempt.current = null; await onRefresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not reload this task."); }
    finally { setBusy(false); }
  };
  const archive = async () => {
    if (!base || busy || !window.confirm(`Archive “${recordName(base)}”? You can restore it from Settings.${dirty ? " Unsaved changes will be discarded." : ""}`)) return;
    setBusy(true); setError("");
    try {
      await api(`/api/records/${base.id}`, { method: "DELETE", body: JSON.stringify({ expected_revision: base.revision, idempotency_key: `archive-task:${base.id}:${base.revision}` }) });
      await onRefresh(); onClose();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not archive this task."); setConflict(err instanceof ApiError && err.status === 409); }
    finally { setBusy(false); }
  };
  return <Modal title={base ? "Edit task" : "New task"} subtitle="Your task, with or without a project." onClose={close}>
    <form onSubmit={save} className="pia-task-form">
      <div className="lab-dialog-body">
        {history.length > 0 && <button type="button" className="lab-text-button pia-task-back" disabled={busy} onClick={() => { if (discard()) onBack(history.length - 1); }}><ArrowLeft size={15} />Back to {recordName(history[history.length - 1])}</button>}
        {error && <div className="lab-alert lab-alert-error" role="alert"><span>{error}</span>{conflict && <button type="button" className="lab-button lab-small" disabled={busy} onClick={() => void reload()}>Load latest version</button>}</div>}
        <fieldset disabled={busy} className="pia-task-fields">
          {!base && <label className="lab-field"><span>Start with a template <small>Optional</small></span><select defaultValue="" onChange={e => { useTemplate(e.target.value); e.target.value = ""; }}><option value="">Choose a teaching template…</option><optgroup label="Teaching">{TEACHING_TEMPLATES.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>{Boolean(state.templates?.length) && <optgroup label="Your templates">{state.templates!.map(item => <option key={item.id} value={item.id}>{item.data.name}</option>)}</optgroup>}</select></label>}
          <label className="pia-checkbox"><input type="checkbox" checked={Boolean(draft.inbox)} onChange={e => update("inbox", e.target.checked)} />Keep in Inbox to organise later</label>
          <label className="lab-field"><span>Task title <b>*</b></span><input autoFocus required maxLength={240} value={draft.name || ""} onChange={e => update("name", e.target.value)} placeholder="e.g. Prepare next week’s practical" /></label>
          <div className="lab-field-grid">
            <label className="lab-field"><span>Category</span><input list="pia-task-categories" maxLength={240} value={draft.category || ""} onChange={e => update("category", e.target.value)} placeholder="General" /><datalist id="pia-task-categories">{categories.map(value => <option key={value} value={value} />)}</datalist><small className="lab-field-hint">Choose a suggestion or type your own.</small></label>
            <label className="lab-field"><span>Status</span><select value={draft.status || "todo"} onChange={e => update("status", e.target.value)}>{TASK_STATUSES.map(value => <option value={value} key={value}>{TASK_STATUS_LABELS[value]}</option>)}</select></label>
          </div>
          <div className="lab-field-grid">
            <label className="lab-field"><span>Due date <small>Optional</small></span><input type="date" value={draft.due_date || ""} onChange={e => update("due_date", e.target.value || null)} />{draft.due_date && <button type="button" className="lab-text-button" onClick={() => update("due_date", null)}>Clear date</button>}</label>
            <label className="lab-field"><span>Priority</span><select value={draft.priority || "normal"} onChange={e => update("priority", e.target.value)}>{TASK_PRIORITIES.map(value => <option key={value} value={value}>{TASK_PRIORITY_LABELS[value]}</option>)}</select></label>
          </div>
          <div className="lab-field-grid">
            <label className="lab-field"><span>Plan to work on <small>Optional</small></span><input type="date" value={draft.planned_date || ""} onChange={e => update("planned_date", e.target.value || null)} /><small className="lab-field-hint">Appears in My day / My week. The due date stays separate.</small></label>
            <label className="lab-field"><span>Estimated effort (minutes)</span><input type="number" min="1" max="10080" step="1" value={draft.estimated_minutes ?? ""} placeholder="e.g. 30" onChange={e => update("estimated_minutes", e.target.value ? Number(e.target.value) : null)} /></label>
          </div>
          <div className="lab-field-grid">
            <label className="lab-field"><span>Module <small>Optional</small></span><input maxLength={240} value={draft.module || ""} placeholder="e.g. Insect Biology" onChange={e => update("module", e.target.value)} /></label>
            <label className="lab-field"><span>Academic year <small>Optional</small></span><input maxLength={240} value={draft.academic_year || ""} placeholder="e.g. 2026/27" onChange={e => update("academic_year", e.target.value)} /></label>
          </div>
          {draft.status === "waiting" && <div className="lab-field-grid">
            <label className="lab-field"><span>Waiting for</span><input maxLength={240} value={draft.waiting_for || ""} placeholder="Person, reply or delivery" onChange={e => update("waiting_for", e.target.value)} /></label>
            <label className="lab-field"><span>Follow-up date</span><input type="date" value={draft.follow_up_date || ""} onChange={e => update("follow_up_date", e.target.value || null)} /></label>
          </div>}
          <div className="lab-field-grid">
            <label className="lab-field"><span>Repeat</span><select value={draft.repeat?.unit || ""} onChange={e => update("repeat", e.target.value ? { unit: e.target.value, interval: 1, until: null } : null)}><option value="">Does not repeat</option><option value="day">Days</option><option value="week">Weeks</option><option value="month">Months</option><option value="year">Years</option></select></label>
            {draft.repeat && <label className="lab-field"><span>Every how many {draft.repeat.unit}s?</span><input type="number" min="1" max="52" value={draft.repeat.interval} onChange={e => update("repeat", { ...draft.repeat!, interval: Number(e.target.value) })} /></label>}
          </div>
          {draft.repeat && <><label className="lab-field"><span>Repeat until <small>Optional</small></span><input type="date" value={draft.repeat.until || ""} onChange={e => update("repeat", { ...draft.repeat!, until: e.target.value || null })} /></label><p className="lab-field-hint">Set a due date or planned date. Completing this task creates one next occurrence and keeps this one in your history. Reopening does not remove the next occurrence. Use templates for irregular term dates.</p></>}
          <label className="lab-field"><span>Remind me on <small>Optional</small></span><input type="date" value={draft.remind_on || ""} onChange={e => update("remind_on", e.target.value || null)} /><small className="lab-field-hint">Enable reminders in Settings. Alerts arrive in PIA at your selected UK hour.</small></label>
          <section className="pia-checklist"><h3>Checklist</h3>{(draft.checklist || []).map((item, index) => <div key={item.id} className="pia-checklist-item"><input type="checkbox" aria-label={`Complete checklist item ${index + 1}`} checked={item.done} onChange={e => update("checklist", draft.checklist!.map(i => i.id === item.id ? { ...i, done: e.target.checked } : i))} /><input aria-label={`Checklist item ${index + 1}`} required maxLength={240} value={item.text} onChange={e => update("checklist", draft.checklist!.map(i => i.id === item.id ? { ...i, text: e.target.value } : i))} /><button type="button" className="lab-text-button" aria-label={`Remove checklist item ${index + 1}`} onClick={() => update("checklist", draft.checklist!.filter(i => i.id !== item.id))}>Remove</button></div>)}<button type="button" className="lab-button lab-small" disabled={(draft.checklist?.length || 0) >= 100} onClick={() => update("checklist", [...(draft.checklist || []), { id: recordId(), text: "", done: false }])}>Add checklist item</button></section>
          <label className="lab-field"><span>Project <small>Optional</small></span><select value={draft.project_id || ""} onChange={e => update("project_id", e.target.value || null)}><option value="">None — standalone task</option>{draft.project_id && !project && <option value={draft.project_id}>Archived or unavailable project — keep or clear</option>}{[...state.projects].sort((a, b) => recordName(a).localeCompare(recordName(b))).map(item => <option key={item.id} value={item.id}>{recordName(item)}</option>)}</select></label>
          {project && <button type="button" className="lab-text-button" onClick={() => { if (discard()) onNavigate(project, base); }}>Open {recordName(project)}<ArrowUpRight size={14} /></button>}
          <label className="lab-field"><span>Notes <small>Optional</small></span><textarea rows={5} maxLength={100000} value={draft.notes || ""} onChange={e => update("notes", e.target.value)} placeholder="Useful context, links, or what you need to finish…" /></label>
        </fieldset>
        {base?.data.status === "completed" && base.data.completed_at && <p className="lab-field-hint">Completed {formatDate(base.data.completed_at.slice(0, 10))}. Change the status to reopen this task.</p>}
      </div>
      {templateMessage && <p role="status" className="lab-field-hint">{templateMessage}</p>}
      <footer className="lab-dialog-footer"><div><button type="button" className="lab-button lab-small" disabled={busy || !draft.name?.trim() || draft.checklist?.some(i => !i.text.trim())} onClick={() => void saveTemplate()}>Save as template</button>{base && <button type="button" className="lab-button lab-quiet lab-danger" disabled={busy} onClick={() => void archive()}><Archive size={16} />Archive</button>}</div><div className="lab-inline-actions"><span className="lab-save-state">{busy ? "Saving…" : dirty ? "Unsaved changes" : base ? "All changes saved" : "New draft"}</span><button type="button" className="lab-button" disabled={busy} onClick={close}>Close</button><button className="lab-button lab-primary" type="submit" disabled={busy || Boolean(base && !dirty)}>{busy ? <LoaderCircle size={16} className="lab-spin" /> : <Save size={16} />}{base ? "Save changes" : "Create task"}</button></div></footer>
    </form>
  </Modal>;
}

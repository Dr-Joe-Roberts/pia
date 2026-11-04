import BackupPanel from "./BackupPanel";
"use client";

import { ReminderSettings } from "./Reminders";
import { useRef, useState } from "react";
import { Archive, ArrowDownToLine, Check, LoaderCircle, Plus, RotateCcw, Save, Upload, X } from "lucide-react";
import { IS_BROWSER_DEMO, api, optionsFor, personStatusLabel, personStatusValue, recordName, type LabRecord, type LabState, type Option } from "./model";

function OptionEditor({ title, description, type, state, refresh }: { title: string; description: string; type: string; state: LabState; refresh: () => Promise<void> }) {
  const existing = state.settings.find(s => s.data.setting_type === type);
  const [editing, setEditing] = useState(false);
  const [base, setBase] = useState(existing);
  const [options, setOptions] = useState<Option[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const start = () => { setBase(existing); setOptions(optionsFor(state, type).map(o => ({ ...o, label: type === "student_lab_statuses" ? personStatusLabel(o.label) : o.label }))); setEditing(true); setMessage(""); };
  const save = async () => {
    setBusy(true); setMessage("");
    try {
      const cleaned = options.map(o => ({ label: type === "student_lab_statuses" ? personStatusValue(o.label) : o.label.trim(), color: o.color || "#148575" }));
      if (cleaned.some(o => !o.label)) throw new Error("Every option needs a name.");
      if (new Set(cleaned.map(o => o.label.toLowerCase())).size !== cleaned.length) throw new Error("Each option needs a unique name.");
      await api(base ? `/api/records/${base.id}` : "/api/records", { method: base ? "PATCH" : "POST", body: JSON.stringify(base ? { data: { ...base.data, options: cleaned }, expected_revision: base.revision } : { kind: "lab_setting", data: { setting_type: type, options: cleaned } }) });
      await refresh(); setEditing(false); setMessage("Options saved.");
    } catch (err) { setMessage(err instanceof Error ? err.message : "Could not save settings."); } finally { setBusy(false); }
  };
  return <section className="lab-panel lab-setting-panel"><div className="lab-panel-heading"><div><h3>{title}</h3><p>{description}</p></div>{!editing && <button className="lab-button lab-small" onClick={start}>Edit options</button>}</div>
    {editing ? <><div className="lab-option-rows">{options.map((option, index) => <div className="lab-option-row" key={index}><input aria-label={`Color for option ${index + 1}`} type="color" value={/^#[0-9a-f]{6}$/i.test(option.color || "") ? option.color : "#148575"} onChange={e => setOptions(previous => previous.map((o, i) => i === index ? { ...o, color: e.target.value } : o))} /><input aria-label={`Option ${index + 1} name`} value={option.label} placeholder="Option name" onChange={e => setOptions(previous => previous.map((o, i) => i === index ? { ...o, label: e.target.value } : o))} /><button className="lab-icon-button" aria-label={`Remove option ${index + 1}`} onClick={() => setOptions(previous => previous.filter((_, i) => i !== index))}><X size={16} /></button></div>)}</div><button className="lab-button lab-quiet lab-small" onClick={() => setOptions(previous => [...previous, { label: "", color: "#148575" }])}><Plus size={15} />Add option</button><p className="lab-field-hint">Removing or renaming an option keeps existing records visible with their original value. Update those records when you are ready.</p><div className="lab-inline-actions"><button className="lab-button lab-small" disabled={busy} onClick={() => { setEditing(false); setMessage(""); }}>Cancel</button><button className="lab-button lab-primary lab-small" disabled={busy} onClick={save}>{busy ? <LoaderCircle size={15} className="lab-spin" /> : <Save size={15} />}Save options</button></div></> : <div className="lab-option-chips">{optionsFor(state, type).map(option => <span key={option.label} className="lab-tag"><span style={{ background: option.color || "#148575" }} />{type === "student_lab_statuses" ? personStatusLabel(option.label) : option.label}</span>)}{optionsFor(state, type).length === 0 && <p className="lab-muted">No options yet. Add your first one above.</p>}</div>}
    {message && <p className={message === "Options saved." ? "lab-success" : "lab-field-error"} role="status">{message}</p>}
  </section>;
}

export default function LabSettings({ state, refresh, notify }: { state: LabState; refresh: () => Promise<void>; notify: (message: string) => void }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [archived, setArchived] = useState<LabRecord[] | null>(null);
  const loadArchived = async () => { setBusy("archive"); setError(""); try { const results = await Promise.all(["project", "student", "deadline", "task", "task_template"].map(kind => api<{ records: LabRecord[] }>(`/api/records?kind=${kind}&archived=true`))); setArchived(results.flatMap(r => r.records)); } catch (err) { setError(err instanceof Error ? err.message : "Could not load archive."); } finally { setBusy(""); } };
  const restore = async (record: LabRecord) => { setBusy(record.id); setError(""); try { await api(`/api/records/${record.id}/restore`, { method: "POST", body: JSON.stringify({ expected_revision: record.revision }) }); setArchived(previous => previous?.filter(r => r.id !== record.id) || []); await refresh(); notify(`${recordName(record)} restored.`); } catch (err) { setError(err instanceof Error ? err.message : "Could not restore."); } finally { setBusy(""); } };
  return <div className="lab-settings-grid"><div><ReminderSettings /><OptionEditor title="Project statuses" description="A workflow that fits your research." type="project_statuses" state={state} refresh={refresh} /><OptionEditor title="Lab membership" description="Keep track of each person's relationship to the group." type="student_lab_statuses" state={state} refresh={refresh} /><OptionEditor title="Degrees & roles" description="Labels for the people in your lab." type="student_degrees" state={state} refresh={refresh} /></div><div>
    <BackupPanel refresh={refresh} notify={notify} />
    <section className="lab-panel lab-setting-panel"><div className="lab-panel-heading"><div><h3><Archive size={18} />Archive</h3><p>Bring back tasks, projects, people, or deadlines.</p></div></div>{archived === null ? <button className="lab-button" disabled={!!busy} onClick={loadArchived}>{busy === "archive" ? <LoaderCircle size={16} className="lab-spin" /> : <Archive size={16} />}View archived records</button> : archived.length ? <div className="lab-archive-list">{archived.map(record => <div className="lab-archive-row" key={record.id}><div><strong>{recordName(record)}</strong><span>{record.kind === "student" ? "Person" : record.kind === "task_template" ? "Task template" : record.kind}</span></div><button className="lab-icon-button lab-bordered" disabled={!!busy} title="Restore" aria-label={`Restore ${recordName(record)}`} onClick={() => restore(record)}><RotateCcw size={16} /></button></div>)}</div> : <p className="lab-muted"><Check size={16} />Nothing in your archive.</p>}</section>
    <section className="lab-panel lab-setting-panel lab-soft-panel"><h3>A shared home for your assistant</h3><p>{IS_BROWSER_DEMO ? "This demo stores edits in your browser. Deploy your own PIA for live assistant connections and private file uploads." : "Connect this workspace to your preferred AI assistant to work with your lab through conversation. Your saved records stay the source of truth."}</p><a className="lab-button" href={IS_BROWSER_DEMO ? "https://github.com/assafshocher/PIA/blob/main/docs/ai-connection.md" : "/connect"}>Set up your assistant</a></section>
    {error && <div className="lab-alert lab-alert-error" role="alert">{error}</div>}
  </div></div>;
}

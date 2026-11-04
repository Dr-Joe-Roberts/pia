import { useEffect, useState } from 'react';
import { api, IS_BROWSER_DEMO, type LabRecord, type LabState } from './model';
import { DEFAULT_REMINDERS, type Notice, type ReminderPreferences } from '../../lib/reminders';
type PlanningResponse = { settings: ReminderPreferences; revision: number; last_backup_at: string | null; notices: Notice[]; unread: number };
export function ReminderSettings() {
  const [settings, setSettings] = useState({ ...DEFAULT_REMINDERS }), [revision, setRevision] = useState(-1), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [desktop, setDesktop] = useState(() => localStorage.getItem('pia-desktop-alerts') === 'true');
  const load = async () => { try { const data = await api<PlanningResponse>('/api/planning'); setSettings(data.settings); setRevision(data.revision); setMessage(''); } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not load reminder settings.'); } };
  useEffect(() => { void load(); }, []);
  const hourOptions = Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>);
  return <section className="lab-panel lab-setting-panel"><h3>Reminders and weekly review</h3><p>Alerts are saved in PIA, ready when you next open it. All times use UK time, including daylight saving.</p><div className="pia-reminder-fields">
    <label className="pia-checkbox"><input type="checkbox" checked={settings.reminders_enabled} onChange={e => setSettings(s => ({ ...s, reminders_enabled: e.target.checked }))} />Enable task and follow-up reminders</label>
    <div className="lab-field-grid"><label className="lab-field"><span>Reminder time</span><select value={settings.reminder_hour} onChange={e => setSettings(s => ({ ...s, reminder_hour: Number(e.target.value) }))}>{hourOptions}</select></label><label className="lab-field"><span>Days before a deadline</span><input type="number" min="0" max="7" value={settings.days_before} onChange={e => setSettings(s => ({ ...s, days_before: Number(e.target.value) }))} /></label></div>
    <label className="pia-checkbox"><input type="checkbox" checked={settings.weekly_digest} onChange={e => setSettings(s => ({ ...s, weekly_digest: e.target.checked }))} />Enable weekly workload digest</label>
    <div className="lab-field-grid"><label className="lab-field"><span>Weekly review day</span><select value={settings.digest_day} onChange={e => setSettings(s => ({ ...s, digest_day: Number(e.target.value) }))}>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, i) => <option key={day} value={i}>{day}</option>)}</select></label><label className="lab-field"><span>Weekly review time</span><select value={settings.digest_hour} onChange={e => setSettings(s => ({ ...s, digest_hour: Number(e.target.value) }))}>{hourOptions}</select></label></div>
    <div className="lab-inline-actions"><button className="lab-button lab-primary" disabled={busy || revision < 0} onClick={async () => { setBusy(true); setMessage(''); try { const data = await api<PlanningResponse>('/api/planning', { method: 'POST', body: JSON.stringify({ settings, expected_revision: revision }) }); setRevision(data.revision); setMessage('Reminder settings saved.'); window.dispatchEvent(new Event('pia-planning')); } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not save reminders.'); } finally { setBusy(false); } }}>Save reminder settings</button><button className="lab-button" disabled={busy} onClick={() => void load()}>Reload settings</button></div>
    <button className="lab-button" onClick={async () => { if (desktop) { localStorage.removeItem('pia-desktop-alerts'); setDesktop(false); return; } if (!('Notification' in window)) { setMessage('This browser does not support desktop notifications. In-app reminders still work.'); return; } try { const permission = await Notification.requestPermission(); if (permission === 'granted') { localStorage.setItem('pia-desktop-alerts', 'true'); setDesktop(true); window.dispatchEvent(new Event('pia-planning')); } else setMessage('Desktop notifications were not permitted. In-app reminders still work.'); } catch { setMessage('Desktop notifications are unavailable here.'); } }}>{desktop ? 'Turn off browser notifications' : 'Enable browser notifications on this device'}</button>
    <p className="lab-field-hint">Browser notifications require this page to remain open. No email or phone push is sent. {IS_BROWSER_DEMO ? 'The demo calculates reminders only while open.' : 'Cloudflare checks the saved schedule hourly, even when PIA is closed.'}</p>
    {message && <p role="status" className="lab-field-hint">{message}</p>}
  </div></section>;
}
export function ReminderInbox({ state, open }: { state: LabState; open: (record: LabRecord) => void }) {
  const [data, setData] = useState<PlanningResponse | null>(null), [expanded, setExpanded] = useState(false), [error, setError] = useState('');
  const load = async () => {
    try {
      const value = await api<PlanningResponse>('/api/planning'); setData(value); setError('');
      if ('Notification' in window && Notification.permission === 'granted' && localStorage.getItem('pia-desktop-alerts') === 'true') {
        const seen = new Set<string>(JSON.parse(localStorage.getItem('pia-seen-alerts') || '[]'));
        const fresh = value.notices.filter(n => !n.read_at && !seen.has(n.id));
        if (fresh.length) {
          try {
            new Notification('PIA reminders', { body: 'Open your private workspace to review your reminders.', tag: 'pia-reminders' });
            for (const notice of fresh) seen.add(notice.id);
            localStorage.setItem('pia-seen-alerts', JSON.stringify([...seen].slice(-500)));
          } catch { /* The in-app inbox remains available. */ }
        }
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load reminders.'); }
  };
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 60000); const listener = () => void load(); window.addEventListener('pia-planning', listener); return () => { clearInterval(timer); window.removeEventListener('pia-planning', listener); }; }, []);
  const markRead = async (ids: string[]) => { if (!ids.length) return; try { await api('/api/planning', { method: 'PATCH', body: JSON.stringify({ ids }) }); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not update reminders.'); } };
  return <section className="pia-reminder-inbox"><button className="lab-button" aria-expanded={expanded} onClick={() => { setExpanded(!expanded); void load(); }}>Reminders {data?.unread ? `(${data.unread})` : ''}</button>{expanded && <div className="pia-notices">{error && <p role="alert">{error}</p>}{data?.notices.length ? <><button className="lab-text-button" onClick={() => void markRead(data.notices.filter(n => !n.read_at).map(n => n.id))}>Mark shown reminders as read</button>{data.notices.map(n => <article key={n.id} className={n.read_at ? 'is-read' : ''}><strong>{n.title}</strong><p>{n.body}</p><button className="lab-text-button" onClick={() => { void markRead([n.id]); const record = state.tasks.find(t => t.id === n.task_id); if (record) open(record); }}>{n.task_id && state.tasks.some(t => t.id === n.task_id) ? 'Open task' : 'Mark as read'}</button></article>)}</> : !error && <p>No reminders yet. Enable reminders in Settings.</p>}</div>}</section>;
}

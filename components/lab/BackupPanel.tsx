import { useEffect, useRef, useState } from 'react';
import { api, IS_BROWSER_DEMO } from './model';
import { createBackupArchive, readBackupArchive, sha256, MAX_MANIFEST_BYTES, type BackupFile } from '../../lib/backup-archive';
type Preview = { add: number; keep: number; archived: number; restore_files: string[]; complete: boolean; links: number };
type Selection = { manifest: any; files: Map<string, Blob>; preview: Preview };
export default function BackupPanel({ refresh, notify }: { refresh: () => Promise<void>; notify: (message: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [last, setLast] = useState<string | null>(null), [selection, setSelection] = useState<Selection | null>(null);
  const [restoreSettings, setRestoreSettings] = useState(false);
  const updateLast = async () => { try { const result = await api<{ last_backup_at: string | null }>('/api/planning'); setLast(result.last_backup_at); } catch { /* The action reports configuration failures if used. */ } };
  useEffect(() => { void updateLast(); }, []);
  const backup = async () => {
    setBusy('Preparing records…'); setError('');
    try {
      const manifest = await api<{ files: BackupFile[]; [key: string]: unknown }>('/api/backups/manifest');
      const files = new Map<string, Blob>();
      for (const [index, file] of manifest.files.entries()) {
        setBusy(`Verifying attachment ${index + 1} of ${manifest.files.length}…`);
        const response = await fetch(`/api/files/${file.id}`); if (!response.ok) throw new Error('An attachment could not be downloaded. No incomplete archive was saved.');
        const blob = await response.blob();
        if (blob.size !== file.size || await sha256(await blob.arrayBuffer()) !== file.sha256) throw new Error('An attachment changed during backup. Please try again.');
        files.set(file.id, blob);
      }
      const archive = createBackupArchive(manifest, files), url = URL.createObjectURL(archive), a = document.createElement('a'); a.href = url; a.download = `pia-complete-backup-${new Date().toISOString().slice(0, 10)}.tar`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      const result = await api<{ prepared_at: string }>('/api/backups/completed', { method: 'POST', body: '{}' }); setLast(result.prepared_at); notify('Complete backup prepared. Check that the archive was saved in Downloads.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Backup could not be prepared.'); }
    finally { setBusy(''); }
  };
  const preview = async (file: File) => {
    setBusy('Checking backup…'); setError(''); setSelection(null); setRestoreSettings(false);
    try {
      let manifest: any, files = new Map<string, Blob>();
      if (file.name.toLowerCase().endsWith('.tar')) ({ manifest, files } = await readBackupArchive(file));
      else { if (file.size > MAX_MANIFEST_BYTES) throw new Error('Choose a JSON backup under 7 MB, or a complete .tar archive.'); manifest = JSON.parse(await file.text()); }
      const result = await api<Preview>('/api/backups/preview', { method: 'POST', body: JSON.stringify(manifest) });
      if (result.complete && (manifest.files || []).some((f: BackupFile) => !files.has(f.id))) throw new Error('Choose the complete .tar archive, which includes the attachment files.');
      setSelection({ manifest, files, preview: result });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not read the backup.'); }
    finally { setBusy(''); }
  };
  const restore = async () => {
    if (!selection) return; setBusy('Restoring…'); setError('');
    try {
      // Revalidate before any writes; existing records and files remain protected during the merge.
      const current = await api<Preview>('/api/backups/preview', { method: 'POST', body: JSON.stringify(selection.manifest) });
      if (selection.preview.complete) for (const [index, id] of current.restore_files.entries()) {
        setBusy(`Restoring attachment ${index + 1} of ${current.restore_files.length}…`);
        const metadata = selection.manifest.files.find((f: BackupFile) => f.id === id);
        const file = selection.files.get(id); if (!file) throw new Error('A required attachment is missing.');
        await api(`/api/backups/file/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-PIA-File': encodeURIComponent(JSON.stringify(metadata)) }, body: file });
      }
      const result = await api<{ created: number; skipped: number }>('/api/import', { method: 'POST', body: JSON.stringify({ records: selection.manifest.records, links: selection.manifest.links, mode: 'merge' }) });
      if (restoreSettings && selection.manifest.reminder_settings) {
        const planning = await api<{ revision: number }>('/api/planning');
        await api('/api/planning', { method: 'POST', body: JSON.stringify({ settings: selection.manifest.reminder_settings, expected_revision: planning.revision }) });
        window.dispatchEvent(new Event('pia-planning'));
      }
      setSelection(null); await refresh(); notify(`Restore complete: ${result.created} records added; ${result.skipped} existing records preserved.`);
    } catch (e) { setError(`${e instanceof Error ? e.message : 'Restore failed.'} Some files or records may already have been added. Existing records were preserved; retrying this merge is safe.`); }
    finally { setBusy(''); }
  };
  return <section className="lab-panel lab-setting-panel"><h3>Backup and recovery</h3><p>Keep tasks, templates, research records and attachment files together in one portable archive.</p><p className="lab-field-hint">Last complete backup prepared: <strong>{last ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' }).format(new Date(last)) : 'None recorded'}</strong>. Confirm that the downloaded file was saved.</p><div className="lab-setting-actions"><button className="lab-button" disabled={Boolean(busy)} onClick={() => void backup()}>Download complete backup</button><button className="lab-button" disabled={Boolean(busy)} onClick={() => input.current?.click()}>Preview a backup to restore</button><input ref={input} className="lab-visually-hidden" type="file" accept=".tar,.json,application/json,application/x-tar" onChange={e => { if (e.target.files?.[0]) void preview(e.target.files[0]); e.target.value = ''; }} /></div>
    <p className="lab-field-hint">Archives support up to 100 MB, 2,000 records and 1,000 attachments (20 MB each). Keep a copy outside the hosting account. Passwords, sign-in sessions, OAuth grants and the audit log are excluded. {IS_BROWSER_DEMO ? 'This demo has no uploaded attachments.' : ''}</p>
    {selection && <div className="pia-restore-preview"><h4>Review before restoring</h4><dl><dt>Records to add</dt><dd>{selection.preview.add} ({selection.preview.archived} archived)</dd><dt>Existing records to preserve</dt><dd>{selection.preview.keep}</dd><dt>Attachments to restore</dt><dd>{selection.preview.complete ? selection.preview.restore_files.length : 'Not included in legacy JSON'}</dd><dt>Relationships to check and merge</dt><dd>{selection.preview.links}</dd></dl><p>No records have been changed. Confirming adds missing records and preserves existing versions. A new deployment is the place to recover a complete historical copy.</p>{!selection.preview.complete && <p className="lab-field-error">This JSON backup does not contain attachment files. {selection.preview.restore_files.length} referenced file(s) are unavailable here.</p>}<>{selection.manifest.reminder_settings && <label className="pia-checkbox"><input type="checkbox" checked={restoreSettings} onChange={e => setRestoreSettings(e.target.checked)} />Also replace reminder settings with this backup’s settings</label>}</><div className="lab-inline-actions"><button className="lab-button" disabled={Boolean(busy)} onClick={() => setSelection(null)}>Cancel</button><button className="lab-button lab-primary" disabled={Boolean(busy)} onClick={() => void restore()}>Confirm restore of missing records</button></div></div>}
    {busy && <p role="status">{busy}</p>}{error && <p role="alert" className="lab-field-error">{error}</p>}
  </section>;
}

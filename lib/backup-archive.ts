/** A portable, uncompressed POSIX tar. No executable entries, links or arbitrary paths. */
export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;
export const MAX_MANIFEST_BYTES = 7 * 1024 * 1024;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export type BackupFile = { id: string; name: string; content_type: string; size: number; sha256?: string; created_at?: string };
const encoder = new TextEncoder(), decoder = new TextDecoder();
export async function sha256(data: ArrayBuffer) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(x => x.toString(16).padStart(2, '0')).join(''); }
function header(name: string, size: number) {
  const bytes = new Uint8Array(512);
  const put = (at: number, value: string) => bytes.set(encoder.encode(value), at);
  put(0, name); put(100, '0000600\0'); put(108, '0000000\0'); put(116, '0000000\0'); put(124, size.toString(8).padStart(11, '0') + '\0'); put(136, '00000000000\0'); put(148, '        '); put(156, '0'); put(257, 'ustar\0'); put(263, '00');
  put(148, [...bytes].reduce((sum, b) => sum + b, 0).toString(8).padStart(6, '0') + '\0 '); return bytes;
}
export function createBackupArchive(manifest: unknown, files: Map<string, Blob>) {
  const parts: BlobPart[] = [], json = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
  if (json.size > MAX_MANIFEST_BYTES) throw new Error('The record manifest exceeds the 7 MB backup limit.');
  const add = (name: string, blob: Blob) => { parts.push(header(name, blob.size), blob); if (blob.size % 512) parts.push(new Uint8Array(512 - blob.size % 512)); };
  add('manifest.json', json);
  for (const [id, blob] of files) { if (!/^[a-zA-Z0-9_-]{1,94}$/.test(id) || blob.size > MAX_FILE_BYTES) throw new Error('Invalid attachment in backup.'); add(`files/${id}`, blob); }
  parts.push(new Uint8Array(1024)); const result = new Blob(parts, { type: 'application/x-tar' });
  if (result.size > MAX_BACKUP_BYTES) throw new Error('This backup exceeds the 100 MB archive limit. No incomplete backup was produced.');
  return result;
}
export async function readBackupArchive(blob: Blob) {
  if (blob.size > MAX_BACKUP_BYTES) throw new Error('Choose a backup archive no larger than 100 MB.');
  const entries = new Map<string, Blob>(); let offset = 0, ended = false;
  const string = (bytes: Uint8Array, start: number, end: number) => decoder.decode(bytes.slice(start, end)).split('\0')[0].trim();
  while (offset + 512 <= blob.size) {
    const bytes = new Uint8Array(await blob.slice(offset, offset + 512).arrayBuffer());
    if (bytes.every(n => n === 0)) { const tail = new Uint8Array(await blob.slice(offset).arrayBuffer()); if (tail.length < 1024 || tail.some(n => n !== 0)) throw new Error('Invalid archive ending.'); ended = true; break; }
    const name = string(bytes, 0, 100), rawSize = string(bytes, 124, 136), rawSum = string(bytes, 148, 156);
    const sum = bytes.reduce((n, b, i) => n + (i >= 148 && i < 156 ? 32 : b), 0);
    if (!/^[0-7]+$/.test(rawSize) || !/^[0-7]+$/.test(rawSum) || parseInt(rawSum, 8) !== sum) throw new Error('Archive header checksum failed.');
    if (string(bytes, 257, 263) !== 'ustar' || ![0, 48].includes(bytes[156]) || string(bytes, 345, 500) || !(name === 'manifest.json' || /^files\/[a-zA-Z0-9_-]{1,120}$/.test(name))) throw new Error('This is not a supported PIA archive. Links and arbitrary paths are refused.');
    const size = parseInt(rawSize, 8), limit = name === 'manifest.json' ? MAX_MANIFEST_BYTES : MAX_FILE_BYTES;
    if (size > limit || offset + 512 + size > blob.size || entries.has(name) || entries.size >= 1001) throw new Error('Archive entry is too large, duplicated or truncated.');
    entries.set(name, blob.slice(offset + 512, offset + 512 + size)); offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (!ended || !entries.has('manifest.json')) throw new Error('The archive is incomplete or has no manifest.');
  const manifest = JSON.parse(await entries.get('manifest.json')!.text());
  if (manifest.format !== 'pia-complete-backup' || manifest.version !== 2 || !Array.isArray(manifest.files) || !Array.isArray(manifest.records)) throw new Error('Unsupported backup format.');
  const files = new Map<string, Blob>();
  for (const file of manifest.files as BackupFile[]) {
    const content = entries.get(`files/${file.id}`);
    if (files.has(file.id) || !content || content.size !== file.size || !/^[a-f0-9]{64}$/.test(file.sha256 || '') || await sha256(await content.arrayBuffer()) !== file.sha256) throw new Error('An attachment is missing or has a different checksum. Nothing has been restored.');
    files.set(file.id, content);
  }
  if (entries.size !== files.size + 1) throw new Error('The archive contains unlisted attachments.');
  return { manifest, files };
}

# Data, backups and moving your workspace

Records live in your Cloudflare D1 database, attachments in private R2, and OAuth grants in KV. A source-code clone contains none of those private resources.

## Download a complete backup

Use **Settings → Download complete backup**. This prepares one portable `.tar` archive containing active and archived records, tasks, templates, relationships, workspace settings, reminder preferences and attachment files. It includes uploaded files even when no current record links to them. Checksums verify each attachment; missing or changed attachment contents stop the download rather than silently producing a partial archive. External website links are retained as links, not downloaded.

Confirm that the file appears in Downloads, and retain a private copy outside the hosting account. **Last complete backup prepared** records when the browser prepared a download, not proof that the file was saved or retained. Backups are manual; there is no automatic off-site backup service. Avoid editing the workspace in another tab while preparing an archive.

| Limit or exclusion | Detail |
| --- | --- |
| Archive | Up to 100 MB, including the manifest and archive overhead. |
| Records | Up to 2,000 records; manifest up to 7 MB. |
| Attachments | Up to 1,000 files, no more than 20 MB per file. |
| Excluded | Passwords, session secrets, sign-in sessions, OAuth grants, audit log and reminder inbox history. |
| External links | Website content and remotely hosted files are not copied into the archive. |

Archives are not encrypted by PIA. Treat them as private records. Imported provenance can include the full original source record, so the archive may contain more information than the visible record title. For a larger workspace, use a managed D1/R2 backup process; these limits are deliberate browser-memory bounds.

## Preview and restore

1. Select **Settings → Preview a backup to restore** and choose the complete `.tar` file. The app validates the archive and every attachment checksum before showing the preview.
2. Review records to add, existing records to preserve, archived records and missing attachments. Selecting a file does not write any records.
3. Optionally tick **Also replace reminder settings with this backup's settings**. This can re-enable reminders; it is off by default.
4. Select **Confirm restore of missing records**, or **Cancel**.
5. Check several tasks, archived items, research relationships and attachment downloads after restoration.

Restore merges missing IDs. It preserves existing records and refuses to overwrite a different attachment with the same ID. Repeating the merge is safe. Restoring is not a single transaction across all files and records: an interrupted operation can have added some items, and the same archive can be retried. A conflict or invalid file is reported rather than silently overwritten.

To recover a complete historical version, restore into a **new, empty deployment**. Merging into an existing workspace does not roll back newer edits or unarchive an existing record. Original creation dates and completion data are retained; new revision/audit history starts in the destination. Recurring completed records are imported as history without creating extra occurrences.

### Older JSON backups

The same preview accepts workspace JSON backups under 7 MB and up to 2,000 records. JSON contains metadata and links, not attachment contents; the preview identifies this limitation. Missing files need recovery from the original storage. The existing authenticated `/api/export` endpoint still produces this legacy records export.

Legacy Base44 files need conversion to workspace format first. The repository includes conversion utilities; the browser does not convert them automatically. Only import files you intend to bring into the workspace.

## Move to another deployment

1. Download and retain a complete backup from the original app.
2. Create and verify an empty private deployment with its own credentials and resources.
3. Preview and restore the archive in the new app. Uploaded attachments retain their private IDs and links.
4. Check tasks, templates, archived records, people–project links, targets, settings and several attachment downloads.
5. Reconnect assistants to the new `/mcp` address; revoke grants on the old app when the move is complete.

Retain the original app until you have verified the transfer. Deleting a Worker does not necessarily remove its separately provisioned databases, buckets or namespaces.

## Demo data

The demonstration is entirely fictional, including descriptions, updates and external URLs. Its complete archive contains browser-stored records and settings but no uploaded attachments. Use a separate demo workspace for recordings rather than renaming real records.

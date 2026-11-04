# Personal tasks

The **Tasks** tab tracks your whole workload: teaching, research, supervision, administration and personal work. A project is optional. A lecture to prepare or expenses to submit can exist independently of any research project.

## Use the tracker

1. Open **Tasks → New task**.
2. Enter a title, such as “Prepare the Insect Biology practical”. That is the only required field.
3. Optionally choose or type a category, set a due date and priority, add notes, or link a project.
4. Select **Create task**. Close the editor to return to the list.
5. Select the circle beside a task to complete it. Select the tick to reopen it as **To do**. Open its title to edit any field.

| Field | Behaviour |
| --- | --- |
| Category | Teaching, Research, Supervision, Administration, Personal or General; custom labels are supported. |
| Status | To do, In progress, Waiting or Completed. |
| Priority | Low, Normal or High; Normal is the default. |
| Due date | Optional calendar date. Today and overdue use UK time, including daylight saving. |
| Project | Optional. New links must point to an active project in this workspace. |
| Notes | Optional free text for context and links. |

**All tasks** includes completed tasks. **Today**, **Upcoming** and **Overdue** show unfinished tasks due today, after today and before today respectively. **Waiting** shows unfinished waiting tasks. **Completed** retains finished work for reference or reopening. Undated tasks remain in All tasks and Waiting when applicable. Category, status, priority and project filters combine with search. Sort by due date, priority or most recently updated.

Tasks also appear in global search and, when linked, in the project's **Linked tasks** section. Archiving removes a task from active views; restore it from **Settings → Archive**. JSON exports and imports include tasks. Completed tasks are retained until you choose to archive them.

A due date does not send a notification. This version does not create recurring tasks, calendar events or email reminders.

## Run this version

The task tracker uses the same app and database as PIA. No additional paid service, dependency or database migration is required for this feature.

For a hosted private workspace, follow the [browser setup in the README](../README.md#set-up-in-your-browser). You do not need to install Node.js or Git. It explains how to deploy this fork with the task tracker and HAU branding.

For an optional isolated local demonstration on a computer where installation is permitted, use Node.js 24 and Git. After the customisations are merged into `main`, run:

```sh
git clone https://github.com/Dr-Joe-Roberts/pia.git pia-tasks-demo
cd pia-tasks-demo
npm ci
npm run demo
```

Open **http://127.0.0.1:5174/lab#tasks**. This demonstration uses entirely fictional records in a local D1 database. Use a separate clone of this fork for your real workspace, following the [private local setup](../README.md#developer-setup) or [Cloudflare setup](deployment.md). The browser-only build (`npm run build:demo`) stores edits in that browser and has no live assistant connection.

For an existing private PIA deployment, back up its data, apply the task-tracker changes to its deployment repository, deploy with the normal build/deploy process, and open the Tasks tab. Preserve your existing Cloudflare resource bindings and secrets. If starting from this fork's placeholder configuration, complete the [Cloudflare deployment guide](deployment.md) first. Adding the feature in GitHub alone does not create a running Cloudflare deployment.

## Assistant access

An authorised MCP assistant can read and update the same task records. Example requests:

> Add a Teaching task called “Prepare next week's practical”. Leave the due date unset.

> Show my unfinished teaching tasks due this week.

> Mark “Submit travel expenses” as completed.

The `task` record kind uses `name`, `category`, `status`, `priority`, `due_date`, `project_id`, `notes` and server-managed `completed_at`. Omit `project_id` or set it to `null` for a standalone task. Assistants must read the latest record and revision before updating it; `upsert_record` replaces the submitted data rather than merging individual fields. No due date, project association or completion should be inferred without evidence or instruction.

## Validation

The automated suite covers title-only creation, invalid dates and states, combined filters, UK date boundaries, completion/reopening timestamps, revision conflicts, idempotency, owner isolation, optional project references, archiving/restoration, search and backup round trips. Real Worker integration tests exercise task creation and reads through OAuth/MCP, completion through the browser API, CSRF and rejection of anonymous task access.

Browser checks also covered title-only creation, edits, reload persistence, completion/reopening, archive/restore, global search and project navigation. The 390 px mobile frame had no horizontal page overflow; the task editor kept its controls accessible. All displayed records are fictional.

![Desktop task tracker with fictional records](task-tracker-desktop.jpg)

[Mobile layout screenshot](task-tracker-mobile.jpg)

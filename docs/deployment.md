# Deploy a private PIA

Each deployment is one owner's workspace. The source code is public; your records, password, sessions, attachments and AI grants belong in your own deployment.

## Recommended: browser setup

Follow the [browser setup in the README](../README.md#set-up-in-your-browser). It covers merging this fork's customisations, deploying the correct repository, entering the login settings and checking the installation. No local Node.js, Git or terminal is needed. Cloudflare's [deployment-button guide](https://developers.cloudflare.com/workers/platform/deploy-buttons/) explains automatic resource provisioning and the build form.

You need a GitHub account and a Cloudflare account with Workers, D1, KV and R2 available. Cloudflare may ask you to enable a service or add billing details. Check the current [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [D1](https://developers.cloudflare.com/d1/platform/pricing/) and [R2](https://developers.cloudflare.com/r2/pricing/) pricing; this project does not promise free hosting.

The deploy flow creates a separate repository in your GitHub account. Record which repository and production branch are connected to the Worker. Later changes to `Dr-Joe-Roberts/pia` must be incorporated into that deployment repository before they can reach your app. The button does not grant an assistant permission or populate your real workspace with sample records.

## Configuration values

The browser guide recommends a random owner password of at least 20 characters and a separate random session secret of 64 characters. The enforced minimums are 16 and 32 respectively. Use Worker **Secrets** for both values, never public files or frontend variables.

`APP_ORIGIN` must be the exact HTTPS production origin, without a trailing slash or path. It can be stored as a Worker Secret, which is the recommended browser workflow and also works with the secret prompts generated from `.dev.vars.example`. If you already use a Text variable, it works at runtime too. To preserve that Text value on code deployments, set `vars.APP_ORIGIN` in the deployment repository's `wrangler.jsonc` to the same public URL, or configure `keep_vars: true` to preserve dashboard variables. Never place `OWNER_PASSWORD` or `SESSION_SECRET` in `vars`. See Cloudflare's [environment variable guidance](https://developers.cloudflare.com/workers/configuration/environment-variables/) and [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/).

An unknown initial app address can temporarily be set to `https://setup.invalid`. Requests to the deployed address will remain blocked until this is replaced with the actual origin and the settings are deployed. Leave `DEMO_MODE` unset or `false`; do not use the local HTTP example online.

The build command is `npm run build`; the deployment command is `npm run deploy`, which applies database migrations before deploying. Keep these binding names unchanged:

| Binding | Cloudflare resource | Purpose |
| --- | --- | --- |
| `DB` | D1 database | Records, including tasks, and browser sessions. |
| `BUCKET` | Private R2 bucket | Attachment files. |
| `OAUTH_KV` | KV namespace | Assistant OAuth connections. |

For developers who have Node.js available, this optional command generates a 64-character session secret:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

This prints a new secret for you to place in the password manager and secret configuration. Do not paste it into an issue, commit, screenshot or chat with an untrusted party. `OWNER_PASSWORD` and `SESSION_SECRET` must be different values.

## Command-line deployment

This optional route requires Node.js and Git. After the customisations are merged into `main`, clone this fork and install dependencies. These commands use your own authenticated Cloudflare account:

```sh
git clone https://github.com/Dr-Joe-Roberts/pia.git
cd pia
npm ci
npx wrangler login
npx wrangler d1 create pi-lot
npx wrangler kv namespace create OAUTH_KV
npx wrangler r2 bucket create pi-lot-files
```

If a resource name already exists, choose a different one. Update `wrangler.jsonc` with the returned D1 database ID and KV namespace ID, and your actual database and bucket names. Keep the bindings named `DB`, `OAUTH_KV` and `BUCKET`. The checked-in zero IDs are placeholders, not usable cloud resources.

Configure secrets through the interactive prompts; avoid placing secret values in shell command arguments:

```sh
npx wrangler secret put OWNER_PASSWORD
npx wrangler secret put SESSION_SECRET
npx wrangler secret put APP_ORIGIN
npm test
npm run test:integration
npm run build
npm run check:release
npm run deploy
```

For `APP_ORIGIN`, enter your Worker's exact HTTPS origin. If the initial Worker has not yet been created or its URL is unknown, perform the initial deployment first, then add the secrets and redeploy. An incompletely configured deployment cannot authenticate an owner or access their records. `.dev.vars` is for local development and is not a substitute for deployed secrets.

## Verify your copy

Before adding private records:

1. In a signed-out/private browser window, `/lab` should require sign-in; `/api/records` must not return records.
2. Sign in at `/login`. Add a temporary project, refresh, and confirm it persists. Archive it when finished.
3. Download a backup and confirm that it contains only records from your new workspace.
4. If using AI, follow the [connection guide](ai-connection.md), make a read-only request, then try one clearly authorized change and inspect it in the app.

These steps verify your installation. The repository's local tests and build do not prove that your account's resources, routing, secrets or a particular AI client have been configured correctly.

## Domains and updates

If you add a custom domain, update `APP_ORIGIN` to that exact HTTPS origin and use its `/mcp` address for new AI connections. The application checks its configured origin. Reconnect clients after an origin change; old tokens and callbacks should not be assumed to carry across origins.

Before upgrading, download a backup and retain your resource IDs and secrets. For the browser workflow, apply reviewed changes to the repository and production branch connected to Cloudflare, then check the resulting build and deployment in the dashboard. Keep its build command as `npm run build` and deploy command as `npm run deploy`. Updating the original fork alone does not update a separate deployment copy.

For command-line upgrades, review release notes and migrations, pull the version you want, then run `npm ci`, the tests, the build and `npm run deploy`. With either route, do not replace existing resource IDs with the template placeholders. Schema migrations apply to the configured database, so check the account and configuration before deploying, and repeat the signed-out access check afterwards.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Setup required or app stays locked | All three required values exist; password and session secret meet their lengths; `APP_ORIGIN` exactly matches the HTTPS address being visited. |
| Login works locally but not online | The deployment needs its own secrets. Local `.dev.vars` is not deployed. |
| Storage unavailable or missing tables | `DB` points to the intended D1 database and the migrations completed remotely. |
| Attachments unavailable | `BUCKET` is bound to a private R2 bucket. |
| OAuth cannot finish | `OAUTH_KV` exists, origin and callback agree, and the client supports the documented OAuth flow. |
| A new clone shows no records | Expected: source code does not include anyone's private database. Import your own reviewed backup if needed. |
| Demo command refuses existing configuration | Use a fresh clone for the demo instead of replacing private configuration. |

See [security](../SECURITY.md) for revocation, secret rotation and reporting problems.

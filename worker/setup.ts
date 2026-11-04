import type { AuthEnv } from './auth';
import { escapeHtml, html, page } from './pages';
export function setupIssues(env: Partial<AuthEnv> & { OAUTH_KV?: unknown }) {
  const issues: { name: string; help: string }[] = [];
  if (!env.OWNER_PASSWORD || env.OWNER_PASSWORD.length < 16) issues.push({ name: 'OWNER_PASSWORD', help: 'In Variables and Secrets, add a Secret containing your unique sign-in password. Use at least 20 random characters (minimum accepted: 16).' });
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) issues.push({ name: 'SESSION_SECRET', help: 'Add a separate Secret containing a new random value, preferably 64 characters (minimum accepted: 32). This is not your sign-in password.' });
  let validOrigin = false;
  try { const origin = new URL(env.APP_ORIGIN || ''); validOrigin = origin.protocol === 'https:' && origin.origin === env.APP_ORIGIN && !origin.username && !origin.password && origin.hostname !== 'setup.invalid'; } catch { /* missing or malformed */ }
  if (!validOrigin) issues.push({ name: 'APP_ORIGIN', help: 'Set this to your exact HTTPS Worker address. Remove a trailing slash and paths such as /lab or /login. Replace any temporary setup address.' });
  if (!env.DB) issues.push({ name: 'DB', help: 'Connect the D1 database binding named DB. Use npm run deploy in the Cloudflare deploy-command field so the database tables are created.' });
  if (!env.OAUTH_KV) issues.push({ name: 'OAUTH_KV', help: 'Connect the KV namespace binding named OAUTH_KV.' });
  return issues;
}
export function setupPage(env: Partial<AuthEnv> & { OAUTH_KV?: unknown }, wrongHost = false) {
  const issues = setupIssues(env);
  if (wrongHost && !issues.some(i => i.name === 'APP_ORIGIN')) issues.push({ name: 'APP_ORIGIN', help: 'This address differs from the configured app address. Open your intended Worker address, or correct APP_ORIGIN in Cloudflare. Its saved value is not displayed here.' });
  return html(page('Finish your PIA setup', `<h1>Finish your private setup</h1><p>Your records remain locked while configuration is incomplete. No secret values are shown or collected on this page.</p><p>Open the Cloudflare dashboard, then <strong>Workers &amp; Pages → your Worker → Settings → Variables and Secrets</strong>.</p><ol>${issues.map(i => `<li><h2>${escapeHtml(i.name)}</h2><p>${escapeHtml(i.help)}</p></li>`).join('')}</ol><p>Keep DEMO_MODE false or absent. Select <strong>Deploy</strong> after saving, then reopen the app. If storage tables are missing, check that the deploy command is <code>npm run deploy</code>.</p><p><a class="button" href="https://dash.cloudflare.com/">Open Cloudflare</a></p><p><a href="https://github.com/Dr-Joe-Roberts/pia/blob/main/README.md#set-up-in-your-browser">Read the browser setup guide</a></p>`), undefined, wrongHost ? 403 : 503);
}

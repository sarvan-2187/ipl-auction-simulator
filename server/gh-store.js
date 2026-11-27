// Tiny persistence layer: keeps small JSON files on a separate "data" branch of the GitHub repo,
// so they survive Render deploys. The data branch is not deployed, so saving never restarts the app.
// Needs GITHUB_TOKEN (fine-grained, Contents: read and write on this repo). Without it, everything is a no-op.
const API = process.env.GITHUB_API || 'https://api.github.com';
const REPO = process.env.GITHUB_REPO || 'sarvan-2187/ipl-auction-simulator';
const BRANCH = process.env.GITHUB_DATA_BRANCH || 'data';

export const enabled = () => !!process.env.GITHUB_TOKEN;

async function gh(path, opts = {}) {
  const r = await fetch(`${API}/repos/${REPO}${path}`, {
    ...opts,
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'dugout-store', 'content-type': 'application/json', ...(opts.headers || {}) },
    signal: AbortSignal.timeout(20000),
  });
  return r;
}

export async function getJSON(file) {
  if (!enabled()) return null;
  const r = await gh(`/contents/${file}?ref=${BRANCH}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  const j = await r.json();
  return JSON.parse(Buffer.from(j.content, 'base64').toString('utf8'));
}

async function ensureBranch() {
  if ((await gh(`/branches/${BRANCH}`)).ok) return;
  const repo = await (await gh('')).json();
  const head = await (await gh(`/git/ref/heads/${repo.default_branch}`)).json();
  const r = await gh('/git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: head.object.sha }) });
  if (!r.ok && r.status !== 422) throw new Error(`Could not create ${BRANCH} branch (${r.status})`);
}

export async function putJSON(file, data, message) {
  if (!enabled()) return false;
  await ensureBranch();
  const cur = await gh(`/contents/${file}?ref=${BRANCH}`);
  const sha = cur.ok ? (await cur.json()).sha : undefined;
  const r = await gh(`/contents/${file}`, { method: 'PUT', body: JSON.stringify({ message, branch: BRANCH, sha, content: Buffer.from(JSON.stringify(data, null, 1)).toString('base64') }) });
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  return true;
}

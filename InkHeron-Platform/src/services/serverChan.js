/**
 * Server酱 (Server Chan) WeChat push notifications.
 *
 * The teacher's send key is stored server-side in the settings table under
 * key 'serverchan_key'. If unset, all calls are silent no-ops.
 * Never expose the key to the client.
 */
export async function notifyTeacher(db, { studentName, assignmentTitle }) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'serverchan_key'").get();
  if (!row?.value) return;

  const key = row.value.trim();
  if (!key) return;

  const title = `${studentName} submitted work`;
  const desp = `Assignment: ${assignmentTitle}`;

  await fetch(`https://sctapi.ftqq.com/${encodeURIComponent(key)}.send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ title, desp }).toString(),
  });
}

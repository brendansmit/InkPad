import fs from 'node:fs';
import path from 'node:path';

function normalizeDoc(row) {
  return {
    ...row,
    downloadable: Boolean(row.downloadable),
  };
}

function safeLibraryPath(uploadsDir, filename) {
  const base = path.basename(filename);
  if (base !== filename) return null;
  return path.join(uploadsDir, base);
}

function downloadName(title, filename) {
  const ext = path.extname(filename).toLowerCase() || '.html';
  const base = String(title || 'document')
    .replace(/[^a-z0-9 _-]/gi, '')
    .trim()
    .replace(/\s+/g, '-') || 'document';
  return base + ext;
}

export async function registerLibraryRoutes(app, { db, uploadsDir }) {
  fs.mkdirSync(uploadsDir, { recursive: true });

  app.get('/api/library/categories', async () => {
    return db.prepare(`
      SELECT id, label, icon, sort_order
      FROM eap_library_categories
      ORDER BY sort_order ASC, id ASC
    `).all();
  });

  app.get('/api/library/docs', async () => {
    return db.prepare(`
      SELECT id, filename, title, views, uploaded_at, category_id, icon, release_at, file_type, downloadable
      FROM eap_library_docs
      WHERE hidden = 0
      ORDER BY uploaded_at DESC
    `).all().map(normalizeDoc);
  });

  app.get('/api/library/docs/:id/download', async (request, reply) => {
    const row = db.prepare(`
      SELECT filename, title, hidden, release_at, downloadable
      FROM eap_library_docs
      WHERE id = ?
    `).get(request.params.id);

    if (!row || row.hidden) return reply.code(404).send({ error: 'not_found' });

    const today = new Date().toISOString().slice(0, 10);
    if (row.release_at && row.release_at > today) {
      return reply.code(403).send({ error: 'not_available_yet' });
    }

    if (!row.downloadable) return reply.code(403).send({ error: 'download_disabled' });

    const filePath = safeLibraryPath(uploadsDir, row.filename);
    if (!filePath || !fs.existsSync(filePath)) return reply.code(404).send({ error: 'file_not_found' });

    reply.header('Content-Disposition', `attachment; filename="${downloadName(row.title, row.filename)}"`);
    return reply.send(fs.createReadStream(filePath));
  });

  app.post('/api/library/docs/:id/view', async (request) => {
    const { student_name, class_period, duration_seconds } = request.body || {};
    const name = String(student_name || '').trim();
    const seconds = Math.max(0, Number.parseInt(duration_seconds ?? 0, 10) || 0);

    db.prepare('UPDATE eap_library_docs SET views = views + 1 WHERE id = ?').run(request.params.id);

    if (name) {
      db.prepare(`
        INSERT INTO eap_library_view_log (doc_id, student_name, class_period, duration_seconds)
        VALUES (?, ?, ?, ?)
      `).run(request.params.id, name, String(class_period || '').trim(), seconds);
    }

    return { ok: true };
  });
}

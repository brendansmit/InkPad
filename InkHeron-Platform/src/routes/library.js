import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';

const ALLOWED_EXTENSIONS = new Set(['.html', '.pdf']);

function normalizeDoc(row) {
  return {
    ...row,
    downloadable: Boolean(row.downloadable),
  };
}

function boolFlag(value) {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
}

function safeLibraryPath(uploadsDir, filename) {
  const base = path.basename(filename);
  if (base !== filename) return null;
  return path.join(uploadsDir, base);
}

function fileTypeFor(filename) {
  return path.extname(filename).toLowerCase() === '.pdf' ? 'pdf' : 'html';
}

function uniqueUploadName(originalName) {
  const ext = path.extname(originalName).toLowerCase();
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
}

function downloadName(title, filename) {
  const ext = path.extname(filename).toLowerCase() || '.html';
  const base = String(title || 'document')
    .replace(/[^a-z0-9 _-]/gi, '')
    .trim()
    .replace(/\s+/g, '-') || 'document';
  return base + ext;
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanNullableDate(value) {
  const text = cleanText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function cleanIcon(value, fallback = 'file') {
  const text = cleanText(value);
  if (!text) return fallback;
  return text.replace(/[^a-z0-9_-]/gi, '').slice(0, 32) || fallback;
}

async function readMultipartUpload(request, reply, uploadsDir, { requireFile }) {
  const fields = {};
  let storedFile = null;

  for await (const part of request.parts()) {
    if (part.type === 'file') {
      if (storedFile) {
        part.file.resume();
        return { errorReply: reply.code(400).send({ error: 'one_file_only' }) };
      }

      const ext = path.extname(part.filename || '').toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        part.file.resume();
        return { errorReply: reply.code(400).send({ error: 'unsupported_file_type' }) };
      }

      const filename = uniqueUploadName(part.filename);
      const filePath = path.join(uploadsDir, filename);
      try {
        await pipeline(part.file, fs.createWriteStream(filePath));
      } catch (error) {
        fs.rmSync(filePath, { force: true });
        if (error.code === 'FST_REQ_FILE_TOO_LARGE') {
          return { errorReply: reply.code(413).send({ error: 'file_too_large' }) };
        }
        throw error;
      }

      storedFile = {
        filename,
        originalName: part.filename,
        file_type: fileTypeFor(filename),
      };
    } else {
      fields[part.fieldname] = String(part.value ?? '');
    }
  }

  if (requireFile && !storedFile) return { errorReply: reply.code(400).send({ error: 'file_required' }) };
  return { fields, storedFile };
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

  app.get('/api/library/admin/docs',
    { preValidation: [app.requireTeacherSession] },
    async () => {
      return db.prepare(`
        SELECT id, filename, title, hidden, views, uploaded_at, category_id, icon, release_at, file_type, downloadable
        FROM eap_library_docs
        ORDER BY uploaded_at DESC
      `).all().map(normalizeDoc);
    }
  );

  app.post('/api/library/admin/docs',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const parsed = await readMultipartUpload(request, reply, uploadsDir, { requireFile: true });
      if (parsed.errorReply) return parsed.errorReply;

      const { fields, storedFile } = parsed;
      const title = cleanText(fields.title) || storedFile.originalName.replace(/\.(html|pdf)$/i, '');
      const categoryId = cleanText(fields.category_id) ? Number.parseInt(fields.category_id, 10) : null;
      const icon = cleanIcon(fields.icon, storedFile.file_type === 'pdf' ? 'pdf' : 'file');
      const downloadable = boolFlag(fields.downloadable) ? 1 : 0;

      const result = db.prepare(`
        INSERT INTO eap_library_docs (filename, title, category_id, icon, file_type, downloadable)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(storedFile.filename, title, Number.isFinite(categoryId) ? categoryId : null, icon, storedFile.file_type, downloadable);

      const doc = db.prepare(`
        SELECT id, filename, title, hidden, views, uploaded_at, category_id, icon, release_at, file_type, downloadable
        FROM eap_library_docs
        WHERE id = ?
      `).get(result.lastInsertRowid);

      return reply.code(201).send({ doc: normalizeDoc(doc) });
    }
  );

  app.put('/api/library/admin/docs/:id',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const existing = db.prepare('SELECT id FROM eap_library_docs WHERE id = ?').get(request.params.id);
      if (!existing) return reply.code(404).send({ error: 'not_found' });

      const body = request.body || {};
      const title = body.title === undefined ? null : cleanText(body.title);
      if (body.title !== undefined && !title) return reply.code(400).send({ error: 'title_required' });
      const categoryId = body.category_id === undefined || body.category_id === '' ? null : Number.parseInt(body.category_id, 10);
      const categoryProvided = body.category_id !== undefined;
      const icon = body.icon === undefined ? null : cleanIcon(body.icon);
      const releaseAt = body.release_at === undefined ? null : cleanNullableDate(body.release_at);
      const hidden = body.hidden === undefined ? null : (boolFlag(body.hidden) ? 1 : 0);
      const downloadable = body.downloadable === undefined ? null : (boolFlag(body.downloadable) ? 1 : 0);

      db.prepare(`
        UPDATE eap_library_docs
        SET
          title = CASE WHEN ? THEN ? ELSE title END,
          hidden = CASE WHEN ? THEN ? ELSE hidden END,
          category_id = CASE WHEN ? THEN ? ELSE category_id END,
          icon = CASE WHEN ? THEN ? ELSE icon END,
          release_at = CASE WHEN ? THEN ? ELSE release_at END,
          downloadable = CASE WHEN ? THEN ? ELSE downloadable END
        WHERE id = ?
      `).run(
        body.title !== undefined ? 1 : 0, title,
        body.hidden !== undefined ? 1 : 0, hidden ?? 0,
        categoryProvided ? 1 : 0, categoryProvided && Number.isFinite(categoryId) ? categoryId : null,
        body.icon !== undefined ? 1 : 0, icon,
        body.release_at !== undefined ? 1 : 0, releaseAt,
        body.downloadable !== undefined ? 1 : 0, downloadable ?? 0,
        request.params.id
      );

      const doc = db.prepare(`
        SELECT id, filename, title, hidden, views, uploaded_at, category_id, icon, release_at, file_type, downloadable
        FROM eap_library_docs
        WHERE id = ?
      `).get(request.params.id);

      return { doc: normalizeDoc(doc) };
    }
  );

  app.post('/api/library/admin/docs/:id/replace',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const existing = db.prepare('SELECT id, filename FROM eap_library_docs WHERE id = ?').get(request.params.id);
      if (!existing) return reply.code(404).send({ error: 'not_found' });

      const parsed = await readMultipartUpload(request, reply, uploadsDir, { requireFile: true });
      if (parsed.errorReply) return parsed.errorReply;

      const oldPath = safeLibraryPath(uploadsDir, existing.filename);
      const { storedFile } = parsed;
      db.prepare('UPDATE eap_library_docs SET filename = ?, file_type = ? WHERE id = ?')
        .run(storedFile.filename, storedFile.file_type, request.params.id);
      if (oldPath) fs.rmSync(oldPath, { force: true });

      const doc = db.prepare(`
        SELECT id, filename, title, hidden, views, uploaded_at, category_id, icon, release_at, file_type, downloadable
        FROM eap_library_docs
        WHERE id = ?
      `).get(request.params.id);

      return { doc: normalizeDoc(doc) };
    }
  );

  app.delete('/api/library/admin/docs/:id',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const existing = db.prepare('SELECT id, filename FROM eap_library_docs WHERE id = ?').get(request.params.id);
      if (!existing) return reply.code(404).send({ error: 'not_found' });

      db.prepare('DELETE FROM eap_library_docs WHERE id = ?').run(request.params.id);
      const filePath = safeLibraryPath(uploadsDir, existing.filename);
      if (filePath) fs.rmSync(filePath, { force: true });
      return { ok: true };
    }
  );

  app.get('/api/library/admin/view-log',
    { preValidation: [app.requireTeacherSession] },
    async () => {
      return db.prepare(`
        SELECT
          vl.student_name,
          d.title as doc_title,
          SUM(vl.duration_seconds) as duration_seconds,
          COUNT(*) as visit_count,
          MAX(vl.viewed_at) as last_viewed
        FROM eap_library_view_log vl
        LEFT JOIN eap_library_docs d ON d.id = vl.doc_id
        GROUP BY vl.doc_id, vl.student_name
        ORDER BY MAX(vl.viewed_at) DESC
        LIMIT 500
      `).all();
    }
  );

  app.get('/api/library/admin/categories',
    { preValidation: [app.requireTeacherSession] },
    async () => {
      return db.prepare(`
        SELECT id, label, icon, sort_order
        FROM eap_library_categories
        ORDER BY sort_order ASC, id ASC
      `).all();
    }
  );

  app.post('/api/library/admin/categories',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const label = cleanText(request.body?.label);
      const icon = cleanIcon(request.body?.icon, 'folder');
      if (!label) return reply.code(400).send({ error: 'label_required' });

      const max = db.prepare('SELECT MAX(sort_order) as max_order FROM eap_library_categories').get();
      const result = db.prepare('INSERT INTO eap_library_categories (label, icon, sort_order) VALUES (?, ?, ?)')
        .run(label, icon, (max?.max_order ?? 0) + 1);
      const category = db.prepare('SELECT id, label, icon, sort_order FROM eap_library_categories WHERE id = ?')
        .get(result.lastInsertRowid);

      return reply.code(201).send({ category });
    }
  );

  app.put('/api/library/admin/categories/:id',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const existing = db.prepare('SELECT id FROM eap_library_categories WHERE id = ?').get(request.params.id);
      if (!existing) return reply.code(404).send({ error: 'not_found' });

      const label = request.body?.label === undefined ? null : cleanText(request.body.label);
      if (request.body?.label !== undefined && !label) return reply.code(400).send({ error: 'label_required' });
      const icon = request.body?.icon === undefined ? null : cleanIcon(request.body.icon, 'folder');
      const sortOrder = request.body?.sort_order === undefined ? null : Number.parseInt(request.body.sort_order, 10);

      db.prepare(`
        UPDATE eap_library_categories
        SET
          label = CASE WHEN ? THEN ? ELSE label END,
          icon = CASE WHEN ? THEN ? ELSE icon END,
          sort_order = CASE WHEN ? THEN ? ELSE sort_order END
        WHERE id = ?
      `).run(
        request.body?.label !== undefined ? 1 : 0, label,
        request.body?.icon !== undefined ? 1 : 0, icon,
        Number.isFinite(sortOrder) ? 1 : 0, Number.isFinite(sortOrder) ? sortOrder : 0,
        request.params.id
      );

      const category = db.prepare('SELECT id, label, icon, sort_order FROM eap_library_categories WHERE id = ?')
        .get(request.params.id);
      return { category };
    }
  );

  app.delete('/api/library/admin/categories/:id',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      db.exec('BEGIN');
      try {
        db.prepare('UPDATE eap_library_docs SET category_id = NULL WHERE category_id = ?').run(request.params.id);
        const result = db.prepare('DELETE FROM eap_library_categories WHERE id = ?').run(request.params.id);
        db.exec('COMMIT');
        if (result.changes === 0) return reply.code(404).send({ error: 'not_found' });
        return { ok: true };
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
  );
}

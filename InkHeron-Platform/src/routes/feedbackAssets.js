import { extractFeedbackUploadText, loadActiveFeedbackAssets, parseFeedbackAsset, publicFeedbackAsset } from '../feedback/assets.js';

const VALID_KINDS = new Set(['strength_target', 'rubric']);
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

function cleanText(value, limit = 20000) {
  return String(value ?? '').trim().slice(0, limit);
}

function requireKind(kind) {
  const value = cleanText(kind, 40);
  if (!VALID_KINDS.has(value)) {
    const err = new Error('invalid_feedback_asset_kind');
    err.statusCode = 400;
    throw err;
  }
  return value;
}

export async function registerFeedbackAssetRoutes(app, { db }) {
  app.get('/api/feedback-assets',
    { preValidation: [app.requireTeacherSession] },
    async (request) => {
      const kind = cleanText(request.query?.kind, 40);
      return { assets: loadActiveFeedbackAssets(db, kind) };
    }
  );

  app.post('/api/feedback-assets',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const kind = requireKind(request.body?.kind);
      const title = cleanText(request.body?.title, 160);
      if (!title) return reply.code(400).send({ error: 'title_required' });
      const assignmentType = cleanText(request.body?.assignment_type, 120);
      const contentText = cleanText(request.body?.content_text, 60000);
      const parsed = parseFeedbackAsset(kind, contentText);
      const result = db.prepare(`
        INSERT INTO feedback_assets (teacher_id, kind, title, assignment_type, content_text, parsed_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        request.session.user.id,
        kind,
        title,
        assignmentType,
        contentText,
        JSON.stringify(parsed)
      );
      const row = db.prepare(`
        SELECT id, kind, title, assignment_type, content_text, parsed_json, is_archived, created_at, updated_at
        FROM feedback_assets
        WHERE id = ?
      `).get(result.lastInsertRowid);
      return reply.code(201).send({ asset: publicFeedbackAsset(row) });
    }
  );

  app.post('/api/feedback-assets/extract',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const part = await request.file();
      if (!part) return reply.code(400).send({ error: 'file_required' });
      const chunks = [];
      let size = 0;
      try {
        for await (const chunk of part.file) {
          size += chunk.length;
          if (size > MAX_UPLOAD_BYTES) {
            part.file.resume();
            return reply.code(413).send({ error: 'file_too_large' });
          }
          chunks.push(chunk);
        }
      } catch (error) {
        if (error.code === 'FST_REQ_FILE_TOO_LARGE') {
          return reply.code(413).send({ error: 'file_too_large' });
        }
        throw error;
      }
      try {
        const text = await extractFeedbackUploadText({
          filename: part.filename || '',
          mimeType: part.mimetype || '',
          buffer: Buffer.concat(chunks),
        });
        if (!text) return reply.code(422).send({ error: 'no_extractable_text' });
        return { filename: part.filename || '', text };
      } catch (error) {
        return reply.code(error.statusCode || 422).send({ error: error.message || 'extract_failed' });
      }
    }
  );

  app.delete('/api/feedback-assets/:id',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'invalid_id' });
      const result = db.prepare(`
        UPDATE feedback_assets
        SET is_archived = 1, updated_at = datetime('now')
        WHERE id = ?
      `).run(id);
      if (!result.changes) return reply.code(404).send({ error: 'feedback_asset_not_found' });
      return reply.code(204).send();
    }
  );
}

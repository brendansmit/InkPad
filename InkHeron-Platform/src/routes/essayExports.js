import {
  buildEssayDocx,
  buildEssayPdf,
  buildEssayZip,
  loadAssignmentEssaysForExport,
  loadEssayForExport,
  loadSelectedEssaysForExport,
  normalizeExportState,
  safeFilename,
} from '../services/essayExports.js';

function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    const error = new Error(`${field}_must_be_positive_integer`);
    error.statusCode = 400;
    throw error;
  }
  return number;
}

function positiveIntegerList(value, field) {
  const values = String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  if (!values.length || values.length > 500) {
    const error = new Error(`${field}_must_contain_between_1_and_500_ids`);
    error.statusCode = 400;
    throw error;
  }
  return [...new Set(values.map((item) => positiveInteger(item, field)))];
}

function attachment(reply, filename, type, buffer) {
  return reply
    .header('Content-Disposition', `attachment; filename="${safeFilename(filename)}"`)
    .type(type)
    .send(buffer);
}

export async function registerEssayExportRoutes(app, { db }) {
  app.get('/api/native/pads/:padId/export.docx',
    { preValidation: [app.requireTeacherSession] },
    async (request, reply) => {
      const padId = positiveInteger(request.params.padId, 'padId');
      const state = normalizeExportState(request.query?.state);
      const essay = loadEssayForExport(db, padId, state);
      if (!essay) return reply.code(404).send({ error: 'pad_not_found' });
      const buffer = await buildEssayDocx([essay], state);
      return attachment(reply, `${essay.studentName} - ${essay.assignmentTitle} - ${state}.docx`,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer);
    }
  );

  app.get('/api/native/assignments/:assignmentId/export.zip',
    { preValidation: [app.requireTeacherSession] },
    async (request, reply) => {
      const assignmentId = positiveInteger(request.params.assignmentId, 'assignmentId');
      const state = normalizeExportState(request.query?.state);
      const essays = loadAssignmentEssaysForExport(db, assignmentId, state);
      if (!essays.length) return reply.code(404).send({ error: 'essays_not_found' });
      const buffer = await buildEssayZip(essays, state);
      return attachment(reply, `${essays[0].assignmentTitle} - ${state} - DOCX.zip`, 'application/zip', buffer);
    }
  );

  app.get('/api/native/assignments/:assignmentId/export.pdf',
    { preValidation: [app.requireTeacherSession] },
    async (request, reply) => {
      const assignmentId = positiveInteger(request.params.assignmentId, 'assignmentId');
      const state = normalizeExportState(request.query?.state);
      const essays = loadAssignmentEssaysForExport(db, assignmentId, state);
      if (!essays.length) return reply.code(404).send({ error: 'essays_not_found' });
      const buffer = await buildEssayPdf(essays, state);
      return attachment(reply, `${essays[0].assignmentTitle} - ${state} - compiled.pdf`, 'application/pdf', buffer);
    }
  );

  app.get('/api/native/essays/export.zip',
    { preValidation: [app.requireTeacherSession] },
    async (request, reply) => {
      const padIds = positiveIntegerList(request.query?.pad_ids, 'pad_ids');
      const state = normalizeExportState(request.query?.state);
      const essays = loadSelectedEssaysForExport(db, padIds, state);
      if (!essays.length) return reply.code(404).send({ error: 'essays_not_found' });
      const buffer = await buildEssayZip(essays, state);
      return attachment(reply, `${essays[0].assignmentTitle} - selected - ${state} - DOCX.zip`, 'application/zip', buffer);
    }
  );

  app.get('/api/native/essays/export.pdf',
    { preValidation: [app.requireTeacherSession] },
    async (request, reply) => {
      const padIds = positiveIntegerList(request.query?.pad_ids, 'pad_ids');
      const state = normalizeExportState(request.query?.state);
      const essays = loadSelectedEssaysForExport(db, padIds, state);
      if (!essays.length) return reply.code(404).send({ error: 'essays_not_found' });
      const buffer = await buildEssayPdf(essays, state);
      return attachment(reply, `${essays[0].assignmentTitle} - selected - ${state} - compiled.pdf`, 'application/pdf', buffer);
    }
  );
}

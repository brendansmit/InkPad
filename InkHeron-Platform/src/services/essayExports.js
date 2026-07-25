import { ZipArchive } from 'archiver';
import {
  AlignmentType,
  CommentRangeEnd,
  CommentRangeStart,
  CommentReference,
  Document,
  Footer,
  HeadingLevel,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import PDFDocument from 'pdfkit';
import { realStudentsWhere } from '../db/realStudents.js';

const EXPORT_STATES = new Set(['raw', 'reviewed']);
const BODY_FONT = 'Calibri';

export function normalizeExportState(value) {
  const state = String(value ?? 'raw').toLowerCase();
  if (!EXPORT_STATES.has(state)) {
    const error = new Error('invalid_export_state');
    error.statusCode = 400;
    throw error;
  }
  return state;
}

export function safeFilename(value, fallback = 'essay') {
  const cleaned = String(value ?? '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._ -]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  return (cleaned || fallback).slice(0, 120);
}

function parseJson(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

function annotationLabel(row) {
  const metadata = parseJson(row.metadata_json);
  if (row.type === 'literacy_code') {
    const code = metadata.code ? `${metadata.code}: ` : '';
    return `${code}${metadata.label || metadata.category || row.body || 'Literacy mark'}`;
  }
  if (row.type === 'inline_comment') return row.body || 'Inline comment';
  if (row.type === 'highlight') return row.body || 'Highlighted by teacher';
  return row.body || 'General comment';
}

function feedbackForPad(db, padId) {
  return db.prepare(`
    SELECT kind, title, explanation, try_now_prompt
    FROM native_feedback_items
    WHERE native_pad_id = ?
    ORDER BY kind ASC, sort_order ASC, id ASC
  `).all(padId);
}

function annotationsForPad(db, padId) {
  return db.prepare(`
    SELECT id, type, start_offset, end_offset, selected_text, body, metadata_json, resolved, created_at
    FROM native_annotations
    WHERE native_pad_id = ?
    ORDER BY start_offset ASC, end_offset ASC, id ASC
  `).all(padId).map((row) => ({
    ...row,
    label: annotationLabel(row),
    resolved: row.resolved === 1,
  }));
}

function latestSubmitText(db, pad) {
  const revision = db.prepare(`
    SELECT plain_text, word_count, created_at
    FROM native_pad_revisions
    WHERE native_pad_id = ? AND reason = 'submit'
    ORDER BY id DESC
    LIMIT 1
  `).get(pad.id);
  return revision ?? {
    plain_text: pad.plain_text ?? '',
    word_count: Number(pad.word_count ?? 0),
    created_at: pad.submitted_at ?? pad.updated_at,
  };
}

function exportEssay(db, pad, state) {
  const source = state === 'raw' ? latestSubmitText(db, pad) : pad;
  return {
    padId: pad.id,
    assignmentId: pad.assignment_id,
    assignmentTitle: pad.assignment_title,
    className: pad.class_name,
    studentName: pad.student_name,
    studentUsername: pad.student_username,
    text: String(source.plain_text ?? ''),
    wordCount: Number(source.word_count ?? 0),
    submittedAt: source.created_at ?? pad.submitted_at ?? null,
    annotations: state === 'reviewed' ? annotationsForPad(db, pad.id) : [],
    feedback: state === 'reviewed' ? feedbackForPad(db, pad.id) : [],
  };
}

const PAD_SELECT = `
  SELECT np.*,
         s.display_name AS student_name,
         s.username AS student_username,
         a.title AS assignment_title,
         c.name AS class_name
  FROM native_pads np
  JOIN students s ON s.id = np.student_id
  JOIN assignments a ON a.id = np.assignment_id
  JOIN classes c ON c.id = a.class_id
`;

export function loadEssayForExport(db, padId, state) {
  const pad = db.prepare(`${PAD_SELECT}
    WHERE np.id = ? AND ${realStudentsWhere('s')}
  `).get(padId);
  return pad ? exportEssay(db, pad, state) : null;
}

export function loadAssignmentEssaysForExport(db, assignmentId, state) {
  return db.prepare(`${PAD_SELECT}
    WHERE np.assignment_id = ?
      AND ${realStudentsWhere('s')}
      AND length(trim(np.plain_text)) > 0
    ORDER BY s.display_name COLLATE NOCASE ASC, np.id ASC
  `).all(assignmentId).map((pad) => exportEssay(db, pad, state));
}

export function loadSelectedEssaysForExport(db, padIds, state) {
  if (!padIds.length) return [];
  const placeholders = padIds.map(() => '?').join(', ');
  return db.prepare(`${PAD_SELECT}
    WHERE np.id IN (${placeholders})
      AND ${realStudentsWhere('s')}
      AND length(trim(np.plain_text)) > 0
    ORDER BY s.display_name COLLATE NOCASE ASC, np.id ASC
  `).all(...padIds).map((pad) => exportEssay(db, pad, state));
}

function bodyParagraph(text) {
  return new Paragraph({
    spacing: { before: 0, after: 120, line: 264, lineRule: 'auto' },
    children: [new TextRun({ text, font: BODY_FONT, size: 22, color: '000000' })],
  });
}

function metadataParagraph(essay, state) {
  const stateLabel = state === 'raw' ? 'Raw submit snapshot' : 'Reviewed copy';
  return new Paragraph({
    spacing: { before: 0, after: 280, line: 240, lineRule: 'auto' },
    children: [new TextRun({
      text: `${essay.className} | ${essay.wordCount} words | ${stateLabel}`,
      font: BODY_FONT,
      size: 19,
      color: '666666',
    })],
  });
}

function inlineAnnotations(essay, nextCommentId) {
  const text = essay.text.replace(/\r\n?/g, '\n');
  const eligible = essay.annotations.filter((annotation) =>
    annotation.type !== 'general_comment'
    && Number.isInteger(annotation.start_offset)
    && Number.isInteger(annotation.end_offset)
    && annotation.start_offset >= 0
    && annotation.end_offset > annotation.start_offset
    && annotation.end_offset <= text.length
  ).map((annotation) => ({ ...annotation, commentId: nextCommentId() }));

  const comments = eligible.map((annotation) => ({
    id: annotation.commentId,
    author: 'InkHeron review',
    initials: 'IH',
    children: [bodyParagraph(`${annotation.resolved ? '[Resolved] ' : ''}${annotation.label}`)],
  }));

  const paragraphs = [];
  let globalOffset = 0;
  for (const line of text.split('\n')) {
    const lineStart = globalOffset;
    const lineEnd = lineStart + line.length;
    const points = new Set([lineStart, lineEnd]);
    const localAnnotations = eligible.filter((a) => a.start_offset <= lineEnd && a.end_offset >= lineStart);
    for (const annotation of localAnnotations) {
      points.add(Math.max(lineStart, annotation.start_offset));
      points.add(Math.min(lineEnd, annotation.end_offset));
    }
    const ordered = [...points].sort((a, b) => a - b);
    const children = [];
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const start = ordered[index];
      const end = ordered[index + 1];
      for (const annotation of localAnnotations.filter((a) => a.start_offset === start)) {
        children.push(new CommentRangeStart(annotation.commentId));
      }
      if (end > start) {
        const active = localAnnotations.filter((a) => a.start_offset < end && a.end_offset > start);
        children.push(new TextRun({
          text: text.slice(start, end),
          font: BODY_FONT,
          size: 22,
          color: active.some((a) => a.type === 'literacy_code') ? '9B1C1C' : '000000',
          highlight: active.length ? 'yellow' : undefined,
        }));
      }
      for (const annotation of localAnnotations.filter((a) => a.end_offset === end)) {
        children.push(new CommentRangeEnd(annotation.commentId), new CommentReference(annotation.commentId));
      }
    }
    if (!children.length) children.push(new TextRun({ text: line, font: BODY_FONT, size: 22 }));
    paragraphs.push(new Paragraph({ spacing: { before: 0, after: 120, line: 264, lineRule: 'auto' }, children }));
    globalOffset = lineEnd + 1;
  }
  return { paragraphs, comments };
}

function reviewSummaryParagraphs(essay) {
  const general = essay.annotations.filter((annotation) => annotation.type === 'general_comment');
  if (!general.length && !essay.feedback.length) return [];
  const children = [new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun('Review summary')],
  })];
  for (const annotation of general) {
    children.push(bodyParagraph(`General comment: ${annotation.label}`));
  }
  for (const item of essay.feedback) {
    const label = item.kind === 'strength' ? 'Strength' : 'Target';
    const details = [item.explanation, item.try_now_prompt ? `Try now: ${item.try_now_prompt}` : ''].filter(Boolean).join(' ');
    children.push(bodyParagraph(`${label}: ${item.title}${details ? ` - ${details}` : ''}`));
  }
  return children;
}

function docxStyles() {
  return {
    default: {
      document: { run: { font: BODY_FONT, size: 22, color: '000000' }, paragraph: { spacing: { after: 120, line: 264, lineRule: 'auto' } } },
      heading1: { run: { font: BODY_FONT, size: 32, bold: true, color: '2E74B5' }, paragraph: { spacing: { before: 320, after: 160 } } },
      heading2: { run: { font: BODY_FONT, size: 26, bold: true, color: '2E74B5' }, paragraph: { spacing: { before: 240, after: 120 } } },
      title: { run: { font: BODY_FONT, size: 44, bold: true, color: '203748' }, paragraph: { spacing: { before: 0, after: 160 } } },
    },
  };
}

export async function buildEssayDocx(essays, state) {
  let commentId = 1;
  const comments = [];
  const content = [];
  const compiled = essays.length > 1;

  if (compiled) {
    content.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 1600, after: 160 },
        children: [new TextRun({ text: essays[0]?.assignmentTitle || 'Essay export', font: BODY_FONT, size: 44, bold: true, color: '203748' })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [new TextRun({ text: `${state === 'raw' ? 'Raw submissions' : 'Reviewed essays'} | ${essays.length} students`, font: BODY_FONT, size: 26, color: '4D6675' })],
      }),
      new Paragraph({ children: [new PageBreak()] }),
    );
  }

  essays.forEach((essay, index) => {
    if (index > 0) content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 0, after: 120 }, children: [new TextRun(essay.studentName)] }),
      new Paragraph({ spacing: { before: 0, after: 60 }, children: [new TextRun({ text: essay.assignmentTitle, font: BODY_FONT, size: 24, bold: true, color: '203748' })] }),
      metadataParagraph(essay, state),
    );
    if (state === 'reviewed') {
      const rendered = inlineAnnotations(essay, () => commentId++);
      comments.push(...rendered.comments);
      content.push(...rendered.paragraphs, ...reviewSummaryParagraphs(essay));
    } else {
      for (const line of essay.text.replace(/\r\n?/g, '\n').split('\n')) content.push(bodyParagraph(line));
    }
  });

  const document = new Document({
    creator: 'InkHeron',
    title: `${essays[0]?.assignmentTitle || 'Essay export'} - ${state}`,
    subject: state === 'raw' ? 'Raw submit snapshots' : 'Teacher-reviewed essays',
    description: 'Teacher-only export generated by InkHeron.',
    styles: docxStyles(),
    comments: { children: comments },
    sections: [{
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 708, footer: 708 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '666666' })] })] }) },
      children: content,
    }],
  });
  return Packer.toBuffer(document);
}

function collectStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

export async function buildEssayZip(essays, state) {
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const result = collectStream(archive);
  for (const essay of essays) {
    const buffer = await buildEssayDocx([essay], state);
    const filename = `${safeFilename(essay.studentName)} - ${state}.docx`;
    archive.append(buffer, { name: filename });
  }
  await archive.finalize();
  return result;
}

function numberedReviewText(essay) {
  const notes = essay.annotations.filter((annotation) => annotation.type !== 'general_comment');
  const insertions = notes
    .filter((annotation) => Number.isInteger(annotation.end_offset) && annotation.end_offset >= 0 && annotation.end_offset <= essay.text.length)
    .map((annotation, index) => ({ offset: annotation.end_offset, marker: `[${index + 1}]`, annotation }))
    .sort((a, b) => b.offset - a.offset);
  let text = essay.text;
  for (const insertion of insertions) text = `${text.slice(0, insertion.offset)}${insertion.marker}${text.slice(insertion.offset)}`;
  return { text, notes: insertions.sort((a, b) => a.offset - b.offset) };
}

function addPdfEssay(doc, essay, state, first) {
  if (!first) doc.addPage();
  doc.fillColor('#2E74B5').font('Helvetica-Bold').fontSize(16).text(essay.studentName);
  doc.moveDown(0.25).fillColor('#203748').fontSize(12).text(essay.assignmentTitle);
  doc.moveDown(0.25).fillColor('#666666').font('Helvetica').fontSize(9)
    .text(`${essay.className} | ${essay.wordCount} words | ${state === 'raw' ? 'Raw submit snapshot' : 'Reviewed copy'}`);
  doc.moveDown(1).fillColor('#000000').font('Times-Roman').fontSize(11);
  const reviewed = state === 'reviewed' ? numberedReviewText(essay) : { text: essay.text, notes: [] };
  for (const paragraph of reviewed.text.replace(/\r\n?/g, '\n').split('\n')) {
    doc.text(paragraph || ' ', { lineGap: 2 });
    doc.moveDown(0.5);
  }
  if (state !== 'reviewed') return;
  const general = essay.annotations.filter((annotation) => annotation.type === 'general_comment');
  if (!reviewed.notes.length && !general.length && !essay.feedback.length) return;
  doc.moveDown(0.5).fillColor('#2E74B5').font('Helvetica-Bold').fontSize(13).text('Review summary');
  doc.moveDown(0.4).fillColor('#000000').font('Helvetica').fontSize(10);
  for (const note of reviewed.notes) doc.text(`[${reviewed.notes.indexOf(note) + 1}] ${note.annotation.label}`, { paragraphGap: 5 });
  for (const annotation of general) doc.text(`General comment: ${annotation.label}`, { paragraphGap: 5 });
  for (const item of essay.feedback) {
    const label = item.kind === 'strength' ? 'Strength' : 'Target';
    const details = [item.explanation, item.try_now_prompt ? `Try now: ${item.try_now_prompt}` : ''].filter(Boolean).join(' ');
    doc.text(`${label}: ${item.title}${details ? ` - ${details}` : ''}`, { paragraphGap: 5 });
  }
}

export async function buildEssayPdf(essays, state) {
  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 72, right: 72, bottom: 72, left: 72 }, info: {
    Title: `${essays[0]?.assignmentTitle || 'Essay export'} - ${state}`,
    Author: 'InkHeron',
    Subject: state === 'raw' ? 'Raw submit snapshots' : 'Teacher-reviewed essays',
  } });
  const result = collectStream(doc);
  doc.fillColor('#203748').font('Helvetica-Bold').fontSize(24).text(essays[0]?.assignmentTitle || 'Essay export', { align: 'center' });
  doc.moveDown(0.5).fillColor('#4D6675').font('Helvetica').fontSize(13)
    .text(`${state === 'raw' ? 'Raw submissions' : 'Reviewed essays'} | ${essays.length} students`, { align: 'center' });
  essays.forEach((essay) => addPdfEssay(doc, essay, state, false));
  doc.end();
  return result;
}

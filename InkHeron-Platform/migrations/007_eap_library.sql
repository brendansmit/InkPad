CREATE TABLE IF NOT EXISTS eap_library_categories (
  id INTEGER PRIMARY KEY,
  label TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'folder',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS eap_library_docs (
  id INTEGER PRIMARY KEY,
  filename TEXT NOT NULL,
  title TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
  views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  category_id INTEGER,
  icon TEXT NOT NULL DEFAULT 'file',
  release_at TEXT,
  file_type TEXT NOT NULL DEFAULT 'html' CHECK (file_type IN ('html', 'pdf')),
  downloadable INTEGER NOT NULL DEFAULT 0 CHECK (downloadable IN (0, 1)),
  FOREIGN KEY (category_id) REFERENCES eap_library_categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS eap_library_view_log (
  id INTEGER PRIMARY KEY,
  doc_id INTEGER NOT NULL,
  student_name TEXT NOT NULL,
  class_period TEXT NOT NULL DEFAULT '',
  viewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  FOREIGN KEY (doc_id) REFERENCES eap_library_docs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_eap_library_docs_category_id ON eap_library_docs(category_id);
CREATE INDEX IF NOT EXISTS idx_eap_library_view_log_doc_id ON eap_library_view_log(doc_id);

INSERT INTO eap_library_categories (label, icon, sort_order)
SELECT 'Exam Skills', 'target', 1
WHERE NOT EXISTS (SELECT 1 FROM eap_library_categories);

INSERT INTO eap_library_categories (label, icon, sort_order)
SELECT 'Model Texts', 'document', 2
WHERE (SELECT COUNT(*) FROM eap_library_categories) = 1;

INSERT INTO eap_library_categories (label, icon, sort_order)
SELECT 'Language Practice', 'pencil', 3
WHERE (SELECT COUNT(*) FROM eap_library_categories) = 2;

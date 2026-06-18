import io
import xlrd
from xlutils.copy import copy as xl_copy


# Column indices in the template (0-based)
COL_STUDENT_ID = 0
COL_STUDENT_NUM = 1
COL_CHINESE_NAME = 2
COL_ENGLISH_NAME = 3
COL_ADMIN_CLASS = 4
COL_TASK_CLASS = 5
COL_COMPLETION = 6
COL_SCORE = 7
COL_COMMENTS = 8


def fill_xls(template_bytes: bytes, scores: list[dict]) -> bytes:
    """
    template_bytes: raw bytes of the original .xls file
    scores: list of {"student_id": str, "score": float|None, "completion_status": str}
    Returns filled .xls as bytes.
    """
    score_map = {r["student_id"]: r for r in scores}

    rb = xlrd.open_workbook(file_contents=template_bytes, formatting_info=True)
    wb = xl_copy(rb)
    ws = wb.get_sheet(0)
    rs = rb.sheet_by_index(0)

    for row_idx in range(1, rs.nrows):
        sid = str(rs.cell_value(row_idx, COL_STUDENT_ID)).strip()
        # xlrd reads numeric student IDs as floats like "4203777.0"
        if "." in sid:
            sid = sid.split(".")[0]

        if sid in score_map:
            entry = score_map[sid]
            score = entry.get("score")
            status = entry.get("completion_status", "On Time")

            if score is not None:
                ws.write(row_idx, COL_SCORE, score)
            if status:
                ws.write(row_idx, COL_COMPLETION, status)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def parse_xls_roster(file_bytes: bytes) -> list[dict]:
    rb = xlrd.open_workbook(file_contents=file_bytes)
    ws = rb.sheet_by_index(0)

    students = []
    for row_idx in range(1, ws.nrows):
        sid = str(ws.cell_value(row_idx, COL_STUDENT_ID)).strip()
        if not sid:
            continue
        if "." in sid:
            sid = sid.split(".")[0]

        students.append({
            "student_id": sid,
            "chinese_name": str(ws.cell_value(row_idx, COL_CHINESE_NAME)).strip(),
            "english_name": str(ws.cell_value(row_idx, COL_ENGLISH_NAME)).strip(),
            "admin_class": str(ws.cell_value(row_idx, COL_ADMIN_CLASS)).strip(),
            "task_class": str(ws.cell_value(row_idx, COL_TASK_CLASS)).strip(),
        })
    return students

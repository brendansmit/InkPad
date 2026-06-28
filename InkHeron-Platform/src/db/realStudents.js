/**
 * Real-students filter.
 *
 * Demo and ghost accounts are mechanically normal students — they get pads, dashboards and the
 * full writing/submission/mark/green-pen flow — but they must NEVER influence any aggregate,
 * tally, count, average, export, analytic, paste/focus statistic, or difficulty calibration.
 *
 * THE ONE RULE: every query that computes real-student data must use this helper.
 *
 * @param {string} alias - Optional table alias prefix (e.g. 's' for `students s`).
 * @returns {string} A SQL boolean expression `is_demo = 0 AND is_ghost = 0`, optionally prefixed.
 */
export function realStudentsWhere(alias = '') {
  const prefix = alias ? `${alias}.` : '';
  return `${prefix}is_demo = 0 AND ${prefix}is_ghost = 0`;
}

/**
 * Convenience for the start of a WHERE clause.
 */
export function realStudentsClause(alias = '') {
  return `WHERE ${realStudentsWhere(alias)}`;
}

/**
 * Convenience for appending to an existing WHERE clause.
 */
export function andRealStudents(alias = '') {
  return `AND ${realStudentsWhere(alias)}`;
}

function conversionMessages(prompt) {
  return [
    {
      role: 'system',
      content: `You convert a software-build prompt into a structured JSON build plan.
Return ONLY a JSON object with these exact top-level fields:
- projectName (string)
- description (string)
- stack (string or array of strings)
- budgetUsd (number, default 4)
- defaults: { generator, fastGenerator, hardGenerator, reviewer, temperature, concurrency, reviewRounds, retries }
- tasks: array of { id, path, instruction, dependsOn, generator(optional), reviewer(optional), maxOutputTokens }

CRITICAL RULES FOR TASKS:
1. Each task instruction must be COMPLETE and SELF-CONTAINED. The generator sees ONLY the instruction and dependency file contents — it has no access to the original prompt. Every route, schema column, CSS variable, font, colour, auth rule, field name, API call, and behaviour must be written out explicitly in the instruction. Do not say "follow the design system" or "use the provided styles" — paste the actual CSS variable names and values, font names, layout measurements, and component specs directly into the instruction word for word.
2. For every HTML or CSS file: paste the full list of CSS custom properties (--variable: value), the font stack, the exact colour hex codes, the layout structure (sidebar width, grid columns, spacing), and the interactive behaviour (what happens on click, hover, form submit). If the prompt specifies a design system, every detail of it goes into every HTML/CSS task that uses it.
3. For every HTML file that fetches data: name the exact API endpoint, HTTP method, and response shape it must call. Do not say "fetch documents" — say "GET /api/docs returns [{id, title, views, uploaded_at}], render one card per item".
4. Do not split backend logic from its data model. If server.js needs a database, include the exact schema (table name, column names, types, defaults) in the server.js instruction.
5. reviewRounds must be at least 2 so repair passes can run.
6. Omit generator/reviewer/fastGenerator/hardGenerator from defaults — leave those fields out entirely.
7. Tasks must have unique string ids. Paths must be relative file paths.`
    },
    { role: 'user', content: prompt }
  ];
}

function generationMessages(task, deps = [], plan = {}) {
  const depBlock =
    deps.length === 0
      ? 'None'
      : deps.map((d) => `--- ${d.path} ---\n${d.content}`).join('\n\n');

  const projectCtx = [
    plan.projectName ? `Project: ${plan.projectName}` : '',
    plan.description ? `Description: ${plan.description}` : '',
    plan.stack ? `Stack: ${Array.isArray(plan.stack) ? plan.stack.join(', ') : plan.stack}` : ''
  ].filter(Boolean).join('\n');

  return [
    {
      role: 'system',
      content:
        'You generate a single project file. Respond with the complete file content only. Do not wrap it in markdown fences and add no commentary.'
    },
    {
      role: 'user',
      content: `${projectCtx ? projectCtx + '\n\n' : ''}File: ${task.path}\n\nDependencies:\n${depBlock}\n\nInstruction:\n${task.instruction}`
    }
  ];
}

function reviewMessages(task, content) {
  return [
    {
      role: 'system',
      content:
        'You review code. Return ONLY a JSON object with fields passed (boolean) and issues (array of short strings).'
    },
    {
      role: 'user',
      content: `Review the file ${task.path} for correctness, completeness, and adherence to the instruction.\n\nInstruction:\n${task.instruction}\n\nContent:\n${content}`
    }
  ];
}

function repairMessages(task, content, issues) {
  return [
    {
      role: 'system',
      content:
        'You repair code. Output the COMPLETE corrected file from the very first line to the very last line. Do not truncate, do not summarise, do not omit any section. No markdown fences, no commentary, no explanations — only file content.'
    },
    {
      role: 'user',
      content: `File: ${task.path}\n\nOriginal instruction:\n${task.instruction}\n\nIssues to fix:\n${issues.join('\n')}\n\nCurrent (broken) content:\n${content}\n\nReturn the fully corrected file now. Every line must be present.`
    }
  ];
}

module.exports = { conversionMessages, generationMessages, reviewMessages, repairMessages };

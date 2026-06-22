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

Tasks must be non-empty with unique ids. paths must be relative file paths.`
    },
    { role: 'user', content: prompt }
  ];
}

function generationMessages(task, deps = []) {
  const depBlock =
    deps.length === 0
      ? 'None'
      : deps.map((d) => `--- ${d.path} ---\n${d.content}`).join('\n\n');

  return [
    {
      role: 'system',
      content:
        'You generate a single project file. Respond with the complete file content only. Do not wrap it in markdown fences and add no commentary.'
    },
    {
      role: 'user',
      content: `File: ${task.path}\n\nDependencies:\n${depBlock}\n\nInstruction:\n${task.instruction}`
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
        'You repair code. Respond with the corrected full file content only. No markdown fences, no commentary.'
    },
    {
      role: 'user',
      content: `File: ${task.path}\nOriginal instruction:\n${task.instruction}\nIssues to fix:\n${issues.join('\n')}\n\nCurrent content:\n${content}`
    }
  ];
}

module.exports = { conversionMessages, generationMessages, reviewMessages, repairMessages };

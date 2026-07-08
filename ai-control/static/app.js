let selectedJob = null;
let currentJob = null;
let pollTimer = null;

const $ = id => document.getElementById(id);

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { output: text }; }
  if (!res.ok) throw new Error(data.error || data.output || res.statusText);
  return data;
}

function short(text, n = 84) {
  text = text || "";
  return text.length > n ? text.slice(0, n - 3) + "..." : text;
}

function pillClass(status) {
  return "pill " + String(status || "").replaceAll("_", "_");
}

async function loadProjects() {
  const data = await api("/api/projects");
  const enabled = data.projects.filter(p => !p.disabled);
  $("project").innerHTML = enabled
    .map(p => `<option value="${p.id}">${p.name}</option>`)
    .join("");
  if (!enabled.length) {
    $("submit").disabled = true;
    $("task").placeholder = "No enabled projects. Edit config/projects.json on the server.";
  }
}

async function submitJob() {
  const task = $("task").value.trim();
  const project_id = $("project").value;
  if (!task) return alert("Task required.");
  $("submit").disabled = true;
  try {
    const data = await api("/api/jobs", {
      method: "POST",
      body: JSON.stringify({ project_id, task })
    });
    $("task").value = "";
    selectedJob = data.job_id;
    await loadJobs();
    await loadJob(selectedJob);
  } catch (err) {
    alert(err.message);
  } finally {
    $("submit").disabled = false;
  }
}

async function loadJobs() {
  const data = await api("/api/jobs");
  $("jobs").innerHTML = data.jobs.map(job => `
    <div class="job ${job.id === selectedJob ? "active" : ""}" data-id="${job.id}">
      <div class="job-title">${short(escapeHtml(job.task), 72)}</div>
      <div class="job-meta"><span>${job.project_id}</span><span>${job.status}</span></div>
    </div>
  `).join("") || "<p class='hint'>No jobs yet.</p>";
  document.querySelectorAll(".job").forEach(el => {
    el.addEventListener("click", () => {
      selectedJob = el.dataset.id;
      loadJobs();
      loadJob(selectedJob);
    });
  });
}

async function loadJob(id) {
  if (!id) return;
  const [{ job }, logs, diff] = await Promise.all([
    api(`/api/jobs/${id}`),
    fetch(`/api/jobs/${id}/logs`).then(r => r.text()),
    fetch(`/api/jobs/${id}/diff`).then(r => r.text())
  ]);
  currentJob = job;
  $("detail-title").textContent = short(job.task, 54);
  $("detail-status").className = pillClass(job.status);
  $("detail-status").textContent = job.status;
  $("files").textContent = (job.changed_files || []).join("\n") || "(none yet)";
  $("logs").textContent = logs || "(no logs yet)";
  $("diff").textContent = diff || "(no diff yet)";
  $("warnings").innerHTML = (job.warnings || []).map(w => `<div class="warn">${escapeHtml(w)}</div>`).join("");
  $("push").disabled = !["review", "review_failed"].includes(job.status);
  $("deploy").disabled = !["review", "review_failed", "pushed"].includes(job.status);
}

async function pushJob() {
  if (!selectedJob) return;
  $("push").disabled = true;
  try {
    await api(`/api/jobs/${selectedJob}/push`, { method: "POST", body: "{}" });
    await loadJob(selectedJob);
    await loadJobs();
  } catch (err) {
    alert(err.message);
  }
}

async function deployJob() {
  if (!selectedJob) return;
  const failed = currentJob && currentJob.status === "review_failed";
  const message = failed ? "Tests or build failed. Force deploy anyway?" : "Deploy this job now?";
  if (!confirm(message)) return;
  $("deploy").disabled = true;
  try {
    await api(`/api/jobs/${selectedJob}/deploy`, { method: "POST", body: JSON.stringify({ force: failed }) });
    await loadJob(selectedJob);
    await loadJobs();
  } catch (err) {
    alert(err.message);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

$("submit").addEventListener("click", submitJob);
$("refresh").addEventListener("click", () => {
  loadJobs();
  if (selectedJob) loadJob(selectedJob);
});
$("push").addEventListener("click", pushJob);
$("deploy").addEventListener("click", deployJob);

async function boot() {
  await loadProjects();
  await loadJobs();
  pollTimer = setInterval(() => {
    loadJobs();
    if (selectedJob) loadJob(selectedJob);
  }, 3500);
}

boot().catch(err => alert(err.message));

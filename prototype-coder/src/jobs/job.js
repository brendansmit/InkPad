const { v4: uuid } = require('uuid');

class Job {
  constructor({ plan, apiKey, options = {} }) {
    this.id = uuid();
    this.runId = uuid();
    this.state = 'queued';
    this.plan = plan;
    this.apiKey = apiKey;
    this.options = options;
    this.createdAt = new Date().toISOString();
    this.events = [];
    this.outputs = new Map();
    this.issues = [];
    this.tokens = { prompt: 0, completion: 0 };
    this.costUsd = 0;
    this.zipPath = null;
    this.listeners = new Set();
  }

  transition(state) {
    this.state = state;
  }

  emit(type, payload = {}) {
    const ev = { type, payload, time: new Date().toISOString() };
    this.events.push(ev);
    this.listeners.forEach((fn) => {
      try { fn(ev); } catch {}
    });
  }

  onEvent(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  addOutput(taskId, file) {
    this.outputs.set(taskId, file);
  }

  getStatus() {
    return {
      id: this.id,
      runId: this.runId,
      state: this.state,
      projectName: this.plan?.projectName,
      fileCount: this.outputs.size,
      zipPath: this.zipPath,
      downloadUrl:
        this.state === 'ready' && this.zipPath
          ? `/api/builds/${this.id}/download`
          : null,
      costUsd: Math.round(this.costUsd * 10000) / 10000,
      tokens: this.tokens,
      issueCount: this.issues.length
    };
  }
}

module.exports = { Job };

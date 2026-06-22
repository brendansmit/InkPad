const { Job } = require('./job');
const { runJob } = require('./runner');

class JobManager {
  constructor(deps) {
    this.deps = deps;
    this.jobs = new Map();
  }

  createJob({ plan, apiKey, options }) {
    const job = new Job({ plan, apiKey, options });
    job.emit('job:queued');
    this.jobs.set(job.id, job);
    runJob(job, this.deps).catch(() => {});
    return job;
  }

  getJob(id) {
    return this.jobs.get(id);
  }
}

module.exports = { JobManager };

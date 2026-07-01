module.exports = {
  apps: [{
    name: 'grade-importer',
    script: 'app.py',
    interpreter: 'python3',
    cwd: '/var/www/grade-importer',
    env: {
      PORT: '5051',
    },
    out_file: '/var/log/grade-importer.out.log',
    error_file: '/var/log/grade-importer.err.log',
    restart_delay: 3000,
  }]
};

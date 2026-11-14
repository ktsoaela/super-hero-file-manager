const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const root = path.join(__dirname, '..');
const port = 3123;
const url = `http://localhost:${port}`;

const next = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '-p', String(port)], {
  cwd: root,
  stdio: 'inherit',
});

function waitForServer(attempt = 0) {
  http
    .get(url, (res) => {
      res.resume();
      if (res.statusCode < 500) startElectron();
      else setTimeout(() => waitForServer(attempt + 1), 500);
    })
    .on('error', () => {
      if (attempt > 240) {
        console.error('Next.js dev server did not start.');
        next.kill();
        process.exit(1);
      }
      setTimeout(() => waitForServer(attempt + 1), 500);
    });
}

function startElectron() {
  const electron = spawn(require('electron'), ['.'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, STARK_RENDERER_URL: url },
  });
  electron.on('exit', (code) => {
    next.kill();
    process.exit(code ?? 0);
  });
}

waitForServer();

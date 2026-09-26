import { spawn } from 'child_process';
const child = spawn('npm.cmd', ['run', 'dev'], { stdio: 'pipe' });

child.stdout.on('data', (data) => {
  console.log(`STDOUT: ${data}`);
});

child.stderr.on('data', (data) => {
  console.error(`STDERR: ${data}`);
});

child.on('close', (code) => {
  console.log(`CHILD PROCESS CLOSED WITH CODE ${code}`);
});

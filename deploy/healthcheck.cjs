// HTTP-only liveness check: no login, database mutation or manual sync.
fetch('http://127.0.0.1:3000/login', { redirect: 'manual', signal: AbortSignal.timeout(4000) })
  .then(response => { process.exitCode = response.status === 200 ? 0 : 1; })
  .catch(() => { process.exitCode = 1; });

// Local QA only: fixed-concurrency catalog/search benchmark against the Compose API.
const http = require('node:http');
const https = require('node:https');
const { performance } = require('node:perf_hooks');

const users = Number(process.env.QA_USERS || 200);
const seconds = Number(process.env.QA_SECONDS || 15);
const host = process.env.QA_HOST || 'api';
const port = Number(process.env.QA_PORT || 5000);
const useHttps = process.env.QA_PROTOCOL === 'https';
const transport = useHttps ? https : http;
const paths = ['/api/books', '/api/books/search?q=technology'];
const agent = new transport.Agent({
  keepAlive: true,
  maxSockets: users,
  rejectUnauthorized: !useHttps || process.env.QA_TRUST_LOCAL_CERT !== 'true',
});
const latencies = [[], []];
const statuses = [new Map(), new Map()];
const failures = [0, 0];
let running = true;

function request(index) {
  return new Promise((resolve) => {
    const started = performance.now();
    const req = transport.get({
      host,
      port,
      path: paths[index],
      agent,
      servername: useHttps ? 'localhost' : undefined,
      headers: useHttps ? { Host: 'localhost' } : { 'X-Forwarded-Proto': 'https' },
      timeout: 10000,
    }, (res) => {
      res.resume();
      res.on('end', () => {
        const elapsed = performance.now() - started;
        statuses[index].set(res.statusCode, (statuses[index].get(res.statusCode) || 0) + 1);
        if (res.statusCode === 200) latencies[index].push(elapsed);
        else failures[index]++;
        resolve();
      });
      res.on('error', () => { failures[index]++; resolve(); });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => { failures[index]++; resolve(); });
  });
}

async function worker(index) {
  while (running) await request(index);
}

function summarize(index) {
  const values = latencies[index].sort((a, b) => a - b);
  const percentile = (fraction) => values[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)] || 0;
  return {
    endpoint: paths[index],
    success: values.length,
    failures: failures[index],
    statuses: Object.fromEntries(statuses[index]),
    medianMs: Number(percentile(0.5).toFixed(2)),
    p95Ms: Number(percentile(0.95).toFixed(2)),
    p99Ms: Number(percentile(0.99).toFixed(2)),
    under800Percent: Number((100 * values.filter((x) => x < 800).length / Math.max(1, values.length)).toFixed(2)),
  };
}

(async () => {
  const started = performance.now();
  setTimeout(() => { running = false; }, seconds * 1000);
  await Promise.all(Array.from({ length: users }, (_, i) => worker(i % 2)));
  agent.destroy();
  const all = [...latencies[0], ...latencies[1]].sort((a, b) => a - b);
  const p95 = all[Math.min(all.length - 1, Math.ceil(all.length * 0.95) - 1)] || 0;
  console.log(JSON.stringify({
    users,
    seconds,
    elapsedSeconds: Number(((performance.now() - started) / 1000).toFixed(2)),
    results: [summarize(0), summarize(1)],
    overall: {
      success: all.length,
      failures: failures[0] + failures[1],
      p95Ms: Number(p95.toFixed(2)),
      under800Percent: Number((100 * all.filter((x) => x < 800).length / Math.max(1, all.length)).toFixed(2)),
    },
  }, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });

// Logs method, path (without the query string), status and duration only.
// Bodies, headers and query strings are never logged so personal data stays out of the logs (SRS 6.3).
function requestLogger(req, res, next) {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    const path = `${req.baseUrl}${req.path}`;
    console.log(`${new Date().toISOString()} ${req.method} ${path} ${res.statusCode} ${elapsedMs.toFixed(1)}ms`);
  });
  next();
}

module.exports = { requestLogger };

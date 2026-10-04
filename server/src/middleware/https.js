const strings = require('../resources/strings');

// SRS 6.3 / 3.3: all traffic is served over HTTPS. TLS itself is terminated by the deployment
// proxy; this redirects safe requests and refuses everything else that arrives over plain HTTP.
function enforceHttps(req, res, next) {
  if (req.secure) return next();
  if (req.method === 'GET' || req.method === 'HEAD') {
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  }
  return res.status(403).json({ error: { message: strings.common.httpsRequired } });
}

module.exports = { enforceHttps };

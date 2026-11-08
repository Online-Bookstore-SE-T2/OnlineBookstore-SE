const { randomUUID } = require('crypto');

// SASD 4.4.2: every request gets a correlation id, logged with the request and returned in 500
// responses so a user's report can be traced to the server-side entry. An id set by the proxy in
// front of the API is kept when it is a short token; anything else is replaced, so the header
// can never inject text into the log.
const HEADER = 'X-Request-Id';
const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

function requestId(req, res, next) {
  const incoming = req.get(HEADER);
  req.id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.set(HEADER, req.id);
  next();
}

module.exports = { requestId, REQUEST_ID_HEADER: HEADER };

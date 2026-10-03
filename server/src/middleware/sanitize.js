// Removes MongoDB operator keys ($ne, $gt, ...) and dotted paths from request input
// so they cannot reach a query (SRS 6.3, injection).

function stripOperatorKeys(value) {
  if (Array.isArray(value)) {
    value.forEach(stripOperatorKeys);
  } else if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (key.startsWith('$') || key.includes('.')) {
        delete value[key];
      } else {
        stripOperatorKeys(value[key]);
      }
    }
  }
  return value;
}

function sanitizeRequest(req, _res, next) {
  stripOperatorKeys(req.body);
  stripOperatorKeys(req.query);
  stripOperatorKeys(req.params);
  next();
}

module.exports = { sanitizeRequest, stripOperatorKeys };

const mongoose = require('mongoose');
const strings = require('../resources/strings');
const { AppError } = require('../utils/errors');

function notFound(_req, _res, next) {
  next(new AppError(404, strings.common.notFound));
}

// Mongoose validation messages are mapped to field errors without echoing the submitted value.
function mongooseFieldErrors(err) {
  const fields = {};
  for (const [path, detail] of Object.entries(err.errors)) {
    fields[path] = detail.kind === 'required' ? strings.fields.required(path) : strings.common.validationFailed;
  }
  return fields;
}

function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { message: err.message, ...(err.fields && { fields: err.fields }) } });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: { message: strings.common.payloadTooLarge } });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { message: strings.common.malformedJson } });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({ error: { message: strings.common.validationFailed, fields: mongooseFieldErrors(err) } });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(404).json({ error: { message: strings.common.notFound } });
  }

  // Only the error name and stack frames are logged; the message may contain submitted data (SRS 6.3).
  const frames = (err.stack || '').split('\n').slice(1, 4).join('\n');
  console.error(`[error] ${err.name || 'Error'}${err.code ? ` code=${err.code}` : ''}\n${frames}`);
  return res.status(500).json({ error: { message: strings.common.serverError } });
}

module.exports = { notFound, errorHandler };

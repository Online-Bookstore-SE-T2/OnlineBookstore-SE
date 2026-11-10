const { randomUUID } = require('crypto');
const mongoose = require('mongoose');
const strings = require('../resources/strings');
const { AppError, errorBody } = require('../utils/errors');

function notFound(_req, _res, next) {
    next(new AppError(404, strings.common.notFound));
}

function mongooseFieldErrors(err) {
    const fields = {};

    for (const [path, detail] of Object.entries(err.errors)) {
        fields[path] = detail.kind === 'required'
            ? strings.fields.required(path)
            : strings.common.validationFailed;
    }

    return fields;
}

// SASD 4.4.1: the single place that turns a thrown error into a response, so every endpoint
// reports the same condition with the same status, code and body shape.
function errorHandler(err, req, res, _next) {
    const send = (status, message, details) => res.status(status).json(errorBody(status, message, details));

    // Handle application errors first.
    if (err instanceof AppError) {
        return send(err.status, err.message, { code: err.code, fields: err.fields });
    }

    if (err.type === 'entity.too.large') {
        return send(413, strings.common.payloadTooLarge);
    }

    if (err.type === 'entity.parse.failed') {
        return send(400, strings.common.malformedJson);
    }

    if (err instanceof mongoose.Error.ValidationError) {
        return send(400, strings.common.validationFailed, { fields: mongooseFieldErrors(err) });
    }

    if (err instanceof mongoose.Error.CastError) {
        return send(404, strings.common.notFound);
    }

    if (err instanceof mongoose.Error.VersionError) {
        return send(409, strings.common.concurrentChange);
    }

    // SASD 4.4.2: the stack stays in the server log, keyed by the correlation id that the
    // response returns, so a user's report can be matched to this entry.
    const correlationId = req.id || randomUUID();
    const frames = (err.stack || '')
        .split('\n')
        .slice(1, 4)
        .join('\n');

    console.error(
        `[error] ${err.name || 'Error'}${err.code ? ` code=${err.code}` : ''} correlationId=${correlationId}\n${frames}`
    );

    return send(500, strings.common.serverError, { correlationId });
}

module.exports = { notFound, errorHandler };


const strings = require('../resources/strings');

// SASD 4.4.1: every error response carries a machine-readable code for its class.
// The code follows from the HTTP status, so a thrown AppError never has to name it.
const ERROR_CODES = Object.freeze({
  400: 'VALIDATION_FAILED',
  401: 'INVALID_CREDENTIALS',
  402: 'PAYMENT_FAILED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'TOO_MANY_ATTEMPTS',
  500: 'INTERNAL_ERROR',
  // Statuses the delivered system uses that the SASD 4.4.1 table does not list.
  410: 'GONE',
  413: 'PAYLOAD_TOO_LARGE',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE',
});

function errorCodeFor(status) {
  return ERROR_CODES[status] || (status >= 500 ? ERROR_CODES[500] : 'BAD_REQUEST');
}

class AppError extends Error {
  constructor(status, message, fields, code = errorCodeFor(status)) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.statusCode = status;
    this.code = code;

    if (fields) {
      this.fields = fields;
    }
  }
}

class ValidationError extends AppError {
  constructor(fields, message = strings.common.validationFailed) {
    super(400, message, fields);
    this.name = 'ValidationError';
  }
}

// The single shape of every error response body (SASD 4.4.1).
function errorBody(status, message, { code = errorCodeFor(status), fields, correlationId } = {}) {
  return {
    error: {
      code,
      message,
      ...(fields && { fields }),
      ...(correlationId && { correlationId }),
    },
  };
}

module.exports = { AppError, ValidationError, ERROR_CODES, errorCodeFor, errorBody };

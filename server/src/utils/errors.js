const strings = require('../resources/strings');

class AppError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    if (fields) this.fields = fields;
  }
}

class ValidationError extends AppError {
  constructor(fields, message = strings.common.validationFailed) {
    super(400, message, fields);
    this.name = 'ValidationError';
  }
}

module.exports = { AppError, ValidationError };

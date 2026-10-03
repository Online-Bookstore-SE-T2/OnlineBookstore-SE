// Single resource module for every user-facing server message (SRS 7, internationalisation).
// Release 1.0 ships in English only; translating this file changes every message without code changes.

module.exports = {
  common: {
    notFound: 'The requested resource was not found.',
    malformedJson: 'The request body is not valid JSON.',
    payloadTooLarge: 'The request body is larger than the 1 MB limit.',
    validationFailed: 'Some fields are invalid. Please correct them and try again.',
    serverError: 'Something went wrong. Please try again later.',
    httpsRequired: 'This service is only available over HTTPS.',
    tooManyRequests: 'Too many requests. Please wait a minute and try again.',
  },
  auth: {
    // REQ-1: exact wording required by the SRS
    emailTaken: 'e-mail already registered',
    registered: 'Your account has been created. You can now log in.',
  },
  fields: {
    required: (label) => `${label} is required.`,
    tooLong: (label, max) => `${label} must be at most ${max} characters.`,
    mustBeText: (label) => `${label} must be text.`,
    notAllowed: (label) => `${label} is not one of the allowed values.`,
    invalidEmail: 'Enter a valid e-mail address.',
    invalidPhone: 'Phone number must be exactly 10 digits.',
    invalidPostalCode: 'Postal code must be exactly 6 digits.',
  },
  labels: {
    name: 'Name',
    email: 'E-mail address',
    password: 'Password',
    currentPassword: 'Current password',
    newPassword: 'New password',
    phone: 'Phone number',
    addressLine: 'Address',
    city: 'City',
    state: 'State',
    postalCode: 'Postal code',
    note: 'Note',
    categoryName: 'Category name',
    reasonCode: 'Reason code',
  },
};

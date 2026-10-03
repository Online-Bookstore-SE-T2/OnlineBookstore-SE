// Common server-side validation module, shared by every feature slice (SRS 7, reuse).
// All input is validated and sanitised here before it reaches the database (SRS 6.3).

const strings = require('../resources/strings');
const { ValidationError } = require('../utils/errors');

const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;
const PHONE_PATTERN = /^\d{10}$/;
const POSTAL_CODE_PATTERN = /^\d{6}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const LIMITS = {
  // Appendix B field layouts
  name: 60,
  email: 100,
  addressLine: 200,
  // Lengths chosen for the Release 1.0 address form (not given in the SRS)
  city: 100,
  state: 100,
  sellerRequestNote: 200,
  categoryName: 100,
};

// Characters are counted as code points so that non-Latin text (UTF-8, SRS 7) is measured fairly.
function characterCount(value) {
  return Array.from(value).length;
}

// Removes markup and control characters so stored text can never carry a script (SRS 6.3, XSS).
function sanitizeText(value) {
  return value
    .normalize('NFC')
    .replace(CONTROL_CHARACTERS, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidIsbn13(value) {
  if (typeof value !== 'string' || !/^\d{13}$/.test(value)) return false;
  const digits = value.split('').map(Number);
  const sum = digits.slice(0, 12).reduce((acc, digit, index) => acc + digit * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === digits[12];
}

// Monetary values are INR with at most two decimal places (SRS 6.5).
function isMoney(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
}

function isAbsent(value) {
  return value === undefined || value === null;
}

class FieldValidator {
  constructor() {
    this.errors = {};
  }

  addError(field, message) {
    if (!this.errors[field]) this.errors[field] = message;
  }

  get hasErrors() {
    return Object.keys(this.errors).length > 0;
  }

  throwIfInvalid() {
    if (this.hasErrors) throw new ValidationError(this.errors);
  }

  // Free text. Returns the sanitised value, '' for an optional field that was cleared,
  // or undefined when the field was absent or invalid.
  text(field, value, { label, required = false, max }) {
    if (isAbsent(value)) {
      if (required) this.addError(field, strings.fields.required(label));
      return undefined;
    }
    if (typeof value !== 'string') {
      this.addError(field, strings.fields.mustBeText(label));
      return undefined;
    }
    const clean = sanitizeText(value);
    if (clean === '') {
      if (required) {
        this.addError(field, strings.fields.required(label));
        return undefined;
      }
      return '';
    }
    if (max && characterCount(clean) > max) {
      this.addError(field, strings.fields.tooLong(label, max));
      return undefined;
    }
    return clean;
  }

  email(field, value, { required = true } = {}) {
    const label = strings.labels.email;
    if (isAbsent(value) || value === '') {
      if (required) this.addError(field, strings.fields.required(label));
      return undefined;
    }
    if (typeof value !== 'string') {
      this.addError(field, strings.fields.mustBeText(label));
      return undefined;
    }
    const clean = value.trim().toLowerCase();
    if (clean === '') {
      if (required) this.addError(field, strings.fields.required(label));
      return undefined;
    }
    if (characterCount(clean) > LIMITS.email) {
      this.addError(field, strings.fields.tooLong(label, LIMITS.email));
      return undefined;
    }
    if (!EMAIL_PATTERN.test(clean)) {
      this.addError(field, strings.fields.invalidEmail);
      return undefined;
    }
    return clean;
  }

  // Passwords are never sanitised or trimmed; the SRS sets no format rules beyond being mandatory.
  password(field, value, { label = strings.labels.password } = {}) {
    if (isAbsent(value) || value === '') {
      this.addError(field, strings.fields.required(label));
      return undefined;
    }
    if (typeof value !== 'string') {
      this.addError(field, strings.fields.mustBeText(label));
      return undefined;
    }
    return value;
  }

  // Digit-only codes such as phone numbers and postal codes.
  digits(field, value, { label, required = false, pattern, message }) {
    if (isAbsent(value) || value === '') {
      if (required) this.addError(field, strings.fields.required(label));
      return isAbsent(value) ? undefined : '';
    }
    if (typeof value !== 'string' || !pattern.test(value.trim())) {
      this.addError(field, message);
      return undefined;
    }
    return value.trim();
  }

  phone(field, value, { required = false } = {}) {
    return this.digits(field, value, {
      label: strings.labels.phone,
      required,
      pattern: PHONE_PATTERN,
      message: strings.fields.invalidPhone,
    });
  }

  postalCode(field, value, { required = true } = {}) {
    return this.digits(field, value, {
      label: strings.labels.postalCode,
      required,
      pattern: POSTAL_CODE_PATTERN,
      message: strings.fields.invalidPostalCode,
    });
  }

  // A delivery address (REQ-3): line, city, state and a 6-digit postal code.
  // When `required` is false the whole address may be omitted, but a partly filled one is
  // rejected. Returns the cleaned address, null when omitted, or undefined when invalid.
  address(value, { prefix = '', required = true } = {}) {
    const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const parts = ['line', 'city', 'state', 'postalCode'];
    const provided = parts.some((part) => typeof input[part] === 'string' && input[part].trim() !== '');
    if (!required && !provided) return null;

    const errorsBefore = Object.keys(this.errors).length;
    const address = {
      line: this.text(`${prefix}line`, input.line, { label: strings.labels.addressLine, required: true, max: LIMITS.addressLine }),
      city: this.text(`${prefix}city`, input.city, { label: strings.labels.city, required: true, max: LIMITS.city }),
      state: this.text(`${prefix}state`, input.state, { label: strings.labels.state, required: true, max: LIMITS.state }),
      postalCode: this.postalCode(`${prefix}postalCode`, input.postalCode, { required: true }),
    };
    return Object.keys(this.errors).length === errorsBefore ? address : undefined;
  }

  oneOf(field, value, allowed, { label, required = true }) {
    if (isAbsent(value) || value === '') {
      if (required) this.addError(field, strings.fields.required(label));
      return undefined;
    }
    if (!allowed.includes(value)) {
      this.addError(field, strings.fields.notAllowed(label));
      return undefined;
    }
    return value;
  }
}

module.exports = {
  FieldValidator,
  sanitizeText,
  isValidIsbn13,
  isMoney,
  characterCount,
  LIMITS,
  EMAIL_PATTERN,
  PHONE_PATTERN,
  POSTAL_CODE_PATTERN,
};

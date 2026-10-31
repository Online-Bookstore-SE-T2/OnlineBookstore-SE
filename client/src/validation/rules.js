// Client-side validation mirroring the server rules, so errors appear before a round trip.
// The server remains the authority and re-validates everything (SRS 2.1, 6.3).
import strings from '../resources/strings.js';

export const LIMITS = {
  name: 60,
  email: 100,
  addressLine: 200,
  city: 100,
  state: 100,
  sellerRequestNote: 200,
  categoryName: 100,
  bookTitle: 200,
  bookAuthor: 100,
  bookDescription: 2000,
  coverImageUrl: 500,
  maxAddresses: 5,
};

const URL_PATTERN = /^https?:\/\/[^\s<>"]+$/i;
const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;
const PHONE_PATTERN = /^\d{10}$/;
const POSTAL_CODE_PATTERN = /^\d{6}$/;

const isBlank = (value) => value === undefined || value === null || String(value).trim() === '';
const length = (value) => Array.from(String(value).trim()).length;

export function requiredText(value, label, max) {
  if (isBlank(value)) return strings.validation.required(label);
  if (max && length(value) > max) return strings.validation.tooLong(label, max);
  return undefined;
}

export function optionalText(value, label, max) {
  if (isBlank(value)) return undefined;
  return requiredText(value, label, max);
}

export function email(value) {
  if (isBlank(value)) return strings.validation.required(strings.fields.email);
  if (length(value) > LIMITS.email) return strings.validation.tooLong(strings.fields.email, LIMITS.email);
  if (!EMAIL_PATTERN.test(String(value).trim())) return strings.validation.invalidEmail;
  return undefined;
}

export function password(value, label = strings.fields.password) {
  return value ? undefined : strings.validation.required(label);
}

export function phone(value) {
  if (isBlank(value)) return undefined;
  return PHONE_PATTERN.test(String(value).trim()) ? undefined : strings.validation.invalidPhone;
}

export function postalCode(value) {
  if (isBlank(value)) return strings.validation.required(strings.fields.postalCode);
  return POSTAL_CODE_PATTERN.test(String(value).trim()) ? undefined : strings.validation.invalidPostalCode;
}

// ISBN-13 with its check digit (SRS 6.5); hyphens and spaces are ignored.
export function isbn(value) {
  if (isBlank(value)) return strings.validation.required(strings.fields.isbn);
  const digits = String(value).replace(/[\s-]/g, '');
  if (!/^\d{13}$/.test(digits)) return strings.validation.invalidIsbn;
  const sum = digits.slice(0, 12).split('').reduce((acc, digit, index) => acc + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === Number(digits[12]) ? undefined : strings.validation.invalidIsbn;
}

// A positive amount in INR with at most two decimals (SRS 6.5).
export function price(value) {
  if (isBlank(value)) return strings.validation.required(strings.fields.price);
  return /^\d+(\.\d{1,2})?$/.test(String(value).trim()) && Number(value) > 0 ? undefined : strings.validation.invalidPrice;
}

export function optionalUrl(value, label, max) {
  if (isBlank(value)) return undefined;
  return requiredText(value, label, max) || (URL_PATTERN.test(String(value).trim()) ? undefined : strings.validation.invalidUrl);
}

// A catalog book (REQ-4). The ISBN is fixed once a book exists, so it is only checked on creation.
export function validateBook(values, { creating = true } = {}) {
  return compact({
    ...(creating && { isbn: isbn(values.isbn) }),
    title: requiredText(values.title, strings.fields.title, LIMITS.bookTitle),
    author: requiredText(values.author, strings.fields.author, LIMITS.bookAuthor),
    category: isBlank(values.category) ? strings.validation.required(strings.fields.category) : undefined,
    price: price(values.price),
    description: optionalText(values.description, strings.fields.description, LIMITS.bookDescription),
    coverImageUrl: optionalUrl(values.coverImageUrl, strings.fields.coverImageUrl, LIMITS.coverImageUrl),
  });
}

// Validates an address; when `optional` is true an entirely blank address is allowed.
export function address(values, { optional = false, prefix = '' } = {}) {
  const parts = ['line', 'city', 'state', 'postalCode'];
  if (optional && parts.every((part) => isBlank(values[part]))) return {};
  const errors = {
    [`${prefix}line`]: requiredText(values.line, strings.fields.addressLine, LIMITS.addressLine),
    [`${prefix}city`]: requiredText(values.city, strings.fields.city, LIMITS.city),
    [`${prefix}state`]: requiredText(values.state, strings.fields.state, LIMITS.state),
    [`${prefix}postalCode`]: postalCode(values.postalCode),
  };
  return compact(errors);
}

// Drops undefined entries so an empty object means "valid".
export function compact(errors) {
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message));
}

export function validateProfile(values) {
  return compact({
    name: requiredText(values.name, strings.fields.name, LIMITS.name),
    email: email(values.email),
    phone: phone(values.phone),
  });
}

export function validatePasswordChange(values) {
  return compact({
    currentPassword: password(values.currentPassword, strings.fields.currentPassword),
    newPassword: password(values.newPassword, strings.fields.newPassword),
  });
}

export function validateRegistration(values) {
  return compact({
    name: requiredText(values.name, strings.fields.name, LIMITS.name),
    email: email(values.email),
    password: password(values.password),
    phone: phone(values.phone),
    ...address(values.address, { optional: true, prefix: 'address.' }),
  });
}

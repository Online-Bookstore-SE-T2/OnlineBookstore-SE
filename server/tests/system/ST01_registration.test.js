// ST01 - REQ-1 (FR01) user registration, through the HTTP API.
// Test case IDs refer to the G2 Test Case Design (Functional, Field Validation and NFR sheets).
const request = require('supertest');
const User = require('../../src/models/User');
const { testApp } = require('../helpers/app');
const { useTestDatabase } = require('../helpers/db');
const { NEW_USER, PASSWORD, ADDRESSES, createUser } = require('../helpers/fixtures');

useTestDatabase();
const app = testApp();

function register(body) {
  return request(app).post('/api/auth/register').send(body);
}

describe('ST01 registration', () => {
  test('TC-ST01-01 / TC-FLD-12 / TC-FLD-26: valid details create an Active Buyer account', async () => {
    const res = await register(NEW_USER);
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/account has been created/i);
    expect(res.body.user).toMatchObject({ name: 'Divya Kamath', email: NEW_USER.email, role: 'Buyer', status: 'Active' });
  });

  test('TC-ST01-02 / TC-FLD-08: an already registered e-mail is rejected with "e-mail already registered"', async () => {
    await createUser('U-B01');
    const res = await register({ name: 'Anita Rao', email: 'anita.rao@testmail.example', password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('e-mail already registered');
    expect(res.body.error.fields.email).toBe('e-mail already registered');
    expect(await User.countDocuments({ email: 'anita.rao@testmail.example' })).toBe(1);
  });

  test.each([
    ['TC-ST01-03 / TC-FLD-04', { email: NEW_USER.email, password: PASSWORD }, ['name']],
    ['TC-ST01-03 / TC-FLD-04', { name: '', email: NEW_USER.email, password: PASSWORD }, ['name']],
    ['TC-ST01-04 / TC-FLD-07', { name: NEW_USER.name, password: PASSWORD }, ['email']],
    ['TC-ST01-04 / TC-FLD-07', { name: NEW_USER.name, email: '', password: PASSWORD }, ['email']],
    ['TC-ST01-05 / TC-FLD-11', { name: NEW_USER.name, email: NEW_USER.email }, ['password']],
    ['TC-ST01-05 / TC-FLD-11', { name: NEW_USER.name, email: NEW_USER.email, password: '' }, ['password']],
    ['TC-ST01-06', { name: '', email: '', password: '' }, ['name', 'email', 'password']],
  ])('%s: missing or empty mandatory fields are rejected per field', async (_id, body, fields) => {
    const res = await register(body);
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields).sort()).toEqual([...fields].sort());
    expect(await User.countDocuments()).toBe(0);
  });

  test.each(['divya.kamath.testmail.example', 'divya@', '@testmail.example'])(
    'TC-ST01-07: invalid e-mail format "%s" is rejected',
    async (email) => {
      const res = await register({ ...NEW_USER, email });
      expect(res.status).toBe(400);
      expect(res.body.error.fields).toHaveProperty('email');
      expect(await User.countDocuments()).toBe(0);
    },
  );

  test('TC-ST01-08 / TC-FLD-10 / TC-NFR-SEC-01 / TC-NFR-SEC-02: password is stored as a bcrypt hash with cost >= 10', async () => {
    await register(NEW_USER);
    const stored = await User.findOne({ email: NEW_USER.email }).select('+passwordHash').lean();
    expect(stored.passwordHash).toHaveLength(60);
    expect(stored.passwordHash.startsWith('$2')).toBe(true);
    expect(stored.passwordHash).not.toBe(PASSWORD);
    expect(Number(stored.passwordHash.split('$')[2])).toBeGreaterThanOrEqual(10);
    expect(Object.keys(stored)).not.toContain('password');
  });

  test('TC-ST01-09: the registration response contains neither the password nor its hash', async () => {
    const res = await register(NEW_USER);
    const raw = JSON.stringify(res.body) + JSON.stringify(res.headers);
    expect(raw).not.toContain(PASSWORD);
    expect(raw).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  test('TC-FLD-01: the user ID is system-generated, 24 alphanumeric characters and unique', async () => {
    const a = await register({ ...NEW_USER, _id: 'AAAAAAAAAAAAAAAAAAAAAAAA', id: 'AAAAAAAAAAAAAAAAAAAAAAAA' });
    const b = await register({ ...NEW_USER, email: 'second.user@testmail.example' });
    expect(a.body.user.id).toMatch(/^[a-f0-9]{24}$/);
    expect(a.body.user.id).not.toBe('AAAAAAAAAAAAAAAAAAAAAAAA');
    expect(a.body.user.id).not.toBe(b.body.user.id);
  });

  test('TC-FLD-02 / TC-FLD-03: name of 60 characters is accepted and 61 is rejected', async () => {
    const ok = await register({ ...NEW_USER, name: 'A'.repeat(60) });
    expect(ok.status).toBe(201);
    expect(ok.body.user.name).toHaveLength(60);
    const tooLong = await register({ ...NEW_USER, email: 'other@testmail.example', name: 'A'.repeat(61) });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.fields.name).toMatch(/at most 60/);
  });

  test('TC-FLD-05 / TC-FLD-06: e-mail of 100 characters is accepted and 101 is rejected', async () => {
    const local83 = 'a'.repeat(83);
    const ok = await register({ ...NEW_USER, email: `${local83}@testmail.example` });
    expect(ok.status).toBe(201);
    expect(ok.body.user.email).toHaveLength(100);
    const tooLong = await register({ ...NEW_USER, email: `b${local83}@testmail.example` });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.fields.email).toMatch(/at most 100/);
  });

  test('TC-FLD-09: two simultaneous registrations with the same e-mail create exactly one account', async () => {
    const [first, second] = await Promise.all([register(NEW_USER), register(NEW_USER)]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    expect(await User.countDocuments({ email: NEW_USER.email })).toBe(1);
  });

  test('TC-FLD-13 / TC-NFR-SEC-10: a requested role (Administrator, Superuser) is ignored; the account is a Buyer', async () => {
    const admin = await register({ ...NEW_USER, role: 'Administrator' });
    expect(admin.body.user.role).toBe('Buyer');
    const superuser = await register({ ...NEW_USER, email: 'super@testmail.example', role: 'Superuser' });
    expect(superuser.body.user.role).toBe('Buyer');
  });

  test('TC-FLD-17 / TC-FLD-20 / TC-FLD-24 / TC-FLD-27: phone, address, postal code and reject code are optional', async () => {
    const res = await register(NEW_USER);
    expect(res.status).toBe(201);
    expect(res.body.user.phone).toBeUndefined();
    expect(res.body.user.addresses).toEqual([]);
    expect(res.body.user.rejectReasonCode).toBeUndefined();
  });

  test('optional phone and delivery address are saved when supplied', async () => {
    const res = await register({ ...NEW_USER, phone: '9000000099', address: ADDRESSES['ADDR-1'] });
    expect(res.status).toBe(201);
    expect(res.body.user.phone).toBe('9000000099');
    expect(res.body.user.addresses[0]).toMatchObject({ ...ADDRESSES['ADDR-1'], isDefault: true });
  });

  test.each([
    ['11 digits', '90000000211'],
    ['letters', '90000abc21'],
    ['9 digits', '900000002'],
  ])('a phone number with %s is rejected at registration', async (_label, phone) => {
    const res = await register({ ...NEW_USER, phone });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty('phone');
  });

  test('a malformed postal code in the registration address is rejected', async () => {
    const res = await register({ ...NEW_USER, address: { ...ADDRESSES['ADDR-1'], postalCode: '56A011' } });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty(['address.postalCode']);
  });

  test('TC-FLD-25: the registration date is set by the server and stored as an ISO 8601 UTC timestamp', async () => {
    const res = await register({ ...NEW_USER, registrationDate: '2020-01-01' });
    expect(res.body.user.registrationDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);
    expect(res.body.user.registrationDate.startsWith('2020')).toBe(false);
  });

  test('TC-NFR-SEC-13: markup in the name is sanitised before it is stored', async () => {
    const res = await register({ ...NEW_USER, name: 'Divya <script>alert(1)</script>Kamath' });
    expect(res.status).toBe(201);
    expect(res.body.user.name).not.toMatch(/[<>]/);
    const onlyMarkup = await register({ ...NEW_USER, email: 'x@testmail.example', name: '<img src=x onerror=alert(1)>' });
    expect(onlyMarkup.status).toBe(400);
  });

  test('TC-NFR-QUA-20: UTF-8 names are stored exactly as entered', async () => {
    const res = await register({ ...NEW_USER, name: 'Zoë Müller' });
    expect(res.body.user.name).toBe('Zoë Müller');
  });
});

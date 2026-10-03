// UT01 - REQ-1 (FR01) registration service (authService.registerUser).
const bcrypt = require('bcrypt');
const User = require('../../src/models/User');
const { registerUser, isDuplicateEmail } = require('../../src/services/authService');
const { useTestDatabase } = require('../helpers/db');
const { NEW_USER, PASSWORD, ADDRESSES, createUser } = require('../helpers/fixtures');

useTestDatabase();

async function expectRejected(promise, status, fieldKeys) {
  const err = await promise.catch((e) => e);
  expect(err).toBeInstanceOf(Error);
  expect(err.status).toBe(status);
  if (fieldKeys) expect(Object.keys(err.fields).sort()).toEqual([...fieldKeys].sort());
  return err;
}

describe('UT01 registerUser', () => {
  test('creates an Active Buyer with a bcrypt hash and a server-set registration date', async () => {
    const before = Date.now();
    const user = await registerUser({ ...NEW_USER });
    const stored = await User.findById(user.id).select('+passwordHash').lean();

    expect(stored.role).toBe('Buyer');
    expect(stored.status).toBe('Active');
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$(\d{2})\$.{53}$/);
    expect(Number(stored.passwordHash.split('$')[2])).toBeGreaterThanOrEqual(10);
    expect(await bcrypt.compare(PASSWORD, stored.passwordHash)).toBe(true);
    expect(stored).not.toHaveProperty('password');
    expect(stored.registrationDate.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(stored.addresses).toEqual([]);
  });

  test('ignores client-supplied role, id, status, registration date and reject code', async () => {
    const user = await registerUser({
      ...NEW_USER,
      role: 'Administrator',
      _id: 'AAAAAAAAAAAAAAAAAAAAAAAA',
      status: 'Suspended',
      registrationDate: '2020-01-01',
      rejectReasonCode: 'OTHR',
    });
    expect(user.role).toBe('Buyer');
    expect(user.status).toBe('Active');
    expect(user.id).not.toBe('AAAAAAAAAAAAAAAAAAAAAAAA');
    expect(user.id).toMatch(/^[a-f0-9]{24}$/);
    expect(user.registrationDate.getUTCFullYear()).not.toBe(2020);
    expect(user.rejectReasonCode).toBeUndefined();
  });

  test('normalises the e-mail address and trims the name', async () => {
    const user = await registerUser({ ...NEW_USER, name: '  Divya   Kamath ', email: ' Divya.Kamath@TestMail.Example ' });
    expect(user.name).toBe('Divya Kamath');
    expect(user.email).toBe('divya.kamath@testmail.example');
  });

  test('stores an optional phone number and an optional address as the default address', async () => {
    const user = await registerUser({ ...NEW_USER, phone: '9000000099', address: ADDRESSES['ADDR-1'] });
    expect(user.phone).toBe('9000000099');
    expect(user.addresses).toHaveLength(1);
    expect(user.addresses[0]).toMatchObject({ ...ADDRESSES['ADDR-1'], isDefault: true });
  });

  test('treats an address with every part blank as omitted', async () => {
    const user = await registerUser({ ...NEW_USER, address: { line: ' ', city: '', state: '', postalCode: '' } });
    expect(user.addresses).toHaveLength(0);
  });

  test('rejects a partly filled address, naming each missing part', async () => {
    await expectRejected(registerUser({ ...NEW_USER, address: { line: 'House 44, Temple Road' } }), 400, [
      'address.city',
      'address.state',
      'address.postalCode',
    ]);
    expect(await User.countDocuments()).toBe(0);
  });

  test('rejects missing mandatory fields with one error per field', async () => {
    await expectRejected(registerUser({}), 400, ['name', 'email', 'password']);
    await expectRejected(registerUser({ name: '', email: '', password: '' }), 400, ['name', 'email', 'password']);
  });

  test('rejects a duplicate e-mail regardless of letter case', async () => {
    await createUser('U-B01');
    const err = await expectRejected(
      registerUser({ name: 'Anita Rao', email: 'ANITA.RAO@testmail.example', password: PASSWORD }),
      409,
      ['email'],
    );
    expect(err.message).toBe('e-mail already registered');
    expect(await User.countDocuments({ email: 'anita.rao@testmail.example' })).toBe(1);
  });

  test('two simultaneous registrations with the same e-mail create exactly one account', async () => {
    const results = await Promise.allSettled([registerUser({ ...NEW_USER }), registerUser({ ...NEW_USER })]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(rejected.reason.status).toBe(409);
    expect(await User.countDocuments({ email: NEW_USER.email })).toBe(1);
  });

  test('isDuplicateEmail recognises only e-mail unique-index violations', () => {
    expect(isDuplicateEmail({ code: 11000, keyPattern: { email: 1 } })).toBe(true);
    expect(isDuplicateEmail({ code: 11000, keyPattern: { other: 1 } })).toBe(false);
    expect(isDuplicateEmail({ code: 121 })).toBe(false);
    expect(isDuplicateEmail(null)).toBeFalsy();
  });

  test('the response shape never includes the password hash', async () => {
    const user = await registerUser({ ...NEW_USER });
    const json = user.toJSON();
    expect(json).not.toHaveProperty('passwordHash');
    expect(json).not.toHaveProperty('_id');
    expect(json.id).toMatch(/^[a-f0-9]{24}$/);
  });
});

// UT03 - REQ-3 (FR03) profile and address service (userService).
const bcrypt = require('bcrypt');
const User = require('../../src/models/User');
const userService = require('../../src/services/userService');
const { useTestDatabase } = require('../helpers/db');
const { createUser, ADDRESSES, PASSWORD, USERS } = require('../helpers/fixtures');

useTestDatabase();

const reload = (user) => User.findById(user._id);
const rejection = (promise) => promise.then(() => null, (err) => err);

describe('UT03 updateProfile', () => {
  test('updates name and phone and leaves absent fields unchanged', async () => {
    const user = await createUser('U-B01');
    await userService.updateProfile(user, { name: 'Anita R Rao', phone: '9000000011' });
    const stored = await reload(user);
    expect(stored).toMatchObject({ name: 'Anita R Rao', phone: '9000000011', email: USERS['U-B01'].email });
  });

  test('an empty phone removes it; an empty or missing-but-present name is rejected', async () => {
    const user = await createUser('U-B01');
    await userService.updateProfile(user, { phone: '' });
    expect((await reload(user)).phone).toBeUndefined();
    expect((await rejection(userService.updateProfile(user, { name: '' }))).fields).toHaveProperty('name');
    expect((await rejection(userService.updateProfile(user, { name: null }))).fields).toHaveProperty('name');
  });

  test('changes the e-mail address, normalised, and rejects one used by another account', async () => {
    const user = await createUser('U-B01');
    await createUser('U-B02');
    await userService.updateProfile(user, { email: 'Anita.New@TestMail.example' });
    expect((await reload(user)).email).toBe('anita.new@testmail.example');

    const err = await rejection(userService.updateProfile(user, { email: USERS['U-B02'].email }));
    expect(err.status).toBe(409);
    expect(err.message).toBe('e-mail already registered');
  });

  test('re-submitting the current e-mail is not treated as a duplicate', async () => {
    const user = await createUser('U-B01');
    await expect(userService.updateProfile(user, { email: USERS['U-B01'].email })).resolves.toBeDefined();
  });
});

describe('UT03 changePassword', () => {
  test('replaces the hash when the current password is right', async () => {
    const user = await createUser('U-B01');
    await userService.changePassword(user, { currentPassword: PASSWORD, newPassword: 'NewPass#2026' });
    const { passwordHash } = await User.findById(user._id).select('+passwordHash');
    expect(await bcrypt.compare('NewPass#2026', passwordHash)).toBe(true);
    expect(Number(passwordHash.split('$')[2])).toBeGreaterThanOrEqual(10);
  });

  test('rejects a wrong current password and missing fields', async () => {
    const user = await createUser('U-B01');
    const wrong = await rejection(userService.changePassword(user, { currentPassword: 'nope', newPassword: 'x' }));
    expect(wrong.status).toBe(400);
    expect(wrong.fields).toEqual({ currentPassword: 'Current password is incorrect.' });
    const missing = await rejection(userService.changePassword(user, {}));
    expect(Object.keys(missing.fields).sort()).toEqual(['currentPassword', 'newPassword']);
  });
});

describe('UT03 addresses', () => {
  test('the first address becomes the default; later ones do not unless asked', async () => {
    const user = await createUser('U-B05');
    await userService.addAddress(user, ADDRESSES['ADDR-1']);
    await userService.addAddress(user, ADDRESSES['ADDR-2']);
    await userService.addAddress(user, { ...ADDRESSES['ADDR-3'], isDefault: true });
    const defaults = (await reload(user)).addresses.map((a) => a.isDefault);
    expect(defaults).toEqual([false, false, true]);
  });

  test('at most five addresses are allowed', async () => {
    const user = await createUser('U-B05');
    for (const key of ['ADDR-1', 'ADDR-2', 'ADDR-3', 'ADDR-4', 'ADDR-5']) {
      await userService.addAddress(user, ADDRESSES[key]);
    }
    const err = await rejection(userService.addAddress(user, ADDRESSES['ADDR-6']));
    expect(err.status).toBe(409);
    expect((await reload(user)).addresses).toHaveLength(5);
  });

  test('update replaces the fields; set default moves the default flag', async () => {
    const user = await createUser('U-B05');
    const first = await userService.addAddress(user, ADDRESSES['ADDR-1']);
    const second = await userService.addAddress(user, ADDRESSES['ADDR-2']);
    await userService.updateAddress(user, first.id, { ...ADDRESSES['ADDR-1'], line: 'Flat 12, Lakeview Apartments, 6th Cross' });
    await userService.setDefaultAddress(user, second.id);
    const stored = await reload(user);
    expect(stored.addresses[0].line).toBe('Flat 12, Lakeview Apartments, 6th Cross');
    expect(stored.addresses.map((a) => a.isDefault)).toEqual([false, true]);
  });

  test('deleting the default address passes the default to the first remaining one', async () => {
    const user = await createUser('U-B05');
    const first = await userService.addAddress(user, ADDRESSES['ADDR-1']);
    await userService.addAddress(user, ADDRESSES['ADDR-2']);
    await userService.deleteAddress(user, first.id);
    const stored = await reload(user);
    expect(stored.addresses).toHaveLength(1);
    expect(stored.addresses[0]).toMatchObject({ postalCode: '570001', isDefault: true });
  });

  test('unknown or malformed address IDs give 404', async () => {
    const user = await createUser('U-B05');
    expect((await rejection(userService.deleteAddress(user, 'nope'))).status).toBe(404);
    expect((await rejection(userService.setDefaultAddress(user, '64b000000000000000000000'))).status).toBe(404);
  });

  test('invalid address fields are rejected with per-field errors', async () => {
    const user = await createUser('U-B05');
    const err = await rejection(userService.addAddress(user, { line: '', city: 'x'.repeat(101), state: 'S', postalCode: '56001' }));
    expect(Object.keys(err.fields).sort()).toEqual(['city', 'line', 'postalCode']);
  });
});

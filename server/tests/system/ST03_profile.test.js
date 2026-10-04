// ST03 - REQ-3 (FR03) profile details and delivery addresses, through the HTTP API.
const request = require('supertest');
const User = require('../../src/models/User');
const { testApp } = require('../helpers/app');
const { useTestDatabase } = require('../helpers/db');
const { createUser, ADDRESSES, PASSWORD, USERS } = require('../helpers/fixtures');
const { tokenFor, bearer, login } = require('../helpers/auth');

useTestDatabase();
const app = testApp();

async function asUser(key, overrides) {
  const user = await createUser(key, overrides);
  return { user, auth: bearer(await tokenFor(app, user)) };
}

const api = {
  me: (auth) => request(app).get('/api/users/me').set(auth),
  update: (auth, body) => request(app).patch('/api/users/me').set(auth).send(body),
  password: (auth, body) => request(app).put('/api/users/me/password').set(auth).send(body),
  addresses: (auth) => request(app).get('/api/users/me/addresses').set(auth),
  addAddress: (auth, body) => request(app).post('/api/users/me/addresses').set(auth).send(body),
  editAddress: (auth, id, body) => request(app).put(`/api/users/me/addresses/${id}`).set(auth).send(body),
  deleteAddress: (auth, id) => request(app).delete(`/api/users/me/addresses/${id}`).set(auth),
  makeDefault: (auth, id) => request(app).patch(`/api/users/me/addresses/${id}/default`).set(auth),
};

async function addAll(auth, keys) {
  for (const key of keys) expect((await api.addAddress(auth, ADDRESSES[key])).status).toBe(201);
}

describe('ST03 profile details', () => {
  test('TC-ST03-01: the profile shows the stored name, e-mail and phone', async () => {
    const { auth } = await asUser('U-B01');
    const res = await api.me(auth);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Anita Rao', email: 'anita.rao@testmail.example', phone: '9000000001' });
  });

  test('TC-ST03-02: name and phone updates are saved and returned after reload', async () => {
    const { user, auth } = await asUser('U-B01');
    const res = await api.update(auth, { name: 'Anita R Rao', phone: '9000000011' });
    expect(res.status).toBe(200);
    expect((await api.me(auth)).body.user).toMatchObject({ name: 'Anita R Rao', phone: '9000000011' });
    expect(await User.findById(user.id).lean()).toMatchObject({ name: 'Anita R Rao', phone: '9000000011' });
  });

  test('TC-ST03-03: an empty name is rejected and the stored name is unchanged', async () => {
    const { user, auth } = await asUser('U-B01');
    const res = await api.update(auth, { name: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty('name');
    expect((await User.findById(user.id)).name).toBe('Anita Rao');
  });

  test('TC-FLD-14 / TC-FLD-15 / TC-FLD-16: phone of 10 digits is saved; 11 digits or letters are rejected', async () => {
    const { user, auth } = await asUser('U-B01');
    expect((await api.update(auth, { phone: '9000000021' })).status).toBe(200);
    for (const phone of ['90000000211', '90000abc21']) {
      const res = await api.update(auth, { phone });
      expect(res.status).toBe(400);
      expect(res.body.error.fields).toHaveProperty('phone');
    }
    expect((await User.findById(user.id)).phone).toBe('9000000021');
  });

  test('the e-mail address can be changed, and the new one is used to log in', async () => {
    const { auth } = await asUser('U-B01');
    expect((await api.update(auth, { email: 'anita.new@testmail.example' })).status).toBe(200);
    expect((await login(app, 'anita.new@testmail.example')).status).toBe(200);
    expect((await login(app, USERS['U-B01'].email)).status).toBe(401);
  });

  test('changing the e-mail to one already registered is rejected with "e-mail already registered"', async () => {
    const { auth } = await asUser('U-B01');
    await createUser('U-B02');
    const res = await api.update(auth, { email: USERS['U-B02'].email });
    expect(res.status).toBe(409);
    expect(res.body.error.fields.email).toBe('e-mail already registered');
  });

  test('the password can be changed after confirming the current one', async () => {
    const { auth } = await asUser('U-B01');
    const wrong = await api.password(auth, { currentPassword: 'WrongPass#99', newPassword: 'NewPass#2026' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.fields.currentPassword).toBe('Current password is incorrect.');

    const ok = await api.password(auth, { currentPassword: PASSWORD, newPassword: 'NewPass#2026' });
    expect(ok.status).toBe(200);
    expect((await login(app, USERS['U-B01'].email, 'NewPass#2026')).status).toBe(200);
    expect((await login(app, USERS['U-B01'].email, PASSWORD)).status).toBe(401);
  });

  test('TC-ST03-11 / TC-NFR-SEC-08: profile routes require a login', async () => {
    expect((await request(app).get('/api/users/me')).status).toBe(401);
    expect((await request(app).get('/api/users/me/addresses')).status).toBe(401);
  });
});

describe('ST03 delivery addresses', () => {
  test('TC-ST03-04: an address is added and listed', async () => {
    const { auth } = await asUser('U-B05');
    const res = await api.addAddress(auth, ADDRESSES['ADDR-1']);
    expect(res.status).toBe(201);
    const list = (await api.addresses(auth)).body.addresses;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ ...ADDRESSES['ADDR-1'], isDefault: true });
    expect(list[0].id).toMatch(/^[a-f0-9]{24}$/);
  });

  test('TC-ST03-05: five addresses can be saved', async () => {
    const { auth } = await asUser('U-B05');
    await addAll(auth, ['ADDR-1', 'ADDR-2', 'ADDR-3', 'ADDR-4', 'ADDR-5']);
    expect((await api.addresses(auth)).body.addresses).toHaveLength(5);
  });

  test('TC-ST03-06: a sixth address is rejected with a message about the limit of five', async () => {
    const { auth } = await asUser('U-B05');
    await addAll(auth, ['ADDR-1', 'ADDR-2', 'ADDR-3', 'ADDR-4', 'ADDR-5']);
    const res = await api.addAddress(auth, ADDRESSES['ADDR-6']);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/up to five/);
    expect((await api.addresses(auth)).body.addresses).toHaveLength(5);
  });

  test('two simultaneous adds at four addresses cannot exceed the limit of five', async () => {
    const { auth } = await asUser('U-B05');
    await addAll(auth, ['ADDR-1', 'ADDR-2', 'ADDR-3', 'ADDR-4']);
    const results = await Promise.all([api.addAddress(auth, ADDRESSES['ADDR-5']), api.addAddress(auth, ADDRESSES['ADDR-6'])]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await api.addresses(auth)).body.addresses).toHaveLength(5);
  });

  test('TC-ST03-07: removing one address frees a slot for a new one', async () => {
    const { auth } = await asUser('U-B05');
    await addAll(auth, ['ADDR-1', 'ADDR-2', 'ADDR-3', 'ADDR-4', 'ADDR-5']);
    const fifth = (await api.addresses(auth)).body.addresses[4];
    expect((await api.deleteAddress(auth, fifth.id)).status).toBe(200);
    expect((await api.addAddress(auth, ADDRESSES['ADDR-6'])).status).toBe(201);
    const codes = (await api.addresses(auth)).body.addresses.map((a) => a.postalCode);
    expect(codes).toHaveLength(5);
    expect(codes).toContain('682001');
    expect(codes).not.toContain('411001');
  });

  test('TC-ST03-08: an existing address can be edited', async () => {
    const { user, auth } = await asUser('U-B05');
    await addAll(auth, ['ADDR-1']);
    const [address] = (await api.addresses(auth)).body.addresses;
    const line = 'Flat 12, Lakeview Apartments, 6th Cross';
    const res = await api.editAddress(auth, address.id, { ...ADDRESSES['ADDR-1'], line });
    expect(res.status).toBe(200);
    expect((await User.findById(user.id)).addresses[0].line).toBe(line);
  });

  test('the default address can be changed', async () => {
    const { auth } = await asUser('U-B05');
    await addAll(auth, ['ADDR-1', 'ADDR-2']);
    const [, second] = (await api.addresses(auth)).body.addresses;
    const res = await api.makeDefault(auth, second.id);
    expect(res.body.addresses.map((a) => a.isDefault)).toEqual([false, true]);
  });

  test.each([
    ['TC-ST03-09 / TC-FLD-23', '56A011'],
    ['TC-ST03-09 / TC-FLD-22', '5600111'],
    ['TC-ST03-10', '56001'],
  ])('%s: postal code "%s" is rejected and nothing is saved', async (_id, postalCode) => {
    const { auth } = await asUser('U-B05');
    const res = await api.addAddress(auth, { ...ADDRESSES['ADDR-1'], postalCode });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty('postalCode');
    expect((await api.addresses(auth)).body.addresses).toHaveLength(0);
  });

  test('TC-FLD-21: a postal code of exactly 6 digits is saved', async () => {
    const { auth } = await asUser('U-B05');
    expect((await api.addAddress(auth, { ...ADDRESSES['ADDR-1'], postalCode: '560011' })).status).toBe(201);
  });

  test('TC-FLD-18 / TC-FLD-19: an address line of 200 characters is saved and 201 is rejected', async () => {
    const { auth } = await asUser('U-B05');
    expect((await api.addAddress(auth, { ...ADDRESSES['ADDR-1'], line: 'A'.repeat(200) })).status).toBe(201);
    const res = await api.addAddress(auth, { ...ADDRESSES['ADDR-2'], line: 'A'.repeat(201) });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.line).toMatch(/at most 200/);
  });

  test('city and state are mandatory and limited to 100 characters', async () => {
    const { auth } = await asUser('U-B05');
    const res = await api.addAddress(auth, { ...ADDRESSES['ADDR-1'], city: '', state: 'S'.repeat(101) });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['city', 'state']);
  });

  test('an unknown address ID gives 404', async () => {
    const { auth } = await asUser('U-B05');
    expect((await api.deleteAddress(auth, '64b000000000000000000000')).status).toBe(404);
    expect((await api.editAddress(auth, 'not-an-id', ADDRESSES['ADDR-1'])).status).toBe(404);
  });
});

describe('ST03 privacy, sanitising and suspended accounts', () => {
  test('TC-NFR-SEC-09: one user cannot read or change another user\'s profile or addresses', async () => {
    const anita = await asUser('U-B01', { addresses: [{ ...ADDRESSES['ADDR-1'], isDefault: true }] });
    const rahul = await asUser('U-B02');
    const anitaAddressId = anita.user.addresses[0].id;

    const own = await api.me(rahul.auth);
    expect(own.body.user.email).toBe(USERS['U-B02'].email);
    expect(JSON.stringify(own.body)).not.toContain('anita');

    expect((await request(app).get(`/api/users/${anita.user.id}`).set(rahul.auth)).status).toBe(404);
    expect((await api.deleteAddress(rahul.auth, anitaAddressId)).status).toBe(404);
    expect((await api.editAddress(rahul.auth, anitaAddressId, ADDRESSES['ADDR-2'])).status).toBe(404);
    expect((await User.findById(anita.user.id)).addresses).toHaveLength(1);
  });

  test('TC-NFR-SEC-04: profile responses never contain the password hash or lockout state', async () => {
    const { auth } = await asUser('U-B01');
    const raw = JSON.stringify((await api.me(auth)).body);
    expect(raw).not.toMatch(/passwordHash|failedLoginAttempts|lockUntil|\$2[aby]\$/);
  });

  test('TC-NFR-SEC-13: markup in the profile name and address is stripped before storing', async () => {
    const { user, auth } = await asUser('U-B01');
    await api.update(auth, { name: 'Anita <script>alert(1)</script>Rao' });
    await api.addAddress(auth, { ...ADDRESSES['ADDR-1'], line: '<img src=x onerror=alert(1)>Flat 12' });
    const stored = await User.findById(user.id);
    expect(stored.name).not.toMatch(/[<>]/);
    expect(stored.addresses[0].line).toBe('Flat 12');
  });

  test('TC-NFR-QUA-20: a UTF-8 name is stored and shown exactly as entered', async () => {
    const { auth } = await asUser('U-B06');
    await api.update(auth, { name: 'Zoë Müller' });
    expect((await api.me(auth)).body.user.name).toBe('Zoë Müller');
  });

  test('a suspended account can view its profile but every change is refused with 403', async () => {
    const { user, auth } = await asUser('U-B04', { addresses: [{ ...ADDRESSES['ADDR-1'], isDefault: true }] });
    await User.updateOne({ _id: user._id }, { status: 'Suspended' });
    const addressId = user.addresses[0].id;

    expect((await api.me(auth)).status).toBe(200);
    expect((await api.addresses(auth)).status).toBe(200);
    const attempts = [
      api.update(auth, { name: 'X' }),
      api.password(auth, { currentPassword: PASSWORD, newPassword: 'x' }),
      api.addAddress(auth, ADDRESSES['ADDR-2']),
      api.editAddress(auth, addressId, ADDRESSES['ADDR-2']),
      api.deleteAddress(auth, addressId),
      api.makeDefault(auth, addressId),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(403);
      expect(res.body.error.message).toMatch(/suspended/);
    }
    expect((await User.findById(user.id)).name).toBe('Vikram Desai');
  });
});

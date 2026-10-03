const bcrypt = require('bcrypt');
const User = require('../../src/models/User');

// Values from the "Test Data" sheet of the G2 Test Case Design.
const PASSWORD = 'BookTest#2026';
const WRONG_PASSWORD = 'WrongPass#99';

const USERS = {
  'U-B01': { name: 'Anita Rao', email: 'anita.rao@testmail.example', phone: '9000000001', role: 'Buyer' },
  'U-B02': { name: 'Rahul Menon', email: 'rahul.menon@testmail.example', phone: '9000000002', role: 'Buyer' },
  'U-B03': { name: 'Sneha Joshi', email: 'sneha.joshi@testmail.example', phone: '9000000003', role: 'Buyer' },
  'U-B04': { name: 'Vikram Desai', email: 'vikram.desai@testmail.example', phone: '9000000004', role: 'Buyer' },
  'U-B05': { name: 'Pooja Nambiar', email: 'pooja.nambiar@testmail.example', phone: '9000000005', role: 'Buyer' },
  'U-B06': { name: 'Sameer Gupta', email: 'sameer.gupta@testmail.example', phone: '9000000006', role: 'Buyer' },
  'U-S01': { name: 'Kiran Hegde', email: 'kiran.books@testmail.example', phone: '9000000011', role: 'Seller' },
  'U-S02': { name: 'Latha Shenoy', email: 'latha.books@testmail.example', phone: '9000000012', role: 'Seller' },
  'U-S03': { name: 'Mohan Rao', email: 'mohan.traders@testmail.example', phone: '9000000013', role: 'Seller' },
  A01: { name: 'Admin User One', email: 'admin.one@testmail.example', phone: '9000000021', role: 'Administrator' },
};

const ADDRESSES = {
  'ADDR-1': { line: 'Flat 12, Lakeview Apartments, 5th Cross, Jayanagar', city: 'Bengaluru', state: 'Karnataka', postalCode: '560011' },
  'ADDR-2': { line: 'House 44, Temple Road', city: 'Mysuru', state: 'Karnataka', postalCode: '570001' },
  'ADDR-3': { line: '8, Gandhi Street, T Nagar', city: 'Chennai', state: 'Tamil Nadu', postalCode: '600017' },
  'ADDR-4': { line: 'Plot 21, Lake View Colony', city: 'Hyderabad', state: 'Telangana', postalCode: '500034' },
  'ADDR-5': { line: 'B-304, Green Park Residency', city: 'Pune', state: 'Maharashtra', postalCode: '411001' },
  'ADDR-6': { line: '17, Canal Road, Ernakulam', city: 'Kochi', state: 'Kerala', postalCode: '682001' },
};

const NEW_USER = { name: 'Divya Kamath', email: 'divya.kamath@testmail.example', password: PASSWORD };

let cachedHash;
async function passwordHash() {
  if (!cachedHash) cachedHash = await bcrypt.hash(PASSWORD, 10);
  return cachedHash;
}

// Creates one of the seeded users (e.g. 'U-B01'), with optional overrides.
async function createUser(key, overrides = {}) {
  const base = USERS[key];
  if (!base) throw new Error(`Unknown test user ${key}`);
  return User.create({ ...base, passwordHash: await passwordHash(), ...overrides });
}

module.exports = { PASSWORD, WRONG_PASSWORD, USERS, ADDRESSES, NEW_USER, createUser };

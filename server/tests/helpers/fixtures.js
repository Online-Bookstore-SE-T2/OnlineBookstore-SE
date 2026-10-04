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

// Seeds the users, categories, books, listings, orders and reviews the administration tests
// need, following the Test Data sheet (names, ISBNs, prices and statuses).
async function seedMarketplace() {
  const { Category, Book, Listing, Order, Review } = require('../../src/models');
  const users = {};
  for (const key of ['U-B01', 'U-B02', 'U-B04', 'U-B05', 'U-B06', 'U-S01', 'U-S02', 'U-S03', 'A01']) {
    users[key] = await createUser(key);
  }

  const categories = {};
  for (const name of ['Fiction', 'Textbook', 'Non-Fiction', 'History', 'Cooking', 'Science']) {
    categories[name] = await Category.create({ name });
  }

  const bookData = {
    B01: ['The Silent Orchard', 'Meera Iyer', 'Fiction', '9789380000015', 120],
    B02: ['Learning Data Structures', 'Arjun Nair', 'Textbook', '9789380000022', 550],
    B05: ['Modern Database Systems', 'Kavita Shah', 'Textbook', '9789380000053', 410],
    B07: ['Cooking with Millets', 'Divya Reddy', 'Cooking', '9789380000077', 150],
    B11: ['Orchard Care Handbook', 'Ganesh Kamath', 'Non-Fiction', '9789380000114', 260],
  };
  const books = {};
  for (const [key, [title, author, category, isbn, price]] of Object.entries(bookData)) {
    books[key] = await Book.create({ title, author, isbn, price, category: categories[category]._id });
  }

  const listingData = {
    L01: ['B01', 'U-S01', 'New', 349, 5],
    L02: ['B01', 'U-S02', 'Good', 199.5, 3],
    L04: ['B02', 'U-S01', 'New', 550, 10],
    L06: ['B05', 'U-S01', 'Good', 410, 2],
    L08: ['B07', 'U-S02', 'Good', 150, 2],
  };
  const listings = {};
  for (const [key, [book, seller, condition, price, quantity]] of Object.entries(listingData)) {
    listings[key] = await Listing.create({ book: books[book]._id, seller: users[seller]._id, condition, price, quantity });
  }

  const order = (buyer, listingKey, bookKey, sellerKey, status) =>
    Order.create({
      buyer: users[buyer]._id,
      items: [{ listing: listings[listingKey]._id, book: books[bookKey]._id, seller: users[sellerKey]._id, quantity: 1, unitPrice: listings[listingKey].price }],
      deliveryAddress: ADDRESSES['ADDR-1'],
      totalAmount: listings[listingKey].price,
      status,
    });
  const orders = {
    'ORD-S03': await order('U-B01', 'L06', 'B05', 'U-S01', 'Paid'),
    'ORD-S04': await order('U-B01', 'L04', 'B02', 'U-S01', 'Cancelled'),
    'ORD-S05': await order('U-B01', 'L04', 'B02', 'U-S01', 'Placed'),
  };

  const reviews = {
    'B01-U-B05': await Review.create({ user: users['U-B05']._id, book: books.B01._id, rating: 4, text: 'Nice, a bit slow in the middle.' }),
  };

  return { users, categories, books, listings, orders, reviews };
}

module.exports = { PASSWORD, WRONG_PASSWORD, USERS, ADDRESSES, NEW_USER, createUser, seedMarketplace };

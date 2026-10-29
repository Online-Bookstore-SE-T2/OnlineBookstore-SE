const { config, assertServerConfig } = require('../config/env');
const { connectDatabase, disconnectDatabase } = require('../config/db');
const { ACCOUNT_STATUS, ORDER_STATUS, ROLES } = require('../constants');
const { Category, Book, Listing, Order, Review, User } = require('../models');
const { hashPassword } = require('../services/authService');
const { recomputeBookRating } = require('../services/ratingService');

const DEMO_PASSWORD = 'DemoPass#2026';
const DEMO_CATEGORY = 'Demo Picks';
const DEMO_LISTING_NOTES = 'Seeded demo listing';

const demoUsers = [
  {
    key: 'buyerOne',
    name: 'Aarav Mehta',
    email: 'demo.buyer@example.test',
    phone: '9000000101',
    role: ROLES.BUYER,
    address: {
      line: '12 Demo Street',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560011',
      isDefault: true,
    },
  },
  {
    key: 'buyerTwo',
    name: 'Mira Shah',
    email: 'demo.buyer2@example.test',
    phone: '9000000102',
    role: ROLES.BUYER,
    address: {
      line: '24 Sample Road',
      city: 'Pune',
      state: 'Maharashtra',
      postalCode: '411001',
      isDefault: true,
    },
  },
  {
    key: 'sellerOne',
    name: 'Dev Books',
    email: 'demo.seller@example.test',
    phone: '9000000111',
    role: ROLES.SELLER,
  },
  {
    key: 'sellerTwo',
    name: 'North Star Books',
    email: 'demo.seller2@example.test',
    phone: '9000000112',
    role: ROLES.SELLER,
  },
  {
    key: 'administrator',
    name: 'Demo Administrator',
    email: 'demo.admin@example.test',
    phone: '9000000121',
    role: ROLES.ADMINISTRATOR,
  },
];

const demoBooks = [
  {
    key: 'javascript',
    number: 90001,
    title: 'The JavaScript Handbook',
    author: 'Priya Nair',
    price: 399,
  },
  {
    key: 'gardens',
    number: 90002,
    title: 'Gardens of the Monsoon',
    author: 'Neel Kapoor',
    price: 275,
  },
  {
    key: 'design',
    number: 90003,
    title: 'A Practical Guide to Design',
    author: 'Anika Rao',
    price: 520,
  },
];

const demoListings = [
  { key: 'javascript', seller: 'sellerOne', price: 299, quantity: 2, condition: 'Like New' },
  { key: 'gardens', seller: 'sellerTwo', price: 180, quantity: 2, condition: 'Good' },
  { key: 'design', seller: 'sellerOne', price: 420, quantity: 2, condition: 'New' },
];

const demoOrders = [
  {
    key: 'placed',
    buyer: 'buyerOne',
    listingKeys: ['javascript'],
    status: ORDER_STATUS.PLACED,
    deliveryAddress: {
      line: '12 Demo Street',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560011',
    },
  },
  {
    key: 'paid',
    buyer: 'buyerTwo',
    listingKeys: ['design'],
    status: ORDER_STATUS.PAID,
    paymentStatus: 'Paid',
    deliveryAddress: {
      line: '24 Sample Road',
      city: 'Pune',
      state: 'Maharashtra',
      postalCode: '411001',
    },
  },
  {
    key: 'shipped',
    buyer: 'buyerOne',
    listingKeys: ['design'],
    status: ORDER_STATUS.SHIPPED,
    paymentStatus: 'Paid',
    deliveryAddress: {
      line: '12 Demo Street',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560011',
    },
  },
  {
    key: 'delivered',
    buyer: 'buyerTwo',
    listingKeys: ['javascript', 'gardens'],
    status: ORDER_STATUS.DELIVERED,
    paymentStatus: 'Paid',
    deliveryAddress: {
      line: '24 Sample Road',
      city: 'Pune',
      state: 'Maharashtra',
      postalCode: '411001',
    },
  },
  {
    key: 'cancelled',
    buyer: 'buyerOne',
    listingKeys: ['gardens'],
    status: ORDER_STATUS.CANCELLED,
    paymentStatus: 'Refund pending',
    deliveryAddress: {
      line: '12 Demo Street',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560011',
    },
  },
];

const demoReviews = [
  { book: 'javascript', rating: 5, text: 'Clear explanations and a very useful reference.' },
  { book: 'gardens', rating: 4, text: 'A lovely collection with thoughtful writing.' },
];

function makeDemoIsbn(number) {
  const base = `978${String(number).padStart(9, '0')}`;
  const digits = [...base].map(Number);
  const sum = digits.reduce(
    (total, digit, index) => total + digit * (index % 2 === 0 ? 1 : 3),
    0,
  );
  return base + String((10 - (sum % 10)) % 10);
}

async function findOrCreateBook(spec, category, created) {
  const isbn = makeDemoIsbn(spec.number);
  const existing = await Book.findOne({ isbn });

  if (existing) {
    if (existing.deletedAt) {
      throw new Error(`Demo book ${isbn} is soft-deleted. Resolve it before seeding.`);
    }
    if (
      existing.title !== spec.title
      || existing.author !== spec.author
      || !existing.category.equals(category._id)
    ) {
      throw new Error(`Demo ISBN ${isbn} belongs to a different book. Resolve it before seeding.`);
    }
    return existing;
  }

  const book = await Book.create({
    isbn,
    title: spec.title,
    author: spec.author,
    description: `${spec.title} is sample catalogue data for the bookstore demonstration.`,
    category: category._id,
    price: spec.price,
    coverImageUrl: `https://placehold.co/400x600?text=${encodeURIComponent(spec.title)}`,
  });
  created.books++;
  return book;
}

async function findOrCreateListing(spec, books, users, created) {
  const book = books[spec.key];
  const seller = users[spec.seller];
  let listing = await Listing.findOne({
    book: book._id,
    seller: seller._id,
    notes: DEMO_LISTING_NOTES,
  });

  if (listing) {
    if (listing.deletedAt) {
      throw new Error(`Demo listing for "${book.title}" is soft-deleted. Resolve it before seeding.`);
    }
    return listing;
  }

  listing = await Listing.create({
    book: book._id,
    seller: seller._id,
    price: spec.price,
    quantity: spec.quantity,
    condition: spec.condition,
    notes: DEMO_LISTING_NOTES,
  });
  created.listings++;
  return listing;
}

async function findOrCreateOrder(spec, users, listings, books, created) {
  const buyer = users[spec.buyer];
  const orderListings = spec.listingKeys.map((key) => listings[key]);
  const firstListing = orderListings[0];
  let order = await Order.findOne({
    buyer: buyer._id,
    'items.listing': firstListing._id,
    'deliveryAddress.line': spec.deliveryAddress.line,
  });

  if (order) return order;

  const items = spec.listingKeys.map((key) => {
    const listing = listings[key];
    const book = books[key];
    return {
      listing: listing._id,
      book: book._id,
      seller: listing.seller,
      quantity: 1,
      unitPrice: listing.price,
    };
  });
  const totalAmount = Number(items.reduce((total, item) => total + item.unitPrice, 0).toFixed(2));
  const payment = spec.paymentStatus
    ? { transactionRef: `DEMO-${spec.key.toUpperCase()}`, status: spec.paymentStatus }
    : undefined;

  order = await Order.create({
    buyer: buyer._id,
    items,
    deliveryAddress: spec.deliveryAddress,
    totalAmount,
    status: spec.status,
    ...(payment && { payment }),
  });
  created.orders++;
  return order;
}

async function findOrCreateReview(spec, order, users, books, created) {
  const buyer = users.buyerTwo;
  const book = books[spec.book];
  const existing = await Review.findOne({ user: buyer._id, book: book._id });

  if (existing) {
    if (existing.deletedAt) {
      throw new Error(`Demo review for "${book.title}" is soft-deleted. Resolve it before seeding.`);
    }
    return;
  }

  await Review.create({
    user: buyer._id,
    book: book._id,
    order: order._id,
    rating: spec.rating,
    text: spec.text,
  });
  created.reviews++;
}

function assertDemoSeedingAllowed() {
  if (config.env === 'production') {
    throw new Error('Demo data seeding is disabled in production.');
  }
}

async function seedDemoData() {
  assertDemoSeedingAllowed();

  const created = { users: 0, categories: 0, books: 0, listings: 0, orders: 0, reviews: 0 };
  let passwordHash;
  const users = {};

  for (const spec of demoUsers) {
    let user = await User.findOne({ email: spec.email });

    if (user) {
      if (user.deletedAt || user.status !== ACCOUNT_STATUS.ACTIVE) {
        throw new Error(`Demo account ${spec.email} is not active. Resolve it before seeding.`);
      }
      if (user.role !== spec.role) {
        throw new Error(`Demo account ${spec.email} has the wrong role. Resolve it before seeding.`);
      }
    } else {
      if (!passwordHash) passwordHash = await hashPassword(DEMO_PASSWORD);
      user = await User.create({
        name: spec.name,
        email: spec.email,
        phone: spec.phone,
        role: spec.role,
        passwordHash,
        addresses: spec.address ? [spec.address] : [],
      });
      created.users++;
    }

    users[spec.key] = user;
  }

  let category = await Category.findOne({ name: DEMO_CATEGORY })
    .collation({ locale: 'en', strength: 2 });
  if (!category) {
    category = await Category.create({ name: DEMO_CATEGORY });
    created.categories++;
  } else if (category.deletedAt) {
    throw new Error(`Demo category "${DEMO_CATEGORY}" is soft-deleted. Resolve it before seeding.`);
  }

  const books = {};
  for (const spec of demoBooks) {
    books[spec.key] = await findOrCreateBook(spec, category, created);
  }

  const listings = {};
  for (const spec of demoListings) {
    listings[spec.key] = await findOrCreateListing(spec, books, users, created);
  }

  const orders = {};
  for (const spec of demoOrders) {
    orders[spec.key] = await findOrCreateOrder(spec, users, listings, books, created);
  }

  const deliveredOrder = orders.delivered;
  if (deliveredOrder.status !== ORDER_STATUS.DELIVERED) {
    throw new Error('The demo review order must be Delivered before demo reviews can be seeded.');
  }
  for (const spec of demoReviews) {
    await findOrCreateReview(spec, deliveredOrder, users, books, created);
  }

  for (const book of Object.values(books)) {
    await recomputeBookRating(book._id);
  }

  return created;
}

async function main() {
  assertDemoSeedingAllowed();
  assertServerConfig();
  await connectDatabase(config.mongoUri);
  try {
    const created = await seedDemoData();
    console.log('\n===== DEMO DATA SEED SUMMARY =====');
    for (const [type, count] of Object.entries(created)) {
      console.log(`${type[0].toUpperCase()}${type.slice(1)} created: ${count}`);
    }
    console.log(`Demo login password: ${DEMO_PASSWORD}`);
    console.log('==================================\n');
  } finally {
    await disconnectDatabase();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Demo data seeding failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { seedDemoData, makeDemoIsbn, DEMO_PASSWORD };

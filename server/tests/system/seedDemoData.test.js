const { seedDemoData, DEMO_PASSWORD } = require('../../src/scripts/seedDemoData');
const { ORDER_STATUS, ROLES } = require('../../src/constants');
const { Book, Listing, Order, Review, User } = require('../../src/models');
const { loginUser } = require('../../src/services/authService');
const { useTestDatabase } = require('../helpers/db');

useTestDatabase();

describe('demo data seed', () => {
  test('creates all demo roles, order statuses and verified reviews idempotently', async () => {
    const firstRun = await seedDemoData();

    expect(firstRun).toEqual({
      users: 5,
      categories: 1,
      books: 3,
      listings: 3,
      orders: 5,
      reviews: 2,
    });

    const secondRun = await seedDemoData();
    expect(secondRun).toEqual({
      users: 0,
      categories: 0,
      books: 0,
      listings: 0,
      orders: 0,
      reviews: 0,
    });

    expect(await User.countDocuments()).toBe(5);
    expect(await Book.countDocuments()).toBe(3);
    expect(await Listing.countDocuments()).toBe(3);
    expect(await Order.countDocuments()).toBe(5);
    expect(await Review.countDocuments()).toBe(2);

    const orders = await Order.find();
    expect(orders.map((order) => order.status).sort())
      .toEqual(Object.values(ORDER_STATUS).sort());

    const buyers = await User.find({ role: 'Buyer' });
    expect(buyers.every((buyer) => buyer.addresses.length > 0)).toBe(true);

    const users = await User.find();
    expect(users.map((user) => user.role).sort())
      .toEqual([ROLES.ADMINISTRATOR, ROLES.BUYER, ROLES.BUYER, ROLES.SELLER, ROLES.SELLER].sort());
    for (const user of users) {
      const login = await loginUser({ email: user.email, password: DEMO_PASSWORD });
      expect(login.user.id).toBe(user.id);
    }

    const listings = await Listing.find();
    expect(listings.every((listing) => listing.status === 'Active')).toBe(true);

    const reviews = await Review.find();
    for (const review of reviews) {
      const order = await Order.findById(review.order);
      expect(order.status).toBe(ORDER_STATUS.DELIVERED);
      expect(order.buyer.toString()).toBe(review.user.toString());
      expect(order.items.some((item) => item.book.equals(review.book))).toBe(true);
    }

    const ratedBooks = (await Book.find()).filter((book) => book.reviewCount > 0);
    expect(ratedBooks).toHaveLength(2);
    expect(ratedBooks.every((book) => book.averageRating > 0)).toBe(true);
  });
});

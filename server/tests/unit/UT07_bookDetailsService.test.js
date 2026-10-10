```javascript
const mongoose = require('mongoose');
const { Book, Category, Review } = require('../../src/models');
const { getBookDetails } = require('../../src/services/bookDetailsService');
const { createUser } = require('../helpers/fixtures');
const { useTestDatabase } = require('../helpers/db');

useTestDatabase();

let category;
let book;
let user;

beforeEach(async () => {
  category = await Category.create({
    name: 'Book Details Test Category',
  });

  user = await createUser('U-B01');

  book = await Book.create({
    title: 'Testing Book Details',
    author: 'Anita Rao',
    isbn: '9789380000015',
    description: 'A book created for unit testing.',
    category: category._id,
    price: 350,
    averageRating: 4,
    reviewCount: 1,
  });
});

describe('UT07 - Book details service', () => {
  test('returns details for a valid book ID', async () => {
    const result = await getBookDetails(book._id.toString());

    expect(result.book.title).toBe('Testing Book Details');
    expect(result.book.author).toBe('Anita Rao');
    expect(result.book.price).toBe(350);
  });

  test('includes the populated category name', async () => {
    const result = await getBookDetails(book._id.toString());

    expect(result.book.category.name).toBe(
      'Book Details Test Category'
    );
  });

  test('returns the book rating summary', async () => {
    const result = await getBookDetails(book._id.toString());

    expect(result.rating.average).toBe(4);
    expect(result.rating.count).toBe(1);
  });

  test('returns reviews with reviewer names', async () => {
    await Review.create({
      user: user._id,
      book: book._id,
      rating: 4,
      text: 'A useful book.',
    });

    const result = await getBookDetails(book._id.toString());

    expect(result.reviews).toHaveLength(1);
    expect(result.reviews[0].rating).toBe(4);
    expect(result.reviews[0].text).toBe('A useful book.');
    expect(result.reviews[0].reviewer).toBe(user.name);
  });

  test('returns an empty review list when no reviews exist', async () => {
    const result = await getBookDetails(book._id.toString());

    expect(result.reviews).toEqual([]);
  });

  test('returns a not-found error for an invalid book ID', async () => {
    await expect(
      getBookDetails('invalid-book-id')
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  test('returns a not-found error when the book does not exist', async () => {
    const missingBookId = new mongoose.Types.ObjectId().toString();

    await expect(
      getBookDetails(missingBookId)
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  test('does not return a soft-deleted book', async () => {
    await Book.findByIdAndUpdate(book._id, {
      $set: { deletedAt: new Date() },
    });

    await expect(
      getBookDetails(book._id.toString())
    ).rejects.toMatchObject({
  status: 404,
  });
  });
});
```
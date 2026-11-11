
const { Book, Category } = require('../../src/models');
const { searchBooks } = require('../../src/services/searchService');
const { useTestDatabase } = require('../helpers/db');

useTestDatabase();

let category;

beforeEach(async () => {
  category = await Category.create({ name: 'Unit Test Fiction' });

  await Book.create([
    {
      title: 'Learning JavaScript',
      author: 'Anita Rao',
      isbn: '9789380000107',
      category: category._id,
      price: 250,
    },
    {
      title: 'Database Essentials',
      author: 'Rahul Menon',
      isbn: '9789380000121',
      category: category._id,
      price: 400,
    },
    {
      title: 'Python for Beginners',
      author: 'Anita Rao',
      isbn: '9789380000138',
      category: category._id,
      price: 300,
      markedUnavailable: true,
    },
  ]);
});

describe('UT06 - Book search service', () => {
  test('searches book titles case-insensitively', async () => {
    const result = await searchBooks({ q: 'LEARNING JAVASCRIPT' });

    expect(result.total).toBe(1);
    expect(result.items[0].title).toBe('Learning JavaScript');
  });

  test('searches by author', async () => {
    const result = await searchBooks({ q: 'Anita Rao' });

    expect(result.items.map((book) => book.title)).toContain(
      'Learning JavaScript'
    );
    expect(result.items.map((book) => book.title)).not.toContain(
      'Database Essentials'
    );
  });

  test('searches by ISBN', async () => {
    const result = await searchBooks({ q: '9789380000121' });

    expect(result.total).toBe(1);
    expect(result.items[0].title).toBe('Database Essentials');
  });

  test('returns all available books when no search term is provided', async () => {
    const result = await searchBooks({});

    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(
      result.items.some((book) => book.markedUnavailable)
    ).toBe(false);
  });

  test('returns an empty result for an unmatched search term', async () => {
    const result = await searchBooks({ q: 'NoSuchBookXYZ' });

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(1);
  });

  test('treats search input as literal text instead of a regular expression', async () => {
    const result = await searchBooks({ q: '.*' });

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  test('returns pagination metadata', async () => {
    const result = await searchBooks({ page: 1 });

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.total).toBe(2);
    expect(result.totalPages).toBe(1);
  });

  test('supports partial title substring searches', async () => {
    const result = await searchBooks({ q: 'JavaScr' });

    expect(result.total).toBe(1);
    expect(result.items[0].title).toBe('Learning JavaScript');
    expect(result.items[0]).not.toHaveProperty('searchNgrams');
  });

  test('preserves short-query fallback searches', async () => {
    const result = await searchBooks({ q: 'An' });

    expect(result.items.map((book) => book.title)).toContain(
      'Learning JavaScript'
    );
  });

  test('preserves non-ASCII fallback searches', async () => {
    await Book.create({
      title: 'ಕನ್ನಡ ಪುಸ್ತಕ',
      author: 'ಕುವೆಂಪು',
      isbn: '9789380000145',
      category: category._id,
      price: 200,
    });

    const result = await searchBooks({ q: 'ಪುಸ್ತಕ' });

    expect(result.total).toBe(1);
    expect(result.items[0].title).toBe('ಕನ್ನಡ ಪುಸ್ತಕ');
  });

  test('coalesces simultaneous identical searches but does not cache completed results', async () => {
    const aggregateSpy = jest.spyOn(Book, 'aggregate');

    try {
      const [first, second] = await Promise.all([
        searchBooks({ q: 'JavaScript', page: '1' }),
        searchBooks({ page: '1', q: 'JavaScript' }),
      ]);

      expect(aggregateSpy).toHaveBeenCalledTimes(1);
      expect(first).toEqual(second);

      await searchBooks({ q: 'JavaScript', page: '1' });
      expect(aggregateSpy).toHaveBeenCalledTimes(2);
    } finally {
      aggregateSpy.mockRestore();
    }
  });

  test('does not return soft-deleted books', async () => {
    await Book.findOneAndUpdate(
      { isbn: '9789380000107' },
      { $set: { deletedAt: new Date() } }
    );

    const result = await searchBooks({ q: 'Learning JavaScript' });

    expect(result.total).toBe(0);
    expect(result.items).toHaveLength(0);
  });
});

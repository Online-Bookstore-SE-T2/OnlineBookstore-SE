```javascript
const { Book, Category } = require('../../src/models');
const {
  getCatalogBooks,
  getCatalogCategories,
} = require('../../src/services/catalogService');
const { useTestDatabase } = require('../helpers/db');

useTestDatabase();

let category;
let secondCategory;

beforeEach(async () => {
  category = await Category.create({
    name: 'Catalog Fiction',
  });

  secondCategory = await Category.create({
    name: 'Catalog Technology',
  });

  await Book.create([
    {
      title: 'Alpha Testing Book',
      author: 'Anita Rao',
      isbn: '9789380000015',
      category: category._id,
      price: 200,
      averageRating: 4.5,
      reviewCount: 10,
    },
    {
      title: 'Beta Testing Book',
      author: 'Rahul Menon',
      isbn: '9789380000022',
      category: secondCategory._id,
      price: 500,
      averageRating: 3,
      reviewCount: 5,
    },
    {
      title: 'Gamma Testing Book',
      author: 'Meera Nair',
      isbn: '9789380000053',
      category: category._id,
      price: 350,
      averageRating: 4,
      reviewCount: 8,
      markedUnavailable: true,
    },
  ]);
});

describe('UT08 - Catalog service', () => {
  test('returns catalog books with pagination metadata', async () => {
    const result = await getCatalogBooks({});

    expect(result.items).toHaveLength(3);
    expect(result.total).toBe(3);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.totalPages).toBe(1);
  });

  test('filters books by category', async () => {
    const result = await getCatalogBooks({
      category: category._id.toString(),
    });

    expect(result.items).toHaveLength(2);

    expect(
      result.items.every(
        (book) =>
          book.category._id.toString() === category._id.toString()
      )
    ).toBe(true);
  });

  test('filters books by minimum price', async () => {
    const result = await getCatalogBooks({
      minPrice: '300',
    });

    expect(result.items).toHaveLength(2);

    expect(
      result.items.every((book) => book.price >= 300)
    ).toBe(true);
  });

  test('filters books by maximum price', async () => {
    const result = await getCatalogBooks({
      maxPrice: '300',
    });

    expect(result.items).toHaveLength(1);

    expect(
      result.items.every((book) => book.price <= 300)
    ).toBe(true);
  });

  test('filters books by minimum rating', async () => {
    const result = await getCatalogBooks({
      minRating: '4',
    });

    expect(result.items).toHaveLength(2);

    expect(
      result.items.every((book) => book.averageRating >= 4)
    ).toBe(true);
  });

  test('sorts books by title in ascending order by default', async () => {
    const result = await getCatalogBooks({});

    const titles = result.items.map((book) => book.title);

    expect(titles).toEqual([
      'Alpha Testing Book',
      'Beta Testing Book',
      'Gamma Testing Book',
    ]);
  });

  test('supports descending title sorting', async () => {
    const result = await getCatalogBooks({
      sort: 'title_desc',
    });

    const titles = result.items.map((book) => book.title);

    expect(titles).toEqual([
      'Gamma Testing Book',
      'Beta Testing Book',
      'Alpha Testing Book',
    ]);
  });

  test('rejects an invalid page number', async () => {
    await expect(
      getCatalogBooks({ page: '0' })
    ).rejects.toMatchObject({
      status: 400,
    });
  });

  test('rejects an invalid sort option', async () => {
    await expect(
      getCatalogBooks({ sort: 'invalid_sort' })
    ).rejects.toMatchObject({
      status: 400,
    });
  });

  test('returns catalog categories in alphabetical order', async () => {
    const categories = await getCatalogCategories();

    const names = categories.map((item) => item.name);

    expect(names).toContain('Catalog Fiction');
    expect(names).toContain('Catalog Technology');
    expect(names).toEqual([...names].sort());
  });
});
```
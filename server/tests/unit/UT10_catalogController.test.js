const catalogService = require('../../src/services/catalogService');

jest.mock('../../src/services/catalogService', () => ({
  getCatalogBooks: jest.fn(),
  getCatalogCategories: jest.fn(),
}));

const catalogController = require('../../src/controllers/catalogController');

describe('UT10 - Catalog controller', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      query: {},
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  describe('listBooks', () => {
    test('passes query parameters to the catalog service', async () => {
      req.query = {
        category: 'technology',
        minPrice: '200',
        maxPrice: '800',
        page: '2',
      };

      const catalogResult = {
        items: [{ title: 'Database Essentials' }],
        page: 2,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      };

      catalogService.getCatalogBooks.mockResolvedValue(catalogResult);

      await catalogController.listBooks(req, res);

      expect(catalogService.getCatalogBooks).toHaveBeenCalledWith(req.query);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(catalogResult);
    });

    test('returns an empty catalog when no books are found', async () => {
      const emptyResult = {
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 1,
      };

      catalogService.getCatalogBooks.mockResolvedValue(emptyResult);

      await catalogController.listBooks(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(emptyResult);
    });
  });

  describe('listCategories', () => {
    test('returns categories inside the items property', async () => {
      const categories = [
        { _id: 'category1', name: 'Fiction' },
        { _id: 'category2', name: 'Technology' },
      ];

      catalogService.getCatalogCategories.mockResolvedValue(categories);

      await catalogController.listCategories(req, res);

      expect(catalogService.getCatalogCategories).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        items: categories,
      });
    });

    test('returns an empty items array when no categories exist', async () => {
      catalogService.getCatalogCategories.mockResolvedValue([]);

      await catalogController.listCategories(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        items: [],
      });
    });
  });
});
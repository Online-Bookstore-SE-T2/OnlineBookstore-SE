```javascript
jest.mock('../../src/services/searchService', () => ({
  searchBooks: jest.fn(),
}));

jest.mock('../../src/services/bookDetailsService', () => ({
  getBookDetails: jest.fn(),
}));

const { searchBooks } = require('../../src/services/searchService');
const { getBookDetails } = require('../../src/services/bookDetailsService');
const bookController = require('../../src/controllers/bookController');

describe('UT09 - Book controller', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      query: {},
      params: {},
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  describe('search', () => {
    test('passes query parameters to the search service', async () => {
      req.query = {
        q: 'database',
        page: '2',
      };

      const searchResult = {
        items: [{ title: 'Database Essentials' }],
        page: 2,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      };

      searchBooks.mockResolvedValue(searchResult);

      await bookController.search(req, res);

      expect(searchBooks).toHaveBeenCalledWith(req.query);
      expect(res.json).toHaveBeenCalledWith(searchResult);
    });

    test('returns an empty search result when no books match', async () => {
      const emptyResult = {
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 1,
      };

      searchBooks.mockResolvedValue(emptyResult);

      await bookController.search(req, res);

      expect(res.json).toHaveBeenCalledWith(emptyResult);
    });
  });

  describe('details', () => {
    test('passes the book ID to the details service', async () => {
      req.params.bookId = '507f1f77bcf86cd799439011';

      const detailsResult = {
        book: {
          _id: req.params.bookId,
          title: 'Database Essentials',
        },
        rating: {
          average: 4,
          count: 2,
        },
        reviews: [],
      };

      getBookDetails.mockResolvedValue(detailsResult);

      await bookController.details(req, res);

      expect(getBookDetails).toHaveBeenCalledWith(req.params.bookId);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(detailsResult);
    });

    test('returns details with reviews when the service provides them', async () => {
      req.params.bookId = '507f1f77bcf86cd799439012';

      const detailsResult = {
        book: {
          _id: req.params.bookId,
          title: 'Learning JavaScript',
        },
        rating: {
          average: 5,
          count: 1,
        },
        reviews: [
          {
            rating: 5,
            text: 'Excellent book.',
            reviewer: 'Test Reviewer',
          },
        ],
      };

      getBookDetails.mockResolvedValue(detailsResult);

      await bookController.details(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(detailsResult);
    });
  });
});
```
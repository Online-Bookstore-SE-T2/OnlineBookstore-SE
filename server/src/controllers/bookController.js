
const { searchBooks } = require('../services/searchService');
const { getBookDetails } = require('../services/bookDetailsService');

async function search(req, res) {
  const result = await searchBooks(req.query);
  res.json(result);
}

async function details(req, res) {
  const result = await getBookDetails(req.params.bookId);
  res.status(200).json(result);
}

module.exports = {
  search,
  details,
};

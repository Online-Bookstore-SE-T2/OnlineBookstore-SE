const { searchBooks } = require('../services/searchService');

async function search(req, res) {
  const result = await searchBooks(req.query);
  res.json(result);
}

module.exports = {
  search,
};
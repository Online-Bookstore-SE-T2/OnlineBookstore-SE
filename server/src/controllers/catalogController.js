
const catalogService = require('../services/catalogService');

async function listBooks(req, res) {
  const result = await catalogService.getCatalogBooks(req.query);
  res.status(200).json(result);
}

async function listCategories(req, res) {
  const categories = await catalogService.getCatalogCategories();
  res.status(200).json({ items: categories });
}

module.exports = {
  listBooks,
  listCategories,
};

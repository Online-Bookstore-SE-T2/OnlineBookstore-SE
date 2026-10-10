const catalogService = require('../services/catalogService');

async function listBooks(req, res) {
  const result = await catalogService.getCatalogBooks(req.query);
  res.status(200).json(result);
}

module.exports = { listBooks };

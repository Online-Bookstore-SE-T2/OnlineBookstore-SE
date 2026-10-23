
const express = require('express');
const catalogController = require('../controllers/catalogController');
const { asyncHandler } = require('../utils/asyncHandler');

function createCatalogRouter() {
  const router = express.Router();

  // Get all active categories
  router.get(
    '/categories',
    asyncHandler(catalogController.listCategories)
  );

  // Get catalog books with filters and sorting
  router.get(
    '/',
    asyncHandler(catalogController.listBooks)
  );

  return router;
}

module.exports = { createCatalogRouter };

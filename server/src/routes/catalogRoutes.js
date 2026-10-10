const express = require('express');
const catalogController = require('../controllers/catalogController');
const { asyncHandler } = require('../utils/asyncHandler');

function createCatalogRouter() {
  const router = express.Router();

  router.get('/', asyncHandler(catalogController.listBooks));

  return router;
}

module.exports = { createCatalogRouter };

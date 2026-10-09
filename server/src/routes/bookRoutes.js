const express = require('express');
const bookController = require('../controllers/bookController');
const { asyncHandler } = require('../utils/asyncHandler');

function createBookRouter() {
  const router = express.Router();

  router.get('/search', asyncHandler(bookController.search));

  return router;
}

module.exports = { createBookRouter };
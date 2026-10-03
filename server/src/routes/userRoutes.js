const express = require('express');
const userController = require('../controllers/userController');
const { asyncHandler } = require('../utils/asyncHandler');
const { authenticate, requireWriteAccess } = require('../middleware/auth');

// The logged-in user's own profile and addresses (REQ-3). Every route works on "me"; there is
// no route that takes another user's ID, so personal data cannot be read across accounts (NFR10).
function createUserRouter() {
  const router = express.Router();
  router.use(authenticate);

  router.get('/me', asyncHandler(userController.getProfile));
  router.patch('/me', requireWriteAccess, asyncHandler(userController.updateProfile));
  router.put('/me/password', requireWriteAccess, asyncHandler(userController.changePassword));

  router.get('/me/addresses', asyncHandler(userController.listAddresses));
  router.post('/me/addresses', requireWriteAccess, asyncHandler(userController.addAddress));
  router.put('/me/addresses/:addressId', requireWriteAccess, asyncHandler(userController.updateAddress));
  router.delete('/me/addresses/:addressId', requireWriteAccess, asyncHandler(userController.deleteAddress));
  router.patch('/me/addresses/:addressId/default', requireWriteAccess, asyncHandler(userController.setDefaultAddress));

  router.post('/me/seller-request', requireWriteAccess, asyncHandler(userController.requestSellerStatus));

  return router;
}

module.exports = { createUserRouter };

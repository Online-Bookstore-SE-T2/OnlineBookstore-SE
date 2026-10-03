const express = require('express');
const admin = require('../controllers/adminController');
const { asyncHandler } = require('../utils/asyncHandler');
const { requireAdministrator, requireWriteAccess } = require('../middleware/auth');

// Administration console API (REQ-4, FR15). Every route is for administrators only (403
// otherwise), and every change is written to the audit log by the service layer.
function createAdminRouter() {
  const router = express.Router();
  router.use(requireAdministrator);
  const write = requireWriteAccess;
  const route = (handler) => asyncHandler(handler);

  router.get('/audit-log', route(admin.auditLog));
  router.get('/seller-requests', route(admin.listSellerRequests));

  router.post('/users/:id/suspend', write, route(admin.suspendUser));
  router.post('/users/:id/reinstate', write, route(admin.reinstateUser));
  router.post('/users/:id/promote', write, route(admin.promoteUser));
  router.post('/users/:id/seller-request/approve', write, route(admin.approveSellerRequest));
  router.post('/users/:id/seller-request/reject', write, route(admin.rejectSellerRequest));

  router.patch('/books/:id/availability', write, route(admin.setBookAvailability));

  router.post('/listings/:id/suspend', write, route(admin.suspendListing));
  router.post('/listings/:id/reinstate', write, route(admin.reinstateListing));

  router.post('/categories', write, route(admin.createCategory));
  router.patch('/categories/:id', write, route(admin.renameCategory));

  // Generic routes for users, books, categories, listings, reviews and orders.
  router.post('/:entity/query', route(admin.listRecords));
  router.get('/:entity/:id', route(admin.getRecord));
  router.delete('/:entity/:id', write, route(admin.deleteRecord));
  router.post('/:entity/:id/restore', write, route(admin.restoreRecord));

  return router;
}

module.exports = { createAdminRouter };

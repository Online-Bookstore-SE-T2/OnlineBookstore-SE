const express = require('express');
const notificationController = require('../controllers/notificationController');
const { asyncHandler } = require('../utils/asyncHandler');
const {
  authenticate,
  requireWriteAccess,
} = require('../middleware/auth');

function createNotificationRouter() {
  const router = express.Router();

  router.use(authenticate);

  router.get(
    '/',
    asyncHandler(notificationController.listNotifications)
  );

  router.patch(
    '/:notificationId/read',
    requireWriteAccess,
    asyncHandler(notificationController.markAsRead)
  );

  return router;
}

module.exports = { createNotificationRouter };
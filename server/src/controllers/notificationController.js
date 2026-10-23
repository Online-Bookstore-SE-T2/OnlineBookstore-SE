const notificationService = require('../services/notificationService');

async function listNotifications(req, res) {
  const unreadOnly = req.query.unreadOnly === 'true';

  const notifications = await notificationService.getNotifications(
    req.user._id,
    { unreadOnly }
  );

  res.status(200).json({ notifications });
}

async function markAsRead(req, res) {
  const notification = await notificationService.markNotificationAsRead(
    req.user._id,
    req.params.notificationId
  );

  res.status(200).json({
    message: 'Notification marked as read.',
    notification,
  });
}

module.exports = {
  listNotifications,
  markAsRead,
};
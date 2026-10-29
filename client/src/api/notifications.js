import { apiRequest } from './http.js';

export async function listNotifications(unreadOnly = false) {
  const suffix = unreadOnly ? '?unreadOnly=true' : '';
  return (await apiRequest(`/notifications${suffix}`)).notifications;
}

export async function markNotificationRead(notificationId) {
  const result = await apiRequest(`/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'PATCH',
  });
  window.dispatchEvent(new Event('notifications-updated'));
  return result.notification;
}

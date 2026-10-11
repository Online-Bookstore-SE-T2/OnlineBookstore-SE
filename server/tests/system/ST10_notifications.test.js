const request = require('supertest');
const { testApp } = require('../helpers/app');
const { useTestDatabase } = require('../helpers/db');
const { seedMarketplace } = require('../helpers/fixtures');
const { tokenFor, bearer } = require('../helpers/auth');
const { Notification } = require('../../src/models');

useTestDatabase();

describe('ST10 Notifications', () => {
  let app;
  let data;
  let buyerAuth;
  let secondBuyerAuth;

  beforeEach(async () => {
    app = testApp();
    data = await seedMarketplace();

    buyerAuth = bearer(
      await tokenFor(app, data.users['U-B01'])
    );

    secondBuyerAuth = bearer(
      await tokenFor(app, data.users['U-B02'])
    );
  });

  async function createNotification(recipient, overrides = {}) {
    return Notification.create({
      recipient,
      type: 'ORDER_PLACED',
      title: 'Order placed successfully',
      message: 'Your order has been placed.',
      ...overrides,
    });
  }

  test('TC-NOT-01: rejects unauthenticated notification requests', async () => {
    const response = await request(app)
      .get('/api/notifications');

    expect(response.status).toBe(401);
  });

  test('TC-NOT-02: buyer can retrieve their notifications', async () => {
    await createNotification(data.users['U-B01']._id);

    const response = await request(app)
      .get('/api/notifications')
      .set(buyerAuth);

    expect(response.status).toBe(200);
    expect(response.body.notifications).toHaveLength(1);
    expect(response.body.notifications[0].title)
      .toBe('Order placed successfully');
  });

  test('TC-NOT-03: buyer cannot see another buyer notifications', async () => {
    await createNotification(data.users['U-B01']._id);
    await createNotification(data.users['U-B02']._id, {
      title: 'Private notification',
      message: 'This belongs to another buyer.',
    });

    const response = await request(app)
      .get('/api/notifications')
      .set(buyerAuth);

    expect(response.status).toBe(200);
    expect(response.body.notifications).toHaveLength(1);
    expect(response.body.notifications[0].title)
      .toBe('Order placed successfully');
  });

  test('TC-NOT-04: unreadOnly returns only unread notifications', async () => {
    await createNotification(data.users['U-B01']._id);

    await createNotification(data.users['U-B01']._id, {
      title: 'Already read',
      readAt: new Date(),
    });

    const response = await request(app)
      .get('/api/notifications?unreadOnly=true')
      .set(buyerAuth);

    expect(response.status).toBe(200);
    expect(response.body.notifications).toHaveLength(1);
    expect(response.body.notifications[0].readAt).toBeNull();
  });

  test('TC-NOT-05: buyer can mark their notification as read', async () => {
    const notification = await createNotification(
      data.users['U-B01']._id
    );

    const response = await request(app)
      .patch(`/api/notifications/${notification._id}/read`)
      .set(buyerAuth);

    expect(response.status).toBe(200);
    expect(response.body.notification.readAt).not.toBeNull();

    const saved = await Notification.findById(notification._id);
    expect(saved.readAt).not.toBeNull();
  });

  test('TC-NOT-06: buyer cannot mark another buyer notification as read', async () => {
    const notification = await createNotification(
      data.users['U-B01']._id
    );

    const response = await request(app)
      .patch(`/api/notifications/${notification._id}/read`)
      .set(secondBuyerAuth);

    expect(response.status).toBe(404);

    const saved = await Notification.findById(notification._id);
    expect(saved.readAt).toBeNull();
  });

  test('TC-NOT-07: rejects an invalid notification ID', async () => {
    const response = await request(app)
      .patch('/api/notifications/not-an-object-id/read')
      .set(buyerAuth);

    expect(response.status).toBe(400);
  });
});
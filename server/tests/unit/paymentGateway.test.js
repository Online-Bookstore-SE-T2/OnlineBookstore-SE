const crypto = require('crypto');

let config;
let gateway;
let fetchMock;

function reply(status, body) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
}

describe('Razorpay payment gateway adapter', () => {
  beforeEach(() => {
    jest.resetModules();
    config = require('../../src/config/env').config;
    config.paymentProvider = 'razorpay';
    config.razorpayKeyId = 'rzp_test_notarealkey';
    config.razorpayKeySecret = 'not_a_real_secret';
    fetchMock = jest.spyOn(global, 'fetch');
    gateway = require('../../src/services/paymentGateway');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('creates an INR Razorpay order from the server-calculated amount, with order notes', async () => {
    fetchMock.mockReturnValue(reply(200, { id: 'order_TEST123456', amount: 12345, currency: 'INR', status: 'created' }));

    const result = await gateway.authorise({ id: 'order-1', buyer: 'buyer-1', totalAmount: 123.45 });

    expect(result.id).toBe('order_TEST123456');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.razorpay.com/v1/orders');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({
      amount: 12345,
      currency: 'INR',
      receipt: 'order-order-1',
      notes: { orderId: 'order-1', buyerId: 'buyer-1' },
    });
    const expectedAuth = `Basic ${Buffer.from('rzp_test_notarealkey:not_a_real_secret').toString('base64')}`;
    expect(options.headers.Authorization).toBe(expectedAuth);
  });

  test('retrieves an order and its payments, captures and refunds through the REST API', async () => {
    fetchMock
      .mockReturnValueOnce(reply(200, { id: 'order_TEST123456' }))
      .mockReturnValueOnce(reply(200, { entity: 'collection', items: [{ id: 'pay_TEST123456', status: 'authorized' }] }))
      .mockReturnValueOnce(reply(200, { id: 'pay_TEST123456', status: 'captured' }))
      .mockReturnValueOnce(reply(200, { id: 'rfnd_TEST123456', status: 'processed' }));

    await gateway.retrieveOrder('order_TEST123456');
    const payments = await gateway.listOrderPayments('order_TEST123456');
    const captured = await gateway.capturePayment('pay_TEST123456', 12345);
    await gateway.refundPayment('pay_TEST123456', { orderId: 'order-1' });

    expect(payments).toEqual([{ id: 'pay_TEST123456', status: 'authorized' }]);
    expect(captured.status).toBe('captured');
    expect(fetchMock.mock.calls.map(([url, options]) => `${options.method} ${url}`)).toEqual([
      'GET https://api.razorpay.com/v1/orders/order_TEST123456',
      'GET https://api.razorpay.com/v1/orders/order_TEST123456/payments',
      'POST https://api.razorpay.com/v1/payments/pay_TEST123456/capture',
      'POST https://api.razorpay.com/v1/payments/pay_TEST123456/refund',
    ]);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ amount: 12345, currency: 'INR' });
  });

  test('verifies the checkout signature (HMAC-SHA256 of order_id|payment_id) and rejects others', () => {
    const good = crypto.createHmac('sha256', 'not_a_real_secret').update('order_TEST123456|pay_TEST123456').digest('hex');

    expect(gateway.verifySignature('order_TEST123456', 'pay_TEST123456', good)).toBe(true);
    expect(gateway.verifySignature('order_TEST123456', 'pay_OTHER123456', good)).toBe(false);
    expect(gateway.verifySignature('order_TEST123456', 'pay_TEST123456', 'a'.repeat(64))).toBe(false);
    expect(gateway.verifySignature('order_TEST123456', 'pay_TEST123456', 'short')).toBe(false);
    expect(gateway.verifySignature('order_TEST123456', 'pay_TEST123456', undefined)).toBe(false);
  });

  test('a gateway error becomes a 502 without passing on the gateway response or the key', async () => {
    fetchMock.mockReturnValue(reply(400, { error: { code: 'BAD_REQUEST_ERROR', description: 'The id provided does not exist' } }));
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(gateway.retrieveOrder('order_MISSING12345')).rejects.toMatchObject({ status: 502, message: 'The payment gateway rejected the request.' });
    expect(logged.mock.calls.join(' ')).not.toContain('not_a_real_secret');
  });

  test('a network failure becomes a 502', async () => {
    fetchMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND api.razorpay.com'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(gateway.retrieveOrder('order_TEST123456')).rejects.toMatchObject({ status: 502 });
  });

  test('refuses to call Razorpay when it is not the configured provider or keys are missing', async () => {
    config.razorpayKeySecret = undefined;
    await expect(gateway.retrieveOrder('order_TEST123456')).rejects.toMatchObject({ status: 503 });
    config.paymentProvider = 'simulator';
    config.razorpayKeySecret = 'not_a_real_secret';
    await expect(gateway.retrieveOrder('order_TEST123456')).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('the simulator still authorises without any network call', async () => {
    config.paymentProvider = 'simulator';
    const result = await gateway.authorise({ id: 'order-1', buyer: 'buyer-1', totalAmount: 10 }, { outcome: 'success' });
    expect(result).toMatchObject({ status: 'succeeded' });
    expect(result.id).toMatch(/^SIM-/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

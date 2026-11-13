const { config, assertServerConfig } = require('../../src/config/env');

describe('server configuration check', () => {
  let saved;

  beforeEach(() => {
    saved = { ...config };
    Object.assign(config, {
      mongoUri: 'mongodb://127.0.0.1:27017/test',
      jwtSecret: 'test-secret',
      razorpayKeyId: undefined,
      razorpayKeySecret: undefined,
    });
  });

  afterEach(() => {
    Object.assign(config, saved);
  });

  test('production refuses the simulator by default', () => {
    Object.assign(config, { env: 'production', paymentProvider: 'simulator', allowPaymentSimulator: false });

    expect(() => assertServerConfig()).toThrow(/PAYMENT_PROVIDER=razorpay/);
  });

  test('production starts on the simulator when ALLOW_PAYMENT_SIMULATOR is set', () => {
    Object.assign(config, { env: 'production', paymentProvider: 'simulator', allowPaymentSimulator: true });

    expect(() => assertServerConfig()).not.toThrow();
  });

  test('production on Razorpay still needs both keys, whatever the simulator switch says', () => {
    Object.assign(config, { env: 'production', paymentProvider: 'razorpay', allowPaymentSimulator: true });

    expect(() => assertServerConfig()).toThrow(/RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET/);
  });
});

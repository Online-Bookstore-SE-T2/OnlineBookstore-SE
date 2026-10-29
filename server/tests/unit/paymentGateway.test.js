jest.mock('stripe', () => jest.fn());

let Stripe;
let config;
let gateway;
let stripeClient;

describe('Stripe payment gateway adapter', () => {
  beforeEach(() => {
    jest.resetModules();
    Stripe = require('stripe');
    config = require('../../src/config/env').config;
    config.paymentProvider = 'stripe';
    config.stripeSecretKey = 'sk_test_not_a_real_key';
    stripeClient = {
      paymentIntents: {
        create: jest.fn().mockResolvedValue({
          id: 'pi_test_1',
          client_secret: 'pi_test_1_secret',
        }),
        retrieve: jest.fn().mockResolvedValue({ id: 'pi_test_1' }),
        cancel: jest.fn().mockResolvedValue({ id: 'pi_test_1', status: 'canceled' }),
      },
    };
    Stripe.mockImplementation(() => stripeClient);
    gateway = require('../../src/services/paymentGateway');
  });

  test('creates an INR test payment intent using server-calculated amount and order metadata', async () => {
    const order = { id: 'order-1', buyer: 'buyer-1', totalAmount: 123.45 };
    const intent = await gateway.authorise(order);

    expect(intent.client_secret).toBe('pi_test_1_secret');
    expect(stripeClient.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 12345,
        currency: 'inr',
        payment_method_types: ['card'],
        metadata: { orderId: 'order-1', buyerId: 'buyer-1' },
      }),
      { idempotencyKey: 'order-order-1' },
    );
  });

  test('delegates retrieval and cancellation to the provider', async () => {
    await gateway.retrieve('pi_test_1');
    await gateway.cancel('pi_test_1');
    expect(stripeClient.paymentIntents.retrieve).toHaveBeenCalledWith('pi_test_1');
    expect(stripeClient.paymentIntents.cancel).toHaveBeenCalledWith('pi_test_1');
  });
});

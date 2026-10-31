jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

let nodemailer;
let config;
let dispatchOrderEvent;

describe('order e-mail delivery', () => {
  const order = {
    id: 'order-123',
    status: 'Paid',
    totalAmount: 99.5,
    payment: { status: 'Paid' },
  };
  const recipient = { email: 'buyer@example.test' };

  beforeEach(() => {
    jest.resetModules();
    nodemailer = require('nodemailer');
    config = require('../../src/config/env').config;
    dispatchOrderEvent = require('../../src/services/emailService').dispatchOrderEvent;
    config.smtp = {
      host: 'smtp.example.test',
      port: 587,
      user: 'user',
      pass: 'password',
      from: 'bookstore@example.test',
    };
    nodemailer.createTransport.mockReset();
  });

  test('uses STARTTLS on port 587 and retries transient failures', async () => {
    const sendMail = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('temporary disconnect'), { code: 'ECONNECTION' }))
      .mockResolvedValueOnce({});
    nodemailer.createTransport.mockReturnValue({ sendMail });

    await expect(dispatchOrderEvent('payment', order, recipient)).resolves.toBeUndefined();

    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      port: 587,
      secure: false,
      requireTLS: true,
    }));
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail.mock.calls[0][0]).toMatchObject({
      to: recipient.email,
      text: expect.stringContaining(order.id),
    });
  });

  test('logs permanent delivery failures without rejecting the caller', async () => {
    const sendMail = jest.fn().mockRejectedValue(Object.assign(new Error('recipient rejected'), { responseCode: 550 }));
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    nodemailer.createTransport.mockReturnValue({ sendMail });

    await expect(dispatchOrderEvent('placed', order, recipient)).resolves.toBeUndefined();
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('Order e-mail delivery failed:', 'recipient rejected');
    log.mockRestore();
  });
});

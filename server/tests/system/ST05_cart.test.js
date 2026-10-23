const request = require('supertest');
const { testApp } = require('../helpers/app');
const { useTestDatabase } = require('../helpers/db');
const { seedMarketplace } = require('../helpers/fixtures');
const { tokenFor, bearer } = require('../helpers/auth');

useTestDatabase();

describe('ST05 Shopping Cart', () => {
    let app;
    let data;
    let buyerAuth;
    let secondBuyerAuth;

    beforeEach(async() => {
        app = testApp();
        data = await seedMarketplace();

        const buyerToken = await tokenFor(app, data.users['U-B01']);
        const secondBuyerToken = await tokenFor(app, data.users['U-B02']);

        buyerAuth = bearer(buyerToken);
        secondBuyerAuth = bearer(secondBuyerToken);
    });

    test('TC-CART-01: authenticated buyer can get an empty cart', async() => {
        const res = await request(app)
            .get('/api/cart')
            .set(buyerAuth);

        expect(res.status).toBe(200);
        expect(res.body.cart).toBeDefined();
        expect(res.body.cart.items).toEqual([]);
        expect(res.body.cart.buyer).toBe(data.users['U-B01'].id);
    });

    test('TC-CART-02: buyer can add a valid listing to the cart', async() => {
        const res = await request(app)
            .post('/api/cart/items')
            .set(buyerAuth)
            .send({
                listingId: data.listings.L01.id,
                quantity: 2,
            });

        expect(res.status).toBe(200);
        expect(res.body.cart.items).toHaveLength(1);
        expect(res.body.cart.items[0].listing).toBe(data.listings.L01.id);
        expect(res.body.cart.items[0].quantity).toBe(2);
    });

    test('TC-CART-03: adding the same listing increases its quantity', async() => {
        await request(app)
            .post('/api/cart/items')
            .set(buyerAuth)
            .send({
                listingId: data.listings.L01.id,
                quantity: 2,
            });

        const res = await request(app)
            .post('/api/cart/items')
            .set(buyerAuth)
            .send({
                listingId: data.listings.L01.id,
                quantity: 2,
            });

        expect(res.status).toBe(200);
        expect(res.body.cart.items).toHaveLength(1);
        expect(res.body.cart.items[0].quantity).toBe(4);
    });

    test('TC-CART-04: adding more than available stock is rejected', async() => {
        const res = await request(app)
            .post('/api/cart/items')
            .set(buyerAuth)
            .send({
                listingId: data.listings.L01.id,
                quantity: 6,
            });

        expect(res.status).toBe(409);
        expect(res.body.error.message).toMatch(/available/i);
    });

    test('TC-CART-05: adding a nonexistent listing is rejected', async() => {
        const res = await request(app)
            .post('/api/cart/items')
            .set(buyerAuth)
            .send({
                listingId: '507f1f77bcf86cd799439011',
                quantity: 1,
            });

        expect(res.status).toBe(404);
        expect(res.body.error.message).toMatch(/listing/i);
    });

    test('TC-CART-06: invalid quantity is rejected', async() => {
        const res = await request(app)
            .post('/api/cart/items')
            .set(buyerAuth)
            .send({
                listingId: data.listings.L01.id,
                quantity: 0,
            });

        expect(res.status).toBe(400);
        expect(res.body.error.message).toMatch(/quantity/i);
    });

    test('TC-CART-07: buyer can update an existing cart item quantity', async() => {
        await request(app)
            .post('/api/cart/items')
            .set(buyerAuth)
            .send({
                listingId: data.listings.L01.id,
                quantity: 2,
            });

        const res = await request(app)
            .patch(`/api/cart/items/${data.listings.L01.id}`)
            .set(buyerAuth)
            .send({
                quantity: 4,
            });

        expect(res.status).toBe(200);
        expect(res.body.cart.items[0].quantity).toBe(4);
    });

    test('TC-CART-08: updating beyond available stock is rejected', async() => {
        await request(app)
            .post('/api/cart/items')
            .set(buyerAuth)
            .send({
                listingId: data.listings.L01.id,
                quantity: 1,
            });

        const res = await request(app)
            .patch(`/api/cart/items/${data.listings.L01.id}`)
            .set(buyerAuth)
            .send({
                quantity: 6,
            });

        expect(res.status).toBe(409);
        expect(res.body.error.message).toMatch(/available/i);
    });

    test('TC-CART-09: buyer can remove an item from the cart', async() => {
        await request(app)
            .post('/api/cart/items')
            .set(buyerAuth)
            .send({
                listingId: data.listings.L01.id,
                quantity: 1,
            });

        const res = await request(app)
            .delete(`/api/cart/items/${data.listings.L01.id}`)
            .set(buyerAuth);

        expect(res.status).toBe(200);
        expect(res.body.cart.items).toEqual([]);
    });

    test('TC-CART-10: buyer can clear the entire cart', async() => {
        await request(app)
            .post('/api/cart/items')
            .set(buyerAuth)
            .send({
                listingId: data.listings.L01.id,
                quantity: 1,
            });

        await request(app)
            .post('/api/cart/items')
            .set(buyerAuth)
            .send({
                listingId: data.listings.L04.id,
                quantity: 1,
            });

        const res = await request(app)
            .delete('/api/cart')
            .set(buyerAuth);

        expect(res.status).toBe(200);
        expect(res.body.cart.items).toEqual([]);
    });

    test('TC-CART-11: unauthenticated users cannot access the cart', async() => {
        const res = await request(app)
            .get('/api/cart');

        expect(res.status).toBe(401);
    });

    test('TC-CART-12: one buyer cannot see another buyer cart', async() => {
        await request(app)
            .post('/api/cart/items')
            .set(buyerAuth)
            .send({
                listingId: data.listings.L01.id,
                quantity: 1,
            });

        const res = await request(app)
            .get('/api/cart')
            .set(secondBuyerAuth);

        expect(res.status).toBe(200);
        expect(res.body.cart.items).toEqual([]);
        expect(res.body.cart.buyer).toBe(data.users['U-B02'].id);
    });
});
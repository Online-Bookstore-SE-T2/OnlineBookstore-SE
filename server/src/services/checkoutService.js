const mongoose = require('mongoose');
const { Cart, Listing, User, Order } = require('../models');
const {
    LISTING_STATUS,
    ROLES,
    ORDER_STATUS,
} = require('../constants');
const { AppError } = require('../utils/errors');

function getAddress(user, addressId) {
    if (!mongoose.isValidObjectId(addressId)) {
        throw new AppError(400, 'A valid saved delivery address is required.');
    }

    const address = user.addresses.id(addressId);

    if (!address) {
        throw new AppError(404, 'Saved delivery address not found.');
    }

    return address;
}

async function getBuyerCart(userId, session) {
    const cart = await Cart.findOne({ buyer: userId }).session(session);

    if (!cart || cart.items.length === 0) {
        throw new AppError(400, 'Your cart is empty.');
    }

    return cart;
}

async function validateCheckout(userId, addressId) {
    if (!mongoose.isValidObjectId(addressId)) {
        throw new AppError(400, 'A valid saved delivery address is required.');
    }

    const user = await User.findById(userId);

    if (!user) {
        throw new AppError(401, 'User session is invalid.');
    }

    if (user.role !== ROLES.BUYER) {
        throw new AppError(403, 'Only buyers can check out.');
    }

    const address = getAddress(user, addressId);
    const cart = await Cart.findOne({ buyer: userId });

    if (!cart || cart.items.length === 0) {
        throw new AppError(400, 'Your cart is empty.');
    }

    const items = [];
    let totalPaise = 0;

    for (const cartItem of cart.items) {
        const listing = await Listing.findById(cartItem.listing)
            .populate('book')
            .populate('seller');

        if (!listing || listing.status !== LISTING_STATUS.ACTIVE) {
            throw new AppError(409, 'A cart item is no longer available.');
        }

        if (!listing.book ||
            !listing.seller ||
            !Number.isSafeInteger(cartItem.quantity) ||
            cartItem.quantity < 1
        ) {
            throw new AppError(409, 'A cart item has invalid or missing data.');
        }

        if (listing.quantity < cartItem.quantity) {
            throw new AppError(
                409,
                `Only ${listing.quantity} item(s) are available for one of your cart items.`
            );
        }

        const unitPricePaise = Math.round(listing.price * 100);
        const subtotalPaise = unitPricePaise * cartItem.quantity;

        totalPaise += subtotalPaise;

        if (!Number.isSafeInteger(totalPaise)) {
            throw new AppError(400, 'The order total is too large.');
        }

        items.push({
            listingId: listing._id,
            bookId: listing.book._id,
            title: listing.book.title,
            sellerId: listing.seller._id,
            quantity: cartItem.quantity,
            unitPrice: unitPricePaise / 100,
            subtotal: subtotalPaise / 100,
            condition: listing.condition,
            availableQuantity: listing.quantity,
        });
    }

    return {
        address: {
            id: address._id,
            line: address.line,
            city: address.city,
            state: address.state,
            postalCode: address.postalCode,
        },
        items,
        subtotal: totalPaise / 100,
        deliveryCharge: 0,
        totalAmount: totalPaise / 100,
        currency: 'INR',
    };
}

async function createOrder(userId, addressId) {
    const session = await mongoose.startSession();
    let createdOrder;

    try {
        await session.withTransaction(async() => {
            const user = await User.findById(userId).session(session);

            if (!user) {
                throw new AppError(401, 'User session is invalid.');
            }

            if (user.role !== ROLES.BUYER) {
                throw new AppError(403, 'Only buyers can place orders.');
            }

            const address = getAddress(user, addressId);
            const cart = await getBuyerCart(userId, session);

            const orderItems = [];
            let totalPaise = 0;

            for (const cartItem of cart.items) {
                const quantity = cartItem.quantity;

                if (!Number.isSafeInteger(quantity) ||
                    quantity < 1
                ) {
                    throw new AppError(
                        409,
                        'A cart item has an invalid quantity.'
                    );
                }

                const listing = await Listing.findById(cartItem.listing)
                    .session(session)
                    .populate({
                        path: 'book',
                        options: { session },
                    })
                    .populate({
                        path: 'seller',
                        options: { session },
                    });

                if (!listing ||
                    listing.status !== LISTING_STATUS.ACTIVE ||
                    !listing.book ||
                    !listing.seller
                ) {
                    throw new AppError(
                        409,
                        'A cart item is no longer available.'
                    );
                }

                const unitPricePaise = Math.round(listing.price * 100);

                if (!Number.isSafeInteger(unitPricePaise) ||
                    unitPricePaise < 0
                ) {
                    throw new AppError(
                        409,
                        'A listing has an invalid price.'
                    );
                }

                // Atomically reduce stock only if enough stock remains.
                // $expr avoids the Mongoose quantity-query casting error.
		const updatedListing = await Listing.findOneAndUpdate(
    {
        _id: listing._id,
        status: LISTING_STATUS.ACTIVE,
        quantity: mongoose.trusted({ $gte: quantity }),
    },
    {
        $inc: { quantity: -quantity },
    },
    {
        new: true,
        session,
    }
);
                

                if (!updatedListing) {
                    throw new AppError(
                        409,
                        'Stock changed or is insufficient. Please review your cart.'
                    );
                }

                totalPaise += unitPricePaise * quantity;

                if (!Number.isSafeInteger(totalPaise)) {
                    throw new AppError(
                        400,
                        'The order total is too large.'
                    );
                }

                orderItems.push({
                    listing: listing._id,
                    book: listing.book._id,
                    seller: listing.seller._id,
                    quantity,
                    unitPrice: unitPricePaise / 100,
                });
            }

            const [order] = await Order.create(
                [{
                    buyer: user._id,
                    items: orderItems,
                    deliveryAddress: {
                        line: address.line,
                        city: address.city,
                        state: address.state,
                        postalCode: address.postalCode,
                    },
                    deliveryCharge: 0,
                    totalAmount: totalPaise / 100,
                    status: ORDER_STATUS.PLACED,
                    payment: {
                        status: 'Pending',
                    },
                }, ], { session }
            );

            const cartResult = await Cart.updateOne({
                _id: cart._id,
                buyer: user._id,
            }, {
                $set: { items: [] },
            }, { session });

            if (cartResult.matchedCount !== 1) {
                throw new AppError(
                    409,
                    'The cart changed. Please try again.'
                );
            }

            createdOrder = order;
        });

        return createdOrder;
    } finally {
        await session.endSession();
    }
}

module.exports = {
    validateCheckout,
    createOrder,
};
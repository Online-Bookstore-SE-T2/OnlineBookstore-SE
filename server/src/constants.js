// Domain constants shared by models, services and validation.

const ROLES = Object.freeze({
  BUYER: 'Buyer',
  SELLER: 'Seller',
  ADMINISTRATOR: 'Administrator',
});

// Appendix B: Account Status is Active, Suspended or Deleted.
const ACCOUNT_STATUS = Object.freeze({
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  DELETED: 'Deleted',
});

// Appendix B: Reject Reason Code (4 characters) recorded when a seller request is rejected.
const REJECT_REASON_CODES = Object.freeze(['INCD', 'DUPL', 'POLV', 'OTHR']);

const SELLER_REQUEST_STATUS = Object.freeze({
  NONE: 'None',
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
});

// REQ-13: order states.
const ORDER_STATUS = Object.freeze({
  PLACED: 'Placed',
  PAID: 'Paid',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
});

// "Open order" = Placed, Paid or Shipped (Test Case Design assumption A1).
const OPEN_ORDER_STATUSES = Object.freeze([ORDER_STATUS.PLACED, ORDER_STATUS.PAID, ORDER_STATUS.SHIPPED]);

// REQ-18: condition of a listed copy.
const LISTING_CONDITIONS = Object.freeze(['New', 'Like New', 'Good', 'Acceptable']);

const LISTING_STATUS = Object.freeze({
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
});

module.exports = {
  ROLES,
  ACCOUNT_STATUS,
  REJECT_REASON_CODES,
  SELLER_REQUEST_STATUS,
  ORDER_STATUS,
  OPEN_ORDER_STATUSES,
  LISTING_CONDITIONS,
  LISTING_STATUS,
};

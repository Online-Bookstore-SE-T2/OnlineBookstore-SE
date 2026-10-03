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

module.exports = { ROLES, ACCOUNT_STATUS, REJECT_REASON_CODES };

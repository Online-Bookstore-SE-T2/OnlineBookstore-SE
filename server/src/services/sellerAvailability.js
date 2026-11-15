const User = require('../models/User');
const { ACCOUNT_STATUS, ROLES } = require('../constants');

function activeSellerMatch() {
  return { role: ROLES.SELLER, status: ACCOUNT_STATUS.ACTIVE, deletedAt: null };
}

function activeSellerPopulate(select = 'name') {
  return { path: 'seller', select, match: activeSellerMatch() };
}

function activeSellerIds() {
  return User.distinct('_id', activeSellerMatch());
}

module.exports = { activeSellerMatch, activeSellerPopulate, activeSellerIds };

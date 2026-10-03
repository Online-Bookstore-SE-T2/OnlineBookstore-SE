// Registers every Mongoose model so indexes are built at start-up.
const User = require('./User');
const RevokedToken = require('./RevokedToken');

module.exports = { User, RevokedToken };

// Registers every Mongoose model so indexes are built at start-up.
const User = require('./User');
const RevokedToken = require('./RevokedToken');
const AuditLog = require('./AuditLog');
const Category = require('./Category');
const Book = require('./Book');
const Listing = require('./Listing');
const Review = require('./Review');
const Order = require('./Order');

module.exports = { User, RevokedToken, AuditLog, Category, Book, Listing, Review, Order };

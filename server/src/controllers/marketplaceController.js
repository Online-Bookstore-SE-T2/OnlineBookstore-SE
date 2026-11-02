const reviews = require('../services/reviewService');
const listings = require('../services/listingService');
const { getBookDetails } = require('../services/bookDetailsService');

function id(req) { return req.user.id || req.user._id; }

async function details(req, res) { res.json(await getBookDetails(req.params.bookId)); }
async function listReviews(req, res) { res.json(await reviews.listReviews(req.params.bookId, req.query.page)); }
async function getMyReview(req, res) { res.json({ review: await reviews.myReview(id(req), req.params.bookId) }); }
async function createReview(req, res) { res.status(201).json({ review: await reviews.createReview(id(req), req.params.bookId, req.body) }); }
async function updateReview(req, res) { res.json(await reviews.updateMyReview(id(req), req.params.bookId, req.body)); }
async function listPublicListings(req, res) { res.json(await listings.publicListings(req.params.bookId)); }
async function createListing(req, res) { res.status(201).json({ listing: await listings.createListing(id(req), req.body) }); }
async function listMyListings(req, res) { res.json(await listings.myListings(id(req), req.query.page)); }
async function updateListing(req, res) { res.json({ listing: await listings.updateListing(id(req), req.params.listingId, req.body) }); }
async function removeListing(req, res) { res.json({ listing: await listings.removeListing(id(req), req.params.listingId) }); }
async function requestListingRemoval(req, res) {
  const result = await listings.requestListingRemoval(id(req), req.params.listingId, req.body);
  res.status(result.created ? 201 : 200).json({ request: result.request });
}
async function listMyListingRemovalRequests(req, res) {
  res.json(await listings.myListingRemovalRequests(id(req), req.query.page));
}

module.exports = { details, listReviews, getMyReview, createReview, updateReview, listPublicListings, createListing, listMyListings, updateListing, removeListing, requestListingRemoval, listMyListingRemovalRequests };

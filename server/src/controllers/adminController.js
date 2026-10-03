const adminService = require('../services/adminService');
const auditService = require('../services/auditService');
const strings = require('../resources/strings');

function page(result) {
  return { ...result, items: result.items.map((doc) => doc.toJSON()) };
}

function done(res, record) {
  res.json({ message: strings.admin.done, record: record.toJSON() });
}

// POST /api/admin/:entity/query - one page of records. Search terms travel in the body so that
// personal data never appears in a URL (SRS 6.3).
async function listRecords(req, res) {
  res.json(page(await adminService.listRecords(req.params.entity, req.body)));
}

// GET /api/admin/:entity/:id
async function getRecord(req, res) {
  res.json({ record: (await adminService.getRecord(req.params.entity, req.params.id)).toJSON() });
}

// DELETE /api/admin/:entity/:id - soft delete (SRS 6.2)
async function deleteRecord(req, res) {
  done(res, await adminService.deleteRecord(req.user, req.params.entity, req.params.id));
}

// POST /api/admin/:entity/:id/restore - within 30 days of deletion
async function restoreRecord(req, res) {
  done(res, await adminService.restoreRecord(req.user, req.params.entity, req.params.id));
}

async function suspendUser(req, res) {
  done(res, await adminService.suspendUser(req.user, req.params.id));
}

async function reinstateUser(req, res) {
  done(res, await adminService.reinstateUser(req.user, req.params.id));
}

async function promoteUser(req, res) {
  done(res, await adminService.promoteToAdministrator(req.user, req.params.id));
}

// GET /api/admin/seller-requests?page=n
async function listSellerRequests(req, res) {
  res.json(page(await adminService.listSellerRequests({ page: req.query.page })));
}

async function approveSellerRequest(req, res) {
  done(res, await adminService.approveSellerRequest(req.user, req.params.id));
}

async function rejectSellerRequest(req, res) {
  done(res, await adminService.rejectSellerRequest(req.user, req.params.id, req.body));
}

async function setBookAvailability(req, res) {
  done(res, await adminService.setBookAvailability(req.user, req.params.id, req.body));
}

async function suspendListing(req, res) {
  done(res, await adminService.suspendListing(req.user, req.params.id));
}

async function reinstateListing(req, res) {
  done(res, await adminService.reinstateListing(req.user, req.params.id));
}

async function createCategory(req, res) {
  const category = await adminService.createCategory(req.user, req.body);
  res.status(201).json({ message: strings.admin.done, record: category.toJSON() });
}

async function renameCategory(req, res) {
  done(res, await adminService.renameCategory(req.user, req.params.id, req.body));
}

// GET /api/admin/audit-log?page=n
async function auditLog(req, res) {
  const page = Number(req.query.page);
  res.json(page > 0 ? await auditService.list({ page: Math.floor(page) }) : await auditService.list());
}

module.exports = {
  listRecords,
  getRecord,
  deleteRecord,
  restoreRecord,
  suspendUser,
  reinstateUser,
  promoteUser,
  listSellerRequests,
  approveSellerRequest,
  rejectSellerRequest,
  setBookAvailability,
  suspendListing,
  reinstateListing,
  createCategory,
  renameCategory,
  auditLog,
};

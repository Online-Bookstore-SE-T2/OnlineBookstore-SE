import { apiRequest } from '../../api/http.js';
import strings from '../../resources/strings.js';
import { formatDate, formatDateTime, formatINR } from '../../utils/format.js';
import CategoryCreateForm from './CategoryCreateForm.jsx';

// Table and action definitions for each administration section (REQ-4).
// Columns: { key, label, render(row, ctx) }. Actions: { key, label, visible?, confirm?, form?, run }.

const t = strings.admin;
const c = t.columns;

const post = (path, body) => apiRequest(path, { method: 'POST', body });
const remove = (entity) => ({
  key: 'delete',
  label: t.delete,
  confirm: (row) => ({ title: t.confirm.deleteTitle, message: t.confirm.deleteMessage(LABELS[entity](row)) }),
  run: (row) => apiRequest(`/admin/${entity}/${row.id}`, { method: 'DELETE' }),
});

const StatusBadge = ({ value }) => <span className={value === 'Active' ? 'badge' : 'badge badge-strong'}>{value}</span>;

const LABELS = {
  users: (row) => row.name,
  books: (row) => row.title,
  categories: (row) => row.name,
  listings: (row) => `${row.book?.title || 'book'} listing by ${row.seller?.name || 'seller'}`,
  reviews: (row) => `review of ${row.book?.title || 'book'} by ${row.user?.name || 'user'}`,
  orders: (row) => `order ${row.id.slice(-6)}`,
};

const isSelf = (row, ctx) => row.id === ctx.currentUserId;

const userColumns = [
  { key: 'name', label: c.name, render: (row, ctx) => (isSelf(row, ctx) ? `${row.name} ${t.you}` : row.name) },
  { key: 'email', label: c.email, render: (row) => row.email },
  { key: 'role', label: c.role, render: (row) => row.role },
  { key: 'status', label: c.status, render: (row) => <StatusBadge value={row.status} /> },
  { key: 'registered', label: c.registered, render: (row) => formatDate(row.registrationDate) },
];

const userActions = [
  {
    key: 'suspend',
    label: t.suspend,
    visible: (row, ctx) => row.status === 'Active' && !isSelf(row, ctx),
    confirm: (row) => ({ title: t.confirm.suspendTitle, message: t.confirm.suspendMessage(row.name) }),
    run: (row) => post(`/admin/users/${row.id}/suspend`),
  },
  {
    key: 'reinstate',
    label: t.reinstate,
    visible: (row, ctx) => row.status === 'Suspended' && !isSelf(row, ctx),
    run: (row) => post(`/admin/users/${row.id}/reinstate`),
  },
  {
    key: 'promote',
    label: t.promote,
    visible: (row) => row.role !== 'Administrator',
    confirm: (row) => ({ title: t.confirm.promoteTitle, message: t.confirm.promoteMessage(row.name) }),
    run: (row) => post(`/admin/users/${row.id}/promote`),
  },
  { ...remove('users'), visible: (row, ctx) => !isSelf(row, ctx) },
];

const users = {
  id: 'users',
  entity: 'users',
  title: t.tabs.users,
  searchable: true,
  restorable: true,
  filters: [
    { name: 'role', label: c.role, options: ['Buyer', 'Seller', 'Administrator'] },
    { name: 'status', label: c.status, options: ['Active', 'Suspended'] },
  ],
  columns: userColumns,
  actions: userActions,
  label: LABELS.users,
};

const sellers = {
  ...users,
  id: 'sellers',
  title: t.tabs.sellers,
  fixedFilters: { role: 'Seller' },
  filters: [{ name: 'status', label: c.status, options: ['Active', 'Suspended'] }],
  columns: userColumns.filter((column) => column.key !== 'role'),
};

const sellerRequests = {
  id: 'sellerRequests',
  entity: 'users',
  title: t.tabs.sellerRequests,
  load: ({ page }) => apiRequest(`/admin/seller-requests?page=${page}`),
  emptyMessage: t.noPendingRequests,
  columns: [
    { key: 'name', label: c.name, render: (row) => row.name },
    { key: 'email', label: c.email, render: (row) => row.email },
    { key: 'note', label: c.note, render: (row) => row.sellerRequest?.note || '-' },
    { key: 'requested', label: c.requested, render: (row) => formatDate(row.sellerRequest?.requestedAt) },
  ],
  actions: [
    { key: 'approve', label: t.approve, run: (row) => post(`/admin/users/${row.id}/seller-request/approve`) },
    {
      key: 'reject',
      label: t.reject,
      confirm: (row) => ({ title: t.confirm.rejectTitle, message: t.confirm.rejectMessage(row.name) }),
      form: {
        type: 'select',
        field: 'reasonCode',
        label: t.reasonLabel,
        requiredMessage: t.reasonRequired,
        options: Object.entries(strings.rejectReasons).map(([code, label]) => [code, `${code} - ${label}`]),
      },
      run: (row, reasonCode) => post(`/admin/users/${row.id}/seller-request/reject`, { reasonCode }),
    },
  ],
  label: LABELS.users,
};

const books = {
  id: 'books',
  entity: 'books',
  title: t.tabs.books,
  searchable: true,
  restorable: true,
  columns: [
    { key: 'title', label: c.title, render: (row) => row.title },
    { key: 'author', label: c.author, render: (row) => row.author },
    { key: 'isbn', label: c.isbn, render: (row) => row.isbn },
    { key: 'category', label: c.category, render: (row) => row.category?.name || '-' },
    { key: 'availability', label: c.availability, render: (row) => (row.markedUnavailable ? t.unavailable : t.available) },
  ],
  actions: [
    {
      key: 'unavailable',
      label: t.markUnavailable,
      visible: (row) => !row.markedUnavailable,
      run: (row) => apiRequest(`/admin/books/${row.id}/availability`, { method: 'PATCH', body: { available: false } }),
    },
    {
      key: 'available',
      label: t.markAvailable,
      visible: (row) => row.markedUnavailable,
      run: (row) => apiRequest(`/admin/books/${row.id}/availability`, { method: 'PATCH', body: { available: true } }),
    },
    remove('books'),
  ],
  label: LABELS.books,
};

const categories = {
  id: 'categories',
  entity: 'categories',
  title: t.tabs.categories,
  searchable: true,
  restorable: true,
  viewable: false,
  toolbar: ({ onDone }) => <CategoryCreateForm onDone={onDone} />,
  columns: [
    { key: 'name', label: c.name, render: (row) => row.name },
    { key: 'created', label: c.created, render: (row) => formatDate(row.createdAt) },
  ],
  actions: [
    {
      key: 'rename',
      label: t.rename,
      form: {
        type: 'text',
        field: 'name',
        title: t.renameTitle,
        label: t.categoryNameLabel,
        requiredMessage: strings.validation.required(t.categoryNameLabel),
        initial: (row) => row.name,
      },
      run: (row, name) => apiRequest(`/admin/categories/${row.id}`, { method: 'PATCH', body: { name } }),
    },
    remove('categories'),
  ],
  label: LABELS.categories,
};

const listings = {
  id: 'listings',
  entity: 'listings',
  title: t.tabs.listings,
  restorable: true,
  filters: [{ name: 'status', label: c.status, options: ['Active', 'Suspended'] }],
  columns: [
    { key: 'book', label: c.book, render: (row) => row.book?.title || '-' },
    { key: 'seller', label: c.seller, render: (row) => row.seller?.name || '-' },
    { key: 'condition', label: c.condition, render: (row) => row.condition },
    { key: 'price', label: c.price, render: (row) => formatINR(row.price) },
    { key: 'quantity', label: c.quantity, render: (row) => row.quantity },
    { key: 'status', label: c.status, render: (row) => <StatusBadge value={row.status} /> },
  ],
  actions: [
    {
      key: 'suspend',
      label: t.suspend,
      visible: (row) => row.status === 'Active',
      confirm: (row) => ({ title: t.confirm.suspendListingTitle, message: t.confirm.suspendListingMessage(LABELS.listings(row)) }),
      run: (row) => post(`/admin/listings/${row.id}/suspend`),
    },
    {
      key: 'reinstate',
      label: t.reinstate,
      visible: (row) => row.status === 'Suspended',
      run: (row) => post(`/admin/listings/${row.id}/reinstate`),
    },
    remove('listings'),
  ],
  label: LABELS.listings,
};

const reviews = {
  id: 'reviews',
  entity: 'reviews',
  title: t.tabs.reviews,
  searchable: true,
  restorable: true,
  columns: [
    { key: 'book', label: c.book, render: (row) => row.book?.title || '-' },
    { key: 'reviewer', label: c.reviewer, render: (row) => row.user?.name || '-' },
    { key: 'rating', label: c.rating, render: (row) => `${row.rating}/5` },
    { key: 'text', label: c.text, render: (row) => (row.text && row.text.length > 80 ? `${row.text.slice(0, 80)}...` : row.text || '-') },
    { key: 'created', label: c.created, render: (row) => formatDate(row.createdAt) },
  ],
  actions: [remove('reviews')],
  label: LABELS.reviews,
};

const orders = {
  id: 'orders',
  entity: 'orders',
  title: t.tabs.orders,
  restorable: true,
  columns: [
    { key: 'order', label: c.order, render: (row) => row.id.slice(-6) },
    { key: 'buyer', label: c.buyer, render: (row) => row.buyer?.name || '-' },
    { key: 'items', label: c.items, render: (row) => row.items.reduce((sum, item) => sum + item.quantity, 0) },
    { key: 'total', label: c.total, render: (row) => formatINR(row.totalAmount) },
    { key: 'status', label: c.status, render: (row) => row.status },
    { key: 'placed', label: c.placed, render: (row) => formatDate(row.createdAt) },
  ],
  actions: [remove('orders')],
  label: LABELS.orders,
};

const audit = {
  id: 'audit',
  entity: 'audit-log',
  title: t.tabs.audit,
  viewable: false,
  load: ({ page }) => apiRequest(`/admin/audit-log?page=${page}`),
  columns: [
    { key: 'time', label: c.time, render: (row) => formatDateTime(row.createdAt) },
    { key: 'actor', label: c.actor, render: (row) => row.actor?.name || '-' },
    { key: 'action', label: c.action, render: (row) => row.action },
    { key: 'target', label: c.target, render: (row) => `${row.targetType}: ${row.targetLabel || row.targetId}` },
    { key: 'details', label: c.details, render: (row) => (row.details ? JSON.stringify(row.details) : '-') },
  ],
  actions: [],
  label: (row) => row.id,
};

export const ADMIN_SECTIONS = [users, sellers, sellerRequests, books, categories, listings, reviews, orders, audit];

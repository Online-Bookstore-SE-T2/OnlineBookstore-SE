// Add sample stock through the same registration, approval and listing APIs as
// ordinary users. Re-running the script leaves existing offers untouched.
const baseUrl = process.env.DEMO_URL?.replace(/\/$/, '');
const sellerName = process.env.DEMO_SELLER_NAME;
const sellerEmail = process.env.DEMO_SELLER_EMAIL;
const sellerPassword = process.env.DEMO_SELLER_PASSWORD;
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;

if (![baseUrl, sellerName, sellerEmail, sellerPassword, adminEmail, adminPassword].every(Boolean)) {
  throw new Error('Set DEMO_URL, DEMO_SELLER_*, ADMIN_EMAIL and ADMIN_PASSWORD.');
}

async function api(method, path, { token, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`${method} ${path} failed: HTTP ${response.status} ${data.error?.code || ''}`.trim());
  }
  return data;
}

async function allPages(path, key, token) {
  const items = [];
  for (let page = 1; ; page++) {
    const separator = path.includes('?') ? '&' : '?';
    const result = await api('GET', `${path}${separator}page=${page}`, { token });
    items.push(...result[key]);
    if (page >= result.totalPages) return items;
  }
}

async function getSeller() {
  let session;
  try {
    session = await api('POST', '/api/auth/login', {
      body: { email: sellerEmail, password: sellerPassword },
    });
  } catch (error) {
    if (!error.message.includes('HTTP 401')) throw error;
    session = await api('POST', '/api/auth/register', {
      body: {
        name: sellerName,
        email: sellerEmail,
        password: sellerPassword,
        confirmPassword: sellerPassword,
      },
    });
  }

  if (session.user.role === 'Buyer') {
    const request = session.user.sellerRequest;
    if (request?.status === 'Rejected') throw new Error('Demo seller request was rejected.');
    if (request?.status !== 'Pending') {
      await api('POST', '/api/users/me/seller-request', {
        token: session.token,
        body: { note: 'Demo catalog inventory only; no physical fulfillment.' },
      });
    }
    const admin = await api('POST', '/api/auth/login', {
      body: { email: adminEmail, password: adminPassword },
    });
    if (admin.user.role !== 'Administrator') throw new Error('Admin account has the wrong role.');
    await api('POST', `/api/admin/users/${session.user.id}/seller-request/approve`, {
      token: admin.token,
    });
    session = await api('POST', '/api/auth/login', {
      body: { email: sellerEmail, password: sellerPassword },
    });
  }

  if (session.user.role !== 'Seller') throw new Error('Demo seller account has the wrong role.');
  return session;
}

const books = await allPages('/api/books', 'items');
const sampleBooks = books.filter((book) =>
  book.description?.includes('sample bookstore listing created for testing the catalogue')
  && !book.markedUnavailable
);
if (sampleBooks.length === 0 || sampleBooks.length > 100) {
  throw new Error(`Expected 1–100 available sample books; found ${sampleBooks.length}.`);
}

const seller = await getSeller();
const existing = await allPages('/api/listings/mine', 'listings', seller.token);
const existingIsbns = new Set(existing.map((listing) => listing.book?.isbn));
let created = 0;

for (const book of sampleBooks) {
  if (existingIsbns.has(book.isbn)) continue;
  await api('POST', '/api/listings', {
    token: seller.token,
    body: {
      isbn: book.isbn,
      price: book.price,
      quantity: 5,
      condition: 'New',
      notes: 'Demo sample stock; no physical book will be shipped.',
    },
  });
  created++;
  if (created % 20 === 0) console.log(`Created ${created} demo offers.`);
}

const available = await api('GET', '/api/books?available=true');
const first = await api('GET', `/api/books/${sampleBooks[0]._id}`);
if (!first.listings.some((listing) => listing.seller === sellerName && listing.quantity > 0)) {
  throw new Error('Sample book detail still has no active demo offer.');
}

console.log(`Sample books: ${sampleBooks.length}; new offers: ${created}; already present: ${sampleBooks.length - created}.`);
console.log(`Books available in catalog: ${available.total}.`);

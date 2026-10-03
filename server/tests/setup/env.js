// Test configuration. Values set here take precedence over server/.env (dotenv never overrides).
const baseUri = process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27017';
const worker = process.env.JEST_WORKER_ID || '1';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = `${baseUri}/online_bookstore_test_${worker}`;
process.env.JWT_SECRET = 'test-only-jwt-signing-key';
process.env.BCRYPT_ROUNDS = '10';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';

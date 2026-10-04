// Creates the first Administrator from ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD in server/.env.
// Registration can never create an administrator, so this is how the console is first reached.
// Usage: npm run seed:admin -w server
const { config, assertServerConfig } = require('../config/env');
const { connectDatabase, disconnectDatabase } = require('../config/db');
const User = require('../models/User');
const { ROLES } = require('../constants');
const { FieldValidator, LIMITS } = require('../validation/validators');
const { hashPassword } = require('../services/authService');

async function seedAdmin() {
  assertServerConfig();
  const v = new FieldValidator();
  const name = v.text('ADMIN_NAME', config.admin.name, { label: 'ADMIN_NAME', required: true, max: LIMITS.name });
  const email = v.email('ADMIN_EMAIL', config.admin.email);
  const password = v.password('ADMIN_PASSWORD', config.admin.password, { label: 'ADMIN_PASSWORD' });
  if (v.hasErrors) {
    throw new Error(`Invalid administrator settings in server/.env: ${Object.values(v.errors).join(' ')}`);
  }

  await connectDatabase(config.mongoUri);
  try {
    const existing = await User.findOne({ email });
    if (existing) {
      if (existing.role !== ROLES.ADMINISTRATOR) {
        throw new Error('ADMIN_EMAIL belongs to an existing non-administrator account. Use a different e-mail address.');
      }
      console.log('An administrator with ADMIN_EMAIL already exists. Nothing to do.');
      return;
    }
    await User.create({ name, email, passwordHash: await hashPassword(password), role: ROLES.ADMINISTRATOR });
    console.log('Administrator account created.');
  } finally {
    await disconnectDatabase();
  }
}

seedAdmin().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});

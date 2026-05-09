const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');

const seedAdmin = async () => {
  try {
    console.log('Starting admin seeding...');

    const adminData = {
      full_name: 'Mir Mujeeb',
      email: 'mirmujeeb@gmail.com',
      password: 'mmHpass26!',
      role: 'admin',
      status: 'Active',
    };

    // Hash the password
    const hashedPassword = await bcrypt.hash(adminData.password, 10);

    // Insert admin into users table
    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role, status) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (email) DO UPDATE 
       SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, full_name = EXCLUDED.full_name
       RETURNING id, full_name, email, role, status, created_on`,
      [adminData.full_name, adminData.email, hashedPassword, adminData.role, adminData.status]
    );

    console.log('✓ Admin successfully created/updated:');
    console.log(result.rows[0]);
    console.log('\nAdmin Login Credentials:');
    console.log('Email:', adminData.email);
    console.log('Password:', adminData.password);

    await pool.end();
  } catch (err) {
    console.error('Error seeding admin:', err.message);
    process.exit(1);
  }
};

seedAdmin();

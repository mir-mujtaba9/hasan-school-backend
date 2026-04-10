const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');

const seedTeacher = async () => {
  try {
    console.log('Starting teacher seeding...');

    const teacherData = {
      full_name: 'Aqsa Shabir',
      email: 'aqsa.shabir@gmail.com',
      password: 'Butmong@123',
      role: 'teacher',
      status: 'Active',
    };

    // Hash the password
    const hashedPassword = await bcrypt.hash(teacherData.password, 10);

    // Insert teacher into users table
    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role, status) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, full_name, email, role, status, created_on`,
      [teacherData.full_name, teacherData.email, hashedPassword, teacherData.role, teacherData.status]
    );

    console.log('✓ Teacher successfully created:');
    console.log(result.rows[0]);
    console.log('\nTeacher Login Credentials:');
    console.log('Email:', teacherData.email);
    console.log('Password:', teacherData.password);

    await pool.end();
  } catch (err) {
    console.error('Error seeding teacher:', err.message);
    if (err.code === '23505') {
      console.error('Email already exists in the database');
    }
    process.exit(1);
  }
};

seedTeacher();

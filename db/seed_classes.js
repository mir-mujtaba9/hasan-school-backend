const pool = require('../src/config/db');

const classes = [
  { name: 'KG', monthly_fee: 1300 },
  { name: 'Nursery', monthly_fee: 1400 },
  { name: 'Prep', monthly_fee: 1400 },
  { name: 'Class 1', monthly_fee: 1500 },
  { name: 'Class 2', monthly_fee: 1500 },
  { name: 'Class 3', monthly_fee: 1600 },
  { name: 'Class 4', monthly_fee: 1600 },
  { name: 'Class 5', monthly_fee: 1700 },
  { name: 'Class 6', monthly_fee: 1700 },
  { name: 'Class 7', monthly_fee: 1800 },
  { name: 'Class 8', monthly_fee: 2000 },
  { name: 'Class 9', monthly_fee: 2500 },
  { name: 'Class 10', monthly_fee: 2700 }
];

const seedClasses = async () => {
  try {
    console.log('Starting classes seeding...');

    for (const cls of classes) {
      await pool.query(
        `INSERT INTO classes (name, monthly_fee) 
         VALUES ($1, $2) 
         ON CONFLICT (name) DO UPDATE 
         SET monthly_fee = EXCLUDED.monthly_fee`,
        [cls.name, cls.monthly_fee]
      );
    }

    console.log('✓ Classes successfully seeded.');
    
    // Fetch and display the seeded classes
    const result = await pool.query('SELECT * FROM classes ORDER BY id ASC');
    console.table(result.rows);

    await pool.end();
  } catch (err) {
    console.error('Error seeding classes:', err.message);
    process.exit(1);
  }
};

seedClasses();

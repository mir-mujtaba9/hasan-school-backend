const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const nullIfEmpty = (val) => {
  const s = String(val ?? '').trim();
  return s === '' || s.toLowerCase() === 'nan' ? null : s;
};

const cleanPhone = (val) => {
  const s = nullIfEmpty(val);
  // Remove trailing .0 added when CSV reads phone numbers as floats
  return s ? s.replace(/\.0$/, '') : null;
};

const parseDate = (val) => {
  const s = nullIfEmpty(val);
  if (!s) return null;
  // Handle DD/MM/YYYY format
  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 3 && parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const seedStudents = async () => {
  try {
    console.log('\n📂 Reading CSV file...');

    const csvPath = path.join(__dirname, '..', 'students-10th.csv');

    if (!fs.existsSync(csvPath)) {
      throw new Error(`CSV file not found at: ${csvPath}`);
    }

    const csvData = fs.readFileSync(csvPath, 'utf8');
    const lines = csvData.split('\n').map(l => l.trim()).filter(Boolean);
    const headers = lines[0].split(',').map(h => h.trim());

    // Parse rows into named objects using headers (safe against index shifts)
    const rows = lines.slice(1).map(line => {
      const values = line.split(',');
      return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
    });

    console.log(`   Found ${rows.length} rows in CSV\n`);

    // Get real class_id and monthly_fee for Class 10 from DB
    const classRes = await pool.query(
      "SELECT id, monthly_fee FROM classes WHERE name = 'Class 10'"
    );
    if (classRes.rows.length === 0) {
      throw new Error('Class 10 not found in database. Run: psql "$DATABASE_URL" -f db/seed_classes.sql first.');
    }

    const realClassId = classRes.rows[0].id;
    const classMonthlyFee = parseFloat(classRes.rows[0].monthly_fee);

    console.log(`   Class 10 → id: ${realClassId}, monthly_fee: ${classMonthlyFee}\n`);

    // Discount multipliers matching your DB enum
    const factorMap = {
      'No Discount': 1,
      '25%': 0.75,
      '50%': 0.50,
      '75%': 0.25,
      '100%': 0,
    };

    let inserted = 0;
    let skipped = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2; // +2 because row 1 is headers, and humans count from 1

      const admission_no = nullIfEmpty(r.admission_no);
      const full_name = nullIfEmpty(r.full_name);

      // Skip empty or garbage rows (no name or no admission number)
      if (!full_name || !admission_no) {
        console.warn(`  ⚠  Row ${rowNum}: missing full_name or admission_no — skipped`);
        skipped++;
        continue;
      }

      const father_name = nullIfEmpty(r.father_name) || 'Unknown';
      const date_of_birth = parseDate(r.date_of_birth) || '2000-01-01';
      const gender = nullIfEmpty(r.gender) || 'Male';
      const religion = nullIfEmpty(r.religion) || 'Islam';
      const nationality = nullIfEmpty(r.nationality) || 'Pakistani';
      const father_phone = cleanPhone(r.father_phone) || '00000000000';
      const home_address = nullIfEmpty(r.home_address) || 'N/A';
      const admission_date = parseDate(r.admission_date) || new Date().toISOString().slice(0, 10);
      const status = nullIfEmpty(r.status) || 'Active';

      // Always recalculate fees from class fee + discount for data consistency
      const discount = nullIfEmpty(r.discount) || 'No Discount';
      const discounted_fee = classMonthlyFee * (factorMap[discount] ?? 1);

      // Fix: DB CHECK constraint requires discount_reason when discount != 'No Discount'
      let discount_reason = nullIfEmpty(r.discount_reason);
      if (discount !== 'No Discount' && !discount_reason) {
        discount_reason = 'From CSV import';
      }
      if (discount === 'No Discount') {
        discount_reason = null;
      }

      await pool.query(
        `INSERT INTO students (
          admission_no, full_name, father_name, date_of_birth, gender,
          religion, nationality, father_phone, home_address, admission_date,
          class_id, monthly_fee, discount, discounted_fee, discount_reason, status
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16
        ) ON CONFLICT (admission_no) DO NOTHING`,
        [
          admission_no,
          full_name,
          father_name,
          date_of_birth,
          gender,
          religion,
          nationality,
          father_phone,
          home_address,
          admission_date,
          realClassId,
          classMonthlyFee,
          discount,
          discounted_fee,
          discount_reason,
          status,
        ]
      );

      console.log(`  ✓  Row ${rowNum}: ${full_name} (${admission_no})`);
      inserted++;
    }

    console.log(`\n──────────────────────────────\n  ✅ Processed/Inserted : ${inserted}\n  ⚠️  Skipped  : ${skipped}\n──────────────────────────────\n`);

  } catch (err) {
    console.error('\n❌ Seeding failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

seedStudents();

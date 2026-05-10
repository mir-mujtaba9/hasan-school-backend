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
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[2];

            // Detect rollover (e.g. Feb 31st becomes March 3rd)
            const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
            if (isNaN(date.getTime()) || date.getUTCDate() !== parseInt(day)) {
                return `${year}-${month}-01`;
            }
            return `${year}-${month}-${day}`;
        }
    }

    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const seedStudents = async () => {
    try {
        console.log('\n📂 Reading CSV file...');

        const csvPath = path.join(__dirname, '..', 'students-5th-9th.csv');
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

        // ── Build class name → real DB id map ────────────────────────────────────
        // CSV uses class_id 5=Class5, 6=Class6 ... 9=Class9
        // But after re-seed DB ids are different (Class5=8, Class6=9, etc.)
        // So we look up by NAME to get the real DB id + monthly_fee
        const classRes = await pool.query(
            `SELECT id, name, monthly_fee
       FROM classes
       WHERE name IN ('Class 5','Class 6','Class 7','Class 8','Class 9')`
        );

        if (classRes.rows.length === 0) {
            throw new Error('No matching classes found. Run: psql "$DATABASE_URL" -f db/seed_classes.sql first.');
        }

        // Map: CSV class_id number (5-9) → { realId, monthlyFee, name }
        const csvClassIdToDb = {};
        classRes.rows.forEach(row => {
            const csvNum = parseInt(row.name.replace('Class ', ''));
            csvClassIdToDb[csvNum] = {
                realId: row.id,
                monthlyFee: parseFloat(row.monthly_fee),
                name: row.name,
            };
        });

        console.log('   Class mapping (CSV id → DB):');
        Object.entries(csvClassIdToDb).forEach(([csvId, info]) => {
            console.log(`     CSV class_id ${csvId} (${info.name}) → DB id ${info.realId}, fee Rs.${info.monthlyFee}`);
        });
        console.log();

        // Discount multipliers matching your DB enum
        const factorMap = {
            'No Discount': 1,
            '25%': 0.75,
            '50%': 0.50,
            '75%': 0.25,
            '100%': 0,
        };

        // Auto-admission counter for rows missing admission_no
        // Starts at 901 — safely above the highest existing number (464) in this CSV
        let autoAdmCounter = 901;

        let inserted = 0;
        let skipped = 0;

        await pool.query('BEGIN');

        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const rowNum = i + 2; // +2: row 1 is headers, humans count from 1

            const full_name = nullIfEmpty(r.full_name);
            const admission_no = nullIfEmpty(r.admission_no);

            // Skip rows with no name at all — nothing we can do
            if (!full_name) {
                console.warn(`  ⚠  Row ${rowNum}: missing full_name — skipped`);
                skipped++;
                continue;
            }

            // Auto-assign unique admission_no if missing, following ADM20-XXX pattern
            let finalAdmissionNo = admission_no;
            if (!finalAdmissionNo) {
                finalAdmissionNo = `ADM20-${autoAdmCounter++}`;
                console.log(`  ℹ  Row ${rowNum} (${full_name}): no admission_no — auto-assigned ${finalAdmissionNo}`);
            }

            // Resolve CSV class_id → real DB id
            const csvClassId = parseInt(nullIfEmpty(r.class_id));
            const classInfo = csvClassIdToDb[csvClassId];
            if (!classInfo) {
                console.warn(`  ⚠  Row ${rowNum} (${finalAdmissionNo}): unknown class_id ${csvClassId} — skipped`);
                skipped++;
                continue;
            }

            const father_name = nullIfEmpty(r.father_name) || 'Unknown';
            const date_of_birth = parseDate(r.date_of_birth) || '2000-01-01';
            const gender = nullIfEmpty(r.gender) || 'Male';
            const religion = nullIfEmpty(r.religion) || 'Islam';
            const nationality = nullIfEmpty(r.nationality) || 'Pakistani';
            const father_phone = cleanPhone(r.father_phone) || '00000000000';
            // nullIfEmpty prevents empty string bypassing the fallback
            const home_address = nullIfEmpty(r.home_address) || 'N/A';
            const admission_date = parseDate(r.admission_date) || new Date().toISOString().slice(0, 10);
            const status = nullIfEmpty(r.status) || 'Active';

            // Map 'None' to 'No Discount' for DB enum compatibility
            let discount = nullIfEmpty(r.discount) || 'No Discount';
            if (discount === 'None') discount = 'No Discount';
            
            const discounted_fee = classInfo.monthlyFee * (factorMap[discount] ?? 1);

            // DB CHECK constraint: discount_reason required when discount != 'No Discount'
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
                    finalAdmissionNo,
                    full_name,
                    father_name,
                    date_of_birth,
                    gender,
                    religion,
                    nationality,
                    father_phone,
                    home_address,
                    admission_date,
                    classInfo.realId,
                    classInfo.monthlyFee,
                    discount,
                    discounted_fee,
                    discount_reason,
                    status,
                ]
            );

            console.log(`  ✓  Row ${rowNum}: ${full_name} (${finalAdmissionNo}) → ${classInfo.name}`);
            inserted++;
        }

        await pool.query('COMMIT');

        console.log(`
──────────────────────────────
  ✅ Inserted : ${inserted}
  ⚠️  Skipped  : ${skipped}
──────────────────────────────
`);

    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('\n❌ Seeding failed:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
};

seedStudents();

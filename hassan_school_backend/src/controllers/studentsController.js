const pool = require('../config/db');

// Create a new student (new admission)
const createStudent = async (req, res) => {
  const {
    admission_no,
    full_name,
    father_name,
    date_of_birth,
    gender,
    religion,
    nationality,
    place_of_birth,
    mother_tongue,
    student_phone,
    father_phone,
    mother_name,
    mother_phone,
    emergency_contact_name,
    emergency_contact_phone,
    home_address,
    district,
    tehsil,
    admission_date,
    class_id,
    section,
    roll_number,
    previous_school,
    previous_class,
    previous_result,
    discount,
    discounted_fee,
    discount_reason,
    b_form_number,
    father_cnic,
    previous_tc_number,
    medical_condition,
    notes,
  } = req.body;

  // Validate required fields
  if (!admission_no || !full_name || !father_name || !date_of_birth || !gender || !father_phone || !home_address || !admission_date || !class_id) {
    return res.status(400).json({
      error: 'Missing required fields: admission_no, full_name, father_name, date_of_birth, gender, father_phone, home_address, admission_date, class_id',
    });
  }

  // Validate discount_reason if discount is not "No Discount"
  if ((discount && discount !== 'No Discount') && !discount_reason) {
    return res.status(400).json({
      error: 'discount_reason is required when discount is not "No Discount"',
    });
  }

  try {
    // Get monthly_fee from classes table
    const classResult = await pool.query('SELECT monthly_fee FROM classes WHERE id = $1', [class_id]);
    if (classResult.rowCount === 0) {
      return res.status(404).json({ error: 'Class not found' });
    }

    const monthly_fee = classResult.rows[0].monthly_fee;
    const final_discounted_fee = discounted_fee || monthly_fee;

    const result = await pool.query(
      `INSERT INTO students (
        admission_no, full_name, father_name, date_of_birth, gender, religion, nationality,
        place_of_birth, mother_tongue, student_phone, father_phone, mother_name, mother_phone,
        emergency_contact_name, emergency_contact_phone, home_address, district, tehsil,
        admission_date, class_id, section, roll_number, previous_school, previous_class,
        previous_result, monthly_fee, discount, discounted_fee, discount_reason, b_form_number,
        father_cnic, previous_tc_number, medical_condition, notes
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34
      ) RETURNING id, admission_no, full_name, father_name, date_of_birth, gender, class_id, section, status, created_at`,
      [
        admission_no, full_name, father_name, date_of_birth, gender, religion || 'Islam', nationality || 'Pakistani',
        place_of_birth, mother_tongue, student_phone, father_phone, mother_name, mother_phone,
        emergency_contact_name, emergency_contact_phone, home_address, district, tehsil,
        admission_date, class_id, section, roll_number, previous_school, previous_class,
        previous_result, monthly_fee, discount || 'No Discount', final_discounted_fee, discount_reason, b_form_number,
        father_cnic, previous_tc_number, medical_condition, notes,
      ]
    );

    res.status(201).json({
      message: 'Student created successfully',
      student: result.rows[0],
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Admission number already exists' });
    }
    if (err.code === '23514') {
      return res.status(400).json({ error: 'Invalid data: discount_reason required when discount is not "No Discount"' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create student' });
  }
};

// List all students with search, filtering, and pagination
const listStudents = async (req, res) => {
  const { class_id, status, search, page = 1, limit = 10 } = req.query;
  
  try {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
    const offset = (pageNum - 1) * limitNum;

    // Build dynamic WHERE clause
    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (class_id) {
      whereConditions.push(`class_id = $${paramIndex}`);
      params.push(class_id);
      paramIndex++;
    }

    if (status) {
      // Validate status value
      const validStatuses = ['Active', 'Left'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be "Active" or "Left"' });
      }
      whereConditions.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (search) {
      whereConditions.push(`(full_name ILIKE $${paramIndex} OR father_name ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : 'WHERE 1=1';

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM students ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limitNum);

    // Get paginated results
    const dataParams = [...params, limitNum, offset];
    const query = `
      SELECT id, admission_no, full_name, father_name, date_of_birth, gender, class_id, 
             section, roll_number, status, monthly_fee, discount, created_at 
      FROM students 
      ${whereClause}
      ORDER BY admission_no ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const result = await pool.query(query, dataParams);

    res.json({
      data: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
};

// Get student by ID
const getStudentById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM students WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch student' });
  }
};

// Update student
const updateStudent = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  // Validate discount_reason if discount is being updated to non-"No Discount"
  if (updates.discount && updates.discount !== 'No Discount' && !updates.discount_reason) {
    return res.status(400).json({
      error: 'discount_reason is required when discount is not "No Discount"',
    });
  }

  // List of updatable fields
  const allowedFields = [
    'full_name', 'father_name', 'date_of_birth', 'gender', 'religion', 'nationality',
    'place_of_birth', 'mother_tongue', 'student_phone', 'father_phone', 'mother_name',
    'mother_phone', 'emergency_contact_name', 'emergency_contact_phone', 'home_address',
    'district', 'tehsil', 'class_id', 'section', 'roll_number', 'previous_school',
    'previous_class', 'previous_result', 'discount', 'discounted_fee', 'discount_reason',
    'b_form_number', 'father_cnic', 'previous_tc_number', 'medical_condition', 'notes',
    'status', 'leaving_date', 'leaving_reason', 'monthly_fee'
  ];

  const validUpdates = {};
  for (let key in updates) {
    if (allowedFields.includes(key)) {
      validUpdates[key] = updates[key];
    }
  }

  if (Object.keys(validUpdates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  try {
    // Build dynamic UPDATE query
    const setClause = Object.keys(validUpdates)
      .map((field, i) => `${field} = $${i + 1}`)
      .join(', ');

    const values = [...Object.values(validUpdates), id];
    const query = `UPDATE students SET ${setClause}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`;

    const result = await pool.query(query, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    res.json({
      message: 'Student updated successfully',
      student: result.rows[0],
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Admission number already exists' });
    }
    if (err.code === '23514') {
      return res.status(400).json({ error: 'Invalid data: discount_reason required when discount is not "No Discount"' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to update student' });
  }
};

// Delete student
const deleteStudent = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM students WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    res.json({ message: 'Student deleted successfully', id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete student' });
  }
};

module.exports = {
  createStudent,
  listStudents,
  getStudentById,
  updateStudent,
  deleteStudent,
};

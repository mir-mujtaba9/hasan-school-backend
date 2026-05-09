const pool = require('../config/db');

const normalizeDiscount = (discount) => {
  if (discount === undefined || discount === null || discount === '') return undefined;

  if (typeof discount === 'number') {
    if (discount === 0) return 'No Discount';
    return `${discount}%`;
  }

  if (typeof discount === 'string') {
    const trimmed = discount.trim();
    if (!trimmed) return undefined;

    if (trimmed.toLowerCase() === 'no discount') return 'No Discount';

    const percentMatch = trimmed.match(/^(\d+(?:\.\d+)?)%$/);
    if (percentMatch) {
      const num = Number(percentMatch[1]);
      if (!Number.isFinite(num)) return trimmed;
      if (num === 0) return 'No Discount';
      return `${num}%`;
    }

    const numOnlyMatch = trimmed.match(/^\d+(?:\.\d+)?$/);
    if (numOnlyMatch) {
      const num = Number(trimmed);
      if (num === 0) return 'No Discount';
      return `${num}%`;
    }
  }

  return discount;
};

const inferDiscountFromFees = (baseFee, discountedFee) => {
  if (!Number.isFinite(baseFee) || baseFee <= 0) return null;
  if (!Number.isFinite(discountedFee) || discountedFee < 0) return null;

  const epsilon = 0.01;
  const rounded = (value) => Math.round(value * 100) / 100;

  const base = rounded(baseFee);
  const discounted = rounded(discountedFee);

  if (Math.abs(discounted - base) <= epsilon) return 'No Discount';

  const candidates = [
    { discount: '25%', factor: 0.75 },
    { discount: '50%', factor: 0.50 },
    { discount: '75%', factor: 0.25 },
    { discount: '100%', factor: 0.0 },
  ];

  for (const candidate of candidates) {
    if (Math.abs(discounted - rounded(base * candidate.factor)) <= epsilon) {
      return candidate.discount;
    }
  }

  return null;
};

// Create a new student (new admission)
const createStudent = async (req, res) => {
  console.log('Received student creation request:', JSON.stringify(req.body, null, 2));
  
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

  // Validate gender enum value
  const validGenders = ['Male', 'Female'];
  if (!validGenders.includes(gender)) {
    return res.status(400).json({
      error: `Invalid gender. Must be one of: ${validGenders.join(', ')}`,
    });
  }

  const normalizedDiscount = normalizeDiscount(discount);

  // Validate discount value
  const validDiscounts = ['No Discount', '25%', '50%', '75%', '100%'];
  if (normalizedDiscount && !validDiscounts.includes(normalizedDiscount)) {
    return res.status(400).json({
      error: `Invalid discount. Must be one of: ${validDiscounts.join(', ')}`,
    });
  }

  // Validate mother_tongue if provided
  const validMotherTongues = ['Urdu', 'Punjabi', 'Pashto', 'Sindhi', 'Other'];
  if (mother_tongue && !validMotherTongues.includes(mother_tongue)) {
    return res.status(400).json({
      error: `Invalid mother_tongue. Must be one of: ${validMotherTongues.join(', ')}`,
    });
  }

  // Validate previous_result if provided
  const validPreviousResults = ['N/A', 'Excellent', 'Good', 'Average', 'Poor'];
  if (previous_result && !validPreviousResults.includes(previous_result)) {
    return res.status(400).json({
      error: `Invalid previous_result. Must be one of: ${validPreviousResults.join(', ')}`,
    });
  }

  // Validate section if provided
  const validSections = ['A', 'B', 'C'];
  if (section && !validSections.includes(section)) {
    return res.status(400).json({
      error: `Invalid section. Must be one of: ${validSections.join(', ')}`,
    });
  }

  // Validate discount_reason if discount is not "No Discount"
  if ((normalizedDiscount && normalizedDiscount !== 'No Discount') && !discount_reason) {
    return res.status(400).json({
      error: 'discount_reason is required when discount is not "No Discount"',
    });
  }

  const discountedFeeInput = discounted_fee !== undefined ? Number(discounted_fee) : undefined;
  if (discounted_fee !== undefined && !Number.isFinite(discountedFeeInput)) {
    return res.status(400).json({ error: 'discounted_fee must be a number' });
  }

  try {
    // Get monthly_fee from classes table
    const classResult = await pool.query('SELECT monthly_fee FROM classes WHERE id = $1', [class_id]);
    if (classResult.rowCount === 0) {
      return res.status(404).json({ error: 'Class not found' });
    }

    const classMonthlyFee = parseFloat(classResult.rows[0].monthly_fee);

    let appliedDiscount = normalizedDiscount;
    let inferredDiscount = false;

    if (!appliedDiscount && discountedFeeInput !== undefined) {
      const inferred = inferDiscountFromFees(classMonthlyFee, discountedFeeInput);
      if (!inferred) {
        return res.status(400).json({
          error: 'discounted_fee does not match class fee for a supported discount',
        });
      }
      appliedDiscount = inferred;
      inferredDiscount = true;
    }

    if (!appliedDiscount) {
      appliedDiscount = 'No Discount';
    }

    // Always calculate fees from class fee + discount to keep data consistent
    let final_discounted_fee = classMonthlyFee;

    if (appliedDiscount === '25%') {
      final_discounted_fee = classMonthlyFee * 0.75;
    } else if (appliedDiscount === '50%') {
      final_discounted_fee = classMonthlyFee * 0.50;
    } else if (appliedDiscount === '75%') {
      final_discounted_fee = classMonthlyFee * 0.25;
    } else if (appliedDiscount === '100%') {
      final_discounted_fee = 0;
    }

    if (inferredDiscount) {
      final_discounted_fee = discountedFeeInput;
    }

    // monthly_fee is always the base class fee
    const final_monthly_fee = classMonthlyFee;

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
        previous_result, final_monthly_fee, appliedDiscount, final_discounted_fee, discount_reason, b_form_number,
        father_cnic, previous_tc_number, medical_condition, notes,
      ]
    );

    res.status(201).json({
      message: 'Student created successfully',
      student: result.rows[0],
    });
  } catch (err) {
    console.error('Create student error:', err.code, err.message, err.detail);
    
    // Handle specific database error codes
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Admission number already exists' });
    }
    if (err.code === '23514') {
      return res.status(400).json({ error: 'Invalid data: discount_reason required when discount is not "No Discount"' });
    }
    if (err.code === '22P02') {
      return res.status(400).json({ error: `Invalid enum value: ${err.message}` });
    }
    if (err.code === '23502') {
      // NOT NULL constraint violation
      return res.status(400).json({ error: `Missing required field: ${err.detail}` });
    }
    if (err.code === '23503') {
      // Foreign key constraint violation
      return res.status(400).json({ error: 'Invalid class_id: Class not found' });
    }
    
    // Generic error with more details
    return res.status(500).json({ 
      error: 'Failed to create student',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
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
             section, roll_number, status, monthly_fee, discount,
             father_phone, home_address, created_at 
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
  
  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return res.status(400).json({ error: 'Invalid student ID format. Expected UUID.' });
  }
  
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
  
  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return res.status(400).json({ error: 'Invalid student ID format. Expected UUID.' });
  }
  
  const updates = req.body;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  const normalizedUpdateDiscount = normalizeDiscount(updates.discount);

  // Validate discount value if being updated
  const validDiscounts = ['No Discount', '25%', '50%', '75%', '100%'];
  if (normalizedUpdateDiscount && !validDiscounts.includes(normalizedUpdateDiscount)) {
    return res.status(400).json({
      error: `Invalid discount. Must be one of: ${validDiscounts.join(', ')}`,
    });
  }

  // Validate status value if being updated
  const validStatuses = ['Active', 'Left'];
  if (updates.status && !validStatuses.includes(updates.status)) {
    return res.status(400).json({
      error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
    });
  }

  // Validate gender if being updated
  const validGenders = ['Male', 'Female'];
  if (updates.gender && !validGenders.includes(updates.gender)) {
    return res.status(400).json({
      error: `Invalid gender. Must be one of: ${validGenders.join(', ')}`,
    });
  }

  // Validate mother_tongue if being updated
  const validMotherTongues = ['Urdu', 'Punjabi', 'Pashto', 'Sindhi', 'Other'];
  if (updates.mother_tongue && !validMotherTongues.includes(updates.mother_tongue)) {
    return res.status(400).json({
      error: `Invalid mother_tongue. Must be one of: ${validMotherTongues.join(', ')}`,
    });
  }

  // Validate previous_result if being updated
  const validPreviousResults = ['N/A', 'Excellent', 'Good', 'Average', 'Poor'];
  if (updates.previous_result && !validPreviousResults.includes(updates.previous_result)) {
    return res.status(400).json({
      error: `Invalid previous_result. Must be one of: ${validPreviousResults.join(', ')}`,
    });
  }

  // Validate section if being updated
  const validSections = ['A', 'B', 'C'];
  if (updates.section && !validSections.includes(updates.section)) {
    return res.status(400).json({
      error: `Invalid section. Must be one of: ${validSections.join(', ')}`,
    });
  }

  // Validate discount_reason if discount is being updated to non-"No Discount"
  if (normalizedUpdateDiscount && normalizedUpdateDiscount !== 'No Discount' && !updates.discount_reason) {
    return res.status(400).json({
      error: 'discount_reason is required when discount is not "No Discount"',
    });
  }

  const updateDiscountedFeeInput = updates.discounted_fee !== undefined
    ? Number(updates.discounted_fee)
    : undefined;

  if (updates.discounted_fee !== undefined && !Number.isFinite(updateDiscountedFeeInput)) {
    return res.status(400).json({ error: 'discounted_fee must be a number' });
  }

  if (updates.discounted_fee !== undefined && !updates.discount) {
    return res.status(400).json({
      error: 'discount is required when discounted_fee is provided',
    });
  }

  // List of updatable fields
  const allowedFields = [
    'full_name', 'father_name', 'date_of_birth', 'gender', 'religion', 'nationality',
    'place_of_birth', 'mother_tongue', 'student_phone', 'father_phone', 'mother_name',
    'mother_phone', 'emergency_contact_name', 'emergency_contact_phone', 'home_address',
    'district', 'tehsil', 'class_id', 'section', 'roll_number', 'previous_school',
    'previous_class', 'previous_result', 'discount', 'discount_reason',
    'b_form_number', 'father_cnic', 'previous_tc_number', 'medical_condition', 'notes',
    'status', 'leaving_date', 'leaving_reason'
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
    // Fetch current student to get class_id and discount context
    const currentStudentResult = await pool.query(
      'SELECT class_id, discount FROM students WHERE id = $1',
      [id]
    );
    
    if (currentStudentResult.rowCount === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const currentStudent = currentStudentResult.rows[0];

    const incomingClassId = updates.class_id || currentStudent.class_id;
    let incomingDiscount = normalizedUpdateDiscount || currentStudent.discount || 'No Discount';

    // Recalculate fees when discount/class changes or discounted_fee is provided
    if (updates.discount || updates.class_id || updates.discounted_fee !== undefined) {
      const classResult = await pool.query(
        'SELECT monthly_fee FROM classes WHERE id = $1',
        [incomingClassId]
      );

      if (classResult.rowCount === 0) {
        return res.status(404).json({ error: 'Class not found' });
      }

      const classMonthlyFee = parseFloat(classResult.rows[0].monthly_fee);

      if (!normalizedUpdateDiscount && updateDiscountedFeeInput !== undefined) {
        const inferred = inferDiscountFromFees(classMonthlyFee, updateDiscountedFeeInput);
        if (!inferred) {
          return res.status(400).json({
            error: 'discounted_fee does not match class fee for a supported discount',
          });
        }
        incomingDiscount = inferred;
        validUpdates.discount = inferred;
      }

      let discountedFee = classMonthlyFee;

      if (incomingDiscount === '25%') {
        discountedFee = classMonthlyFee * 0.75;
      } else if (incomingDiscount === '50%') {
        discountedFee = classMonthlyFee * 0.50;
      } else if (incomingDiscount === '75%') {
        discountedFee = classMonthlyFee * 0.25;
      } else if (incomingDiscount === '100%') {
        discountedFee = 0;
      }

      // monthly_fee always stores the base class fee
      validUpdates.monthly_fee = classMonthlyFee;
      if (updateDiscountedFeeInput !== undefined && !normalizedUpdateDiscount) {
        discountedFee = updateDiscountedFeeInput;
      }

      validUpdates.discounted_fee = discountedFee;
    }

    // Build dynamic UPDATE query
    const setClause = Object.keys(validUpdates)
      .map((field, i) => `${field} = $${i + 1}`)
      .join(', ');

    const values = [...Object.values(validUpdates), id];
    const query = `UPDATE students SET ${setClause}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`;

    const result = await pool.query(query, values);

    res.json({
      message: 'Student updated successfully',
      student: result.rows[0],
    });
  } catch (err) {
    console.error('Update student error:', err.code, err.message, err.detail);
    
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Admission number already exists' });
    }
    if (err.code === '23514') {
      return res.status(400).json({ error: 'Invalid data: discount_reason required when discount is not "No Discount"' });
    }
    if (err.code === '22P02') {
      return res.status(400).json({ error: `Invalid enum value: ${err.message}` });
    }
    if (err.code === '23502') {
      // NOT NULL constraint violation
      return res.status(400).json({ error: `Missing required field: ${err.detail}` });
    }
    if (err.code === '23503') {
      // Foreign key constraint violation
      return res.status(400).json({ error: 'Invalid class_id: Class not found' });
    }
    
    console.error('Update student error:', err);
    return res.status(500).json({ 
      error: 'Failed to update student',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// Delete student
const deleteStudent = async (req, res) => {
  const { id } = req.params;
  
  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return res.status(400).json({ error: 'Invalid student ID format. Expected UUID.' });
  }
  
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

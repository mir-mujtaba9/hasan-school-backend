const pool = require('../config/db');

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

  // Validate discount value
  const validDiscounts = ['No Discount', '25%', '50%', '75%', '100%'];
  if (discount && !validDiscounts.includes(discount)) {
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

    const class_monthly_fee = classResult.rows[0].monthly_fee;
    
    // Calculate discounted_fee based on discount percentage
    let final_discounted_fee = discounted_fee;
    let final_monthly_fee = class_monthly_fee;
    
    if (!discounted_fee) {
      // Auto-calculate based on discount
      const appliedDiscount = discount || 'No Discount';
      
      if (appliedDiscount === '25%') {
        final_discounted_fee = final_monthly_fee * 0.75;
      } else if (appliedDiscount === '50%') {
        final_discounted_fee = final_monthly_fee * 0.50;
      } else if (appliedDiscount === '75%') {
        final_discounted_fee = final_monthly_fee * 0.25;
      } else if (appliedDiscount === '100%') {
        final_discounted_fee = 0;
      } else {
        // 'No Discount'
        final_discounted_fee = final_monthly_fee;
      }
      
      // If discount is applied, set monthly_fee to discounted_fee
      if (appliedDiscount !== 'No Discount') {
        final_monthly_fee = final_discounted_fee;
      }
    }

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
        previous_result, final_monthly_fee, discount || 'No Discount', final_discounted_fee, discount_reason, b_form_number,
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

  // Validate discount value if being updated
  const validDiscounts = ['No Discount', '25%', '50%', '75%', '100%'];
  if (updates.discount && !validDiscounts.includes(updates.discount)) {
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
    // Fetch current student to get monthly_fee for discount calculation
    const currentStudentResult = await pool.query('SELECT monthly_fee, discount, discounted_fee FROM students WHERE id = $1', [id]);
    
    if (currentStudentResult.rowCount === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const currentStudent = currentStudentResult.rows[0];
    
    // Calculate discounted_fee if discount is being updated or monthly_fee is being updated
    if ((updates.discount && !updates.discounted_fee) || (updates.monthly_fee && !updates.discounted_fee)) {
      const monthlyFee = parseFloat(updates.monthly_fee || currentStudent.monthly_fee);
      const discount = updates.discount || currentStudent.discount;
      
      let discountedFee = monthlyFee;
      
      // Apply discount percentage
      if (discount === '25%') {
        discountedFee = monthlyFee * 0.75;
      } else if (discount === '50%') {
        discountedFee = monthlyFee * 0.50;
      } else if (discount === '75%') {
        discountedFee = monthlyFee * 0.25;
      } else if (discount === '100%') {
        discountedFee = 0;
      }
      // else: 'No Discount' - discountedFee remains as monthlyFee
      
      validUpdates.discounted_fee = discountedFee;
      
      // If discount is applied (not "No Discount"), set monthly_fee to discounted_fee
      if (discount !== 'No Discount') {
        validUpdates.monthly_fee = discountedFee;
      }
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


require('dotenv').config();

const express = require('express');
const path = require('path');
const pool = require('./db');
const { isReportPeriod, getReportOverview } = require('./reports');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// ==========================================
// 1. CẤU HÌNH WEBSITE
// ==========================================

app.disable('x-powered-by');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 2. HÀM KIỂM TRA DỮ LIỆU
// ==========================================

const allowedStatuses = [
  'potential',
  'active',
  'completed'
];

function parseId(value) {
  if (!/^[1-9]\d*$/.test(String(value))) {
    return null;
  }

  const id = Number(value);

  if (!Number.isSafeInteger(id) || id > 2147483647) {
    return null;
  }

  return id;
}

function cleanOptional(value, maxLength) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error('Dữ liệu phải là chuỗi');
  }

  const cleaned = value.trim();

  if (cleaned.length > maxLength) {
    throw new Error('Dữ liệu vượt quá độ dài cho phép');
  }

  return cleaned || null;
}

function validateCustomer(body) {
  try {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { error: 'Dữ liệu không hợp lệ' };
    }

    const { name, email, phone, address, status } = body;

    if (
      typeof name !== 'string' ||
      !name.trim() ||
      name.trim().length > 150
    ) {
      return {
        error: 'Tên khách hàng phải có từ 1 đến 150 ký tự'
      };
    }

    const customer = {
      name: name.trim(),
      email: cleanOptional(email, 150),
      phone: cleanOptional(phone, 20),
      address: cleanOptional(address, 500),
      status: status === undefined ? 'potential' : status
    };

    if (!allowedStatuses.includes(customer.status)) {
      return { error: 'Trạng thái không hợp lệ' };
    }

    if (
      customer.email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)
    ) {
      return { error: 'Email không hợp lệ' };
    }

    return { customer };

  } catch (error) {
    return { error: error.message };
  }
}

function validateContact(body) {
  try {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { error: 'Dữ liệu không hợp lệ' };
    }

    const customerId = parseId(body.customer_id);
    const { name, email, phone, position } = body;

    if (!customerId) {
      return { error: 'Vui lòng chọn khách hàng hợp lệ' };
    }

    if (
      typeof name !== 'string' ||
      !name.trim() ||
      name.trim().length > 150
    ) {
      return {
        error: 'Tên người liên hệ phải có từ 1 đến 150 ký tự'
      };
    }

    const contact = {
      customer_id: customerId,
      name: name.trim(),
      email: cleanOptional(email, 150),
      phone: cleanOptional(phone, 20),
      position: cleanOptional(position, 100)
    };

    if (
      contact.email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)
    ) {
      return { error: 'Email không hợp lệ' };
    }

    return { contact };

  } catch (error) {
    return { error: error.message };
  }
}

// ==========================================
// 3. GIAO DIỆN WEBSITE
// ==========================================

// Dashboard
app.get('/', (req, res) => {
  res.render('dashboard');
});

// Trang báo cáo dùng API riêng, vẫn mở được khi database tạm thời không khả dụng.
app.get('/reports', (req, res) => {
  res.render('reports');
});

app.get('/api/reports/overview', async (req, res) => {
  const period = req.query.period ?? '30d';
  res.set('Cache-Control', 'no-store');
  if (!isReportPeriod(period)) {
    return res.status(400).json({
      success: false,
      message: 'Khoảng thời gian phải là 7d, 30d, 90d hoặc all.'
    });
  }
  try {
    res.json(await getReportOverview(pool, period));
  } catch (error) {
    console.error('Reports overview:', error.message);
    res.status(503).json({
      success: false,
      message: 'Chưa thể tải dữ liệu báo cáo. Vui lòng thử lại.'
    });
  }
});

// Trang khách hàng
app.get('/customers', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, email, phone,
             address, status, created_at
      FROM customers
      ORDER BY created_at DESC, id DESC
    `);

    res.render('customers', {
      customers: result.rows
    });

  } catch (error) {
    console.error('Customers page:', error.message);

    res.status(500).send(
      'Không thể tải danh sách khách hàng'
    );
  }
});

// Trang liên hệ
app.get('/contacts', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.id,
        c.customer_id,
        c.name,
        c.email,
        c.phone,
        c.position,
        c.created_at,
        cu.name AS customer_name
      FROM contacts c
      JOIN customers cu ON c.customer_id = cu.id
      ORDER BY c.created_at DESC, c.id DESC
    `);

    res.render('contacts', {
      contacts: result.rows
    });

  } catch (error) {
    console.error('Contacts page:', error.message);

    res.status(500).send(
      'Không thể tải danh sách liên hệ'
    );
  }
});

// ==========================================
// 4. HEALTH CHECK
// ==========================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'crm-web'
  });
});

app.get('/health/db', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT NOW() AS current_time,
             current_database() AS database_name
    `);

    res.json({
      status: 'ok',
      database: result.rows[0].database_name,
      server_time: result.rows[0].current_time,
      message: 'Kết nối PostgreSQL thành công'
    });

  } catch (error) {
    console.error('Database health:', error.message);

    res.status(503).json({
      status: 'error',
      message: 'Không thể kết nối PostgreSQL'
    });
  }
});

// ==========================================
// 5. API KHÁCH HÀNG
// ==========================================

// GET - Danh sách khách hàng
app.get('/api/customers', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, email, phone,
             address, status, created_at
      FROM customers
      ORDER BY created_at DESC, id DESC
    `);

    res.json({
      success: true,
      total: result.rowCount,
      customers: result.rows
    });

  } catch (error) {
    console.error('Get customers:', error.message);

    res.status(500).json({
      success: false,
      message: 'Không thể lấy danh sách khách hàng'
    });
  }
});

// GET - Chi tiết khách hàng
app.get('/api/customers/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID không hợp lệ'
      });
    }

    const result = await pool.query(
      'SELECT * FROM customers WHERE id = $1',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy khách hàng'
      });
    }

    res.json({
      success: true,
      customer: result.rows[0]
    });

  } catch (error) {
    console.error('Customer detail:', error.message);

    res.status(500).json({
      success: false,
      message: 'Không thể lấy thông tin khách hàng'
    });
  }
});

// POST - Thêm khách hàng
app.post('/api/customers', async (req, res) => {
  try {
    const { error, customer } = validateCustomer(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        message: error
      });
    }

    const result = await pool.query(
      `INSERT INTO customers
       (name, email, phone, address, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        customer.name,
        customer.email,
        customer.phone,
        customer.address,
        customer.status
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Thêm khách hàng thành công',
      customer: result.rows[0]
    });

  } catch (error) {
    console.error('Create customer:', error.message);

    res.status(500).json({
      success: false,
      message: 'Không thể thêm khách hàng'
    });
  }
});

// PUT - Sửa khách hàng
app.put('/api/customers/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID không hợp lệ'
      });
    }

    const { error, customer } = validateCustomer(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        message: error
      });
    }

    const result = await pool.query(
      `UPDATE customers
       SET name = $1,
           email = $2,
           phone = $3,
           address = $4,
           status = $5
       WHERE id = $6
       RETURNING *`,
      [
        customer.name,
        customer.email,
        customer.phone,
        customer.address,
        customer.status,
        id
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy khách hàng'
      });
    }

    res.json({
      success: true,
      message: 'Cập nhật khách hàng thành công',
      customer: result.rows[0]
    });

  } catch (error) {
    console.error('Update customer:', error.message);

    res.status(500).json({
      success: false,
      message: 'Không thể cập nhật khách hàng'
    });
  }
});

// DELETE - Xóa khách hàng
app.delete('/api/customers/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID không hợp lệ'
      });
    }

    const result = await pool.query(
      `DELETE FROM customers
       WHERE id = $1
       RETURNING id, name`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy khách hàng'
      });
    }

    res.json({
      success: true,
      message: 'Xóa khách hàng thành công',
      customer: result.rows[0]
    });

  } catch (error) {
    console.error('Delete customer:', error.message);

    res.status(500).json({
      success: false,
      message: 'Không thể xóa khách hàng'
    });
  }
});

// ==========================================
// 6. API LIÊN HỆ
// ==========================================

// GET - Danh sách liên hệ
app.get('/api/contacts', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.id,
        c.customer_id,
        c.name,
        c.email,
        c.phone,
        c.position,
        c.created_at,
        cu.name AS customer_name
      FROM contacts c
      JOIN customers cu ON c.customer_id = cu.id
      ORDER BY c.created_at DESC, c.id DESC
    `);

    res.json({
      success: true,
      total: result.rowCount,
      contacts: result.rows
    });

  } catch (error) {
    console.error('Get contacts:', error.message);

    res.status(500).json({
      success: false,
      message: 'Không thể lấy danh sách liên hệ'
    });
  }
});

// POST - Thêm liên hệ
app.post('/api/contacts', async (req, res) => {
  try {
    const { error, contact } = validateContact(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        message: error
      });
    }

    const result = await pool.query(
      `INSERT INTO contacts
       (customer_id, name, email, phone, position)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        contact.customer_id,
        contact.name,
        contact.email,
        contact.phone,
        contact.position
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Thêm liên hệ thành công',
      contact: result.rows[0]
    });

  } catch (error) {
    console.error('Create contact:', error.message);

    if (error.code === '23503') {
      return res.status(404).json({
        success: false,
        message: 'Khách hàng không tồn tại'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Không thể thêm liên hệ'
    });
  }
});

/* ==========================================
   API SỬA VÀ XÓA LIÊN HỆ
========================================== */

// GET - Chi tiết một liên hệ
app.get('/api/contacts/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID liên hệ không hợp lệ'
      });
    }

    const result = await pool.query(
      'SELECT * FROM contacts WHERE id = $1',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy liên hệ'
      });
    }

    res.json({
      success: true,
      contact: result.rows[0]
    });
  } catch (error) {
    console.error('Get contact:', error.message);
    res.status(500).json({
      success: false,
      message: 'Không thể lấy thông tin liên hệ'
    });
  }
});

// PUT - Sửa liên hệ
app.put('/api/contacts/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID liên hệ không hợp lệ'
      });
    }

    const { error, contact } = validateContact(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        message: error
      });
    }

    const result = await pool.query(
      `UPDATE contacts
       SET customer_id = $1,
           name = $2,
           email = $3,
           phone = $4,
           position = $5
       WHERE id = $6
       RETURNING *`,
      [
        contact.customer_id,
        contact.name,
        contact.email,
        contact.phone,
        contact.position,
        id
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy liên hệ'
      });
    }

    res.json({
      success: true,
      message: 'Cập nhật liên hệ thành công',
      contact: result.rows[0]
    });
  } catch (error) {
    console.error('Update contact:', error.message);

    if (error.code === '23503') {
      return res.status(400).json({
        success: false,
        message: 'Khách hàng được chọn không tồn tại'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Không thể cập nhật liên hệ'
    });
  }
});

// DELETE - Xóa liên hệ
app.delete('/api/contacts/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID liên hệ không hợp lệ'
      });
    }

    const result = await pool.query(
      `DELETE FROM contacts
       WHERE id = $1
       RETURNING id, name`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy liên hệ'
      });
    }

    res.json({
      success: true,
      message: 'Xóa liên hệ thành công',
      contact: result.rows[0]
    });
  } catch (error) {
    console.error('Delete contact:', error.message);
    res.status(500).json({
      success: false,
      message: 'Không thể xóa liên hệ'
    });
  }
});

/* ==========================================
   QUẢN LÝ LỊCH SỬ TƯƠNG TÁC
========================================== */

const interactionTypes = ['call', 'email', 'meeting', 'note'];

// Trang lịch sử tương tác
app.get('/interactions', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.*, c.name AS customer_name
      FROM interactions i
      JOIN customers c ON i.customer_id = c.id
      ORDER BY i.interaction_date DESC, i.id DESC
    `);

    res.render('interactions', {
      interactions: result.rows
    });
  } catch (error) {
    console.error('Interactions page:', error.message);
    res.status(500).send('Không thể tải lịch sử tương tác');
  }
});

// API lấy danh sách tương tác
app.get('/api/interactions', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.*, c.name AS customer_name
      FROM interactions i
      JOIN customers c ON i.customer_id = c.id
      ORDER BY i.interaction_date DESC, i.id DESC
    `);

    res.json({
      success: true,
      total: result.rowCount,
      interactions: result.rows
    });
  } catch (error) {
    console.error('Get interactions:', error.message);
    res.status(500).json({
      success: false,
      message: 'Không thể lấy lịch sử tương tác'
    });
  }
});

// API thêm tương tác
app.post('/api/interactions', async (req, res) => {
  try {
    const { customer_id, type, content, interaction_date } = req.body || {};
    const customerId = parseId(customer_id);

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn khách hàng'
      });
    }

    if (!interactionTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Loại tương tác không hợp lệ'
      });
    }

    if (
      typeof content !== 'string' ||
      !content.trim() ||
      content.length > 5000
    ) {
      return res.status(400).json({
        success: false,
        message: 'Nội dung phải có từ 1 đến 5000 ký tự'
      });
    }

    let date = null;

    if (interaction_date) {
      if (
        typeof interaction_date !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(interaction_date)
      ) {
        return res.status(400).json({
          success: false,
          message: 'Ngày giờ không hợp lệ'
        });
      }

      date = interaction_date.replace('T', ' ');

      const parsed = new Date(interaction_date);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Ngày giờ không hợp lệ'
        });
      }
    }

    const result = await pool.query(
      `INSERT INTO interactions
       (customer_id, type, content, interaction_date)
       VALUES ($1, $2, $3, COALESCE($4::timestamp, CURRENT_TIMESTAMP))
       RETURNING *`,
      [customerId, type, content.trim(), date]
    );

    res.status(201).json({
      success: true,
      message: 'Thêm tương tác thành công',
      interaction: result.rows[0]
    });
  } catch (error) {
    console.error('Create interaction:', error.message);

    if (error.code === '23503') {
      return res.status(404).json({
        success: false,
        message: 'Khách hàng không tồn tại'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Không thể thêm tương tác'
    });
  }
});

// API xóa tương tác
app.delete('/api/interactions/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID tương tác không hợp lệ'
      });
    }

    const result = await pool.query(
      `DELETE FROM interactions
       WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tương tác'
      });
    }

    res.json({
      success: true,
      message: 'Xóa tương tác thành công'
    });
  } catch (error) {
    console.error('Delete interaction:', error.message);
    res.status(500).json({
      success: false,
      message: 'Không thể xóa tương tác'
    });
  }
});

// ==========================================
// 7. XỬ LÝ LỖI - PHẢI ĐẶT CUỐI CÙNG
// ==========================================

// API không tồn tại
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API không tồn tại'
  });
});

// Trang không tồn tại
app.use((req, res) => {
  res.status(404).send(
    '404 - Không tìm thấy trang'
  );
});

// Xử lý lỗi toàn cục
app.use((err, req, res, next) => {
  if (
    err instanceof SyntaxError &&
    err.status === 400 &&
    'body' in err
  ) {
    return res.status(400).json({
      success: false,
      message: 'Dữ liệu JSON không hợp lệ'
    });
  }

  console.error('Server error:', err.message);

  res.status(500).json({
    success: false,
    message: 'Lỗi máy chủ'
  });
});

// ==========================================
// 8. KHỞI ĐỘNG SERVER
// ==========================================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`CRM server running on port ${PORT}`);
});

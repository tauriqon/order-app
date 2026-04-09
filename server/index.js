require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { pool, initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// 초기 DB 세팅
initDb();

// 1. 메뉴 가져오기
app.get('/api/menus', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM menus ORDER BY id');
    res.json(result.rows.map(row => ({
      id: row.id,
      name: row.name,
      price: row.price,
      description: row.description,
      imageUrl: row.image_url
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 2. 재고 현황 가져오기 (메뉴 정보 포함)
app.get('/api/stocks', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.id as "menuId", m.name as "menuName", s.stock 
      FROM stocks s
      JOIN menus m ON s.menu_id = m.id
      ORDER BY m.id
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 3. 재고 증감
app.patch('/api/stocks/:id', async (req, res) => {
  const { id } = req.params;
  const { action } = req.body; // 'increase' or 'decrease'
  try {
    let query = '';
    if (action === 'increase') {
      query = 'UPDATE stocks SET stock = stock + 1 WHERE menu_id = $1 RETURNING *';
    } else if (action === 'decrease') {
      query = 'UPDATE stocks SET stock = GREATEST(stock - 1, 0) WHERE menu_id = $1 RETURNING *';
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }
    
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Stock not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 4. 새로운 주문 제출하기
app.post('/api/orders', async (req, res) => {
  const { items, totalPrice } = req.body;
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'No items in order' });
  }

  // 트랜잭션 처리
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // 재고 확인 및 감소
    for (const item of items) {
      const stockResult = await client.query('SELECT stock FROM stocks WHERE menu_id = $1', [item.menuId]);
      if (stockResult.rows.length === 0 || stockResult.rows[0].stock < item.quantity) {
        throw new Error(`Insufficient stock for ${item.menuName}`);
      }
      await client.query('UPDATE stocks SET stock = stock - $1 WHERE menu_id = $2', [item.quantity, item.menuId]);
    }

    // 주문 생성
    const orderResult = await client.query(
      'INSERT INTO orders (total_price, status) VALUES ($1, $2) RETURNING id, ordered_at, total_price, status',
      [totalPrice, '주문 접수']
    );
    const order = orderResult.rows[0];

    // 주문 상세 생성
    for (const item of items) {
      await client.query(
        'INSERT INTO order_items (order_id, menu_id, menu_name, options, quantity, unit_price, subtotal) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [order.id, item.menuId, item.menuName, JSON.stringify(item.options), item.quantity, item.unitPrice, item.subtotal]
      );
    }

    await client.query('COMMIT');
    res.json(order);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// 5. 관리자용 전체 주문 목록 조회
app.get('/api/orders', async (req, res) => {
  try {
    const ordersResult = await pool.query('SELECT * FROM orders ORDER BY ordered_at DESC');
    const orders = ordersResult.rows;

    // 아이템 정보 가져오기
    const itemsResult = await pool.query('SELECT * FROM order_items');
    const itemsByOrder = {};
    for (const item of itemsResult.rows) {
      if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
      itemsByOrder[item.order_id].push(item);
    }

    const response = orders.map(order => {
      const items = itemsByOrder[order.id] || [];
      const summaryItemsList = items.map(i => {
        let optStr = [];
        if (i.options.extraShot) optStr.push('샷추가');
        if (i.options.syrup) optStr.push('시럽');
        let optDesc = optStr.length > 0 ? `(${optStr.join(', ')})` : '';
        return `${i.menu_name}${optDesc} ${i.quantity}개`;
      });
      return {
        orderId: String(order.id),
        orderedAt: order.ordered_at,
        itemsSummary: summaryItemsList.join(', '),
        totalPrice: order.total_price,
        status: order.status
      };
    });

    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 6. 대시보드 집계 리포트 조회
app.get('/api/orders/dashboard', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as "totalCount",
        COUNT(*) FILTER (WHERE status = '주문 접수') as "receivedCount",
        COUNT(*) FILTER (WHERE status = '제조 중') as "inProgressCount",
        COUNT(*) FILTER (WHERE status = '제조 완료') as "completedCount"
      FROM orders
    `);
    
    const countData = result.rows[0];
    res.json({
      totalCount: parseInt(countData.totalCount) || 0,
      receivedCount: parseInt(countData.receivedCount) || 0,
      inProgressCount: parseInt(countData.inProgressCount) || 0,
      completedCount: parseInt(countData.completedCount) || 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 7. 관리자 주문 상태 수정
app.patch('/api/orders/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // '주문 접수', '제조 중', '제조 완료'
  try {
    const result = await pool.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
      [status, parseInt(id)]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

import { useState, useEffect } from 'react';
import { Package, TrendingUp, CheckCircle, Clock, Plus, Minus } from 'lucide-react';

const API_BASE = 'http://localhost:5001/api';

export default function AdminPage() {
  const [dashboard, setDashboard] = useState({ totalCount: 0, receivedCount: 0, inProgressCount: 0, completedCount: 0 });
  const [stocks, setStocks] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [dashRes, stockRes, orderRes] = await Promise.all([
        fetch(`${API_BASE}/orders/dashboard`),
        fetch(`${API_BASE}/stocks`),
        fetch(`${API_BASE}/orders`)
      ]);
      const dashData = await dashRes.json();
      const stockData = await stockRes.json();
      const orderData = await orderRes.json();
      
      setDashboard(dashData);
      setStocks(stockData);
      setOrders(orderData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleStockChange = async (menuId, action) => {
    try {
      const res = await fetch(`${API_BASE}/stocks/${menuId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      if (res.ok) {
        // Optimistic update
        setStocks(prev => prev.map(s => {
          if (s.menuId === menuId) {
            const newStock = action === 'increase' ? s.stock + 1 : Math.max(0, s.stock - 1);
            return { ...s, stock: newStock };
          }
          return s;
        }));
      }
    } catch (err) {
      alert('재고 업데이트에 실패했습니다.');
    }
  };

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      const res = await fetch(`${API_BASE}/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        // Refresh all data
        fetchData();
      }
    } catch (err) {
      alert('상태 업데이트에 실패했습니다.');
    }
  };

  if (loading) {
    return <div style={{textAlign: 'center', marginTop: '50px'}}>관리자 데이터를 불러오는 중입니다...</div>;
  }

  return (
    <div style={{ paddingBottom: '100px' }}>
      
      {/* Dashboard Section */}
      <h2 style={{ marginBottom: '20px' }}>대시보드</h2>
      <div className="admin-grid">
        <div className="card glass stat-card">
          <div style={{ color: 'var(--text-secondary)', display: 'flex', justifyContent: 'center', gap: '8px' }}>
            <TrendingUp size={20} /> 총 주문
          </div>
          <div className="stat-value">{dashboard.totalCount}</div>
        </div>
        <div className="card glass stat-card">
          <div style={{ color: 'var(--warning)', display: 'flex', justifyContent: 'center', gap: '8px' }}>
            <Package size={20} /> 주문 접수
          </div>
          <div className="stat-value" style={{ background: 'var(--warning)', WebkitBackgroundClip: 'text' }}>{dashboard.receivedCount}</div>
        </div>
        <div className="card glass stat-card">
          <div style={{ color: 'var(--primary)', display: 'flex', justifyContent: 'center', gap: '8px' }}>
            <Clock size={20} /> 제조 중
          </div>
          <div className="stat-value" style={{ background: 'var(--primary)', WebkitBackgroundClip: 'text' }}>{dashboard.inProgressCount}</div>
        </div>
        <div className="card glass stat-card">
          <div style={{ color: 'var(--success)', display: 'flex', justifyContent: 'center', gap: '8px' }}>
            <CheckCircle size={20} /> 제조 완료
          </div>
          <div className="stat-value" style={{ background: 'var(--success)', WebkitBackgroundClip: 'text' }}>{dashboard.completedCount}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '30px' }}>
        {/* Inventory Section */}
        <div>
          <h2 style={{ marginBottom: '20px' }}>재고 관리</h2>
          <div className="list-container">
            {stocks.map(stock => (
              <div key={stock.menuId} className="card glass" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px' }}>
                <div style={{ fontWeight: '600' }}>{stock.menuName}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <button 
                    className="btn-icon" 
                    onClick={() => handleStockChange(stock.menuId, 'decrease')}
                    disabled={stock.stock <= 0}
                  >
                    <Minus size={16} />
                  </button>
                  <span style={{ fontSize: '1.2rem', fontWeight: 'bold', width: '30px', textAlign: 'center' }}>{stock.stock}</span>
                  <button 
                    className="btn-icon" 
                    onClick={() => handleStockChange(stock.menuId, 'increase')}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Orders Section */}
        <div>
          <h2 style={{ marginBottom: '20px' }}>주문 현황</h2>
          <div className="list-container">
            {orders.length === 0 ? (
              <p>현재 주문이 없습니다.</p>
            ) : (
              orders.map(order => (
                <div key={order.orderId} className="card glass list-item">
                  <div style={{ flexGrow: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 'bold', color: 'var(--primary)' }}># {order.orderId}</span>
                      <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                        {new Date(order.orderedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute:'2-digit' })}
                      </span>
                      <span className={`status-badge status-${order.status.replace(/\s/g, '')}`}>{order.status}</span>
                    </div>
                    <div style={{ marginBottom: '8px' }}>{order.itemsSummary}</div>
                    <div style={{ fontWeight: '700' }}>총 {parseInt(order.totalPrice).toLocaleString()}원</div>
                  </div>
                  <div>
                    <select 
                      value={order.status} 
                      onChange={(e) => handleStatusChange(order.orderId, e.target.value)}
                      disabled={order.status === '제조 완료'}
                    >
                      <option value="주문 접수" disabled={order.status !== '주문 접수'}>주문 접수</option>
                      <option value="제조 중">제조 중</option>
                      <option value="제조 완료">제조 완료</option>
                    </select>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      
    </div>
  );
}

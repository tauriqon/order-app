import { useState, useEffect, useCallback } from 'react';
import { Package, TrendingUp, CheckCircle, Clock, Plus, Minus } from 'lucide-react';
import { supabase } from '../supabase';

export default function AdminPage() {
  const [dashboard, setDashboard] = useState({ totalCount: 0, receivedCount: 0, inProgressCount: 0, completedCount: 0 });
  const [stocks, setStocks] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      // 대시보드와 주문 목록을 위한 order 및 중첩 쿼리
      const { data: ordersData, error: ordersErr } = await supabase
        .from('orders')
        .select(`
          id, ordered_at, total_price, status,
          order_items ( menu_name, options, quantity )
        `)
        .order('ordered_at', { ascending: false });

      if (ordersData) {
        let rec = 0, inp = 0, com = 0;
        const formattedOrders = ordersData.map(o => {
          if (o.status === '주문 접수') rec++;
          if (o.status === '제조 중') inp++;
          if (o.status === '제조 완료') com++;
          
          let itemsSummary = o.order_items.map(i => {
             let opts = [];
             if(i.options.extraShot) opts.push('샷추가');
             if(i.options.syrup) opts.push('시럽');
             let suffix = opts.length ? `(${opts.join(', ')})` : '';
             return `${i.menu_name}${suffix} ${i.quantity}개`;
          }).join(', ');

          return {
             orderId: String(o.id),
             orderedAt: o.ordered_at,
             itemsSummary,
             totalPrice: o.total_price,
             status: o.status
          };
        });
        setDashboard({ totalCount: ordersData.length, receivedCount: rec, inProgressCount: inp, completedCount: com });
        setOrders(formattedOrders);
      }

      // 재고 조회
      const { data: stocksData } = await supabase.from('stocks').select('stock, menu_id');
      const { data: menusData } = await supabase.from('menus').select('id, name');

      if (stocksData && menusData) {
        const formattedStocks = stocksData.map(s => {
           const match = menusData.find(m => m.id === s.menu_id);
           return { menuId: s.menu_id, menuName: match ? match.name : s.menu_id, stock: s.stock };
        }).sort((a,b) => a.menuId.localeCompare(b.menuId));
        setStocks(formattedStocks);
      }

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleStockChange = async (menuId, action) => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      const current = stocks.find(s => s.menuId === menuId);
      if (!current) return;
      const newStock = action === 'increase' ? current.stock + 1 : Math.max(0, current.stock - 1);

      const { error } = await supabase.from('stocks').update({ stock: newStock }).eq('menu_id', menuId);
      
      if (!error) {
        setStocks(prev => prev.map(s => s.menuId === menuId ? { ...s, stock: newStock } : s));
      }
    } catch (err) {
      alert('재고 업데이트에 실패했습니다.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStatusChange = async (orderId, newStatus) => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', parseInt(orderId));
      if (!error) {
        fetchData();
      }
    } catch (err) {
      alert('상태 업데이트에 실패했습니다.');
    } finally {
      setIsUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="loader-container">
        <div className="spinner"></div>
        <div>관리자 데이터를 불러오는 중입니다...</div>
      </div>
    );
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
                    disabled={stock.stock <= 0 || isUpdating}
                  >
                    <Minus size={16} />
                  </button>
                  <span style={{ fontSize: '1.2rem', fontWeight: 'bold', width: '30px', textAlign: 'center' }}>{stock.stock}</span>
                  <button 
                    className="btn-icon" 
                    onClick={() => handleStockChange(stock.menuId, 'increase')}
                    disabled={isUpdating}
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
                      disabled={order.status === '제조 완료' || isUpdating}
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

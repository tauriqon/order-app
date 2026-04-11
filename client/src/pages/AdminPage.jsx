import { useState, useEffect, useCallback } from 'react';
import { Package, CheckCircle, Clock, Plus, Minus, XCircle, Trash2 } from 'lucide-react';
import { supabase } from '../supabase';

export default function AdminPage() {
  const [dashboard, setDashboard] = useState({ receivedCount: 0, inProgressCount: 0, completedCount: 0, cancelledCount: 0 });
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
        let rec = 0, inp = 0, com = 0, can = 0;
        const formattedOrders = ordersData.map(o => {
          if (o.status === '주문 접수') rec++;
          if (o.status === '제조 중') inp++;
          if (o.status === '제조 완료') com++;
          if (o.status === '취소됨') can++;
          
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
        setDashboard({ receivedCount: rec, inProgressCount: inp, completedCount: com, cancelledCount: can });
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

  const handleCancelOrder = async (orderId) => {
    if (!confirm('정말로 이 주문을 취소하시겠습니까? (기록은 남습니다)')) return;
    handleStatusChange(orderId, '취소됨');
  };

  const handleDeleteOrder = async (orderId) => {
    if (!confirm('이 주문 기록을 영구 삭제하시겠습니까?')) return;
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      const { error } = await supabase.from('orders').delete().eq('id', parseInt(orderId));
      if (!error) {
        fetchData();
      }
    } catch (err) {
      alert('삭제에 실패했습니다.');
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

  const ordersByStatus = (status) => orders.filter(o => o.status === status);

  return (
    <div style={{ paddingBottom: '100px' }}>
      
      {/* Header Title Section */}
      <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '30px' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '8px' }}>주문 현황판</h1>
        <p style={{ color: 'var(--text-secondary)' }}>실시간으로 주문을 관리하세요.</p>
      </div>

      {/* Admin Board Section with Category Background Card */}
      <div className="card glass admin-board-container">
        <div className="admin-grid" style={{ marginBottom: 0 }}>
          {/* Column: Received */}
          <div className="board-column">
            <div className="card glass stat-card" style={{ height: '100%' }}>
              <div className="board-header">
                <h3 style={{ color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem' }}>
                  <Package size={18} /> 주문 접수
                </h3>
                <span className="board-count">{dashboard.receivedCount}</span>
              </div>
              <div className="board-list">
                {ordersByStatus('주문 접수').map(order => (
                  <OrderItem 
                    key={order.orderId} 
                    order={order} 
                    onStatusChange={handleStatusChange} 
                    onCancel={() => handleCancelOrder(order.orderId)}
                    isUpdating={isUpdating}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Column: Processing */}
          <div className="board-column">
            <div className="card glass stat-card" style={{ height: '100%' }}>
              <div className="board-header">
                <h3 style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem' }}>
                  <Clock size={18} /> 제조 중
                </h3>
                <span className="board-count">{dashboard.inProgressCount}</span>
              </div>
              <div className="board-list">
                {ordersByStatus('제조 중').map(order => (
                  <OrderItem 
                    key={order.orderId} 
                    order={order} 
                    onStatusChange={handleStatusChange} 
                    onCancel={() => handleCancelOrder(order.orderId)}
                    isUpdating={isUpdating}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Column: Completed */}
          <div className="board-column">
            <div className="card glass stat-card" style={{ height: '100%' }}>
              <div className="board-header">
                <h3 style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem' }}>
                  <CheckCircle size={18} /> 제조 완료
                </h3>
                <span className="board-count">{dashboard.completedCount}</span>
              </div>
              <div className="board-list">
                {ordersByStatus('제조 완료').map(order => (
                  <OrderItem 
                    key={order.orderId} 
                    order={order} 
                    onDelete={() => handleDeleteOrder(order.orderId)}
                    isUpdating={isUpdating}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Column: Cancelled */}
          <div className="board-column">
            <div className="card glass stat-card" style={{ height: '100%' }}>
              <div className="board-header">
                <h3 style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem' }}>
                  <XCircle size={18} /> 취소됨
                </h3>
                <span className="board-count">{dashboard.cancelledCount}</span>
              </div>
              <div className="board-list">
                {ordersByStatus('취소됨').map(order => (
                  <OrderItem 
                    key={order.orderId} 
                    order={order} 
                    onDelete={() => handleDeleteOrder(order.orderId)}
                    isUpdating={isUpdating}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Inventory Section (Now at bottom) */}
      <div style={{ marginTop: '40px' }}>
        <h2 style={{ marginBottom: '20px' }}>재고 관리</h2>
        <div className="menu-grid">
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
      
    </div>
  );
}

function OrderItem({ order, onStatusChange, onCancel, onDelete, isUpdating }) {
  return (
    <div className="board-list-item">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontWeight: 'bold', color: 'var(--primary)', fontSize: '0.9rem' }}># {order.orderId}</span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {new Date(order.orderedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute:'2-digit' })}
        </span>
      </div>
      <div style={{ marginBottom: '8px', fontSize: '0.9rem', lineHeight: '1.4' }}>{order.itemsSummary}</div>
      <div style={{ fontWeight: '700', marginBottom: '12px', fontSize: '1rem' }}>{parseInt(order.totalPrice).toLocaleString()}원</div>
      
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        {onStatusChange && (
          <select 
            value={order.status} 
            onChange={(e) => onStatusChange(order.orderId, e.target.value)}
            disabled={isUpdating}
            style={{ flexGrow: 1, padding: '6px 10px', fontSize: '0.85rem' }}
          >
            <option value="주문 접수" disabled={order.status !== '주문 접수'}>주문 접수</option>
            <option value="제조 중" disabled={order.status === '제조 완료'}>제조 중</option>
            <option value="제조 완료">제조 완료</option>
          </select>
        )}
        
        {onCancel && (
          <button className="btn-icon" onClick={onCancel} style={{ width: '32px', height: '32px', background: '#fee2e2', color: '#dc2626', borderColor: '#fecaca' }}>
            <XCircle size={16} />
          </button>
        )}
        
        {onDelete && (
          <button className="btn-icon" onClick={onDelete} style={{ width: '32px', height: '32px', background: '#f1f5f9', color: 'var(--text-secondary)' }}>
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}


import { useState, useEffect, useCallback } from 'react';
import { Package, CheckCircle, Clock, Plus, Minus, XCircle, Trash2 } from 'lucide-react';
import { supabase } from '../supabase';

export default function AdminPage() {
  const [dashboard, setDashboard] = useState({ receivedCount: 0, inProgressCount: 0, completedCount: 0, cancelledCount: 0 });
  const [stocks, setStocks] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);

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

    // 실시간 주문 구독 설정
    const channel = supabase
      .channel('admin-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stocks' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
      // 만약 '취소됨'으로 변경하는 경우 재고를 다시 돌려줌
      if (newStatus === '취소됨') {
        // 현재 주문의 아이템들을 조회
        const { data: items, error: itemsErr } = await supabase
          .from('order_items')
          .select('menu_id, quantity')
          .eq('order_id', parseInt(orderId));

        if (itemsErr) throw itemsErr;

        // 각 아이템별로 재고 복구
        for (const item of items) {
          const { data: currentStockData } = await supabase
            .from('stocks')
            .select('stock')
            .eq('menu_id', item.menu_id)
            .single();
          
          if (currentStockData) {
            await supabase
              .from('stocks')
              .update({ stock: currentStockData.stock + item.quantity })
              .eq('menu_id', item.menu_id);
          }
        }
      }

      const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', parseInt(orderId));
      if (!error) {
        fetchData();
      }
    } catch (err) {
      console.error(err);
      alert('상태 업데이트 및 재고 복구에 실패했습니다.');
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

  const handleDeleteAllCancelled = async () => {
    const cancelledCount = ordersByStatus('취소됨').length;
    if (cancelledCount === 0) return;
    
    if (!confirm(`취소된 주문 ${cancelledCount}건을 모두 영구 삭제하시겠습니까?`)) return;
    
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('status', '취소됨');
        
      if (!error) {
        setSelectedOrderIds([]);
        fetchData();
      }
    } catch (err) {
      alert('전체 삭제에 실패했습니다.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteSelectedCancelled = async () => {
    if (selectedOrderIds.length === 0) return;
    
    if (!confirm(`선택한 주문 ${selectedOrderIds.length}건을 영구 삭제하시겠습니까?`)) return;
    
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('orders')
        .delete()
        .in('id', selectedOrderIds.map(id => parseInt(id)));
        
      if (!error) {
        setSelectedOrderIds([]);
        fetchData();
      }
    } catch (err) {
      alert('선택 삭제에 실패했습니다.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleToggleSelect = (orderId) => {
    setSelectedOrderIds(prev => 
      prev.includes(orderId) 
        ? prev.filter(id => id !== orderId) 
        : [...prev, orderId]
    );
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
                {ordersByStatus('주문 접수').length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem', opacity: 0.6 }}>
                    접수된 주문이 없습니다.
                  </div>
                ) : (
                  ordersByStatus('주문 접수').map(order => (
                    <OrderItem 
                      key={order.orderId} 
                      order={order} 
                      onStatusChange={handleStatusChange} 
                      onCancel={() => handleCancelOrder(order.orderId)}
                      isUpdating={isUpdating}
                    />
                  ))
                )}
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
                {ordersByStatus('제조 중').length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem', opacity: 0.6 }}>
                    진행 중인 주문이 없습니다.
                  </div>
                ) : (
                  ordersByStatus('제조 중').map(order => (
                    <OrderItem 
                      key={order.orderId} 
                      order={order} 
                      onStatusChange={handleStatusChange} 
                      onCancel={() => handleCancelOrder(order.orderId)}
                      isUpdating={isUpdating}
                    />
                  ))
                )}
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
                {ordersByStatus('제조 완료').length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem', opacity: 0.6 }}>
                    완료된 주문이 없습니다.
                  </div>
                ) : (
                  ordersByStatus('제조 완료').map(order => (
                    <OrderItem 
                      key={order.orderId} 
                      order={order} 
                      onDelete={() => handleDeleteOrder(order.orderId)}
                      isUpdating={isUpdating}
                    />
                  ))
                )}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {ordersByStatus('취소됨').length > 0 && (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button 
                        onClick={handleDeleteSelectedCancelled}
                        disabled={selectedOrderIds.length === 0}
                        style={{ 
                          padding: '2px 8px', 
                          fontSize: '0.7rem', 
                          background: selectedOrderIds.length > 0 ? '#fee2e2' : '#f1f5f9', 
                          border: '1px solid var(--border-color)', 
                          borderRadius: '4px',
                          cursor: selectedOrderIds.length > 0 ? 'pointer' : 'not-allowed',
                          color: selectedOrderIds.length > 0 ? '#dc2626' : '#64748b'
                        }}
                      >
                        선택 삭제
                      </button>
                      <button 
                        onClick={handleDeleteAllCancelled}
                        style={{ 
                          padding: '2px 8px', 
                          fontSize: '0.7rem', 
                          background: '#f1f5f9', 
                          border: '1px solid var(--border-color)', 
                          borderRadius: '4px',
                          cursor: 'pointer',
                          color: '#64748b'
                        }}
                      >
                        전체 삭제
                      </button>
                    </div>
                  )}
                  <span className="board-count">{dashboard.cancelledCount}</span>
                </div>
              </div>
              <div className="board-list">
                {ordersByStatus('취소됨').length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem', opacity: 0.6 }}>
                    취소된 내역이 없습니다.
                  </div>
                ) : (
                  ordersByStatus('취소됨').map(order => (
                    <OrderItem 
                      key={order.orderId} 
                      order={order} 
                      isUpdating={isUpdating}
                      isSelected={selectedOrderIds.includes(order.orderId)}
                      onSelect={() => handleToggleSelect(order.orderId)}
                    />
                  ))
                )}
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
            <div key={stock.menuId} className="card glass" style={{ padding: '20px', gap: '20px' }}>
              {/* Row 1: Title and Status */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: '700', fontSize: '1.1rem' }}>
                  {stock.menuName} ({stock.stock}개)
                </div>
                <span className={`stock-badge stock-${stock.stock === 0 ? '품절' : stock.stock < 5 ? '주의' : '정상'}`}>
                  {stock.stock === 0 ? '품절' : stock.stock < 5 ? '주의' : '정상'}
                </span>
              </div>

              {/* Row 2: Large Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '24px' }}>
                <button 
                  className="btn-icon" 
                  style={{ width: '60px', height: '60px', borderRadius: '12px' }}
                  onClick={() => handleStockChange(stock.menuId, 'decrease')}
                  disabled={stock.stock <= 0 || isUpdating}
                >
                  <Minus size={24} />
                </button>
                <button 
                  className="btn-icon" 
                  style={{ width: '60px', height: '60px', borderRadius: '12px' }}
                  onClick={() => handleStockChange(stock.menuId, 'increase')}
                  disabled={isUpdating}
                >
                  <Plus size={24} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      
    </div>
  );
}

function OrderItem({ order, onStatusChange, onCancel, onDelete, isUpdating, isSelected, onSelect }) {
  return (
    <div className={`board-list-item ${isSelected ? 'selected' : ''}`} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
      {onSelect && (
        <div style={{ paddingTop: '4px' }}>
          <input 
            type="checkbox" 
            checked={isSelected} 
            onChange={onSelect} 
            disabled={isUpdating}
            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
          />
        </div>
      )}
      <div style={{ flexGrow: 1 }}>
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
    </div>
  );
}


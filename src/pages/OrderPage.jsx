import { useState, useEffect, useCallback } from 'react';
import { ShoppingCart, Plus, Minus, Coffee } from 'lucide-react';
import { supabase } from '../supabase';

export default function OrderPage() {
  const [menus, setMenus] = useState([]);
  const [cart, setCart] = useState([]);
  const [optionState, setOptionState] = useState({}); // { menuId: { extraShot: false, syrup: false } }
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchMenus = useCallback(async () => {
    try {
      const { data: menusData, error: menusErr } = await supabase
        .from('menus')
        .select('*')
        .order('id', { ascending: true });
        
      if (menusErr) throw menusErr;

      const { data: stocksData, error: stocksErr } = await supabase
        .from('stocks')
        .select('*');
        
      if (stocksErr) throw stocksErr;
      
      const fetchedMenus = menusData.map(m => {
        const s = stocksData.find(st => st.menu_id === m.id);
        return {
          id: m.id,
          name: m.name,
          price: m.price,
          description: m.description,
          imageUrl: m.image_url,
          stock: s ? s.stock : 0
        };
      });
      
      setMenus(fetchedMenus);
      
      const initialOptions = {};
      fetchedMenus.forEach(m => {
        initialOptions[m.id] = { extraShot: false, syrup: false };
      });
      setOptionState(initialOptions);
    } catch (err) {
      console.error('Failed to load menus', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMenus();

    const channel = supabase
      .channel('order-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stocks' }, () => {
        fetchMenus();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchMenus]);

  const handleOptionChange = (menuId, field) => {
    setOptionState(prev => ({
      ...prev,
      [menuId]: {
        ...prev[menuId],
        [field]: !prev[menuId][field]
      }
    }));
  };

  const getSubtotal = (basePrice, options) => {
    let price = basePrice;
    if (options.extraShot) price += 500;
    return price;
  };

  const addToCart = (menu) => {
    const options = optionState[menu.id];
    
    // 장바구니에 담기 전 재고 확인
    const existingInCart = cart.find(
      p => p.menuId === menu.id && 
           p.options.extraShot === options.extraShot && 
           p.options.syrup === options.syrup
    );

    if (existingInCart) {
      if (existingInCart.quantity >= menu.stock) {
        alert(`죄송합니다. ${menu.name}의 현재 재고(${menu.stock}개)를 초과하여 담을 수 없습니다.`);
        return;
      }
    } else {
      if (menu.stock <= 0) {
        alert('죄송합니다. 품절된 상품입니다.');
        return;
      }
    }

    const unitPrice = getSubtotal(menu.price, options);
    
    setCart(prev => {
      const existing = prev.find(
        p => p.menuId === menu.id && p.options.extraShot === options.extraShot && p.options.syrup === options.syrup
      );
      if (existing) {
        return prev.map(p => 
          p === existing 
            ? { ...p, quantity: p.quantity + 1, subtotal: (p.quantity + 1) * p.unitPrice }
            : p
        );
      }
      return [...prev, {
        menuId: menu.id,
        menuName: menu.name,
        basePrice: menu.price,
        options: { ...options },
        unitPrice,
        quantity: 1,
        subtotal: unitPrice
      }];
    });
  };

  const removeFromCart = (index) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  const handleOrder = async () => {
    if (cart.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    
    // 재고 검증
    for (const item of cart) {
      const { data: stockData } = await supabase
        .from('stocks')
        .select('stock')
        .eq('menu_id', item.menuId)
        .single();
        
      if (!stockData || stockData.stock < item.quantity) {
        alert(`죄송합니다. ${item.menuName}의 재고가 현재 부족합니다. (현재 재고: ${stockData?.stock || 0}개)`);
        setIsSubmitting(false); // 버튼 상태 복구
        fetchMenus(); // 최신 재고 정보를 가져와 UI 업데이트
        return;
      }
    }

    const totalPrice = cart.reduce((sum, item) => sum + item.subtotal, 0);

    try {
      // 재고 차감 (클라이언트에서 직접)
      for (const item of cart) {
         const { data: currentStock } = await supabase.from('stocks').select('stock').eq('menu_id', item.menuId).single();
         await supabase.from('stocks').update({ stock: currentStock.stock - item.quantity }).eq('menu_id', item.menuId);
      }

      // 주문 생성
      const { data: orderData, error: orderErr } = await supabase
        .from('orders')
        .insert({ total_price: totalPrice, status: '주문 접수' })
        .select()
        .single();

      if (orderErr) throw orderErr;

      // 아이템 생성
      const orderItemsInsert = cart.map(item => ({
        order_id: orderData.id,
        menu_id: item.menuId,
        menu_name: item.menuName,
        options: item.options,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        subtotal: item.subtotal
      }));

      const { error: itemsErr } = await supabase.from('order_items').insert(orderItemsInsert);
      if (itemsErr) throw itemsErr;

      alert('주문이 성공적으로 접수되었습니다!');
      setCart([]);
      fetchMenus(); // 즉시 UI 갱신을 위해 호출
    } catch (err) {
      alert('오류가 발생했습니다: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="loader-container">
        <div className="spinner"></div>
        <div>메뉴를 불러오는 중입니다...</div>
      </div>
    );
  }

  const cartTotal = cart.reduce((sum, item) => sum + item.subtotal, 0);

  return (
    <div className="page-layout">
      {/* Menu List */}
      <div style={{ marginBottom: '40px' }}>
        <h2 style={{ marginBottom: '20px' }}>메뉴 선택</h2>
        {menus.length === 0 ? (
          <p>표시할 메뉴가 없습니다.</p>
        ) : (
          <div className="menu-grid">
            {menus.map(menu => (
              <div key={menu.id} className="card glass">
                {menu.imageUrl ? (
                  <img src={`${import.meta.env.BASE_URL}${menu.imageUrl.startsWith('/') ? menu.imageUrl.slice(1) : menu.imageUrl}`} alt={menu.name} className="card-image" />
                ) : (
                  <div className="card-image" style={{display:'flex', alignItems:'center', justifyContent:'center'}}>
                    <Coffee size={48} opacity={0.5} />
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div className="card-title" style={{ margin: 0 }}>{menu.name}</div>
                  {menu.stock === 0 && (
                    <span className="stock-badge stock-품절" style={{ padding: '2px 8px', borderRadius: '4px' }}>품절</span>
                  )}
                </div>
                <div className="card-price">{menu.price.toLocaleString()}원</div>
                <div className="card-desc">{menu.description}</div>
                
                <div className="options-group">
                  <label className="option-label">
                    <input 
                      type="checkbox" 
                      checked={optionState[menu.id]?.extraShot || false}
                      onChange={() => handleOptionChange(menu.id, 'extraShot')}
                    />
                    샷 추가 (+500원)
                  </label>
                  <label className="option-label">
                    <input 
                      type="checkbox" 
                      checked={optionState[menu.id]?.syrup || false}
                      onChange={() => handleOptionChange(menu.id, 'syrup')}
                    />
                    시럽 추가 (무료)
                  </label>
                </div>
                
                <button 
                  className="btn" 
                  onClick={() => addToCart(menu)}
                  disabled={menu.stock === 0 || cart.filter(item => item.menuId === menu.id).reduce((sum, item) => sum + item.quantity, 0) >= menu.stock}
                  style={{ fontSize: '1.2rem' }}
                >
                  <Plus size={20} /> {menu.stock === 0 ? '품절되었습니다' : '담기'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cart Area (At bottom) */}
      <div className="sidebar glass">
        <h2 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShoppingCart /> 장바구니
        </h2>
        
        <div style={{ overflowY: 'auto', maxHeight: '400px', marginBottom: '20px' }}>
          {cart.length === 0 ? (
            <div style={{color:'var(--text-secondary)', textAlign:'center', padding:'40px 0'}}>
              장바구니가 비어있습니다. 메뉴를 선택해 주세요.
            </div>
          ) : (
            cart.map((item, i) => (
              <div key={i} className="cart-item">
                <div style={{ flexGrow: 1 }}>
                  <div style={{ fontWeight: '600' }}>{item.menuName}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {[item.options.extraShot && '샷추가', item.options.syrup && '시럽'].filter(Boolean).join(', ')}
                  </div>
                  <div style={{ fontSize: '0.9rem', marginTop: '4px', color: 'var(--primary)' }}>
                    {item.unitPrice.toLocaleString()}원 x {item.quantity}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ fontWeight: '700' }}>{item.subtotal.toLocaleString()}원</div>
                  <button className="btn-icon" onClick={() => removeFromCart(i)}>
                    <Minus size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', fontSize: '1.2rem', fontWeight: 'bold' }}>
            <span>총 결제금액</span>
            <span style={{ color: 'var(--primary)' }}>{cartTotal.toLocaleString()}원</span>
          </div>
          <button 
            className="btn" 
            style={{ padding: '16px', fontSize: '1.1rem' }} 
            disabled={cart.length === 0 || isSubmitting}
            onClick={handleOrder}
          >
            {isSubmitting ? '주문 접수 중...' : '주문 접수하기'}
          </button>
        </div>
      </div>
    </div>
  );
}

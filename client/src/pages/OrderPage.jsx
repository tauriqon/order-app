import { useState, useEffect } from 'react';
import { ShoppingCart, Plus, Minus, Coffee } from 'lucide-react';
import { supabase } from '../supabase';

export default function OrderPage() {
  const [menus, setMenus] = useState([]);
  const [cart, setCart] = useState([]);
  const [optionState, setOptionState] = useState({}); // { menuId: { extraShot: false, syrup: false } }
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function fetchMenus() {
      try {
        const { data, error } = await supabase
          .from('menus')
          .select('*')
          .order('id', { ascending: true });
          
        if (error) throw error;
        
        const fetchedMenus = data.map(m => ({
          id: m.id,
          name: m.name,
          price: m.price,
          description: m.description,
          imageUrl: m.image_url
        }));
        
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
    }
    fetchMenus();
  }, []);

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
        alert(`죄송합니다. ${item.menuName}의 재고가 부족합니다.`);
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
                  <img src={menu.imageUrl} alt={menu.name} className="card-image" />
                ) : (
                  <div className="card-image" style={{display:'flex', alignItems:'center', justifyContent:'center'}}>
                    <Coffee size={48} opacity={0.5} />
                  </div>
                )}
                <div className="card-title">{menu.name}</div>
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
                
                <button className="btn" onClick={() => addToCart(menu)}>
                  <Plus size={18} /> 담기
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

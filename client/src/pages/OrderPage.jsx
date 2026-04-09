import { useState, useEffect } from 'react';
import { ShoppingCart, Plus, Minus, Coffee } from 'lucide-react';

const API_BASE = 'http://localhost:5001/api';

export default function OrderPage() {
  const [menus, setMenus] = useState([]);
  const [cart, setCart] = useState([]);
  const [optionState, setOptionState] = useState({}); // { menuId: { extraShot: false, syrup: false } }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/menus`)
      .then(res => res.json())
      .then(data => {
        setMenus(data);
        const initialOptions = {};
        data.forEach(m => {
          initialOptions[m.id] = { extraShot: false, syrup: false };
        });
        setOptionState(initialOptions);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
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
    if (cart.length === 0) return;
    
    const totalPrice = cart.reduce((sum, item) => sum + item.subtotal, 0);
    const payload = {
      items: cart,
      totalPrice
    };

    try {
      const res = await fetch(`${API_BASE}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json();
        alert(`주문 실패: ${errData.error || '알 수 없는 오류'}`);
        return;
      }

      alert('주문이 성공적으로 접수되었습니다!');
      setCart([]);
    } catch (err) {
      alert('네트워크 오류가 발생했습니다.');
    }
  };

  if (loading) {
    return <div style={{textAlign: 'center', marginTop: '50px'}}>메뉴를 불러오는 중입니다...</div>;
  }

  const cartTotal = cart.reduce((sum, item) => sum + item.subtotal, 0);

  return (
    <div className="page-layout">
      {/* Menu List */}
      <div>
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

      {/* Cart Area */}
      <div>
        <div className="sidebar glass">
          <h2 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShoppingCart /> 장바구니
          </h2>
          
          <div style={{ flexGrow: 1, overflowY: 'auto', marginBottom: '20px' }}>
            {cart.length === 0 ? (
              <div style={{color:'var(--text-secondary)', textAlign:'center', marginTop:'40px'}}>
                장바구니가 비어있습니다.
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
              disabled={cart.length === 0}
              onClick={handleOrder}
            >
              주문 접수하기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

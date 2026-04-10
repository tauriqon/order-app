-- init.sql
CREATE TABLE IF NOT EXISTS menus (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  price INTEGER NOT NULL,
  description TEXT,
  image_url TEXT
);

CREATE TABLE IF NOT EXISTS stocks (
  menu_id VARCHAR(50) PRIMARY KEY REFERENCES menus(id),
  stock INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  ordered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  total_price INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT '주문 접수'
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  menu_id VARCHAR(50) REFERENCES menus(id),
  menu_name VARCHAR(100) NOT NULL,
  options JSONB NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  subtotal INTEGER NOT NULL
);

-- 초기 데이터 삽입 (존재하지 않는 메뉴에 대해서만 추가)
INSERT INTO menus (id, name, price, description, image_url)
VALUES 
  ('americano-ice', '아메리카노(ICE)', 4000, '시원한 에스프레소 워터', '/images/americano_ice.png'),
  ('americano-hot', '아메리카노(HOT)', 4000, '따뜻한 에스프레소 워터', '/images/americano_hot.png'),
  ('cafelatte-ice', '카페라떼(ICE)', 4500, '고소한 우유와 에스프레소', '/images/cafelatte_ice.png')
ON CONFLICT (id) DO NOTHING;

INSERT INTO stocks (menu_id, stock)
VALUES 
  ('americano-ice', 10),
  ('americano-hot', 10),
  ('cafelatte-ice', 10)
ON CONFLICT (menu_id) DO NOTHING;

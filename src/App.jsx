import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import OrderPage from './pages/OrderPage';
import AdminPage from './pages/AdminPage';

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <div className="container">
        <header className="header glass">
          <div className="brand">COZY COFFEE</div>
          <nav className="nav-tabs">
            <NavLink 
              to="/" 
              className={({ isActive }) => `nav-tab ${isActive ? "active" : ""}`}
            >
              주문하기
            </NavLink>
            <NavLink 
              to="/admin" 
              className={({ isActive }) => `nav-tab ${isActive ? "active" : ""}`}
            >
              관리자
            </NavLink>
          </nav>
        </header>
        
        <Routes>
          <Route path="/" element={<OrderPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;

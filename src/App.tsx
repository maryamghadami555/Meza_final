import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Shop from './pages/Shop'
import ProductPage from './pages/ProductPage'
import CartPage from './pages/CartPage'
import Checkout from './pages/Checkout'
import { Login, Register, Forgot, Reset } from './pages/Auth'
import { TicketList, TicketChat } from './pages/Tickets'
import Account from './pages/Account'
import OrderDetail from './pages/OrderDetail'
import AdminApp from './admin/AdminApp'
import { About, Contact, NotFound } from './pages/Static'

export default function App() {
  return (
    <Routes>
      <Route path="admin/*" element={<AdminApp />} />
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="shop" element={<Shop />} />
        <Route path="product/:id" element={<ProductPage />} />
        <Route path="cart" element={<CartPage />} />
        <Route path="checkout" element={<Checkout />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="account" element={<Account />} />
        <Route path="account/orders/:id" element={<OrderDetail />} />
        <Route path="about" element={<About />} />
        <Route path="contact" element={<Contact />} />
        <Route path="tickets" element={<TicketList />} />
        <Route path="tickets/:id" element={<TicketChat />} />
        <Route path="forgot" element={<Forgot />} />
        <Route path="reset-password" element={<Reset />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

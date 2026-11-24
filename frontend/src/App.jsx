import React, { useState, useEffect, useCallback } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import CashierPage from './pages/CashierPage';
import TransactionsPage from './pages/TransactionsPage';
import CashierReportPage from './pages/CashierReportPage';
import OwnerReportPage from './pages/OwnerReportPage';
import ProductsPage from './pages/ProductsPage';
import IntegrationPage from './pages/IntegrationPage';

export default function App() {
  const [user, setUser] = useState(null);
  const [activeShift, setActiveShift] = useState(null);
  const [activeMenu, setActiveMenu] = useState('kasir');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('zkcell_token');
    localStorage.removeItem('zkcell_user');
    localStorage.removeItem('zkcell_shift');
    setUser(null);
    setActiveShift(null);
    setActiveMenu('kasir');
    setIsMobileMenuOpen(false);
  }, []);

  useEffect(() => {
    try {
      const token = localStorage.getItem('zkcell_token');
      const savedUser = localStorage.getItem('zkcell_user');
      const savedShift = localStorage.getItem('zkcell_shift');

      if (!token || !savedUser) {
        handleLogout();
        return;
      }

      const parsedUser = JSON.parse(savedUser);
      setUser(parsedUser);
      setActiveMenu(parsedUser.role === 'owner' ? 'laporan_owner' : 'kasir');

      if (savedShift && savedShift !== 'null' && savedShift !== 'undefined') {
        setActiveShift(JSON.parse(savedShift));
      }
    } catch (err) {
      console.error('Data sesi tidak valid, mereset login:', err);
      handleLogout();
    }

    // Otomatis logout jika token kadaluwarsa (401 dari API interceptor)
    const onUnauthorized = () => handleLogout();
    window.addEventListener('zkcell:unauthorized', onUnauthorized);
    return () => window.removeEventListener('zkcell:unauthorized', onUnauthorized);
  }, [handleLogout]);

  const handleLoginSuccess = (loggedInUser, shiftData) => {
    setUser(loggedInUser);
    setActiveShift(shiftData || null);
    if (shiftData) {
      localStorage.setItem('zkcell_shift', JSON.stringify(shiftData));
    } else {
      localStorage.removeItem('zkcell_shift');
    }
    setActiveMenu(loggedInUser.role === 'owner' ? 'laporan_owner' : 'kasir');
  };

  // Sinkronisasi state shift saat kasir membuka atau menutup shift
  const handleShiftUpdated = (updatedShift) => {
    setActiveShift(updatedShift || null);
    if (updatedShift) {
      localStorage.setItem('zkcell_shift', JSON.stringify(updatedShift));
    } else {
      localStorage.removeItem('zkcell_shift');
    }
  };

  if (!user) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  const isOwner = user.role === 'owner';

  const menuTitles = {
    kasir: 'Workspace / Kasir',
    transaksi: 'Workspace / Transaksi',
    laporan_pelayan: 'Workspace / Laporan Shift',
    laporan_owner: 'Workspace / Laporan Owner',
    produk: 'Workspace / Produk & Tarif',
    integrasi: 'Workspace / Pengaturan & Integrasi',
  };

  // Render halaman dengan proteksi role agar tidak pernah layar kosong
  const renderActivePage = () => {
    switch (activeMenu) {
      case 'kasir':
        return (
          <CashierPage
            user={user}
            activeShift={activeShift}
            onShiftUpdated={handleShiftUpdated}
          />
        );
      case 'transaksi':
        return <TransactionsPage user={user} />;
      case 'laporan_pelayan':
        return (
          <CashierReportPage
            user={user}
            activeShift={activeShift}
            onShiftUpdated={handleShiftUpdated}
          />
        );
      case 'laporan_owner':
        return isOwner ? (
          <OwnerReportPage />
        ) : (
          <CashierPage user={user} activeShift={activeShift} onShiftUpdated={handleShiftUpdated} />
        );
      case 'produk':
        return isOwner ? (
          <ProductsPage />
        ) : (
          <CashierPage user={user} activeShift={activeShift} onShiftUpdated={handleShiftUpdated} />
        );
      case 'integrasi':
        return isOwner ? (
          <IntegrationPage />
        ) : (
          <CashierPage user={user} activeShift={activeShift} onShiftUpdated={handleShiftUpdated} />
        );
      default:
        return isOwner ? (
          <OwnerReportPage />
        ) : (
          <CashierPage user={user} activeShift={activeShift} onShiftUpdated={handleShiftUpdated} />
        );
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F6F8F8]">
      {/* Sidebar: sticky di desktop, slide-over drawer di mobile */}
      <div className="no-print lg:sticky lg:top-0 lg:h-screen shrink-0">
        <Sidebar
          activeMenu={activeMenu}
          setActiveMenu={setActiveMenu}
          user={user}
          onLogout={handleLogout}
          isOpen={isMobileMenuOpen}
          onClose={() => setIsMobileMenuOpen(false)}
        />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar Header */}
        <header className="no-print sticky top-0 z-30 bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Buka menu navigasi"
              className="lg:hidden p-2 -ml-1 rounded-lg text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition shrink-0"
            >
              <Menu size={20} />
            </button>

            <p className="text-xs font-medium text-gray-500 truncate">
              {menuTitles[activeMenu] || 'Workspace / ZKCELL'}
            </p>

            {activeShift ? (
              <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-50 text-[#047857] border border-emerald-200 text-[11px] font-medium shrink-0">
                Shift #{activeShift.id} · Aktif
              </span>
            ) : (
              !isOwner && (
                <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-medium shrink-0">
                  Belum ada shift aktif
                </span>
              )
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-gray-500 hidden sm:inline">
              {new Date().toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
            <span className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[#047857] text-[11px] sm:text-xs font-semibold capitalize">
              {user.role} · {user.name}
            </span>
          </div>
        </header>

        {/* Konten Utama */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {renderActivePage()}
        </main>
      </div>
    </div>
  );
}
import React from 'react';
import { LogOut, X } from 'lucide-react';

export default function Sidebar({
  activeMenu,
  setActiveMenu,
  user,
  onLogout,
  isOpen = false,
  onClose = () => {},
}) {
  const menus = [
    { id: 'kasir', num: '01', label: 'Kasir', ownerOnly: false },
    { id: 'transaksi', num: '02', label: 'Transaksi', ownerOnly: false },
    { id: 'laporan_pelayan', num: '03', label: 'Laporan pelayan', ownerOnly: false },
    { id: 'laporan_owner', num: '04', label: 'Laporan owner', ownerOnly: true },
    { id: 'produk', num: '05', label: 'Produk & tarif', ownerOnly: true },
    { id: 'integrasi', num: '06', label: 'Integrasi', ownerOnly: true },
  ];

  const handleSelectMenu = (id, isDisabled) => {
    if (isDisabled) return;
    setActiveMenu(id);
    onClose();
  };

  return (
    <>
      {/* Backdrop gelap saat drawer terbuka di HP/Tablet */}
      {isOpen && (
        <div
          onClick={onClose}
          className="no-print fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px] lg:hidden"
        />
      )}

      <aside
        className={`no-print fixed inset-y-0 left-0 z-50 w-64 bg-[#0F1E22] text-white h-dvh overflow-y-auto flex flex-col justify-between p-5 shrink-0 transform transition-transform duration-200 ease-out lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          {/* Brand Header */}
          <div className="mb-8 px-2 flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-wider text-white">ZKCELL</h1>
              <p className="text-[10px] tracking-widest text-gray-400 uppercase mt-0.5">
                RUANG OPERASIONAL
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Tutup menu"
              className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1A3338] transition"
            >
              <X size={18} />
            </button>
          </div>

          {/* Navigation */}
          <p className="text-[10px] font-semibold tracking-wider text-gray-500 uppercase px-2 mb-3">
            WORKSPACE
          </p>
          <nav className="space-y-1.5">
            {menus.map((item) => {
              const isDisabled = item.ownerOnly && user?.role !== 'owner';
              const isActive = activeMenu === item.id;

              return (
                <button
                  key={item.id}
                  disabled={isDisabled}
                  onClick={() => handleSelectMenu(item.id, isDisabled)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition text-left ${
                    isActive
                      ? 'bg-[#1A3338] text-white font-medium'
                      : isDisabled
                      ? 'text-gray-600 cursor-not-allowed'
                      : 'text-gray-300 hover:bg-[#15292E] hover:text-white'
                  }`}
                >
                  <span className="text-xs font-mono text-gray-500">{item.num}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Cabang Aktif */}
          <div className="mt-10 px-2">
            <p className="text-[10px] font-semibold tracking-wider text-gray-500 uppercase mb-2">
              CABANG AKTIF
            </p>
            <p className="text-sm font-semibold text-white">ZKCELL · Utama</p>
            <p className="text-xs text-gray-400 mt-0.5">Operasional 08.00 – 22.00</p>
          </div>
        </div>

        {/* Footer Status & Logout */}
        <div className="px-2 pt-4 mt-6 border-t border-gray-800 space-y-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Sistem online</span>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">Tersambung ke API & Socket</p>
          </div>

          <button
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-[#16292E] hover:bg-red-950/60 text-gray-300 hover:text-red-300 text-xs font-medium transition"
          >
            <LogOut size={14} />
            <span>Keluar Akun</span>
          </button>
        </div>
      </aside>
    </>
  );
}
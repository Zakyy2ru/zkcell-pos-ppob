import React, { useState } from 'react';
import { Store, UserCheck, ShieldCheck, ArrowRight, Eye, EyeOff } from 'lucide-react';
import api from '../services/api';

export default function LoginPage({ onLoginSuccess }) {
  const [selectedRole, setSelectedRole] = useState('karyawan'); // 'karyawan' | 'owner'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [initialCash, setInitialCash] = useState('0');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleRoleSwitch = (role) => {
    setSelectedRole(role);
    setUsername('');
    setPassword('');
    setErrorMsg('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      const parsedCash = initialCash === '' ? 0 : Math.max(0, Number(initialCash) || 0);
      const payload = {
        username: username.trim(),
        password,
        ...(selectedRole === 'karyawan' && { initial_cash: parsedCash }),
      };

      const res = await api.post('/auth/login', payload);
      const { token, user, activeShift } = res.data;

      // Validasi kecocokan tab peran yang dipilih dengan role akun di database
      if (selectedRole === 'owner' && user.role !== 'owner') {
        setErrorMsg('Akun ini bukan akun Owner. Silakan masuk melalui tab Karyawan.');
        setLoading(false);
        return;
      }
      if (selectedRole === 'karyawan' && user.role === 'owner') {
        setErrorMsg('Akun Owner silakan masuk melalui tab Owner.');
        setLoading(false);
        return;
      }

      localStorage.setItem('zkcell_token', token);
      localStorage.setItem('zkcell_user', JSON.stringify(user));
      if (activeShift) {
        localStorage.setItem('zkcell_shift', JSON.stringify(activeShift));
      } else {
        localStorage.removeItem('zkcell_shift');
      }

      onLoginSuccess(user, activeShift);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Gagal masuk. Periksa kembali username dan password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F8F8] flex flex-col items-center justify-center p-4">
      {/* Header Brand */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#047857] text-white shadow-sm mb-3">
          <Store size={24} />
        </div>
        <p className="text-xs font-bold tracking-widest text-[#047857] uppercase">
          ZKCELL · CABANG UTAMA
        </p>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Masuk Ruang Operasional</h1>
        <p className="text-sm text-gray-500 mt-1">
          Pilih akses masuk sesuai peran untuk memulai operasional konter.
        </p>
      </div>

      {/* Card Form Login */}
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 p-7 shadow-xs space-y-6">
        {/* Segmented Control: Karyawan vs Owner */}
        <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-gray-100 rounded-xl">
          <button
            type="button"
            onClick={() => handleRoleSwitch('karyawan')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${
              selectedRole === 'karyawan'
                ? 'bg-white text-[#047857] shadow-xs'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <UserCheck size={15} />
            Karyawan
          </button>

          <button
            type="button"
            onClick={() => handleRoleSwitch('owner')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${
              selectedRole === 'owner'
                ? 'bg-white text-[#047857] shadow-xs'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <ShieldCheck size={15} />
            Owner
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-700">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Username {selectedRole === 'karyawan' ? 'Karyawan' : 'Owner'}
            </label>
            <input
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={selectedRole === 'karyawan' ? 'Masukkan username karyawan' : 'Masukkan username owner'}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm text-gray-900 focus:outline-none focus:border-[#047857]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-4 pr-11 py-3 rounded-xl border border-gray-300 text-sm text-gray-900 focus:outline-none focus:border-[#047857]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Input Modal Kas Awal hanya tampil jika tab Karyawan aktif */}
          {selectedRole === 'karyawan' && (
            <div className="pt-1">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Modal Kas Awal Laci (Rp)
              </label>
              <input
                type="number"
                min="0"
                step="1000"
                required
                value={initialCash}
                onChange={(e) => setInitialCash(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm font-semibold text-gray-900 focus:outline-none focus:border-[#047857]"
              />
              <p className="text-[11px] text-gray-400 mt-1.5">
                Otomatis dilewati jika karyawan sudah memiliki shift aktif yang memiliki transaksi.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3.5 px-4 rounded-xl bg-[#047857] hover:bg-[#065F46] text-white text-sm font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <span>
              {loading
                ? 'Memverifikasi...'
                : selectedRole === 'karyawan'
                ? 'Masuk & Buka Shift Kasir'
                : 'Masuk Dashboard Owner'}
            </span>
            {!loading && <ArrowRight size={16} />}
          </button>
        </form>
      </div>

      <p className="text-[11px] text-gray-400 mt-6">
        Sistem Operasional Konter · Terhubung ke Server Lokal
      </p>
    </div>
  );
}
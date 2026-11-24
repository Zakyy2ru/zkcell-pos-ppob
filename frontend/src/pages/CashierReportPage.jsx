import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import api, { formatRupiah } from '../services/api';

export default function CashierReportPage({ user }) {
  const [period, setPeriod] = useState('daily');
  const [data, setData] = useState(null);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [actualCash, setActualCash] = useState('');

  useEffect(() => {
    fetchReport();
  }, [period]);

  const fetchReport = async () => {
    try {
      const res = await api.get(`/reports/cashier?period=${period}`);
      setData(res.data);
      if (res.data.shift) {
        setActualCash(res.data.shift.expected_cash ?? 0);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCloseShift = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/auth/close-shift', {
        shift_id: data.shift.id,
        actual_cash: Number(actualCash),
      });
      alert(res.data.message);
      setShowCloseModal(false);
      fetchReport();
    } catch (err) {
      alert('Gagal menutup shift');
    }
  };

  if (!data) return <p className="text-sm text-gray-500">Memuat laporan pelayan...</p>;

  const { summary, shift, transactions } = data;
  const initialCash = Number(shift?.initial_cash ?? 0);
  const cashSales = Number(summary?.cashAmount ?? shift?.total_cash_sales ?? 0);
  const expectedCash = Number(shift?.expected_cash ?? initialCash + cashSales);

  return (
    <div className="space-y-6 print-report">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Laporan pelayan</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Pantau transaksi pribadi dan cocokkan setoran sebelum tutup shift.
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="no-print flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#047857] hover:bg-[#065F46] text-white text-xs font-semibold cursor-pointer"
        >
          <Download size={15} />
          Unduh laporan
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2">
          {[
            { id: 'daily', label: 'Harian' },
            { id: 'weekly', label: 'Mingguan' },
            { id: 'monthly', label: 'Bulanan' },
          ].map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                period === p.id
                  ? 'bg-emerald-50 text-[#047857] border border-emerald-200'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <span className="px-3 py-1 rounded-lg bg-emerald-50 text-[#047857] text-xs font-semibold">
          {user?.name} · {shift?.status === 'active' ? 'Shift aktif' : 'Shift ditutup'}
        </span>
      </div>

      {/* 4 Kartu KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500">Penjualan berhasil</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatRupiah(summary.totalSuccessAmount)}</p>
          <p className="text-xs font-medium text-[#047857] mt-2">{summary.totalSuccessCount} transaksi berhasil</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500">Pembayaran cash</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatRupiah(summary.cashAmount)}</p>
          <p className="text-xs text-gray-500 mt-2">{summary.cashCount} transaksi · perlu disetor</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500">Pembayaran QRIS</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatRupiah(summary.qrisAmount)}</p>
          <p className="text-xs font-medium text-[#047857] mt-2">{summary.qrisCount} transaksi · terverifikasi</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500">Total pesanan</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{summary.totalOrders} transaksi</p>
          <p className="text-xs text-amber-600 mt-2">
            {summary.pendingCount} menunggu bayar · {summary.failedCount} gagal
          </p>
        </div>
      </div>

      {/* Grid Bawah: Transaksi Saya & Setoran Shift */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Transaksi saya</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 text-[11px] font-semibold text-gray-400 uppercase">
                  <th className="py-2.5 px-3">ID / Waktu</th>
                  <th className="py-2.5 px-3">Layanan / Tujuan</th>
                  <th className="py-2.5 px-3">Bayar</th>
                  <th className="py-2.5 px-3">Total</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-6 text-center text-gray-400">
                      Belum ada transaksi pada shift ini.
                    </td>
                  </tr>
                ) : (
                  transactions.slice(0, 10).map((t) => (
                    <tr key={t.id}>
                      <td className="py-3 px-3 font-semibold text-gray-900">#{t.invoice_code}</td>
                      <td className="py-3 px-3 text-gray-700">
                        {t.provider} · {t.target_number}
                      </td>
                      <td className="py-3 px-3 uppercase text-gray-600">{t.payment_method}</td>
                      <td className="py-3 px-3 font-bold text-gray-900">{formatRupiah(t.total_amount)}</td>
                      <td className="py-3 px-3">
                        <span
                          className={`font-semibold ${
                            t.fulfillment_status === 'success'
                              ? 'text-[#047857]'
                              : t.payment_status === 'unpaid'
                              ? 'text-amber-600'
                              : 'text-red-600'
                          }`}
                        >
                          {t.fulfillment_status === 'success'
                            ? 'Berhasil'
                            : t.payment_status === 'unpaid'
                            ? 'Menunggu'
                            : 'Gagal'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Kolom Kanan: Setoran Shift & Penjualan per Layanan */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Setoran shift</h3>
              <span className="px-2.5 py-0.5 rounded bg-emerald-50 text-[#047857] text-xs font-semibold">
                {shift?.status === 'active' ? 'Aktif' : 'Selesai'}
              </span>
            </div>

            <div className="space-y-3 text-sm pb-5 border-b border-gray-100">
              <div className="flex justify-between">
                <span className="text-gray-500">Modal kas awal</span>
                <span className="font-semibold text-gray-900">{formatRupiah(initialCash)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Penjualan cash</span>
                <span className="font-semibold text-gray-900">{formatRupiah(cashSales)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-100 font-bold">
                <span className="text-gray-900">Kas yang diharapkan</span>
                <span className="text-gray-900">{formatRupiah(expectedCash)}</span>
              </div>
            </div>

            <button
              onClick={() => setShowCloseModal(true)}
              disabled={!shift || shift.status !== 'active'}
              className="no-print w-full mt-5 py-3 px-4 rounded-xl bg-[#047857] hover:bg-[#065F46] disabled:bg-gray-300 text-white text-xs font-semibold cursor-pointer"
            >
              {shift?.status === 'active' ? 'Cocokkan & tutup shift' : 'Shift sudah ditutup'}
            </button>
            <p className="no-print text-[11px] text-gray-400 text-center mt-2">
              Input uang fisik sebelum kirim ke owner.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3 text-sm">
            <h3 className="font-semibold text-gray-900 mb-2">Penjualan per layanan</h3>
            <div className="flex justify-between">
              <span className="text-gray-500">Pulsa</span>
              <span className="font-bold text-gray-900">{formatRupiah(summary.byCategory.pulsa)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">E-wallet</span>
              <span className="font-bold text-gray-900">{formatRupiah(summary.byCategory.ewallet)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Transfer bank</span>
              <span className="font-bold text-gray-900">{formatRupiah(summary.byCategory.transfer_bank)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Token listrik</span>
              <span className="font-bold text-gray-900">{formatRupiah(summary.byCategory.token_listrik || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Tagihan (PLN/BPJS/WiFi)</span>
              <span className="font-bold text-gray-900">{formatRupiah(summary.byCategory.tagihan_ppob || 0)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Cocokkan & Tutup Shift */}
      {showCloseModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleCloseShift}
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <h3 className="text-lg font-bold text-gray-900">Cocokkan Setoran Kas Fisik</h3>
            <p className="text-xs text-gray-500">
              Hitung total uang tunai di laci kasir (termasuk modal kas awal) sebelum menutup shift.
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Total Uang Tunai Aktual di Laci (Rp)
              </label>
              <input
                type="number"
                required
                value={actualCash}
                onChange={(e) => setActualCash(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm font-bold"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCloseModal(false)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#047857] text-white text-xs font-semibold"
              >
                Simpan & Tutup Shift
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
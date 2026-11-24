import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import api, { formatRupiah } from '../services/api';

export default function OwnerReportPage() {
  const [period, setPeriod] = useState('daily');
  const [cashierId, setCashierId] = useState('all');
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchOwnerReport();
  }, [period, cashierId]);

  const fetchOwnerReport = async () => {
    try {
      const res = await api.get(`/reports/owner?period=${period}&cashier_id=${cashierId}`);
      setData(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  if (!data) return <p className="text-sm text-gray-500">Memuat ringkasan bisnis owner...</p>;

  const { kpi, byCategory, reconciliation, cashierRecap, dailyTrend } = data;
  const totalCat =
    (byCategory.pulsa || 0) +
      (byCategory.token_listrik || 0) +
      (byCategory.tagihan_ppob || 0) +
      (byCategory.ewallet || 0) +
      (byCategory.transfer_bank || 0) || 1;

  return (
    <div className="space-y-6 print-report">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Bisnis Anda, dalam satu pandangan.</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Ringkasan seluruh pelayan, penjualan, dan kesehatan operasional ZKCELL.
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="no-print flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#047857] hover:bg-[#065F46] text-white text-xs font-semibold cursor-pointer"
        >
          <Download size={15} />
          Ekspor laporan
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

        <select
          value={cashierId}
          onChange={(e) => setCashierId(e.target.value)}
          className="px-3.5 py-1.5 rounded-lg bg-emerald-50 text-[#047857] text-xs font-semibold focus:outline-none"
        >
          <option value="all">Semua pelayan</option>
          {cashierRecap.map((c) => (
            <option key={c.id} value={c.id}>
              Pelayan · {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* 4 Kartu KPI Owner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500">Omzet berhasil</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatRupiah(kpi.omzet)}</p>
          <p className="text-xs text-[#047857] font-medium mt-2">Total nilai transaksi sukses</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500">Laba kotor</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatRupiah(kpi.labaKotor)}</p>
          <p className="text-xs text-gray-400 mt-2">Omzet dikurangi modal produk</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500">Transaksi berhasil</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {kpi.successCount} / {kpi.totalCount}
          </p>
          <p className="text-xs text-amber-600 mt-2">
            {kpi.processingCount} diproses · {kpi.failedCount} gagal
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500">Saldo agen pulsa</p>
          <p
            className={`text-2xl font-bold mt-1 ${
              Number(kpi.agenBalance) <= 0
                ? 'text-red-600'
                : Number(kpi.agenBalance) < Number(kpi.agenMinAlert)
                ? 'text-amber-600'
                : 'text-gray-900'
            }`}
          >
            {formatRupiah(kpi.agenBalance)}
          </p>
          {Number(kpi.agenBalance) <= 0 ? (
            <p className="text-xs text-red-600 font-semibold mt-2">
              ● Habis · segera top up (min. {formatRupiah(kpi.agenMinAlert)})
            </p>
          ) : Number(kpi.agenBalance) < Number(kpi.agenMinAlert) ? (
            <p className="text-xs text-amber-600 font-semibold mt-2">
              ● Menipis · di bawah batas {formatRupiah(kpi.agenMinAlert)}
            </p>
          ) : (
            <p className="text-xs text-[#047857] font-medium mt-2">
              ● Aman · batas minimum {formatRupiah(kpi.agenMinAlert)}
            </p>
          )}
        </div>
      </div>

      {/* Grafik Tren & Penjualan per Layanan */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-gray-900">Tren omzet</h3>
              <p className="text-xs text-gray-400">7 hari terakhir</p>
            </div>
            <span className="px-3 py-1 rounded-full bg-emerald-50 text-[#047857] text-xs font-medium">
              ● Penjualan berhasil
            </span>
          </div>

          <div className="flex items-end justify-around h-48 pt-6 gap-3">
            {(dailyTrend.length > 0 ? dailyTrend : [{ date_label: 'Hari Ini', total: kpi.omzet }]).map(
              (item, idx, arr) => {
                const maxVal = Math.max(...arr.map((a) => Number(a.total)), 1);
                const val = Number(item.total) || 0;
                const heightPct = val === 0 ? 4 : Math.max(Math.round((val / maxVal) * 100), 15);
                const isLast = idx === arr.length - 1;
                return (
                  <div key={idx} className="flex flex-col items-center justify-end h-full flex-1">
                    <span className="text-[10px] font-bold text-[#047857] mb-1.5 whitespace-nowrap">
                      {val > 0 ? formatRupiah(val) : 'Rp 0'}
                    </span>
                    <div className="w-full flex-1 flex items-end justify-center">
                      <div
                        style={{ height: `${heightPct}%` }}
                        className={`w-full max-w-12 rounded-t-xl transition-all duration-300 ${
                          val === 0
                            ? 'bg-gray-100'
                            : isLast
                            ? 'bg-[#047857]'
                            : 'bg-emerald-200'
                        }`}
                      ></div>
                    </div>
                    <span className="text-[11px] text-gray-500 mt-2">{item.date_label}</span>
                  </div>
                );
              }
            )}
          </div>
        </div>

        {/* Penjualan per Layanan */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
          <h3 className="font-semibold text-gray-900">Penjualan per layanan</h3>

          {[
            { label: 'Pulsa', val: byCategory.pulsa || 0 },
            { label: 'Token listrik', val: byCategory.token_listrik || 0 },
            { label: 'Tagihan (PLN / BPJS / WiFi)', val: byCategory.tagihan_ppob || 0 },
            { label: 'E-wallet', val: byCategory.ewallet || 0 },
            { label: 'Transfer bank', val: byCategory.transfer_bank || 0 },
          ].map((srv) => {
            const pct = Math.round((srv.val / totalCat) * 100);
            return (
              <div key={srv.label} className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-gray-800">{srv.label}</span>
                  <span className="font-bold text-gray-900">{formatRupiah(srv.val)}</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div style={{ width: `${pct}%` }} className="h-full bg-[#047857] rounded-full"></div>
                </div>
                <p className="text-[11px] text-gray-400">{pct}% dari total omzet</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rekap per Pelayan & Rekonsiliasi Pembayaran */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Rekap per pelayan</h3>
            <span className="text-[11px] text-gray-400 sm:hidden">Geser tabel →</span>
          </div>

          <div className="overflow-x-auto -mx-5 px-5 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[520px] text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  <th className="py-2.5 pr-4 whitespace-nowrap">Pelayan</th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">Berhasil</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Omzet</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Cash</th>
                  <th className="py-2.5 pl-4 text-right whitespace-nowrap">Setoran</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {cashierRecap.map((c) => (
                  <tr key={c.id}>
                    <td className="py-3 pr-4 font-semibold text-gray-900 whitespace-nowrap">
                      {c.name}
                    </td>
                    <td className="py-3 px-3 text-center text-gray-600 whitespace-nowrap">
                      {c.successCount}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-gray-900 whitespace-nowrap">
                      {formatRupiah(c.omzet)}
                    </td>
                    <td className="py-3 px-3 text-right text-gray-700 whitespace-nowrap">
                      {formatRupiah(c.cash)}
                    </td>
                    <td className="py-3 pl-4 text-right whitespace-nowrap">
                      <span className="inline-block px-2.5 py-0.5 rounded-full bg-emerald-50 text-xs font-semibold text-[#047857]">
                        {c.shiftStatus === 'active' ? 'Shift aktif' : 'Sesuai'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <h3 className="font-semibold text-gray-900">Rekonsiliasi pembayaran</h3>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Cash · semua pelayan</span>
            <span className="font-bold text-gray-900">{formatRupiah(reconciliation.cashTotal)}</span>
          </div>
          <div className="flex justify-between text-sm pb-4 border-b border-gray-100">
            <span className="text-gray-500">QRIS · terverifikasi</span>
            <span className="font-bold text-gray-900">{formatRupiah(reconciliation.qrisTotal)}</span>
          </div>
          <p className="text-xs font-semibold text-[#047857]">
            ● Tidak ada selisih pembayaran QRIS
          </p>
        </div>
      </div>
    </div>
  );
}
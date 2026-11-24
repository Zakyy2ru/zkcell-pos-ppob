import React, { useState, useEffect } from 'react';
import { Search, Calendar } from 'lucide-react';
import api, { formatRupiah } from '../services/api';

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('all'); // all | daily | weekly | monthly
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTransactions();
  }, [statusFilter, periodFilter, search]);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await api.get('/transactions', {
        params: {
          status: statusFilter,
          period: periodFilter,
          search,
        },
      });
      setTransactions(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const renderStatusBadge = (status) => {
    if (status === 'success') {
      return <span className="text-xs font-semibold text-[#047857] whitespace-nowrap">Berhasil</span>;
    }
    if (status === 'waiting_payment' || status === 'processing') {
      return <span className="text-xs font-semibold text-amber-600 whitespace-nowrap">Menunggu</span>;
    }
    return <span className="text-xs font-semibold text-red-600 whitespace-nowrap">Gagal</span>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Riwayat transaksi</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Pantau seluruh status pesanan, nomor seri agen, dan metode pembayaran.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 space-y-5">
        {/* Baris 1: Filter Periode Waktu & Pencarian */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-gray-100">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 mr-1">
              <Calendar size={14} />
              Periode:
            </span>
            {[
              { id: 'all', label: 'Semua waktu' },
              { id: 'daily', label: 'Hari ini' },
              { id: 'weekly', label: 'Minggu ini' },
              { id: 'monthly', label: 'Bulan ini' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriodFilter(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  periodFilter === p.id
                    ? 'bg-[#047857] text-white'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari ID / nomor tujuan..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-xs focus:outline-none focus:border-[#047857]"
            />
          </div>
        </div>

        {/* Baris 2: Filter Status Transaksi */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'all', label: 'Semua' },
              { id: 'success', label: 'Berhasil' },
              { id: 'waiting_payment', label: 'Menunggu' },
              { id: 'failed', label: 'Gagal / Refund' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-emerald-50 text-[#047857] border border-emerald-200'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <span className="text-xs text-gray-400">
            Menampilkan <strong className="text-gray-700">{transactions.length}</strong> transaksi
          </span>
        </div>

        {/* Tabel Transaksi */}
        <div className="overflow-x-auto -mx-5 px-5 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[680px] text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                <th className="py-3 px-4 whitespace-nowrap">ID / Waktu</th>
                <th className="py-3 px-4">Layanan / Tujuan</th>
                <th className="py-3 px-4 whitespace-nowrap">Pelayan</th>
                <th className="py-3 px-4 whitespace-nowrap">Bayar</th>
                <th className="py-3 px-4 whitespace-nowrap">Nomor Seri (SN)</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">Total</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-gray-400 text-xs">
                    Memuat data transaksi...
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-gray-400 text-xs">
                    Belum ada transaksi yang sesuai filter.
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => {
                  const txDate = new Date(tx.created_at);
                  const datePart = txDate.toLocaleDateString('id-ID', {
                    day: '2-digit',
                    month: 'short',
                  });
                  const timePart = txDate.toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <tr key={tx.id} className="hover:bg-gray-50/70">
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <p className="font-semibold text-gray-900 text-xs">#{tx.invoice_code}</p>
                        <p className="text-[11px] text-gray-400">
                          {datePart} · {timePart} WIB
                        </p>
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-medium text-gray-800 text-xs">
                          {tx.provider} · {tx.target_number}
                        </p>
                        {tx.customer_name && (
                          <p className="text-[11px] text-gray-400">{tx.customer_name}</p>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-gray-600 whitespace-nowrap">
                        {tx.cashier_name}
                      </td>
                      <td className="py-3.5 px-4 text-xs uppercase font-medium text-gray-700 whitespace-nowrap">
                        {tx.payment_method}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-gray-500 whitespace-nowrap">
                        {tx.serial_number || '-'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-gray-900 text-xs whitespace-nowrap">
                        {formatRupiah(tx.total_amount)}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {renderStatusBadge(tx.fulfillment_status)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
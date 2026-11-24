import React, { useState, useEffect } from 'react';
import api, { formatRupiah } from '../services/api';

export default function IntegrationPage() {
  const [services, setServices] = useState([]);
  const [logs, setLogs] = useState([]);
  const [editingService, setEditingService] = useState(null);
  const [topupAmount, setTopupAmount] = useState('');

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const fetchIntegrations = async () => {
    try {
      const res = await api.get('/integrations');
      setServices(res.data.services);
      setLogs(res.data.logs);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    try {
      const newBalance = Number(editingService.balance) + (Number(topupAmount) || 0);
      await api.put(`/integrations/${editingService.service_key}`, {
        status: editingService.status,
        balance: newBalance,
        api_key_masked: editingService.api_key_masked,
        webhook_url: editingService.webhook_url,
      });
      setEditingService(null);
      setTopupAmount('');
      fetchIntegrations();
    } catch (err) {
      alert('Gagal memperbarui konfigurasi.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Terhubung. Tercatat. Otomatis.</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Kelola koneksi layanan dan pantau setiap proses transaksi dari satu layar.
          </p>
        </div>
        <span className="px-3.5 py-1.5 rounded-full bg-emerald-50 text-[#047857] text-xs font-semibold">
          Akses khusus owner
        </span>
      </div>

      {/* 3 Kartu Koneksi Layanan */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {services.map((srv, idx) => (
          <div key={srv.id} className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col justify-between space-y-5">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-500 text-xs font-mono">
                  0{idx + 1}
                </span>
                <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-[#047857] text-xs font-semibold">
                  ● Terhubung
                </span>
              </div>

              <h3 className="font-bold text-gray-900">{srv.service_name}</h3>
              <p className="text-xs text-gray-400 mt-0.5">{srv.merchant_info}</p>

              <div className="mt-5 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Saldo tercatat</span>
                  <span className="font-bold text-gray-900">{formatRupiah(srv.balance)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Respons rata-rata</span>
                  <span className="font-semibold text-gray-800">{srv.avg_response_sec} detik</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setEditingService(srv)}
              className="text-left text-xs font-semibold text-[#047857] hover:underline pt-3 border-t border-gray-100 cursor-pointer"
            >
              Kelola koneksi →
            </button>
          </div>
        ))}
      </div>

      {/* Aktivitas Terbaru & Pengamanan Transaksi Ganda */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Aktivitas terbaru</h3>
            <span className="text-[11px] text-gray-400 sm:hidden">Geser tabel →</span>
          </div>

          <div className="overflow-x-auto -mx-5 px-5 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[540px] text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  <th className="py-2.5 pr-4 whitespace-nowrap">Waktu</th>
                  <th className="py-2.5 pr-4">Peristiwa</th>
                  <th className="py-2.5 pr-4 whitespace-nowrap">Referensi</th>
                  <th className="py-2.5 text-right whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-3 pr-4 font-mono text-gray-400 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleTimeString('id-ID')}
                    </td>
                    <td className="py-3 pr-4 font-medium text-gray-800">
                      {log.event_message}
                    </td>
                    <td className="py-3 pr-4 font-mono text-gray-500 whitespace-nowrap">
                      {log.invoice_code}
                    </td>
                    <td className="py-3 text-right font-semibold text-[#047857] whitespace-nowrap">
                      {log.status_badge}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <h3 className="font-semibold text-gray-900">Aman dari transaksi ganda</h3>
          <ul className="space-y-2.5 text-xs text-gray-600">
            <li>✓ Satu ID unik untuk setiap pesanan</li>
            <li>✓ Notifikasi mitra diverifikasi</li>
            <li>✓ Cek status sebelum mencoba ulang</li>
            <li>✓ Proses gagal masuk antrean refund</li>
          </ul>
        </div>
      </div>

      {/* Modal Kelola Koneksi & Top Up Saldo Deposit */}
      {editingService && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSaveConfig}
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <h3 className="text-lg font-bold text-gray-900">Kelola {editingService.service_name}</h3>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">API Key / Secret</label>
              <input
                type="text"
                value={editingService.api_key_masked}
                onChange={(e) => setEditingService({ ...editingService, api_key_masked: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Webhook Callback URL</label>
              <input
                type="text"
                value={editingService.webhook_url}
                onChange={(e) => setEditingService({ ...editingService, webhook_url: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Tambah Saldo Deposit Simulasi (Rp)
              </label>
              <input
                type="number"
                placeholder="0"
                value={topupAmount}
                onChange={(e) => setTopupAmount(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-bold"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingService(null)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#047857] text-white text-xs font-semibold"
              >
                Simpan Perubahan
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
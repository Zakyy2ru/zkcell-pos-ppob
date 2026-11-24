import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Search, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import api, { formatRupiah } from '../services/api';

const EMPTY_FORM = {
  product_code: '',
  category: 'pulsa',
  provider: 'Telkomsel',
  name: '',
  nominal: '',
  base_price: '',
  admin_fee: '2000',
  is_available: 1,
  estimated_seconds: 15,
};

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await api.get('/products');
      setProducts(res.data);
    } catch (err) {
      console.error('Gagal memuat daftar produk:', err);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setEditingId(item.id);
    setForm({
      product_code: item.product_code || '',
      category: item.category,
      provider: item.provider,
      name: item.name || '',
      nominal: item.nominal,
      base_price: item.base_price,
      admin_fee: item.admin_fee,
      is_available: item.is_available,
      estimated_seconds: item.estimated_seconds || 15,
    });
    setShowModal(true);
  };

  const handleCategoryChange = (cat) => {
    if (cat === 'pulsa') {
      setForm({ ...form, category: cat, provider: 'Telkomsel', admin_fee: '2000' });
    } else if (cat === 'token_listrik') {
      setForm({ ...form, category: cat, provider: 'PLN Prabayar', admin_fee: '3000' });
    } else if (cat === 'tagihan_ppob') {
      setForm({
        ...form,
        category: cat,
        provider: 'Listrik Pascabayar',
        nominal: '0',
        base_price: '1500',
        admin_fee: '3000',
      });
    } else if (cat === 'ewallet') {
      setForm({ ...form, category: cat, provider: 'DANA', admin_fee: '2000' });
    } else {
      setForm({
        ...form,
        category: cat,
        provider: 'Bank BCA',
        nominal: '0',
        base_price: '2500',
        admin_fee: '5000',
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/products/${editingId}`, form);
      } else {
        await api.post('/products', form);
      }
      setShowModal(false);
      fetchProducts();
    } catch (err) {
      alert(err.response?.data?.message || 'Gagal menyimpan produk.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (item) => {
    try {
      await api.patch(`/products/${item.id}/toggle`);
      setProducts((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, is_available: p.is_available ? 0 : 1 } : p))
      );
    } catch (err) {
      alert('Gagal mengubah status ketersediaan.');
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Hapus layanan "${item.name || item.provider}"?`)) return;
    try {
      const res = await api.delete(`/products/${item.id}`);
      if (res.data?.message) alert(res.data.message);
      fetchProducts();
    } catch (err) {
      alert('Gagal menghapus produk.');
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchCat = categoryFilter === 'all' || p.category === categoryFilter;
    const keyword = search.toLowerCase();
    const matchSearch =
      !keyword ||
      p.provider?.toLowerCase().includes(keyword) ||
      p.name?.toLowerCase().includes(keyword) ||
      p.product_code?.toLowerCase().includes(keyword) ||
      String(p.nominal).includes(keyword);
    return matchCat && matchSearch;
  });

  const isDynamicTariffForm =
    form.category === 'transfer_bank' || form.category === 'tagihan_ppob';

  const previewTotalSell = Number(form.nominal || 0) + Number(form.admin_fee || 0);
  const previewMargin = isDynamicTariffForm
    ? Number(form.admin_fee || 0) - Number(form.base_price || 0)
    : previewTotalSell - Number(form.base_price || 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Kelola produk & tarif</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Atur harga modal agen, biaya admin jual, dan status ketersediaan layanan untuk kasir.
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#047857] hover:bg-[#065F46] text-white text-xs font-semibold transition cursor-pointer"
        >
          <Plus size={16} />
          Tambah produk / tarif
        </button>
      </div>

      {/* Ringkasan Cepat */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500">Total item katalog</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{products.length} produk</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500">Layanan aktif (tersedia)</p>
          <p className="text-2xl font-bold text-[#047857] mt-1">
            {products.filter((p) => p.is_available === 1).length} produk
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500">Layanan gangguan / nonaktif</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">
            {products.filter((p) => p.is_available === 0).length} produk
          </p>
        </div>
      </div>

      {/* Filter & Tabel Produk */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'all', label: 'Semua' },
              { id: 'pulsa', label: 'Pulsa' },
              { id: 'token_listrik', label: 'Token Listrik' },
              { id: 'ewallet', label: 'E-wallet' },
              { id: 'transfer_bank', label: 'Transfer bank' },
              { id: 'tagihan_ppob', label: 'Tagihan PPOB' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setCategoryFilter(tab.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  categoryFilter === tab.id
                    ? 'bg-emerald-50 text-[#047857] border border-emerald-200'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari kode / operator / nama..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-xs focus:outline-none focus:border-[#047857]"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                <th className="py-3 px-4">Kode & Layanan</th>
                <th className="py-3 px-4">Nominal</th>
                <th className="py-3 px-4">Modal Agen</th>
                <th className="py-3 px-4">Biaya Admin</th>
                <th className="py-3 px-4">Harga Jual</th>
                <th className="py-3 px-4">Laba / Trx</th>
                <th className="py-3 px-4">Status Kasir</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan="8" className="py-8 text-center text-gray-400">
                    Memuat katalog produk...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-8 text-center text-gray-400">
                    Tidak ada produk yang ditemukan.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((item) => {
                  const isBank = item.category === 'transfer_bank';
                  const isPasca = item.category === 'tagihan_ppob';
                  const isDynamic = isBank || isPasca;
                  const sellPrice = Number(item.nominal) + Number(item.admin_fee);
                  const profit = isDynamic
                    ? Number(item.admin_fee) - Number(item.base_price)
                    : sellPrice - Number(item.base_price);

                  return (
                    <tr key={item.id} className="hover:bg-gray-50/70">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-semibold uppercase">
                            {item.category.replace('_', ' ')}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-[#047857] text-[10px] font-mono font-semibold">
                            {item.product_code}
                          </span>
                        </div>
                        <p className="font-semibold text-gray-900">{item.name}</p>
                        <p className="text-[11px] text-gray-400">{item.provider}</p>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-gray-800">
                        {isBank
                          ? 'Tarif Berjenjang'
                          : isPasca
                          ? 'Sesuai Tagihan'
                          : formatRupiah(item.nominal)}
                      </td>
                      <td className="py-3.5 px-4 text-gray-600">{formatRupiah(item.base_price)}</td>
                      <td className="py-3.5 px-4 text-gray-800 font-medium">
                        {isBank ? 'Otomatis Tabel' : formatRupiah(item.admin_fee)}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-gray-900">
                        {isDynamic ? 'Nominal + Admin' : formatRupiah(sellPrice)}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`font-bold ${profit >= 0 ? 'text-[#047857]' : 'text-red-600'}`}>
                          +{formatRupiah(profit)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(item)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition cursor-pointer ${
                            item.is_available === 1
                              ? 'bg-emerald-50 text-[#047857] border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                          }`}
                        >
                          {item.is_available === 1 ? (
                            <>
                              <CheckCircle2 size={13} /> Tersedia
                            </>
                          ) : (
                            <>
                              <AlertTriangle size={13} /> Gangguan
                            </>
                          )}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:text-[#047857] hover:border-emerald-300 cursor-pointer"
                          title="Edit Harga"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:text-red-600 hover:border-red-300 cursor-pointer"
                          title="Hapus Produk"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Tambah / Edit Produk */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">
                {editingId ? 'Edit Harga & Layanan' : 'Tambah Produk / Tarif Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Kategori</label>
                <select
                  value={form.category}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs font-semibold"
                >
                  <option value="pulsa">Pulsa</option>
                  <option value="token_listrik">Token Listrik</option>
                  <option value="ewallet">E-wallet</option>
                  <option value="transfer_bank">Transfer bank</option>
                  <option value="tagihan_ppob">Tagihan PPOB</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Kode Produk / SKU</label>
                <input
                  type="text"
                  value={form.product_code}
                  onChange={(e) => setForm({ ...form, product_code: e.target.value })}
                  placeholder="Misal: PLN20 / TSEL-50"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Provider / Bank</label>
                <input
                  type="text"
                  required
                  value={form.provider}
                  onChange={(e) => setForm({ ...form, provider: e.target.value })}
                  placeholder="Telkomsel / PLN Prabayar / DANA / Bank BCA"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Nama Layanan</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Token Listrik PLN 20.000"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {isDynamicTariffForm ? 'Nominal (0 = Bebas)' : 'Nominal (Rp)'}
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={form.nominal}
                  onChange={(e) => setForm({ ...form, nominal: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {form.category === 'transfer_bank' ? 'Modal Transfer' : 'Harga Modal Agen'}
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={form.base_price}
                  onChange={(e) => setForm({ ...form, base_price: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Biaya Admin Jual</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={form.admin_fee}
                  onChange={(e) => setForm({ ...form, admin_fee: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-xs font-bold"
                />
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-center justify-between text-xs">
              <p className="text-gray-600">
                Total Bayar Pelanggan:{' '}
                <strong className="text-gray-900">
                  {isDynamicTariffForm
                    ? `Nominal + ${formatRupiah(form.admin_fee || 0)}`
                    : formatRupiah(previewTotalSell)}
                </strong>
              </p>
              <span className="font-bold text-[#047857]">
                Estimasi Laba: +{formatRupiah(previewMargin)}
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-[#047857] hover:bg-[#065F46] text-white text-xs font-semibold cursor-pointer"
              >
                {saving ? 'Menyimpan...' : 'Simpan Produk'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
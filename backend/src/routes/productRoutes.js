import express from 'express';
import db from '../config/db.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Middleware khusus Owner
const requireOwner = (req, res, next) => {
  if (req.user?.role !== 'owner') {
    return res.status(403).json({ message: 'Akses ditolak. Khusus Owner.' });
  }
  next();
};

// GET /api/products - Ambil semua produk
router.get('/', verifyToken, requireOwner, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM products ORDER BY category ASC, provider ASC, nominal ASC'
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/products - Tambah produk / tarif baru
router.post('/', verifyToken, requireOwner, async (req, res) => {
  const {
    product_code,
    category,
    provider,
    name,
    nominal,
    base_price,
    admin_fee,
    is_available = 1,
    estimated_seconds = 15,
  } = req.body;

  if (!category || !provider || nominal === undefined || base_price === undefined || admin_fee === undefined) {
    return res.status(400).json({ message: 'Semua kolom wajib diisi.' });
  }

  const generatedName =
    name?.trim() ||
    (category === 'transfer_bank'
      ? `Transfer ${provider}`
      : `${provider} ${Number(nominal).toLocaleString('id-ID')}`);

  const autoCode =
    product_code?.trim().toUpperCase() ||
    `${category.slice(0, 3).toUpperCase()}-${provider.replace(/\s+/g, '').toUpperCase().slice(0, 10)}-${
      Number(nominal) > 0 ? Number(nominal) : Date.now().toString().slice(-4)
    }`;

  try {
    const [result] = await db.query(
      `INSERT INTO products (category, provider, product_code, name, nominal, base_price, admin_fee, is_available, estimated_seconds)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        category,
        provider,
        autoCode,
        generatedName,
        Number(nominal),
        Number(base_price),
        Number(admin_fee),
        is_available ? 1 : 0,
        Number(estimated_seconds) || 15,
      ]
    );

    const [created] = await db.query('SELECT * FROM products WHERE id = ?', [result.insertId]);
    res.status(201).json(created[0]);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Kode produk sudah digunakan. Gunakan kode atau nominal lain.' });
    }
    res.status(500).json({ message: error.message });
  }
});

// PUT /api/products/:id - Edit produk / tarif
router.put('/:id', verifyToken, requireOwner, async (req, res) => {
  const { id } = req.params;
  const {
    product_code,
    category,
    provider,
    name,
    nominal,
    base_price,
    admin_fee,
    is_available,
    estimated_seconds = 15,
  } = req.body;

  try {
    await db.query(
      `UPDATE products 
       SET category = ?, provider = ?, product_code = ?, name = ?, nominal = ?, base_price = ?, admin_fee = ?, is_available = ?, estimated_seconds = ?
       WHERE id = ?`,
      [
        category,
        provider,
        product_code,
        name,
        Number(nominal),
        Number(base_price),
        Number(admin_fee),
        is_available ? 1 : 0,
        Number(estimated_seconds) || 15,
        id,
      ]
    );

    const [updated] = await db.query('SELECT * FROM products WHERE id = ?', [id]);
    res.json(updated[0]);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Kode produk sudah dipakai produk lain.' });
    }
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/products/:id/toggle - Ubah cepat status Tersedia <-> Gangguan
router.patch('/:id/toggle', verifyToken, requireOwner, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('UPDATE products SET is_available = NOT is_available WHERE id = ?', [id]);
    const [updated] = await db.query('SELECT * FROM products WHERE id = ?', [id]);
    res.json(updated[0]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/products/:id - Hapus produk
router.delete('/:id', verifyToken, requireOwner, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM products WHERE id = ?', [id]);
    res.json({ message: 'Produk berhasil dihapus.' });
  } catch (error) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      await db.query('UPDATE products SET is_available = 0 WHERE id = ?', [id]);
      return res.json({
        message: 'Produk memiliki riwayat transaksi sehingga otomatis dinonaktifkan (status Gangguan).',
      });
    }
    res.status(500).json({ message: error.message });
  }
});

export default router;
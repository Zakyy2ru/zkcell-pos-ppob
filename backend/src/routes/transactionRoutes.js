import express from 'express';
import db from '../config/db.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import {
  processAutomatedFulfillment,
  handleDigiflazzWebhook,
  inquireCustomerAccount,
} from '../services/fulfillmentService.js';

const router = express.Router();

// Rumus resmi biaya admin transfer bank ZKCELL (Sinkron dengan Frontend)
function calculateBankTransferAdmin(nominal, providerLabel = '') {
  const amt = Number(nominal) || 0;
  const isMainBank = ['Bank BCA', 'Bank BRI', 'Bank BNI', 'Bank Mandiri'].includes(providerLabel);

  if (amt <= 500000) return isMainBank ? 5000 : 8000;
  if (amt <= 1000000) return isMainBank ? 10000 : 12000;
  if (amt <= 2000000) return isMainBank ? 15000 : 17000;
  if (amt <= 3000000) return isMainBank ? 20000 : 25000;
  if (amt <= 4000000) return isMainBank ? 25000 : 30000;
  if (amt <= 5000000) return isMainBank ? 30000 : 35000;
  if (amt <= 8000000) return isMainBank ? 40000 : 50000;
  if (amt <= 10000000) return isMainBank ? 50000 : 60000;
  return isMainBank ? 75000 : 80000;
}

// Rumus resmi biaya admin e-wallet ZKCELL (Sinkron dengan Frontend)
function calculateEwalletAdmin(nominal) {
  const amt = Number(nominal) || 0;
  if (amt <= 50000) return 3000;
  if (amt <= 1000000) return 5000;
  const extraBlocks = Math.ceil((amt - 1000000) / 500000);
  return 5000 + extraBlocks * 5000;
}

// Helper format tanggal lokal WIB (YYMMDD) agar tidak meleset di jam 00.00 - 06.59 WIB
function getLocalYYMMDD(date = new Date()) {
  const wibOffset = 7 * 60 * 60 * 1000;
  const wibDate = new Date(date.getTime() + wibOffset);
  return wibDate.toISOString().slice(2, 10).replace(/-/g, '');
}

// GET /api/transactions/products - Ambil katalog layanan
router.get('/products', verifyToken, async (req, res) => {
  try {
    const [products] = await db.query(
      'SELECT * FROM products WHERE is_available = 1 ORDER BY category, provider, nominal ASC'
    );
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/transactions - Riwayat semua transaksi (untuk halaman 02 · Transaksi)
router.get('/', verifyToken, async (req, res) => {
  const { status, search, period } = req.query;
  try {
    let query = `
      SELECT t.*, u.name AS cashier_name 
      FROM transactions t 
      JOIN users u ON t.user_id = u.id 
      WHERE 1=1
    `;
    const params = [];

    // Jika pelayan, hanya tampilkan transaksi miliknya sendiri
    if (req.user.role === 'pelayan') {
      query += ' AND t.user_id = ?';
      params.push(req.user.id);
    }

    // Filter status (Berhasil, Menunggu, Gagal/Refund)
    if (status && status !== 'all') {
      query += ' AND t.fulfillment_status = ?';
      params.push(status);
    }

    // Filter periode waktu (Hari Ini, Minggu Ini, Bulan Ini - Zona WIB)
    if (period === 'daily') {
      query += ' AND DATE(t.created_at) = CURDATE()';
    } else if (period === 'weekly') {
      query += ' AND t.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)';
    } else if (period === 'monthly') {
      query += ' AND YEAR(t.created_at) = YEAR(CURDATE()) AND MONTH(t.created_at) = MONTH(CURDATE())';
    }

    // Filter pencarian
    if (search) {
      query += ' AND (t.invoice_code LIKE ? OR t.target_number LIKE ? OR t.customer_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY t.created_at DESC LIMIT 200';
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/transactions/inquiry - Cek Nama Pelanggan / Tagihan Otomatis
router.post('/inquiry', verifyToken, async (req, res) => {
  const { category, provider, target_number, sku_code } = req.body;

  if (!target_number || String(target_number).trim().length < 5) {
    return res.status(400).json({ message: 'Masukkan nomor tujuan / ID Pelanggan minimal 5 digit.' });
  }

  try {
    const result = await inquireCustomerAccount({
      category,
      provider,
      target_number,
      sku_code,
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message || 'Gagal mengecek data pelanggan.' });
  }
});

// POST /api/transactions - Tahap 1 -> Tahap 2: Buat Tagihan (Billing)
router.post('/', verifyToken, async (req, res) => {
  const {
    shift_id,
    product_id,
    category,
    provider,
    target_number,
    customer_name,
    nominal,
    admin_fee,
    payment_method = 'qris',
  } = req.body;

  try {
    if (!target_number || !String(target_number).trim()) {
      return res.status(400).json({ message: 'Nomor tujuan / ID Pelanggan wajib diisi.' });
    }

    let finalNominal = Number(nominal) || 0;
    let finalAdminFee = 0;
    let finalBaseCost = 0;

    // Validasi & hitung ulang harga di sisi server agar akurat dan aman
    if (category === 'pulsa' || category === 'token_listrik') {
      if (!product_id) {
        return res.status(400).json({ message: 'Produk / nominal wajib dipilih.' });
      }
      const [prodRows] = await db.query(
        'SELECT * FROM products WHERE id = ? AND is_available = 1',
        [product_id]
      );
      if (prodRows.length === 0) {
        return res.status(404).json({ message: 'Produk tidak ditemukan atau sedang nonaktif.' });
      }
      const prod = prodRows[0];
      finalNominal = Number(prod.nominal);
      finalAdminFee = Number(prod.admin_fee);
      finalBaseCost = Number(prod.base_price);
    } else if (category === 'ewallet') {
      if (finalNominal < 10000 || finalNominal > 10000000) {
        return res.status(400).json({ message: 'Nominal e-wallet harus antara Rp 10.000 – Rp 10.000.000.' });
      }
      finalAdminFee = calculateEwalletAdmin(finalNominal);
      finalBaseCost = finalNominal + 1000; // Modal saldo + biaya top-up agen
    } else if (category === 'transfer_bank') {
      if (finalNominal < 10000 || finalNominal > 15000000) {
        return res.status(400).json({ message: 'Nominal transfer bank harus antara Rp 10.000 – Rp 15.000.000.' });
      }
      finalAdminFee = calculateBankTransferAdmin(finalNominal, provider);
      finalBaseCost = finalNominal + 2500; // Modal transfer + BI-FAST/admin bank agen
    } else if (category === 'tagihan_ppob') {
      if (finalNominal < 1000 || finalNominal > 50000000) {
        return res.status(400).json({ message: 'Nominal tagihan wajib diisi dengan benar.' });
      }
      finalAdminFee = admin_fee !== undefined && admin_fee !== null ? Math.max(0, Number(admin_fee)) : 3000;
      finalBaseCost = finalNominal + 1500; // Modal pembayaran tagihan + fee loket agen
    } else {
      return res.status(400).json({ message: 'Kategori layanan tidak valid.' });
    }

    // Generate Invoice Code unik berbasis MAX(id) & tanggal lokal WIB
    const now = new Date();
    const yymmdd = getLocalYYMMDD(now);
    const [maxRows] = await db.query('SELECT COALESCE(MAX(id), 0) AS maxId FROM transactions');
    const nextNum = String(maxRows[0].maxId + 1).padStart(4, '0');
    const invoiceCode = `ZK-${yymmdd}-${nextNum}`;

    const totalAmount = finalNominal + finalAdminFee;
    const expiresAt = new Date(now.getTime() + 15 * 60000); // Berlaku 15 menit
    const qrisPayload = `00020101021226580014ID.CO.QRIS.WWW0215ZKCELL${invoiceCode}540${totalAmount}5802ID`;

    // Pastikan shift_id terisi otomatis dari shift aktif user jika tidak dikirim frontend
    let resolvedShiftId = shift_id || null;
    if (!resolvedShiftId) {
      const [activeShifts] = await db.query(
        "SELECT id FROM shifts WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1",
        [req.user.id]
      );
      if (activeShifts.length > 0) {
        resolvedShiftId = activeShifts[0].id;
      }
    }

    const [result] = await db.query(
      `INSERT INTO transactions 
       (invoice_code, user_id, shift_id, product_id, category, provider, target_number, customer_name, 
        nominal, base_cost, admin_fee, total_amount, payment_method, payment_status, qris_payload, qris_expires_at, fulfillment_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', ?, ?, 'waiting_payment')`,
      [
        invoiceCode,
        req.user.id,
        resolvedShiftId,
        product_id || null,
        category,
        provider,
        String(target_number).trim(),
        customer_name ? String(customer_name).trim() : null,
        finalNominal,
        finalBaseCost,
        finalAdminFee,
        totalAmount,
        payment_method,
        qrisPayload,
        expiresAt,
      ]
    );

    const [created] = await db.query('SELECT * FROM transactions WHERE id = ?', [result.insertId]);
    res.status(201).json(created[0]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/transactions/:invoiceCode/pay-cash - Konfirmasi Pembayaran Tunai oleh Kasir
router.post('/:invoiceCode/pay-cash', verifyToken, async (req, res) => {
  const { invoiceCode } = req.params;
  const io = req.app.get('io');

  try {
    const [rows] = await db.query('SELECT * FROM transactions WHERE invoice_code = ?', [invoiceCode]);
    if (rows.length === 0) return res.status(404).json({ message: 'Tagihan tidak ditemukan.' });

    const tx = rows[0];
    if (tx.payment_status === 'paid') {
      return res.status(400).json({ message: 'Tagihan ini sudah dibayar.' });
    }
    if (tx.payment_status === 'cancelled') {
      return res.status(400).json({ message: 'Tagihan sudah dibatalkan, silakan buat transaksi baru.' });
    }

    await db.query(
      `UPDATE transactions 
       SET payment_method = 'cash', payment_status = 'paid', paid_at = NOW() 
       WHERE invoice_code = ?`,
      [invoiceCode]
    );

    // Tambah penjualan cash & expected_cash ke shift aktif
    await db.query(
      `UPDATE shifts 
       SET total_cash_sales = total_cash_sales + ?, expected_cash = expected_cash + ? 
       WHERE id = ?`,
      [tx.total_amount, tx.total_amount, tx.shift_id]
    );

    // Jalankan otomasi kirim ke agen pulsa / bank
    processAutomatedFulfillment(invoiceCode, io);

    res.json({ message: 'Pembayaran tunai berhasil dikonfirmasi. Memproses pesanan...' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/transactions/webhook/qris - Simulasi / Webhook Pembayaran QRIS Otomatis
router.post('/webhook/qris', async (req, res) => {
  const { invoice_code } = req.body;
  const io = req.app.get('io');

  try {
    const [rows] = await db.query('SELECT * FROM transactions WHERE invoice_code = ?', [invoice_code]);
    if (rows.length === 0) return res.status(404).json({ message: 'Invoice tidak ditemukan.' });

    const tx = rows[0];
    if (tx.payment_status === 'paid') {
      return res.json({ message: 'Sudah terverifikasi sebelumnya (Idempotent).' });
    }
    if (tx.payment_status === 'cancelled') {
      return res.status(400).json({ message: 'Tagihan sudah dibatalkan.' });
    }
    if (tx.qris_expires_at && new Date(tx.qris_expires_at) < new Date()) {
      return res.status(400).json({ message: 'Kode QRIS sudah kadaluwarsa (melebihi 15 menit).' });
    }

    await db.query(
      `UPDATE transactions 
       SET payment_method = 'qris', payment_status = 'paid', paid_at = NOW() 
       WHERE invoice_code = ?`,
      [invoice_code]
    );

    // Tambah penjualan QRIS ke shift & saldo gateway QRIS
    await db.query('UPDATE shifts SET total_qris_sales = total_qris_sales + ? WHERE id = ?', [
      tx.total_amount,
      tx.shift_id,
    ]);
    await db.query("UPDATE integrations SET balance = balance + ? WHERE service_key = 'qris_gateway'", [
      tx.total_amount,
    ]);

    await db.query(
      "INSERT INTO activity_logs (invoice_code, event_message, status_badge) VALUES (?, 'Pembayaran QRIS terverifikasi', 'Diterima')",
      [invoice_code]
    );

    // Eksekusi otomatis ke agen & push notifikasi ke React via Socket.io
    processAutomatedFulfillment(invoice_code, io);

    res.json({ status: 'OK', message: 'Webhook QRIS diproses' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/transactions/:invoiceCode/cancel - Batalkan tagihan
router.post('/:invoiceCode/cancel', verifyToken, async (req, res) => {
  const { invoiceCode } = req.params;
  try {
    const [result] = await db.query(
      "UPDATE transactions SET payment_status = 'cancelled', fulfillment_status = 'failed' WHERE invoice_code = ? AND payment_status = 'unpaid'",
      [invoiceCode]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({ message: 'Tagihan tidak dapat dibatalkan (sudah dibayar atau tidak ditemukan).' });
    }

    res.json({ message: 'Tagihan berhasil dibatalkan.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/transactions/webhook/ppob - Webhook Callback Real-Time dari Digiflazz
router.post('/webhook/ppob', handleDigiflazzWebhook);

export default router;
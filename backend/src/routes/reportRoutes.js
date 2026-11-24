import express from 'express';
import db from '../config/db.js';
import { verifyToken, requireOwner } from '../middleware/authMiddleware.js';

const router = express.Router();

// GET /api/reports/cashier - Data untuk halaman 03 · Laporan pelayan
router.get('/cashier', verifyToken, async (req, res) => {
  const { period = 'daily', date, shift_id } = req.query;
  const userId = req.user.id;

  try {
    // Ambil shift aktif terbaru milik pelayan (atau shift terakhir jika semua sudah ditutup)
    const [activeShifts] = await db.query(
      "SELECT * FROM shifts WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1",
      [userId]
    );
    const [latestShifts] = await db.query(
      'SELECT * FROM shifts WHERE user_id = ? ORDER BY id DESC LIMIT 1',
      [userId]
    );

    const currentShift = activeShifts[0] || latestShifts[0] || null;

    let query = 'SELECT * FROM transactions WHERE user_id = ?';
    const params = [userId];

    if (shift_id) {
      // Filter spesifik berdasarkan shift_id jika diminta
      query += ' AND shift_id = ?';
      params.push(Number(shift_id));
    } else if (date) {
      // Filter berdasarkan tanggal tertentu (aman dengan parameterized query)
      query += ' AND DATE(created_at) = ?';
      params.push(date);
    } else if (period === 'daily') {
      // Sinkron dengan halaman Riwayat Transaksi: tampilkan semua transaksi hari ini milik pelayan
      query += ' AND DATE(created_at) = CURDATE()';
    } else if (period === 'weekly') {
      query += ' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)';
    } else if (period === 'monthly') {
      query += ' AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())';
    }

    query += ' ORDER BY created_at DESC';

    const [transactions] = await db.query(query, params);

    const successful = transactions.filter((t) => t.fulfillment_status === 'success');
    const cashTx = successful.filter((t) => t.payment_method === 'cash');
    const qrisTx = successful.filter((t) => t.payment_method === 'qris');

    const cashAmount = cashTx.reduce((sum, t) => sum + Number(t.total_amount), 0);

    // Hitung expected_cash khusus dari transaksi tunai pada shift aktif saat ini
    let normalizedShift = currentShift;
    if (currentShift) {
      const initialCash = Number(currentShift.initial_cash || 0);
      const shiftCashAmount =
        currentShift.status === 'active'
          ? cashTx
              .filter((t) => Number(t.shift_id) === Number(currentShift.id))
              .reduce((sum, t) => sum + Number(t.total_amount), 0)
          : 0;

      const calculatedExpectedCash =
        currentShift.status === 'active'
          ? initialCash + shiftCashAmount
          : Number(currentShift.expected_cash ?? initialCash);

      normalizedShift = {
        ...currentShift,
        initial_cash: initialCash,
        expected_cash: calculatedExpectedCash,
      };
    }

    const summary = {
      totalSuccessAmount: successful.reduce((sum, t) => sum + Number(t.total_amount), 0),
      totalSuccessCount: successful.length,
      cashAmount,
      cashCount: cashTx.length,
      qrisAmount: qrisTx.reduce((sum, t) => sum + Number(t.total_amount), 0),
      qrisCount: qrisTx.length,
      totalOrders: transactions.length,
      pendingCount: transactions.filter((t) => t.payment_status === 'unpaid').length,
      failedCount: transactions.filter((t) => ['failed', 'refunded'].includes(t.fulfillment_status)).length,
      byCategory: {
        pulsa: successful.filter((t) => t.category === 'pulsa').reduce((s, t) => s + Number(t.total_amount), 0),
        token_listrik: successful.filter((t) => t.category === 'token_listrik').reduce((s, t) => s + Number(t.total_amount), 0),
        tagihan_ppob: successful.filter((t) => t.category === 'tagihan_ppob').reduce((s, t) => s + Number(t.total_amount), 0),
        ewallet: successful.filter((t) => t.category === 'ewallet').reduce((s, t) => s + Number(t.total_amount), 0),
        transfer_bank: successful.filter((t) => t.category === 'transfer_bank').reduce((s, t) => s + Number(t.total_amount), 0),
      },
    };

    res.json({
      summary,
      shift: normalizedShift,
      transactions,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/reports/owner - Data untuk halaman 04 · Laporan owner
router.get('/owner', verifyToken, requireOwner, async (req, res) => {
  const { period = 'daily', cashier_id = 'all' } = req.query;

  try {
    let dateCondition = 'DATE(t.created_at) = CURDATE()';
    if (period === 'weekly') {
      dateCondition = 'YEARWEEK(t.created_at, 1) = YEARWEEK(CURDATE(), 1)';
    } else if (period === 'monthly') {
      dateCondition = 'MONTH(t.created_at) = MONTH(CURDATE()) AND YEAR(t.created_at) = YEAR(CURDATE())';
    }

    const queryParams = [];
    let cashierFilter = '';
    if (cashier_id !== 'all') {
      cashierFilter = 'AND t.user_id = ?';
      queryParams.push(Number(cashier_id));
    }

    const [transactions] = await db.query(
      `SELECT t.*, u.name AS cashier_name 
       FROM transactions t 
       JOIN users u ON t.user_id = u.id 
       WHERE ${dateCondition} ${cashierFilter}`,
      queryParams
    );

    const [integrations] = await db.query('SELECT * FROM integrations');
    const agenPulsa = integrations.find((i) => i.service_key === 'agen_pulsa');

    const successful = transactions.filter((t) => t.fulfillment_status === 'success');
    const totalOmzet = successful.reduce((sum, t) => sum + Number(t.total_amount), 0);
    const totalModal = successful.reduce((sum, t) => sum + Number(t.base_cost), 0);
    const labaKotor = totalOmzet - totalModal;

    // Rekap per pelayan
    const [cashiers] = await db.query("SELECT id, name FROM users WHERE role = 'pelayan'");
    const cashierRecap = await Promise.all(
      cashiers.map(async (c) => {
        const cTx = successful.filter((t) => t.user_id === c.id);
        const [lastShift] = await db.query('SELECT status FROM shifts WHERE user_id = ? ORDER BY id DESC LIMIT 1', [c.id]);
        return {
          id: c.id,
          name: c.name,
          successCount: cTx.length,
          omzet: cTx.reduce((s, t) => s + Number(t.total_amount), 0),
          cash: cTx.filter((t) => t.payment_method === 'cash').reduce((s, t) => s + Number(t.total_amount), 0),
          shiftStatus: lastShift[0]?.status || 'active',
        };
      })
    );

    // Tren omzet 7 hari terakhir (selalu 7 hari penuh + mendukung filter cashier_id)
    const [rawTrend] = await db.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS date_key, COALESCE(SUM(total_amount), 0) AS total
       FROM transactions
       WHERE fulfillment_status = 'success'
         AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
         ${cashier_id !== 'all' ? 'AND user_id = ?' : ''}
       GROUP BY date_key
       ORDER BY date_key ASC`,
      cashier_id !== 'all' ? [Number(cashier_id)] : []
    );

    const trendMap = new Map(rawTrend.map((r) => [r.date_key, Number(r.total)]));
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const dailyTrend = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const key = `${yyyy}-${mm}-${dd}`;
      const label = `${dd} ${monthNames[d.getMonth()]}`;

      dailyTrend.push({
        date_label: label,
        total: trendMap.get(key) || 0,
      });
    }

    res.json({
      kpi: {
        omzet: totalOmzet,
        labaKotor,
        successCount: successful.length,
        totalCount: transactions.length,
        processingCount: transactions.filter((t) => t.fulfillment_status === 'processing').length,
        failedCount: transactions.filter((t) => ['failed', 'refunded'].includes(t.fulfillment_status)).length,
        agenBalance: agenPulsa ? Number(agenPulsa.balance) : 0,
        agenMinAlert: agenPulsa ? Number(agenPulsa.min_balance_alert) : 500000,
      },
      byCategory: {
        pulsa: successful.filter((t) => t.category === 'pulsa').reduce((s, t) => s + Number(t.total_amount), 0),
        token_listrik: successful.filter((t) => t.category === 'token_listrik').reduce((s, t) => s + Number(t.total_amount), 0),
        tagihan_ppob: successful.filter((t) => t.category === 'tagihan_ppob').reduce((s, t) => s + Number(t.total_amount), 0),
        ewallet: successful.filter((t) => t.category === 'ewallet').reduce((s, t) => s + Number(t.total_amount), 0),
        transfer_bank: successful.filter((t) => t.category === 'transfer_bank').reduce((s, t) => s + Number(t.total_amount), 0),
      },
      reconciliation: {
        cashTotal: successful.filter((t) => t.payment_method === 'cash').reduce((s, t) => s + Number(t.total_amount), 0),
        qrisTotal: successful.filter((t) => t.payment_method === 'qris').reduce((s, t) => s + Number(t.total_amount), 0),
      },
      cashierRecap,
      dailyTrend,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../config/db.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password, initial_cash } = req.body;

  try {
    const [users] = await db.query('SELECT * FROM users WHERE username = ? AND is_active = 1', [username]);
    if (users.length === 0) {
      return res.status(401).json({ message: 'Username tidak ditemukan.' });
    }

    const user = users[0];

    // Cek apakah password_hash di database berupa hash bcrypt ($2a$ / $2b$) atau teks biasa
    const isBcryptHash =
      typeof user.password_hash === 'string' &&
      (user.password_hash.startsWith('$2a$') || user.password_hash.startsWith('$2b$'));

    const isPasswordValid = isBcryptHash
      ? await bcrypt.compare(password, user.password_hash)
      : password === user.password_hash;

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Password salah.' });
    }

    let activeShift = null;

    // Jika role pelayan, kelola shift aktif sesuai input modal awal saat login
    if (user.role === 'pelayan') {
      const hasCustomInitialCash =
        initial_cash !== undefined && initial_cash !== null && String(initial_cash).trim() !== '';
      const parsedModalAwal = hasCustomInitialCash ? Math.max(0, Number(initial_cash) || 0) : null;

      const [shifts] = await db.query(
        "SELECT * FROM shifts WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1",
        [user.id]
      );

      if (shifts.length > 0) {
        const currentShift = shifts[0];

        // Cek apakah shift aktif yang masih terbuka ini sudah punya transaksi
        const [txCountRows] = await db.query(
          'SELECT COUNT(*) AS total FROM transactions WHERE shift_id = ?',
          [currentShift.id]
        );
        const hasTransactions = Number(txCountRows[0]?.total || 0) > 0;

        if (!hasTransactions && parsedModalAwal !== null) {
          // Belum ada transaksi di shift ini -> perbarui modal awal & expected_cash sesuai input login (termasuk 0)
          await db.query(
            'UPDATE shifts SET initial_cash = ?, expected_cash = ?, opened_at = NOW() WHERE id = ?',
            [parsedModalAwal, parsedModalAwal, currentShift.id]
          );
          const [updatedShift] = await db.query('SELECT * FROM shifts WHERE id = ?', [currentShift.id]);
          activeShift = updatedShift[0];
        } else {
          // Shift lama sudah punya transaksi -> lanjutkan shift tersebut
          activeShift = currentShift;
        }
      } else {
        // Buat shift baru dengan nilai modal awal persis sesuai input (0 tetap 0, default 0 jika kosong)
        const modalAwal = parsedModalAwal !== null ? parsedModalAwal : 0;
        const [insertResult] = await db.query(
          `INSERT INTO shifts (user_id, shift_name, opened_at, initial_cash, expected_cash, status) 
           VALUES (?, ?, NOW(), ?, ?, 'active')`,
          [user.id, `Shift · ${user.shift_schedule || '08.00 – 16.00'}`, modalAwal, modalAwal]
        );
        const [newShift] = await db.query('SELECT * FROM shifts WHERE id = ?', [insertResult.insertId]);
        activeShift = newShift[0];
      }
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        shift_schedule: user.shift_schedule,
      },
      activeShift,
    });
  } catch (error) {
    res.status(500).json({ message: 'Terjadi kesalahan server.', error: error.message });
  }
});

// POST /api/auth/close-shift (Cocokkan & tutup shift)
router.post('/close-shift', verifyToken, async (req, res) => {
  const { shift_id, actual_cash } = req.body;
  try {
    const [shifts] = await db.query('SELECT * FROM shifts WHERE id = ? AND user_id = ?', [shift_id, req.user.id]);
    if (shifts.length === 0) return res.status(404).json({ message: 'Shift tidak ditemukan.' });

    const shift = shifts[0];
    const status = Number(actual_cash) === Number(shift.expected_cash) ? 'matched' : 'discrepancy';

    await db.query(
      'UPDATE shifts SET actual_cash = ?, closed_at = NOW(), status = ? WHERE id = ?',
      [actual_cash, status, shift_id]
    );

    res.json({ message: 'Shift berhasil ditutup dan dicocokkan.', status });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
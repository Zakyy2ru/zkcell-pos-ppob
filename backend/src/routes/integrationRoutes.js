import express from 'express';
import db from '../config/db.js';
import { verifyToken, requireOwner } from '../middleware/authMiddleware.js';

const router = express.Router();

// GET /api/integrations
router.get('/', verifyToken, requireOwner, async (req, res) => {
  try {
    const [services] = await db.query('SELECT * FROM integrations ORDER BY id ASC');
    const [logs] = await db.query('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 15');
    res.json({ services, logs });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT /api/integrations/:serviceKey - Simpan pengaturan koneksi / top-up saldo simulasi
router.put('/:serviceKey', verifyToken, requireOwner, async (req, res) => {
  const { serviceKey } = req.params;
  const { status, balance, api_key_masked, webhook_url } = req.body;

  try {
    await db.query(
      `UPDATE integrations 
       SET status = COALESCE(?, status), 
           balance = COALESCE(?, balance), 
           api_key_masked = COALESCE(?, api_key_masked), 
           webhook_url = COALESCE(?, webhook_url) 
       WHERE service_key = ?`,
      [status, balance, api_key_masked, webhook_url, serviceKey]
    );
    res.json({ message: 'Konfigurasi integrasi berhasil diperbarui.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
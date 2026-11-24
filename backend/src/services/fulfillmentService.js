import crypto from 'crypto';
import db from '../config/db.js';

// Helper simulasi 20 digit Kode Token PLN (format: XXXX-XXXX-XXXX-XXXX-XXXX)
function generatePlnToken() {
  const blocks = [];
  for (let i = 0; i < 5; i++) {
    const fourDigits = Math.floor(1000 + Math.random() * 9000);
    blocks.push(String(fourDigits));
  }
  return blocks.join('-');
}

// Helper: Finalisasi transaksi SUKSES (dipakai bersama oleh mode Simulasi & Webhook Digiflazz)
export const completeTransactionSuccess = async (tx, serialNumber, io, realPrice = null) => {
  const costToDeduct = realPrice !== null ? Number(realPrice) : Number(tx.base_cost);

  await db.query(
    `UPDATE transactions 
     SET fulfillment_status = 'success', serial_number = ?, base_cost = ?, completed_at = NOW() 
     WHERE invoice_code = ?`,
    [serialNumber, costToDeduct, tx.invoice_code]
  );

  // Potong saldo deposit agen pulsa / mitra transfer
  const serviceKey = tx.category === 'transfer_bank' ? 'transfer_bank' : 'agen_pulsa';
  await db.query(
    'UPDATE integrations SET balance = balance - ? WHERE service_key = ?',
    [costToDeduct, serviceKey]
  );

  // Catat ke activity_logs (halaman 06 · Integrasi)
  let logMsg = `Transfer ${tx.provider} berhasil`;
  if (tx.category === 'pulsa') {
    logMsg = 'Pulsa terkirim · nomor seri diterima';
  } else if (tx.category === 'token_listrik') {
    logMsg = 'Token PLN terkirim · 20 digit token diterima';
  } else if (tx.category === 'tagihan_ppob') {
    logMsg = `Pembayaran tagihan ${tx.provider} berhasil`;
  } else if (tx.category === 'ewallet') {
    logMsg = `Top up ${tx.provider} berhasil`;
  }

  await db.query(
    "INSERT INTO activity_logs (invoice_code, event_message, status_badge) VALUES (?, ?, 'Berhasil')",
    [tx.invoice_code, logMsg]
  );

  if (io) {
    io.emit('transaction_updated', {
      invoice_code: tx.invoice_code,
      payment_status: 'paid',
      fulfillment_status: 'success',
      serial_number: serialNumber,
      step: 4,
      message: 'Selesai & struk tersedia',
    });
  }
};

// Helper: Tandai transaksi GAGAL & masuk antrean refund
export const failTransactionFulfillment = async (tx, reason, io) => {
  await db.query(
    "UPDATE transactions SET fulfillment_status = 'failed' WHERE invoice_code = ?",
    [tx.invoice_code]
  );

  await db.query(
    "INSERT INTO activity_logs (invoice_code, event_message, status_badge) VALUES (?, ?, 'Gagal / Refund')",
    [tx.invoice_code, `Gagal diproses: ${reason}`]
  );

  if (io) {
    io.emit('transaction_updated', {
      invoice_code: tx.invoice_code,
      payment_status: 'paid',
      fulfillment_status: 'failed',
      step: 4,
      message: reason || 'Transaksi gagal diproses mitra',
    });
  }
};

// Proses Utama Pengisian Otomatis
export const processAutomatedFulfillment = async (invoiceCode, io) => {
  try {
    // 1. Cek idempotency agar transaksi tidak dieksekusi 2x
    const [rows] = await db.query(
      `SELECT t.*, p.product_code AS sku_code 
       FROM transactions t 
       LEFT JOIN products p ON t.product_id = p.id 
       WHERE t.invoice_code = ?`,
      [invoiceCode]
    );
    if (rows.length === 0) return;

    const tx = rows[0];
    if (['processing', 'success', 'refunded'].includes(tx.fulfillment_status)) {
      return;
    }

    // 2. Ubah status ke 'processing'
    await db.query(
      "UPDATE transactions SET fulfillment_status = 'processing' WHERE invoice_code = ?",
      [invoiceCode]
    );

    if (io) {
      io.emit('transaction_updated', {
        invoice_code: invoiceCode,
        payment_status: 'paid',
        fulfillment_status: 'processing',
        step: 3,
        message: 'Pesanan dikirim ke agen',
      });
    }

    const mode = process.env.PPOB_MODE || 'simulation';

    // =========================================================================
    // MODE A: SIMULASI LOKAL (Aman untuk presentasi / uji coba tanpa saldo)
    // =========================================================================
    if (mode !== 'digiflazz') {
      setTimeout(async () => {
        try {
          let serialNumber;
          if (tx.category === 'token_listrik') {
            serialNumber = generatePlnToken();
          } else if (tx.category === 'tagihan_ppob') {
            serialNumber = `REF${Date.now().toString().slice(-8)}${Math.floor(100 + Math.random() * 900)}`;
          } else {
            serialNumber = `SN${Date.now().toString().slice(-8)}${Math.floor(100 + Math.random() * 900)}`;
          }
          await completeTransactionSuccess(tx, serialNumber, io);
        } catch (err) {
          console.error('Error simulasi fulfillment:', err);
        }
      }, 1500);
      return;
    }

    // =========================================================================
    // MODE B: DIGIFLAZZ H2H API (Pulsa / Token / E-Wallet Nyata)
    // =========================================================================
    const username = process.env.DIGIFLAZZ_USERNAME;
    const isTesting = process.env.DIGIFLAZZ_TESTING === 'true';
    const apiKey = isTesting ? process.env.DIGIFLAZZ_DEV_KEY : process.env.DIGIFLAZZ_PROD_KEY;

    if (!username || !apiKey) {
      await failTransactionFulfillment(tx, 'Kredensial API Digiflazz belum dikonfigurasi di .env', io);
      return;
    }

    if (!tx.sku_code) {
      await failTransactionFulfillment(tx, 'Produk belum memiliki Buyer SKU Code Digiflazz', io);
      return;
    }

    // Rumus signature wajib Digiflazz: md5(username + apiKey + ref_id)
    const sign = crypto
      .createHash('md5')
      .update(`${username}${apiKey}${tx.invoice_code}`)
      .digest('hex');

    const payload = {
      username,
      buyer_sku_code: tx.sku_code,
      customer_no: tx.target_number,
      ref_id: tx.invoice_code,
      sign,
      ...(isTesting ? { testing: true } : {}),
    };

    const response = await fetch('https://api.digiflazz.com/v1/transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    const data = result?.data;

    if (!data) {
      await failTransactionFulfillment(tx, 'Respons tidak valid dari server Digiflazz', io);
      return;
    }

    // Status dari Digiflazz: 'Sukses', 'Pending', atau 'Gagal'
    if (data.status === 'Sukses') {
      await completeTransactionSuccess(tx, data.sn || `SN-${tx.invoice_code}`, io, data.price);
    } else if (data.status === 'Gagal') {
      await failTransactionFulfillment(tx, data.message || 'Transaksi ditolak operator', io);
    } else {
      // Status 'Pending': Biarkan tetap 'processing', nanti diselesaikan oleh Webhook Digiflazz
      await db.query(
        "INSERT INTO activity_logs (invoice_code, event_message, status_badge) VALUES (?, ?, 'Menunggu SN')",
        [tx.invoice_code, `Diproses operator (${data.message || 'Pending'})`]
      );
    }
  } catch (error) {
    console.error('Error fulfillmentService:', error);
  }
};

// =========================================================================
// INQUIRY PELANGGAN & TAGIHAN (Token PLN, Pascabayar, E-Wallet, Rekening)
// =========================================================================
export const inquireCustomerAccount = async ({ category, provider, target_number, sku_code }) => {
  const cleanTarget = String(target_number || '').trim();
  const mode = process.env.PPOB_MODE || 'simulation';

  // MODE A: SIMULASI LOKAL (Realistis & konsisten berdasarkan nomor tujuan)
  if (mode !== 'digiflazz') {
    const sampleNames = [
      'BUDI SANTOSO',
      'SITI AMINAH',
      'AHMAD FAUZI',
      'DEWI LESTARI',
      'HENDRA WIJAYA',
      'RINA KUSUMA',
      'DEDI SETIAWAN',
      'NURUL HIDAYAH',
    ];
    // Pilih nama deterministik dari digit terakhir nomor agar tidak berubah-ubah saat dicek ulang
    const lastDigits = parseInt(cleanTarget.replace(/\D/g, '').slice(-2) || '0', 10);
    const baseName = sampleNames[lastDigits % sampleNames.length];

    if (category === 'token_listrik') {
      const dayaList = ['R1/900VA', 'R1M/900VA', 'R1/1300VA', 'R1/2200VA'];
      const daya = dayaList[lastDigits % dayaList.length];
      return {
        customer_name: `${baseName} (${daya})`,
        bill_amount: null,
        admin_fee: null,
        detail: `ID Meter valid · Tarif/Daya ${daya}`,
      };
    }

    if (category === 'tagihan_ppob') {
      // Simulasi nominal tagihan otomatis berdasarkan angka belakang ID
      const simBill = 85000 + (lastDigits % 15) * 18500;
      const simAdmin = provider === 'BPJS Kesehatan' ? 2500 : 3000;
      return {
        customer_name: baseName,
        bill_amount: simBill,
        admin_fee: simAdmin,
        detail: `Tagihan ${provider} periode berjalan ditemukan`,
      };
    }

    if (category === 'transfer_bank') {
      return {
        customer_name: `${baseName} (${provider.toUpperCase()})`,
        bill_amount: null,
        admin_fee: null,
        detail: `Rekening ${provider} aktif & terverifikasi`,
      };
    }

    if (category === 'ewallet') {
      return {
        customer_name: `${provider.toUpperCase()} - ${baseName}`,
        bill_amount: null,
        admin_fee: null,
        detail: `Akun ${provider} terverifikasi`,
      };
    }

    return { customer_name: baseName, bill_amount: null, admin_fee: null, detail: 'Nomor valid' };
  }

  // MODE B: DIGIFLAZZ REAL API INQUIRY
  const username = process.env.DIGIFLAZZ_USERNAME;
  const isTesting = process.env.DIGIFLAZZ_TESTING === 'true';
  const apiKey = isTesting ? process.env.DIGIFLAZZ_DEV_KEY : process.env.DIGIFLAZZ_PROD_KEY;

  if (!username || !apiKey) {
    throw new Error('Kredensial API Digiflazz belum dikonfigurasi di .env');
  }

  // 1. Cek Nama Token Listrik PLN Prabayar (Endpoint resmi Digiflazz: /v1/inquiry-pln)
  if (category === 'token_listrik') {
    const sign = crypto
      .createHash('md5')
      .update(`${username}${apiKey}${cleanTarget}`)
      .digest('hex');

    const res = await fetch('https://api.digiflazz.com/v1/inquiry-pln', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        customer_no: cleanTarget,
        sign,
      }),
    });

    const json = await res.json();
    const d = json?.data;
    if (!d || !d.name) {
      throw new Error(d?.message || 'ID Pelanggan / Nomor Meter PLN tidak ditemukan.');
    }

    const segment = d.segment_power ? ` (${d.segment_power.trim()})` : '';
    return {
      customer_name: `${d.name.trim()}${segment}`,
      bill_amount: null,
      admin_fee: null,
      detail: `Meter No: ${d.meter_no || cleanTarget}`,
    };
  }

  // 2. Cek Tagihan Pascabayar (PLN Pascabayar, BPJS, Internet/WiFi) via inq-pasca
  if (category === 'tagihan_ppob') {
    const refId = `INQ-${Date.now()}`;
    const sign = crypto
      .createHash('md5')
      .update(`${username}${apiKey}${refId}`)
      .digest('hex');

    // Mapping default SKU pascabayar jika tidak dikirim
    const pascaSku =
      sku_code ||
      (provider === 'Listrik Pascabayar'
        ? 'pln'
        : provider === 'BPJS Kesehatan'
        ? 'bpjs'
        : 'indihome');

    const res = await fetch('https://api.digiflazz.com/v1/transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: 'inq-pasca',
        username,
        buyer_sku_code: pascaSku,
        customer_no: cleanTarget,
        ref_id: refId,
        sign,
        ...(isTesting ? { testing: true } : {}),
      }),
    });

    const json = await res.json();
    const d = json?.data;
    if (!d || d.status === 'Gagal') {
      throw new Error(d?.message || 'Tagihan tidak ditemukan atau sudah lunas.');
    }

    return {
      customer_name: d.customer_name || 'PELANGGAN TERDAFTAR',
      bill_amount: Number(d.selling_price || d.price || 0),
      admin_fee: Number(d.admin || 3000),
      detail: d.desc?.lembar_tagihan
        ? `${d.desc.lembar_tagihan} lembar tagihan ditemukan`
        : 'Tagihan aktif ditemukan',
    };
  }

  throw new Error('Layanan inquiry otomatis pada Digiflazz saat ini aktif untuk Token PLN & Tagihan Pascabayar.');
};

// Handler Webhook Callback dari Digiflazz saat transaksi 'Pending' berubah jadi 'Sukses'/'Gagal'
export const handleDigiflazzWebhook = async (req, res) => {
  const io = req.app.get('io');

  try {
    // 1. Verifikasi HMAC-SHA1 Signature dari header X-Hub-Signature
    const secret = process.env.DIGIFLAZZ_WEBHOOK_SECRET;
    const signatureHeader = req.headers['x-hub-signature'];

    if (secret && signatureHeader) {
      const rawBody = JSON.stringify(req.body);
      const expectedSig =
        'sha1=' + crypto.createHmac('sha1', secret).update(rawBody).digest('hex');

      if (signatureHeader !== expectedSig) {
        return res.status(401).json({ message: 'Invalid webhook signature' });
      }
    }

    const eventData = req.body?.data;
    if (!eventData || !eventData.ref_id) {
      return res.status(400).json({ message: 'Payload webhook tidak valid' });
    }

    const [rows] = await db.query('SELECT * FROM transactions WHERE invoice_code = ?', [
      eventData.ref_id,
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Invoice tidak ditemukan' });
    }

    const tx = rows[0];
    // Idempotency: abaikan jika sudah selesai sebelumnya
    if (['success', 'failed', 'refunded'].includes(tx.fulfillment_status)) {
      return res.json({ message: 'Sudah diproses sebelumnya' });
    }

    if (eventData.status === 'Sukses') {
      await completeTransactionSuccess(
        tx,
        eventData.sn || `SN-${tx.invoice_code}`,
        io,
        eventData.price
      );
    } else if (eventData.status === 'Gagal') {
      await failTransactionFulfillment(tx, eventData.message || 'Gagal dari operator', io);
    }

    res.json({ status: 'OK' });
  } catch (error) {
    console.error('Error webhook Digiflazz:', error);
    res.status(500).json({ message: error.message });
  }
};
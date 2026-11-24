import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Check,
  Info,
  Printer,
  Share2,
  RotateCcw,
  Smartphone,
  Wallet,
  Building2,
  Zap,
  ReceiptText,
  Search,
} from 'lucide-react';
import api, { formatRupiah } from '../services/api';
import socket from '../services/socket';

// Rumus biaya admin transfer bank otomatis sesuai tabel tarif resmi ZKCELL
function getBankTransferAdminFee(nominal, bankName) {
  const amt = Number(nominal) || 0;
  const isMainBank = ['Bank BCA', 'Bank BRI', 'Bank BNI', 'Bank Mandiri'].includes(bankName);

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

// Rumus biaya admin e-wallet otomatis sesuai tarif resmi ZKCELL
function getEwalletAdminFee(nominal) {
  const amt = Number(nominal) || 0;
  if (amt <= 50000) return 3000;
  if (amt <= 1000000) return 5000;

  const extraBlocks = Math.ceil((amt - 1000000) / 500000);
  return 5000 + extraBlocks * 5000;
}

export default function CashierPage({ user, activeShift }) {
  const [step, setStep] = useState(1); // 1: Pesanan, 2: Pembayaran, 3: Proses & Struk
  const [products, setProducts] = useState([]);
  const [category, setCategory] = useState('pulsa'); // pulsa | ewallet | transfer_bank | token_listrik | tagihan_ppob

  // Form state
  const [targetNumber, setTargetNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [provider, setProvider] = useState('Telkomsel');
  const [customBankName, setCustomBankName] = useState('');
  const [internetProvider, setInternetProvider] = useState('IndiHome');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [customNominal, setCustomNominal] = useState('150000');
  const [ppobAdminFee, setPpobAdminFee] = useState('3000');
  const [inquiring, setInquiring] = useState(false);
  const [inquiryInfo, setInquiryInfo] = useState('');

  // Active billing & payment state
  const [currentTx, setCurrentTx] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('qris');
  const [processStep, setProcessStep] = useState(2);
  const [loading, setLoading] = useState(false);
  const payLockRef = useRef(false);

  // Shift summary state
  const [shiftStats, setShiftStats] = useState({ total: 0, count: 0 });

  useEffect(() => {
    fetchProducts();
    fetchShiftStats();

    const handleTxUpdate = (data) => {
      setCurrentTx((prev) => {
        if (!prev || prev.invoice_code !== data.invoice_code) return prev;
        return {
          ...prev,
          payment_method: data.payment_method || prev.payment_method,
          payment_status: data.payment_status,
          fulfillment_status: data.fulfillment_status,
          serial_number: data.serial_number || prev.serial_number,
        };
      });

      if (data.step) {
        setProcessStep(data.step);
      }
      if (data.step === 4) {
        setStep(3);
        fetchShiftStats();
      }
    };

    socket.on('transaction_updated', handleTxUpdate);
    return () => socket.off('transaction_updated', handleTxUpdate);
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await api.get('/transactions/products');
      setProducts(res.data);
      const defaultPulsa = res.data.find((p) => p.category === 'pulsa' && Number(p.nominal) === 50000);
      if (defaultPulsa) setSelectedProduct(defaultPulsa);
    } catch (err) {
      console.error('Gagal memuat produk:', err);
    }
  };

  const fetchShiftStats = async () => {
    try {
      const res = await api.get('/reports/cashier?period=daily');
      setShiftStats({
        total: res.data.summary.totalSuccessAmount,
        count: res.data.summary.totalSuccessCount,
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Sinkronisasi transaksi terbaru dari server (fallback jika event socket terlewat / double-tap)
  const syncLatestTransaction = async (invoiceCode, fallbackMethod) => {
    try {
      const res = await api.get('/transactions');
      const list = Array.isArray(res.data) ? res.data : res.data?.transactions || [];
      const latest = list.find((t) => t.invoice_code === invoiceCode);
      if (latest) {
        setCurrentTx((prev) => ({
          ...prev,
          ...latest,
          payment_method: latest.payment_method || fallbackMethod || prev?.payment_method,
        }));
        if (latest.fulfillment_status === 'success' || latest.payment_status === 'paid') {
          setProcessStep(4);
          setStep(3);
          fetchShiftStats();
        }
      }
    } catch (syncErr) {
      console.error('Gagal menyinkronkan status transaksi:', syncErr);
    }
  };

  // Deteksi operator otomatis dari nomor HP
  const handleTargetChange = (val) => {
    setTargetNumber(val);
    if (category === 'pulsa') {
      const clean = val.replace(/\D/g, '');
      let detected = provider;

      if (/^(0811|0812|0813|0821|0822|0823|0851|0852|0853)/.test(clean)) {
        detected = 'Telkomsel';
      } else if (/^(0814|0815|0816|0855|0856|0857|0858)/.test(clean)) {
        detected = 'Indosat Ooredoo';
      } else if (/^(0817|0818|0819|0859|0877|0878)/.test(clean)) {
        detected = 'XL Axiata';
      } else if (/^(0831|0832|0833|0838)/.test(clean)) {
        detected = 'Axis';
      } else if (/^(0895|0896|0897|0898|0899)/.test(clean)) {
        detected = 'Tri (3)';
      } else if (/^(0881|0882|0883|0884|0885|0886|0887|0888|0889)/.test(clean)) {
        detected = 'Smartfren';
      }

      if (detected !== provider) {
        setProvider(detected);
        const firstMatch = products.find((p) => p.category === 'pulsa' && p.provider === detected);
        setSelectedProduct(firstMatch || null);
      }
    }
  };

  const handleCategorySwitch = (newCat) => {
    setCategory(newCat);
    setTargetNumber('');
    setCustomBankName('');
    if (newCat === 'pulsa') {
      setProvider('Telkomsel');
      const item = products.find((p) => p.category === 'pulsa');
      setSelectedProduct(item || null);
    } else if (newCat === 'ewallet') {
      setProvider('DANA');
      setCustomNominal('150000');
      setSelectedProduct(null);
    } else if (newCat === 'transfer_bank') {
      setProvider('Bank BCA');
      setCustomNominal('200000');
      setSelectedProduct(null);
    } else if (newCat === 'token_listrik') {
      setProvider('PLN Prabayar');
      const item = products.find((p) => p.category === 'token_listrik');
      setSelectedProduct(item || null);
    } else if (newCat === 'tagihan_ppob') {
      setProvider('Listrik Pascabayar');
      setCustomNominal('150000');
      setPpobAdminFee('3000');
      setSelectedProduct(null);
    }
  };

  // Cek Nama Pelanggan / Tagihan Otomatis (Inquiry)
  const handleCheckAccount = async () => {
    if (!targetNumber.trim() || targetNumber.trim().length < 5) {
      return alert('Masukkan nomor tujuan / ID Pelanggan minimal 5 digit terlebih dahulu.');
    }

    setInquiring(true);
    setInquiryInfo('');
    try {
      const res = await api.post('/transactions/inquiry', {
        category,
        provider: effectiveServiceLabel,
        target_number: targetNumber,
        sku_code: selectedProduct?.product_code || null,
      });

      if (res.data?.customer_name) {
        setCustomerName(res.data.customer_name);
      }
      if (res.data?.bill_amount) {
        setCustomNominal(String(res.data.bill_amount));
      }
      if (res.data?.admin_fee !== null && res.data?.admin_fee !== undefined) {
        setPpobAdminFee(String(res.data.admin_fee));
      }
      setInquiryInfo(res.data?.detail || 'Data pelanggan ditemukan');
    } catch (err) {
      alert(err.response?.data?.message || 'Gagal mengecek data pelanggan.');
    } finally {
      setInquiring(false);
    }
  };

  // Hitung rincian ringkasan pesanan
  const isFixedCatalog = category === 'pulsa' || category === 'token_listrik';

  const activeNominal = isFixedCatalog
    ? Number(selectedProduct?.nominal || 0)
    : Number(customNominal) || 0;

  const activeAdminFee =
    category === 'transfer_bank'
      ? getBankTransferAdminFee(activeNominal, provider)
      : category === 'ewallet'
      ? getEwalletAdminFee(activeNominal)
      : category === 'tagihan_ppob'
      ? Math.max(0, Number(ppobAdminFee) || 0)
      : Number(selectedProduct?.admin_fee || 3000);

  const activeBaseCost =
    category === 'transfer_bank'
      ? activeNominal + 2500
      : category === 'ewallet'
      ? activeNominal + 1000
      : category === 'tagihan_ppob'
      ? activeNominal + 1500
      : Number(selectedProduct?.base_price || activeNominal);

  const totalBill = activeNominal + activeAdminFee;

  // Label layanan yang ditampilkan di ringkasan & struk
  const effectiveServiceLabel =
    category === 'transfer_bank' && provider === 'Bank Lain' && customBankName.trim()
      ? `Bank Lain (${customBankName.trim()})`
      : category === 'tagihan_ppob' && provider === 'Internet / WiFi'
      ? `Internet (${internetProvider})`
      : provider;

  // Tahap 1 -> Tahap 2: Buat Tagihan
  const handleCreateBill = async (e) => {
    e.preventDefault();
    if (!targetNumber.trim()) {
      return alert('Masukkan nomor tujuan / ID Pelanggan terlebih dahulu.');
    }
    if (isFixedCatalog && !selectedProduct) {
      return alert('Pilih nominal produk terlebih dahulu.');
    }
    if (category === 'transfer_bank' && (activeNominal < 10000 || activeNominal > 15000000)) {
      return alert('Nominal transfer bank harus antara Rp 10.000 sampai Rp 15.000.000.');
    }
    if (category === 'ewallet' && (activeNominal < 10000 || activeNominal > 10000000)) {
      return alert('Nominal top up e-wallet harus antara Rp 10.000 sampai Rp 10.000.000.');
    }
    if (category === 'tagihan_ppob' && activeNominal < 1000) {
      return alert('Masukkan nominal tagihan dengan benar.');
    }

    setLoading(true);
    try {
      const res = await api.post('/transactions', {
        shift_id: activeShift?.id || null,
        product_id: selectedProduct?.id || null,
        category,
        provider: effectiveServiceLabel,
        target_number: targetNumber,
        customer_name: customerName,
        nominal: activeNominal,
        base_cost: activeBaseCost,
        admin_fee: activeAdminFee,
        payment_method: 'qris',
      });
      setCurrentTx(res.data);
      setPaymentMethod('qris');
      setProcessStep(2);
      setStep(2);
    } catch (err) {
      alert(err.response?.data?.message || 'Gagal membuat tagihan.');
    } finally {
      setLoading(false);
    }
  };

  // Transisi animasi status proses secara bertahap sebelum menampilkan struk
  const runFulfillmentSequence = (txData, method) => {
    setCurrentTx((prev) => ({
      ...prev,
      ...(txData && typeof txData === 'object' ? txData : {}),
      payment_method: method,
      payment_status: 'paid',
      fulfillment_status: txData?.fulfillment_status || 'success',
      serial_number: txData?.serial_number || prev?.serial_number,
      paid_at: txData?.paid_at || new Date().toISOString(),
    }));

    // Tahap 3: Pembayaran terverifikasi -> Pesanan dikirim ke agen (ikon 3 berdenyut biru)
    setProcessStep(3);

    // Setelah 1.1 detik -> Tahap 4: Selesai & struk tersedia (ikon 4 centang hijau)
    setTimeout(() => {
      setProcessStep(4);
      fetchShiftStats();

      // Setelah 0.8 detik -> Pindah ke halaman Struk (Step 3)
      setTimeout(() => {
        setStep(3);
      }, 800);
    }, 1100);
  };

  // Konfirmasi Bayar Cash
  const handlePayCash = async () => {
    if (payLockRef.current || loading || !currentTx) return;
    payLockRef.current = true;
    setLoading(true);

    try {
      const res = await api.post(`/transactions/${currentTx.invoice_code}/pay-cash`);
      const updated = res.data?.transaction || res.data;
      runFulfillmentSequence(updated, 'cash');
    } catch (err) {
      const msg = err.response?.data?.message || '';
      if (msg.toLowerCase().includes('sudah dibayar')) {
        await syncLatestTransaction(currentTx.invoice_code, 'cash');
      } else {
        alert(msg || 'Gagal memproses pembayaran tunai.');
      }
    } finally {
      payLockRef.current = false;
      setLoading(false);
    }
  };

  // Simulasi Webhook QRIS Masuk
  const handleSimulateQrisWebhook = async () => {
    if (payLockRef.current || loading || !currentTx) return;
    payLockRef.current = true;
    setLoading(true);

    try {
      const res = await api.post('/transactions/webhook/qris', {
        invoice_code: currentTx.invoice_code,
      });
      const updated = res.data?.transaction || res.data;
      runFulfillmentSequence(updated, 'qris');
    } catch (err) {
      const msg = err.response?.data?.message || '';
      if (msg.toLowerCase().includes('sudah dibayar')) {
        await syncLatestTransaction(currentTx.invoice_code, 'qris');
      } else {
        alert(msg || 'Gagal simulasi QRIS');
      }
    } finally {
      payLockRef.current = false;
      setLoading(false);
    }
  };

  const handleCancelBill = async () => {
    if (!window.confirm('Batalkan tagihan ini?')) return;
    await api.post(`/transactions/${currentTx.invoice_code}/cancel`);
    resetOrder();
  };

  const resetOrder = () => {
    setCurrentTx(null);
    setTargetNumber('');
    setCustomerName('');
    setCustomBankName('');
    setProcessStep(2);
    setStep(1);
  };

  // Render struk menjadi gambar PNG beresolusi tinggi & salin ke clipboard untuk WhatsApp
  const handleShareReceiptImage = async () => {
    if (!currentTx) return;

    const canvas = document.createElement('canvas');
    const scale = 2;
    const width = 420;
    const height = 685;
    canvas.width = width * scale;
    canvas.height = height * scale;

    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    const centerX = width / 2;
    const leftX = 28;
    const rightX = width - 28;
    let y = 34;

    const drawDashedLine = (posY) => {
      ctx.save();
      ctx.strokeStyle = '#9CA3AF';
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(leftX, posY);
      ctx.lineTo(rightX, posY);
      ctx.stroke();
      ctx.restore();
    };

    // Logo Kotak ZK
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.roundRect(centerX - 22, y, 44, 44, 10);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ZK', centerX, y + 28);
    y += 64;

    // Header Toko, Alamat & Waktu
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('ZKCELL', centerX, y);
    y += 17;

    ctx.fillStyle = '#4B5563';
    ctx.font = '11px monospace';
    ctx.fillText('Cikarageman, Kec. Setu, Kabupaten Bekasi', centerX, y);
    y += 14;
    ctx.fillText('Jawa Barat 17320', centerX, y);
    y += 16;

    const formattedTime = new Date(
      currentTx.paid_at || currentTx.created_at || Date.now()
    ).toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    ctx.fillText(formattedTime, centerX, y);
    y += 16;

    drawDashedLine(y);
    y += 26;

    // Judul Jenis Struk
    const receiptTitleMap = {
      pulsa: 'STRUK PEMBELIAN PULSA',
      ewallet: 'STRUK TOP UP E-WALLET',
      transfer_bank: 'STRUK TRANSFER BANK',
      token_listrik: 'STRUK TOKEN LISTRIK PLN',
      tagihan_ppob: 'STRUK PEMBAYARAN TAGIHAN',
    };
    const receiptTitle = receiptTitleMap[currentTx.category] || 'STRUK TRANSAKSI DIGITAL';

    ctx.fillStyle = '#111827';
    ctx.font = 'bold 15px monospace';
    ctx.fillText(receiptTitle, centerX, y);
    y += 28;

    const targetLabel =
      currentTx.category === 'transfer_bank'
        ? 'NO. REK'
        : currentTx.category === 'token_listrik'
        ? 'NO. METER'
        : currentTx.category === 'tagihan_ppob'
        ? 'ID PELANGGAN'
        : 'NO. TUJUAN';

    const details = [
      ['ID TRX', currentTx.invoice_code],
      ['LAYANAN', currentTx.provider],
      [targetLabel, currentTx.target_number],
      ['NAMA', (currentTx.customer_name || 'PELANGGAN UMUM').toUpperCase()],
      ['KASIR', (user?.name || 'KASIR').toUpperCase()],
    ];

    ctx.textAlign = 'left';
    details.forEach(([label, val]) => {
      ctx.fillStyle = '#4B5563';
      ctx.font = '12px monospace';
      ctx.fillText(label, leftX, y);

      ctx.fillStyle = '#111827';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`: ${val}`, leftX + 108, y);
      y += 22;
    });

    y += 6;
    drawDashedLine(y);
    y += 24;

    const drawRow = (label, value, isBold = false) => {
      ctx.textAlign = 'left';
      ctx.fillStyle = isBold ? '#111827' : '#4B5563';
      ctx.font = isBold ? 'bold 14px monospace' : '12px monospace';
      ctx.fillText(label, leftX, y);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#111827';
      ctx.fillText(value, rightX, y);
      y += isBold ? 24 : 20;
    };

    drawRow(currentTx.category === 'tagihan_ppob' ? 'TAGIHAN' : 'NOMINAL', formatRupiah(currentTx.nominal));
    drawRow('BIAYA ADMIN', formatRupiah(currentTx.admin_fee));
    drawRow('TOTAL BAYAR', formatRupiah(currentTx.total_amount), true);
    drawRow('METODE BAYAR', `${String(currentTx.payment_method).toUpperCase()} (LUNAS)`);

    y += 4;
    drawDashedLine(y);
    y += 26;

    // Sorotan Kode Token / Serial Number
    ctx.textAlign = 'center';
    ctx.fillStyle = '#4B5563';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(
      currentTx.category === 'token_listrik' ? '** KODE TOKEN PLN (20 DIGIT) **' : '** Serial Number / Ref **',
      centerX,
      y
    );
    y += 26;

    ctx.fillStyle = '#111827';
    ctx.font = 'bold 17px monospace';
    ctx.fillText(currentTx.serial_number || 'SN994827102', centerX, y);
    y += 24;

    drawDashedLine(y);
    y += 22;

    ctx.fillStyle = '#111827';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('SIMPAN STRUK INI SEBAGAI BUKTI SAH', centerX, y);
    y += 16;

    ctx.fillStyle = '#4B5563';
    ctx.font = '10px monospace';
    ctx.fillText('MELAYANI PULSA, TOKEN PLN, BPJS, WIFI,', centerX, y);
    y += 14;
    ctx.fillText('TOP UP E-WALLET & TRANSFER SEMUA BANK', centerX, y);
    y += 20;

    ctx.fillStyle = '#111827';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('TERIMA KASIH TELAH BERTRANSAKSI', centerX, y);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        if (navigator.clipboard && window.ClipboardItem) {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          alert('Gambar struk berhasil disalin! Buka WhatsApp dan tekan Ctrl+V (Tempel) untuk mengirim gambar.');
          return;
        }
      } catch (err) {
        console.warn('Clipboard image tidak diizinkan browser, beralih ke unduh otomatis:', err);
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Struk-${currentTx.invoice_code}.png`;
      link.click();
      URL.revokeObjectURL(url);
      alert('Gambar struk berhasil diunduh! Silakan lampirkan ke chat WhatsApp pelanggan.');
    }, 'image/png');
  };

  const filteredProducts = products.filter(
    (p) => p.category === category && (category !== 'pulsa' || p.provider === provider)
  );

  const handlePrintThermal = () => {
    const style = document.createElement('style');
    style.id = 'thermal-58mm-page';
    style.innerHTML = `@page { size: 58mm 155mm; margin: 0mm; }`;
    document.head.appendChild(style);

    window.print();

    setTimeout(() => {
      const existing = document.getElementById('thermal-58mm-page');
      if (existing) existing.remove();
    }, 500);
  };

  return (
    <div className="space-y-6">
      {/* Header Judul & Shift Badge */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {step === 1 ? 'Transaksi baru' : step === 2 ? 'Tagihan siap dibayar' : 'Transaksi berhasil'}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {step === 1
              ? 'Layani pelanggan, semua transaksi dalam satu tempat.'
              : step === 2
              ? 'Nominal terisi otomatis. Pesanan diproses setelah pembayaran terverifikasi.'
              : 'Produk telah dikirim ke tujuan dan struk siap diserahkan ke pelanggan.'}
          </p>
        </div>

        {step === 2 ? (
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
            Menunggu pembayaran
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-[#047857] text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-[#047857]"></span>
            Shift aktif · {user?.shift_schedule || '08.00 – 16.00'}
          </span>
        )}
      </div>

      {/* Stepper 3 Langkah */}
      <div className="no-print bg-white rounded-xl border border-gray-200 px-3.5 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between max-w-2xl">
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
              step >= 1 ? 'bg-emerald-50 text-[#047857] border border-emerald-300' : 'bg-gray-100 text-gray-400'
            }`}
          >
            {step > 1 ? <Check size={14} /> : '1'}
          </span>
          <span className={`text-xs sm:text-sm font-medium ${step >= 1 ? 'text-[#047857]' : 'text-gray-400'}`}>
            Pesanan
          </span>
        </div>

        <div className="flex-1 h-px bg-gray-200 mx-2 sm:mx-4"></div>

        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
              step >= 2 ? 'bg-emerald-50 text-[#047857] border border-emerald-300' : 'bg-gray-100 text-gray-400'
            }`}
          >
            {step > 2 ? <Check size={14} /> : '2'}
          </span>
          <span className={`text-xs sm:text-sm font-medium ${step >= 2 ? 'text-[#047857]' : 'text-gray-400'}`}>
            Pembayaran
          </span>
        </div>

        <div className="flex-1 h-px bg-gray-200 mx-2 sm:mx-4"></div>

        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
              step === 3 ? 'bg-emerald-50 text-[#047857] border border-emerald-300' : 'bg-gray-100 text-gray-400'
            }`}
          >
            {step === 3 ? <Check size={14} /> : '3'}
          </span>
          <span className={`text-xs sm:text-sm font-medium ${step === 3 ? 'text-[#047857]' : 'text-gray-400'}`}>
            Struk
          </span>
        </div>
      </div>

      {/* ================= TAHAP 1: PESANAN BARU ================= */}
      {step === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Kolom Kiri: Form Layanan */}
          <form
            onSubmit={handleCreateBill}
            className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-6 space-y-6"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Pilih layanan</h3>
              <span className="text-xs text-gray-400 font-mono">01 / 03</span>
            </div>

            {/* Tab Layanan (5 Kategori) */}
            <div className="flex flex-wrap gap-2 pb-4 border-b border-gray-100">
              <button
                type="button"
                onClick={() => handleCategorySwitch('pulsa')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  category === 'pulsa'
                    ? 'bg-emerald-50 text-[#047857] border border-emerald-200'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Smartphone size={15} />
                Pulsa
              </button>
              <button
                type="button"
                onClick={() => handleCategorySwitch('token_listrik')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  category === 'token_listrik'
                    ? 'bg-emerald-50 text-[#047857] border border-emerald-200'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Zap size={15} />
                Token Listrik
              </button>
              <button
                type="button"
                onClick={() => handleCategorySwitch('tagihan_ppob')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  category === 'tagihan_ppob'
                    ? 'bg-emerald-50 text-[#047857] border border-emerald-200'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <ReceiptText size={15} />
                Tagihan (PLN / BPJS / WiFi)
              </button>
              <button
                type="button"
                onClick={() => handleCategorySwitch('ewallet')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  category === 'ewallet'
                    ? 'bg-emerald-50 text-[#047857] border border-emerald-200'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Wallet size={15} />
                E-wallet
              </button>
              <button
                type="button"
                onClick={() => handleCategorySwitch('transfer_bank')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  category === 'transfer_bank'
                    ? 'bg-emerald-50 text-[#047857] border border-emerald-200'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Building2 size={15} />
                Transfer bank
              </button>
            </div>

            {/* Pilihan Operator khusus Pulsa */}
            {category === 'pulsa' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">
                  Operator Seluler (Otomatis dari nomor atau pilih manual)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {['Telkomsel', 'Indosat Ooredoo', 'XL Axiata', 'Tri (3)', 'Axis', 'Smartfren'].map((op) => (
                    <button
                      key={op}
                      type="button"
                      onClick={() => {
                        setProvider(op);
                        const match = products.find((p) => p.category === 'pulsa' && p.provider === op);
                        setSelectedProduct(match || null);
                      }}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                        provider === op
                          ? 'border-[#047857] bg-emerald-50/50 text-[#047857] ring-1 ring-[#047857]'
                          : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {op}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Pilihan Jenis Tagihan khusus Tagihan PPOB (PLN Pascabayar, BPJS, Internet) */}
            {category === 'tagihan_ppob' && (
              <div className="space-y-3">
                <label className="block text-xs font-medium text-gray-600">Pilih Jenis Tagihan Pelanggan</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {['Listrik Pascabayar', 'BPJS Kesehatan', 'Internet / WiFi'].map((billType) => (
                    <button
                      key={billType}
                      type="button"
                      onClick={() => setProvider(billType)}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                        provider === billType
                          ? 'border-[#047857] bg-emerald-50/50 text-[#047857] ring-1 ring-[#047857]'
                          : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {billType}
                    </button>
                  ))}
                </div>

                {provider === 'Internet / WiFi' && (
                  <div className="pt-1">
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Provider Internet / WiFi</label>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {['IndiHome', 'MyRepublic', 'Biznet', 'First Media', 'ICONNET'].map((isp) => (
                        <button
                          key={isp}
                          type="button"
                          onClick={() => setInternetProvider(isp)}
                          className={`py-2 px-2.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                            internetProvider === isp
                              ? 'border-[#047857] bg-emerald-50 text-[#047857]'
                              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {isp}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Pilihan Dompet Digital khusus E-Wallet */}
            {category === 'ewallet' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Pilih Dompet Digital</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {['DANA', 'OVO', 'GoPay', 'ShopeePay'].map((ew) => (
                    <button
                      key={ew}
                      type="button"
                      onClick={() => setProvider(ew)}
                      className={`py-2.5 px-3 rounded-xl border text-sm font-semibold transition cursor-pointer ${
                        provider === ew
                          ? 'border-[#047857] bg-emerald-50/50 text-[#047857] ring-1 ring-[#047857]'
                          : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {ew}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Pilihan Bank khusus Transfer Bank */}
            {category === 'transfer_bank' && (
              <div className="space-y-3">
                <label className="block text-xs font-medium text-gray-600">Bank Tujuan (Tarif Resmi ZKCELL)</label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  {['Bank BCA', 'Bank BRI', 'Bank BNI', 'Bank Mandiri', 'Bank Lain'].map((bank) => (
                    <button
                      key={bank}
                      type="button"
                      onClick={() => setProvider(bank)}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                        provider === bank
                          ? 'border-[#047857] bg-emerald-50/50 text-[#047857] ring-1 ring-[#047857]'
                          : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {bank}
                    </button>
                  ))}
                </div>

                {provider === 'Bank Lain' && (
                  <input
                    type="text"
                    value={customBankName}
                    onChange={(e) => setCustomBankName(e.target.value)}
                    placeholder="Ketik nama bank tujuan (contoh: BSI, CIMB Niaga, Danamon)"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-xs text-gray-900 focus:outline-none focus:border-[#047857]"
                  />
                )}
              </div>
            )}

            {/* Nomor Tujuan / ID Pelanggan */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                {category === 'transfer_bank'
                  ? 'Nomor rekening tujuan'
                  : category === 'token_listrik'
                  ? 'Nomor Meter / ID Pelanggan PLN (11–12 digit)'
                  : category === 'tagihan_ppob'
                  ? `Nomor ID Pelanggan / Virtual Account (${effectiveServiceLabel})`
                  : 'Nomor handphone'}
              </label>

              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={targetNumber}
                  onChange={(e) => {
                    handleTargetChange(e.target.value);
                    if (inquiryInfo) setInquiryInfo('');
                  }}
                  placeholder={
                    category === 'transfer_bank'
                      ? 'Contoh: 5210986421'
                      : category === 'token_listrik'
                      ? 'Contoh: 14239012845'
                      : category === 'tagihan_ppob'
                      ? 'Contoh: 8888801234567890'
                      : '0812 3456 7890'
                  }
                  className="flex-1 min-w-0 px-4 py-3 rounded-xl border border-gray-300 text-base font-medium text-gray-900 focus:outline-none focus:border-[#047857]"
                />

                {category !== 'pulsa' && (
                  <button
                    type="button"
                    onClick={handleCheckAccount}
                    disabled={inquiring || !targetNumber.trim()}
                    className="shrink-0 flex items-center gap-1.5 px-4 py-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 text-[#047857] border border-emerald-200 text-xs font-semibold transition cursor-pointer"
                  >
                    <Search size={15} />
                    {inquiring
                      ? 'Mengecek...'
                      : category === 'tagihan_ppob'
                      ? 'Cek Tagihan'
                      : 'Cek Nama'}
                  </button>
                )}
              </div>

              {inquiryInfo && (
                <p className="text-xs font-medium text-[#047857] mt-1.5">
                  ✓ {inquiryInfo}
                </p>
              )}
            </div>

            {/* Layanan & Nama Pelanggan */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  {category === 'transfer_bank' ? 'Bank dipilih' : 'Layanan dipilih'}
                </label>
                <div className="px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm font-semibold text-gray-800">
                  {effectiveServiceLabel}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Nama pelanggan {category === 'token_listrik' || category === 'tagihan_ppob' ? '(atas nama meter/tagihan)' : '(opsional)'}
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Contoh: Budi Santoso"
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm text-gray-900 focus:outline-none focus:border-[#047857]"
                />
              </div>
            </div>

            {/* Input Nominal: Katalog Tetap (Pulsa & Token Listrik) vs Input Dinamis (E-Wallet, Transfer Bank, Tagihan PPOB) */}
            {isFixedCatalog ? (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">
                  {category === 'token_listrik' ? 'Pilih Nominal Token Listrik PLN' : 'Nominal pulsa'}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {filteredProducts.map((prod) => {
                    const isSelected = selectedProduct?.id === prod.id;
                    return (
                      <button
                        key={prod.id}
                        type="button"
                        onClick={() => setSelectedProduct(prod)}
                        className={`py-3.5 px-4 rounded-xl border text-sm font-semibold transition cursor-pointer ${
                          isSelected
                            ? 'border-[#047857] bg-emerald-50/40 text-[#047857] ring-1 ring-[#047857]'
                            : 'border-gray-200 text-gray-800 hover:border-gray-300'
                        }`}
                      >
                        {formatRupiah(prod.nominal)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : category === 'tagihan_ppob' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Nominal Tagihan Pokok (Rp)
                  </label>
                  <input
                    type="number"
                    min="1000"
                    required
                    value={customNominal}
                    onChange={(e) => setCustomNominal(e.target.value)}
                    placeholder="Contoh: 185500"
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 text-base font-semibold text-gray-900 focus:outline-none focus:border-[#047857]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Biaya Admin Loket (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    required
                    value={ppobAdminFee}
                    onChange={(e) => setPpobAdminFee(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 text-base font-semibold text-gray-900 focus:outline-none focus:border-[#047857]"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-gray-600">
                    {category === 'transfer_bank'
                      ? 'Nominal transfer (Rp 10.000 – Rp 15.000.000)'
                      : 'Nominal top up saldo (Rp)'}
                  </label>
                  <span className="text-[11px] font-semibold text-[#047857]">
                    Admin otomatis: {formatRupiah(activeAdminFee)}
                  </span>
                </div>

                <input
                  type="number"
                  min="10000"
                  max={category === 'transfer_bank' ? '15000000' : '10000000'}
                  required
                  value={customNominal}
                  onChange={(e) => setCustomNominal(e.target.value)}
                  placeholder="Ketik nominal (contoh: 150000)"
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 text-base font-semibold text-gray-900 focus:outline-none focus:border-[#047857]"
                />

                <div className="flex flex-wrap gap-2">
                  {[20000, 50000, 100000, 150000, 200000, 500000].map((quickAmt) => (
                    <button
                      key={quickAmt}
                      type="button"
                      onClick={() => setCustomNominal(String(quickAmt))}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                        Number(customNominal) === quickAmt
                          ? 'border-[#047857] bg-emerald-50 text-[#047857]'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {formatRupiah(quickAmt)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Status Ketersediaan & Banner Info */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full bg-[#047857]"></span>
                <span className="font-semibold text-[#047857]">Produk tersedia</span>
                <span className="text-gray-400">· Estimasi proses 5–30 detik</span>
              </div>

              <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-emerald-50/70 text-[#065F46] text-xs">
                <Info size={16} className="shrink-0" />
                <span>Pastikan nomor tujuan / ID Pelanggan benar sebelum membuat tagihan.</span>
              </div>
            </div>
          </form>

          {/* Kolom Kanan: Ringkasan Pesanan & Shift Saya */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Ringkasan pesanan</h3>

              <div className="flex items-start justify-between pb-4 border-b border-gray-100">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">
                    {category === 'pulsa'
                      ? `Pulsa ${provider}`
                      : category === 'token_listrik'
                      ? `Token Listrik ${activeNominal >= 1000 ? `${activeNominal / 1000}K` : ''}`
                      : category === 'ewallet'
                      ? `Top Up ${provider}`
                      : effectiveServiceLabel}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {targetNumber || 'Belum diisi'} {customerName ? `· ${customerName}` : ''}
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-md bg-emerald-50 text-[#047857] text-xs font-bold">
                  {activeNominal >= 1000 ? `${Math.round(activeNominal / 1000)}K` : activeNominal}
                </span>
              </div>

              <div className="py-4 space-y-2.5 text-sm border-b border-gray-100">
                <div className="flex justify-between text-gray-600">
                  <span>{category === 'tagihan_ppob' ? 'Nominal tagihan' : 'Nominal transaksi'}</span>
                  <span className="font-medium text-gray-900">{formatRupiah(activeNominal)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Biaya layanan / admin</span>
                  <span className="font-medium text-gray-900">{formatRupiah(activeAdminFee)}</span>
                </div>
              </div>

              <div className="pt-4 pb-6">
                <p className="text-xs text-gray-500">Total tagihan</p>
                <p className="text-3xl font-bold text-[#047857] mt-1">{formatRupiah(totalBill)}</p>
              </div>

              <button
                onClick={handleCreateBill}
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-xl bg-[#047857] hover:bg-[#065F46] text-white font-semibold text-sm transition cursor-pointer"
              >
                {loading ? 'Membuat tagihan...' : 'Buat tagihan →'}
              </button>
              <p className="text-[11px] text-gray-400 text-center mt-2.5">
                Pilih cash atau QRIS di langkah berikutnya.
              </p>
            </div>

            {/* Widget Shift Saya Hari Ini */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Shift saya hari ini</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Penjualan berhasil</span>
                  <span className="font-bold text-gray-900">{formatRupiah(shiftStats.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Transaksi berhasil</span>
                  <span className="font-bold text-gray-900">{shiftStats.count} transaksi</span>
                </div>
              </div>
              <p className="text-[11px] text-gray-400 mt-4">Hanya transaksi milik {user?.name}</p>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAHAP 2: PEMBAYARAN QRIS / CASH ================= */}
      {step === 2 && currentTx && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Metode pembayaran</h3>
              <span className="text-xs font-mono text-gray-500">Tagihan #{currentTx.invoice_code}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setPaymentMethod('qris')}
                className={`flex items-center justify-between p-4 rounded-xl border text-left transition ${
                  paymentMethod === 'qris'
                    ? 'border-[#047857] bg-emerald-50/30 ring-1 ring-[#047857]'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      paymentMethod === 'qris' ? 'border-[#047857]' : 'border-gray-400'
                    }`}
                  >
                    {paymentMethod === 'qris' && <span className="w-2 h-2 rounded-full bg-[#047857]"></span>}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">QRIS otomatis</span>
                </div>
                {paymentMethod === 'qris' && (
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-[#047857] text-[11px] font-semibold">
                    Terpilih
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`flex items-center justify-between p-4 rounded-xl border text-left transition ${
                  paymentMethod === 'cash'
                    ? 'border-[#047857] bg-emerald-50/30 ring-1 ring-[#047857]'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      paymentMethod === 'cash' ? 'border-[#047857]' : 'border-gray-400'
                    }`}
                  >
                    {paymentMethod === 'cash' && <span className="w-2 h-2 rounded-full bg-[#047857]"></span>}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">Cash / tunai</span>
                </div>
                {paymentMethod === 'cash' && (
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-[#047857] text-[11px] font-semibold">
                    Terpilih
                  </span>
                )}
              </button>
            </div>

            {paymentMethod === 'qris' ? (
              <div className="border border-gray-200 rounded-2xl p-6 text-center space-y-4">
                <div className="flex items-center justify-between text-xs font-bold text-gray-700">
                  <span className="text-base tracking-tight">QRIS</span>
                  <span className="text-gray-500">ZKCELL · UTAMA</span>
                </div>

                <div>
                  <p className="text-xs text-gray-500">Total pembayaran</p>
                  <p className="text-3xl font-bold text-[#047857] mt-1">
                    {formatRupiah(currentTx.total_amount)}
                  </p>
                </div>

                <div className="inline-block p-4 bg-white border border-gray-100 rounded-xl shadow-xs">
                  <QRCodeSVG value={currentTx.qris_payload || currentTx.invoice_code} size={180} />
                </div>

                <div>
                  <p className="text-[11px] text-gray-400">Scan menggunakan mobile banking atau e-wallet</p>
                  <span className="inline-block mt-2 px-3 py-1 rounded-full bg-amber-50 text-amber-800 text-xs font-medium">
                    Berlaku 15 menit dari pembuatan tagihan
                  </span>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleSimulateQrisWebhook}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition cursor-pointer"
                  >
                    {loading ? 'Memproses...' : '⚡ Simulasi Pelanggan Selesai Bayar QRIS (Webhook)'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-2xl p-8 text-center space-y-4">
                <p className="text-xs text-gray-500">Terima uang tunai dari pelanggan sebesar</p>
                <p className="text-4xl font-bold text-[#047857]">{formatRupiah(currentTx.total_amount)}</p>
                <p className="text-xs text-gray-500 max-w-md mx-auto">
                  Pastikan uang tunai sudah diterima dengan nominal pas sebelum menekan tombol konfirmasi di bawah.
                </p>
                <button
                  type="button"
                  onClick={handlePayCash}
                  disabled={loading}
                  className="px-6 py-3.5 rounded-xl bg-[#047857] hover:bg-[#065F46] text-white text-sm font-semibold transition cursor-pointer"
                >
                  {loading ? 'Memproses...' : 'Konfirmasi Uang Tunai Diterima & Proses →'}
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => window.print()}
                className="py-3 px-4 rounded-xl border border-gray-200 hover:bg-gray-50 text-sm font-medium text-gray-700"
              >
                Cetak tagihan
              </button>
              <button
                type="button"
                onClick={() => alert(`Tagihan #${currentTx.invoice_code} sebesar ${formatRupiah(currentTx.total_amount)} disalin!`)}
                className="py-3 px-4 rounded-xl border border-gray-200 hover:bg-gray-50 text-sm font-medium text-gray-700"
              >
                Bagikan tagihan
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3 text-sm">
              <h3 className="font-semibold text-gray-900 mb-2">Detail transaksi</h3>
              <div className="flex justify-between">
                <span className="text-gray-500">Pelanggan</span>
                <span className="font-medium text-gray-900">{currentTx.customer_name || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Nomor / ID Pelanggan</span>
                <span className="font-medium text-gray-900">{currentTx.target_number}</span>
              </div>
              <div className="flex justify-between pb-3 border-b border-gray-100">
                <span className="text-gray-500">Layanan</span>
                <span className="font-medium text-gray-900">{currentTx.provider}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Nominal</span>
                <span className="font-medium text-gray-900">{formatRupiah(currentTx.nominal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Biaya layanan</span>
                <span className="font-medium text-gray-900">{formatRupiah(currentTx.admin_fee)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-100 font-bold">
                <span className="text-gray-900">Total tagihan</span>
                <span className="text-gray-900">{formatRupiah(currentTx.total_amount)}</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Status proses</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-[#047857] flex items-center justify-center text-xs font-bold shrink-0">
                    ✓
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Tagihan dibuat</p>
                    <p className="text-xs text-gray-400">Oleh {user?.name}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      processStep > 2 ? 'bg-emerald-100 text-[#047857]' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {processStep > 2 ? '✓' : '2'}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Menunggu pembayaran</p>
                    <p className="text-xs text-gray-400">Dikonfirmasi otomatis oleh sistem</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      processStep > 3
                        ? 'bg-emerald-100 text-[#047857]'
                        : processStep === 3
                        ? 'bg-blue-100 text-blue-700 animate-pulse'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {processStep > 3 ? '✓' : '3'}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Pesanan dikirim ke agen</p>
                    <p className="text-xs text-gray-400">Setelah pembayaran berhasil</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      processStep === 4 ? 'bg-emerald-100 text-[#047857]' : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {processStep === 4 ? '✓' : '4'}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Selesai & struk tersedia</p>
                    <p className="text-xs text-gray-400">Setelah produk berhasil diterima</p>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-gray-400 mt-5 pt-4 border-t border-gray-100">
                Jika proses gagal, dana masuk antrean refund.
              </p>
            </div>

            <button
              type="button"
              onClick={handleCancelBill}
              className="text-xs font-medium text-red-600 hover:text-red-700 cursor-pointer"
            >
              Batalkan tagihan
            </button>
          </div>
        </div>
      )}

      {/* ================= TAHAP 3: PROSES & STRUK SELESAI ================= */}
      {step === 3 && currentTx && (
        <div className="max-w-md mx-auto space-y-4">
          <div className="no-print flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-[#047857]">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-[#047857] text-white flex items-center justify-center shrink-0">
                <Check size={16} strokeWidth={3} />
              </div>
              <div>
                <p className="text-sm font-bold">Transaksi Berhasil Diproses</p>
                <p className="text-xs text-emerald-700">Struk siap dicetak atau dibagikan ke pelanggan.</p>
              </div>
            </div>
          </div>

          {/* Kertas Struk Thermal ZKCELL */}
          <div className="print-area bg-white border border-gray-200 rounded-2xl p-6 shadow-xs font-mono text-gray-900 text-xs leading-relaxed">
            <div className="text-center space-y-1 pb-3 border-b border-dashed border-gray-400">
              <div className="w-10 h-10 rounded-xl bg-gray-900 text-white flex items-center justify-center mx-auto mb-1.5 font-sans font-black text-base tracking-tighter">
                ZK
              </div>
              <h3 className="text-base font-bold tracking-wide">ZKCELL</h3>
              <p className="text-[11px] text-gray-600">Cikarageman, Kec. Setu, Kabupaten Bekasi, Jawa Barat 17320</p>
              <p className="text-[11px] text-gray-600">
                {new Date(currentTx.paid_at || currentTx.created_at || Date.now()).toLocaleString('id-ID', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </p>
            </div>

            <div className="text-center py-3">
              <p className="text-sm font-bold tracking-wider uppercase">
                {currentTx.category === 'pulsa'
                  ? 'STRUK PEMBELIAN PULSA'
                  : currentTx.category === 'ewallet'
                  ? 'STRUK TOP UP E-WALLET'
                  : currentTx.category === 'token_listrik'
                  ? 'STRUK TOKEN LISTRIK PLN'
                  : currentTx.category === 'tagihan_ppob'
                  ? 'STRUK PEMBAYARAN TAGIHAN'
                  : 'STRUK TRANSFER BANK'}
              </p>
            </div>

            <div className="space-y-1.5 py-2">
              <div className="grid grid-cols-12">
                <span className="col-span-4 text-gray-600">ID TRX</span>
                <span className="col-span-8 font-semibold">: {currentTx.invoice_code}</span>
              </div>
              <div className="grid grid-cols-12">
                <span className="col-span-4 text-gray-600">LAYANAN</span>
                <span className="col-span-8 font-semibold">: {currentTx.provider}</span>
              </div>
              <div className="grid grid-cols-12">
                <span className="col-span-4 text-gray-600">
                  {currentTx.category === 'transfer_bank'
                    ? 'NO. REK'
                    : currentTx.category === 'token_listrik'
                    ? 'NO. METER'
                    : currentTx.category === 'tagihan_ppob'
                    ? 'ID PEL'
                    : 'NO. TUJUAN'}
                </span>
                <span className="col-span-8 font-semibold">: {currentTx.target_number}</span>
              </div>
              <div className="grid grid-cols-12">
                <span className="col-span-4 text-gray-600">NAMA</span>
                <span className="col-span-8 uppercase">: {currentTx.customer_name || 'PELANGGAN UMUM'}</span>
              </div>
              <div className="grid grid-cols-12">
                <span className="col-span-4 text-gray-600">KASIR</span>
                <span className="col-span-8 uppercase">: {user?.name || 'KASIR'}</span>
              </div>
            </div>

            <div className="my-3 py-2.5 border-y border-dashed border-gray-400 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-gray-600">
                  {currentTx.category === 'tagihan_ppob' ? 'TAGIHAN' : 'NOMINAL'}
                </span>
                <span>{formatRupiah(currentTx.nominal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">BIAYA ADMIN</span>
                <span>{formatRupiah(currentTx.admin_fee)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold pt-1">
                <span>TOTAL BAYAR</span>
                <span>{formatRupiah(currentTx.total_amount)}</span>
              </div>
              <div className="flex justify-between text-[11px] text-gray-600 pt-0.5">
                <span>METODE BAYAR</span>
                <span className="uppercase font-semibold">{currentTx.payment_method} (LUNAS)</span>
              </div>
            </div>

            <div className="text-center py-3 space-y-1">
              <p className="text-[11px] font-semibold text-gray-600">
                {currentTx.category === 'token_listrik'
                  ? '** KODE TOKEN PLN (20 DIGIT) **'
                  : '** Serial Number / Ref **'}
              </p>
              <p className="text-base font-bold tracking-wider text-gray-900 select-all">
                {currentTx.serial_number || 'SN994827102'}
              </p>
            </div>

            <div className="text-center pt-3 border-t border-dashed border-gray-400 space-y-1.5 text-[10px] text-gray-600">
              <p className="font-semibold text-gray-800">SIMPAN STRUK INI SEBAGAI BUKTI SAH</p>
              <p>
                MELAYANI PULSA, TOKEN PLN, BPJS, WIFI, TOP UP E-WALLET & TRANSFER SEMUA BANK
              </p>
              <p className="pt-1 font-bold text-gray-800">TERIMA KASIH TELAH BERTRANSAKSI</p>
            </div>
          </div>

          <div className="no-print grid grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={handlePrintThermal}
              className="flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-800 cursor-pointer"
            >
              <Printer size={15} />
              Cetak Struk
            </button>
            <button
              type="button"
              onClick={handleShareReceiptImage}
              className="flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold text-[#047857] cursor-pointer"
            >
              <Share2 size={15} />
              Gambar Struk WA
            </button>
            <button
              type="button"
              onClick={resetOrder}
              className="flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl bg-[#047857] hover:bg-[#065F46] text-white text-xs font-semibold cursor-pointer"
            >
              <RotateCcw size={15} />
              Baru
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
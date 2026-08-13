/**
 * Bluetooth Thermal Printer (ESC/POS)
 * Konek langsung ke printer thermal via Web Bluetooth API
 * Seperti Majoo / LunaPos
 */

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

// ESC/POS Commands
const INIT = [ESC, 0x40]; // Initialize printer
const ALIGN_CENTER = [ESC, 0x61, 0x01];
const ALIGN_LEFT = [ESC, 0x61, 0x00];
const BOLD_ON = [ESC, 0x45, 0x01];
const BOLD_OFF = [ESC, 0x45, 0x00];
const FONT_NORMAL = [ESC, 0x4d, 0x00];
const DOUBLE_WIDTH = [GS, 0x21, 0x10];
const NORMAL_SIZE = [GS, 0x21, 0x00];
const CUT_PAPER = [GS, 0x56, 0x00]; // Full cut
const FEED_LINES = [ESC, 0x64, 0x01]; // Feed 1 line

type PrinterDevice = {
  device: BluetoothDevice;
  server: BluetoothRemoteGATTServer;
  characteristic: BluetoothRemoteGATTCharacteristic;
};

let connectedPrinter: PrinterDevice | null = null;

/**
 * Cek apakah Web Bluetooth tersedia
 */
export function isBluetoothAvailable(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

/**
 * Cek apakah printer sudah terkonek
 */
export function isPrinterConnected(): boolean {
  return connectedPrinter !== null && connectedPrinter.server.connected;
}

/**
 * Nama printer yang terkonek
 */
export function getConnectedPrinterName(): string {
  if (!connectedPrinter) return "";
  return connectedPrinter.device.name || "Unknown Printer";
}

/**
 * Konek ke printer Bluetooth
 */
export async function connectPrinter(): Promise<string> {
  if (!isBluetoothAvailable()) {
    throw new Error("Bluetooth tidak tersedia di browser ini. Gunakan Chrome di Android.");
  }

  try {
    // Request device - tampilkan dialog pilih printer
    const device = await navigator.bluetooth.requestDevice({
      filters: [
        { services: ["000018f0-0000-1000-8000-00805f9b34fb"] },
        { namePrefix: "RPP" },
        { namePrefix: "BT" },
        { namePrefix: "Printer" },
        { namePrefix: "PT-" },
        { namePrefix: "MPT" },
        { namePrefix: "TP" },
      ],
      optionalServices: [
        "000018f0-0000-1000-8000-00805f9b34fb",
        "0000ff00-0000-1000-8000-00805f9b34fb",
        "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
        "49535343-fe7d-4ae5-8fa9-9fafd205e455",
      ],
    });

    if (!device.gatt) throw new Error("GATT tidak tersedia.");

    // Connect GATT
    const server = await device.gatt.connect();

    // Cari service & characteristic yang bisa write
    const services = await server.getPrimaryServices();
    let writeChar: BluetoothRemoteGATTCharacteristic | null = null;

    for (const service of services) {
      const chars = await service.getCharacteristics();
      for (const char of chars) {
        if (char.properties.write || char.properties.writeWithoutResponse) {
          writeChar = char;
          break;
        }
      }
      if (writeChar) break;
    }

    if (!writeChar) {
      throw new Error("Tidak menemukan characteristic untuk write. Pastikan printer thermal Bluetooth.");
    }

    connectedPrinter = { device, server, characteristic: writeChar };

    // Listen disconnect
    device.addEventListener("gattserverdisconnected", () => {
      connectedPrinter = null;
    });

    return device.name || "Printer Connected";
  } catch (e: any) {
    if (e.name === "NotFoundError") {
      throw new Error("Tidak ada printer dipilih.");
    }
    throw new Error(e?.message || "Gagal konek ke printer.");
  }
}

/**
 * Disconnect printer
 */
export function disconnectPrinter() {
  if (connectedPrinter?.server?.connected) {
    connectedPrinter.server.disconnect();
  }
  connectedPrinter = null;
}

/**
 * Kirim raw bytes ke printer (chunk 20 bytes)
 */
async function sendBytes(data: Uint8Array) {
  if (!connectedPrinter || !connectedPrinter.server.connected) {
    throw new Error("Printer belum terkonek.");
  }

  const CHUNK_SIZE = 100;
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE);
    if (connectedPrinter.characteristic.properties.writeWithoutResponse) {
      await connectedPrinter.characteristic.writeValueWithoutResponse(chunk);
    } else {
      await connectedPrinter.characteristic.writeValueWithResponse(chunk);
    }
    // Delay kecil antar chunk supaya printer tidak overflow
    await new Promise((r) => setTimeout(r, 20));
  }
}

/**
 * Encode text ke bytes
 */
function textToBytes(text: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 128) {
      bytes.push(code);
    } else {
      // Untuk karakter non-ASCII, encode sebagai ?
      bytes.push(0x3f);
    }
  }
  return bytes;
}

function rupiah(n: number) {
  return new Intl.NumberFormat("id-ID").format(n);
}

function padRight(text: string, len: number) {
  const t = String(text ?? "").slice(0, len);
  return t + " ".repeat(Math.max(0, len - t.length));
}

function padLeft(text: string, len: number) {
  const t = String(text ?? "").slice(0, len);
  return " ".repeat(Math.max(0, len - t.length)) + t;
}

export type BluetoothReceiptData = {
  storeName: string;
  address?: string;
  footer?: string;
  title?: string;
  orderNo: string;
  dateText: string;
  tableNo?: string | null;
  cashierName?: string;
  paymentMethod?: string | null;
  subtotal: number;
  discount: number;
  total: number;
  paidAmount?: number | null;
  items: { name: string; qty: number; price: number; notes?: string }[];
  qrText?: string;
  showQR?: boolean;
  showWatermark?: boolean;
};

/**
 * Print struk via Bluetooth (ESC/POS)
 */
export async function printReceipt(data: BluetoothReceiptData) {
  const bytes: number[] = [];

  // Initialize
  bytes.push(...INIT);

  // Header - Center, Bold
  bytes.push(...ALIGN_CENTER);
  bytes.push(...BOLD_ON);
  bytes.push(...DOUBLE_WIDTH);
  bytes.push(...textToBytes(data.storeName || "RuniX"));
  bytes.push(LF);
  bytes.push(...NORMAL_SIZE);
  bytes.push(...BOLD_OFF);

  if (data.address?.trim()) {
    bytes.push(...textToBytes(data.address.trim()));
    bytes.push(LF);
  }

  bytes.push(...textToBytes(data.title || "STRUK"));
  bytes.push(LF);

  // Separator
  bytes.push(...ALIGN_LEFT);
  bytes.push(...textToBytes("--------------------------------"));
  bytes.push(LF);

  // Info
  bytes.push(...textToBytes(`Waktu : ${data.dateText}`));
  bytes.push(LF);
  bytes.push(...textToBytes(`Order : ${data.orderNo}`));
  bytes.push(LF);
  if (data.tableNo) {
    bytes.push(...textToBytes(`Meja  : ${data.tableNo}`));
    bytes.push(LF);
  }
  if (data.cashierName) {
    bytes.push(...textToBytes(`Kasir : ${data.cashierName}`));
    bytes.push(LF);
  }
  if (data.paymentMethod) {
    bytes.push(...textToBytes(`Bayar : ${data.paymentMethod}`));
    bytes.push(LF);
  }

  // Separator
  bytes.push(...textToBytes("--------------------------------"));
  bytes.push(LF);

  // Items
  for (const it of data.items || []) {
    const itemName = it.notes?.trim() ? `${it.name} (${it.notes})` : it.name;
    bytes.push(...textToBytes(itemName));
    bytes.push(LF);

    const itemTotal = (it.price || 0) * (it.qty || 0);
    const line = `${padRight(`${it.qty} x ${rupiah(it.price)}`, 20)}${padLeft(rupiah(itemTotal), 12)}`;
    bytes.push(...textToBytes(line));
    bytes.push(LF);
  }

  // Separator
  bytes.push(...textToBytes("--------------------------------"));
  bytes.push(LF);

  // Totals
  bytes.push(...textToBytes(`${padRight("Subtotal", 20)}${padLeft(rupiah(data.subtotal || 0), 12)}`));
  bytes.push(LF);

  if (data.discount > 0) {
    bytes.push(...textToBytes(`${padRight("Diskon", 20)}${padLeft(rupiah(data.discount || 0), 12)}`));
    bytes.push(LF);
  }

  bytes.push(...BOLD_ON);
  bytes.push(...textToBytes(`${padRight("TOTAL", 20)}${padLeft(rupiah(data.total || 0), 12)}`));
  bytes.push(LF);
  bytes.push(...BOLD_OFF);

  if (data.paymentMethod === "CASH" && data.paidAmount) {
    bytes.push(...textToBytes(`${padRight("Bayar", 20)}${padLeft(rupiah(data.paidAmount), 12)}`));
    bytes.push(LF);
    const change = Math.max(0, data.paidAmount - (data.total || 0));
    bytes.push(...textToBytes(`${padRight("Kembalian", 20)}${padLeft(rupiah(change), 12)}`));
    bytes.push(LF);
  }

  // Separator + Footer
  bytes.push(...textToBytes("--------------------------------"));
  bytes.push(LF);
  bytes.push(...ALIGN_CENTER);
  bytes.push(...textToBytes(data.footer || "Terima kasih."));
  bytes.push(LF);

  // QR text (printed as URL since ESC/POS QR requires specific printer support)
  if (data.showQR && data.qrText) {
    bytes.push(LF);
    bytes.push(...textToBytes("Scan / Kunjungi:"));
    bytes.push(LF);
    bytes.push(...textToBytes(data.qrText.trim()));
    bytes.push(LF);
  }

  // Watermark
  if (data.showWatermark !== false) {
    bytes.push(LF);
    bytes.push(...textToBytes("Powered by RuniX"));
    bytes.push(LF);
  }

  // Feed & Cut
  bytes.push(...FEED_LINES);
  bytes.push(...CUT_PAPER);

  // Send to printer
  await sendBytes(new Uint8Array(bytes));
}

/**
 * Print teks biasa via Bluetooth
 */
export async function printText(text: string) {
  const bytes: number[] = [];
  bytes.push(...INIT);
  bytes.push(...ALIGN_LEFT);
  bytes.push(...textToBytes(text));
  bytes.push(LF);
  bytes.push(...FEED_LINES);
  bytes.push(...CUT_PAPER);
  await sendBytes(new Uint8Array(bytes));
}

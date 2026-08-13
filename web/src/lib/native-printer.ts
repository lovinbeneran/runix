/**
 * Native Bluetooth Printer (Bluetooth Classic/SPP)
 * Sama seperti Majoo / LunaPos
 * Hanya jalan di APK (Capacitor native), bukan browser
 */

import { Capacitor, registerPlugin } from "@capacitor/core";

interface BluetoothPrinterPlugin {
  isAvailable(): Promise<{ available: boolean; enabled: boolean }>;
  listDevices(): Promise<{ devices: { name: string; address: string }[] }>;
  connect(options: { address: string }): Promise<{ connected: boolean; name: string; address: string }>;
  disconnect(): Promise<{ disconnected: boolean }>;
  isConnected(): Promise<{ connected: boolean; name: string; address: string }>;
  print(options: { text: string }): Promise<{ success: boolean }>;
  printRaw(options: { bytes: number[] }): Promise<{ success: boolean }>;
}

const BluetoothPrinter = registerPlugin<BluetoothPrinterPlugin>("BluetoothPrinter");

// ESC/POS Commands
const ESC = "\x1b";
const GS = "\x1d";
const LF = "\n";

const CMD = {
  INIT: ESC + "@",
  ALIGN_CENTER: ESC + "a" + "\x01",
  ALIGN_LEFT: ESC + "a" + "\x00",
  BOLD_ON: ESC + "E" + "\x01",
  BOLD_OFF: ESC + "E" + "\x00",
  DOUBLE_WIDTH: GS + "!" + "\x10",
  NORMAL_SIZE: GS + "!" + "\x00",
  CUT: GS + "V" + "\x00",
  FEED: ESC + "d" + "\x01",
};

/**
 * Cek apakah jalan di native (APK)
 */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Cek Bluetooth tersedia & enabled
 */
export async function isAvailable(): Promise<{ available: boolean; enabled: boolean }> {
  if (!isNative()) return { available: false, enabled: false };
  return BluetoothPrinter.isAvailable();
}

/**
 * List paired Bluetooth devices
 */
export async function listDevices(): Promise<{ name: string; address: string }[]> {
  const result = await BluetoothPrinter.listDevices();
  return result.devices || [];
}

/**
 * Konek ke printer
 */
export async function connect(address: string): Promise<{ name: string; address: string }> {
  const result = await BluetoothPrinter.connect({ address });
  // Simpan untuk auto-reconnect
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("runix_bt_address", address);
    localStorage.setItem("runix_bt_name", result.name || address);
  }
  return result;
}

/**
 * Disconnect
 */
export async function disconnect(): Promise<void> {
  await BluetoothPrinter.disconnect();
}

/**
 * Cek status koneksi
 */
export async function isConnected(): Promise<{ connected: boolean; name: string }> {
  const result = await BluetoothPrinter.isConnected();
  return { connected: result.connected, name: result.name || "" };
}

/**
 * Auto-reconnect ke printer terakhir
 */
export async function autoReconnect(): Promise<boolean> {
  if (typeof localStorage === "undefined") return false;
  const address = localStorage.getItem("runix_bt_address");
  if (!address) return false;
  try {
    await connect(address);
    return true;
  } catch {
    return false;
  }
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

export type ReceiptData = {
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
 * Print struk lengkap (ESC/POS)
 */
export async function printReceipt(data: ReceiptData): Promise<void> {
  let output = "";

  output += CMD.INIT;
  output += CMD.ALIGN_CENTER;
  output += CMD.BOLD_ON;
  output += CMD.DOUBLE_WIDTH;
  output += (data.storeName || "RuniX") + LF;
  output += CMD.NORMAL_SIZE;
  output += CMD.BOLD_OFF;

  if (data.address?.trim()) output += data.address.trim() + LF;
  output += (data.title || "STRUK") + LF;

  output += CMD.ALIGN_LEFT;
  output += "--------------------------------" + LF;
  output += "Waktu : " + data.dateText + LF;
  output += "Order : " + data.orderNo + LF;
  if (data.tableNo) output += "Meja  : " + data.tableNo + LF;
  if (data.cashierName) output += "Kasir : " + data.cashierName + LF;
  if (data.paymentMethod) output += "Bayar : " + data.paymentMethod + LF;
  output += "--------------------------------" + LF;

  for (const it of data.items || []) {
    const itemName = it.notes?.trim() ? `${it.name} (${it.notes})` : it.name;
    output += itemName + LF;
    const itemTotal = (it.price || 0) * (it.qty || 0);
    output += padRight(`${it.qty} x ${rupiah(it.price)}`, 20) + padLeft(rupiah(itemTotal), 12) + LF;
  }

  output += "--------------------------------" + LF;
  output += padRight("Subtotal", 20) + padLeft(rupiah(data.subtotal || 0), 12) + LF;
  if (data.discount > 0) {
    output += padRight("Diskon", 20) + padLeft(rupiah(data.discount), 12) + LF;
  }
  output += CMD.BOLD_ON;
  output += padRight("TOTAL", 20) + padLeft(rupiah(data.total || 0), 12) + LF;
  output += CMD.BOLD_OFF;

  if (data.paymentMethod === "CASH" && data.paidAmount) {
    output += padRight("Bayar", 20) + padLeft(rupiah(data.paidAmount), 12) + LF;
    const change = Math.max(0, data.paidAmount - (data.total || 0));
    output += padRight("Kembalian", 20) + padLeft(rupiah(change), 12) + LF;
  }

  output += "--------------------------------" + LF;
  output += CMD.ALIGN_CENTER;
  output += (data.footer || "Terima kasih.") + LF;

  if (data.showQR && data.qrText) {
    output += LF;
    output += "Scan / Kunjungi:" + LF;
    output += data.qrText.trim() + LF;
  }

  if (data.showWatermark !== false) {
    output += LF;
    output += "Powered by RuniX" + LF;
  }

  output += CMD.FEED;
  output += CMD.CUT;

  await BluetoothPrinter.print({ text: output });
}

/**
 * Print teks biasa
 */
export async function printText(text: string): Promise<void> {
  let output = CMD.INIT + CMD.ALIGN_LEFT + text + LF + CMD.FEED + CMD.CUT;
  await BluetoothPrinter.print({ text: output });
}

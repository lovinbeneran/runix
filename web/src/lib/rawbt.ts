export type RawBtReceiptItem = {
  name: string;
  qty: number;
  price: number;
};

export type RawBtReceiptData = {
  storeName: string;
  address?: string;
  footer?: string;
  orderNo: string;
  dateText: string;
  tableNo?: string | null;
  cashierEmail?: string;
  paymentMethod?: string | null;
  subtotal: number;
  discount: number;
  total: number;
  paidAmount?: number | null;
  items: RawBtReceiptItem[];
  title?: string;
  isCopy?: boolean;
  qrText?: string;
  showQR?: boolean;
  showWatermark?: boolean;
};

function rupiah(n: number) {
  return new Intl.NumberFormat("id-ID").format(n);
}

function padRight(text: string, len: number) {
  const t = String(text ?? "");
  if (t.length >= len) return t.slice(0, len);
  return t + " ".repeat(len - t.length);
}

function padLeft(text: string, len: number) {
  const t = String(text ?? "");
  if (t.length >= len) return t.slice(0, len);
  return " ".repeat(len - t.length) + t;
}

function center(text: string, width = 32) {
  const t = String(text ?? "");
  if (t.length >= width) return t.slice(0, width);
  const total = width - t.length;
  const left = Math.floor(total / 2);
  const right = total - left;
  return " ".repeat(left) + t + " ".repeat(right);
}

function line(width = 32) {
  return "-".repeat(width);
}

export function buildPlainReceipt(d: RawBtReceiptData) {
  const rows: string[] = [];
  const title = (d.title || "STRUK").trim();

  rows.push(center(d.storeName || "RuniX"));
  if ((d.address || "").trim()) rows.push(center(d.address!.trim()));
  rows.push(center(title));
  if (d.isCopy) rows.push(center("*** COPY ***"));
  rows.push(line());
  rows.push(`Waktu : ${d.dateText}`);
  rows.push(`Order : ${d.orderNo}`);
  if (d.tableNo) rows.push(`Meja  : ${d.tableNo}`);
  if (d.cashierEmail) rows.push(`Kasir : ${d.cashierEmail}`);
  if (d.paymentMethod) rows.push(`Bayar : ${d.paymentMethod}`);
  rows.push(line());

  for (const it of d.items || []) {
    const itemTotal = Number(it.price || 0) * Number(it.qty || 0);
    rows.push(it.name);
    rows.push(
      `${padRight(`${it.qty} x ${rupiah(it.price)}`, 20)}${padLeft(rupiah(itemTotal), 12)}`
    );
  }

  rows.push(line());
  rows.push(`${padRight("Subtotal", 20)}${padLeft(rupiah(d.subtotal || 0), 12)}`);
  rows.push(`${padRight("Diskon", 20)}${padLeft(rupiah(d.discount || 0), 12)}`);
  rows.push(`${padRight("TOTAL", 20)}${padLeft(rupiah(d.total || 0), 12)}`);

  if (d.paymentMethod === "CASH") {
    rows.push(`${padRight("Bayar", 20)}${padLeft(rupiah(Number(d.paidAmount || 0)), 12)}`);
    rows.push(
      `${padRight("Kembalian", 20)}${padLeft(rupiah(Math.max(0, Number(d.paidAmount || 0) - Number(d.total || 0))), 12)}`
    );
  }

  rows.push(line());
  rows.push(center(d.footer || "Terima kasih."));

  if (d.showQR && d.qrText) {
    rows.push("");
    rows.push(center("Scan / Kunjungi:"));
    // Split long URLs across lines if needed
    const qr = d.qrText.trim();
    if (qr.length <= 32) {
      rows.push(center(qr));
    } else {
      rows.push(qr);
    }
  }

  if (d.showWatermark !== false) {
    rows.push("");
    rows.push(center("Powered by RuniX"));
  }

  rows.push("");

  return rows.join("\n");
}

function utf8ToBase64(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function sendToRawBT(text: string) {
  const base64 = utf8ToBase64(text);
  const rawbtUrl = `rawbt:base64,${base64}`;

  const intentUrl =
    `intent:${encodeURI(rawbtUrl)}` +
    `#Intent;component=ru.a402d.rawbtprinter.activity.PrintDownloadActivity;` +
    `package=ru.a402d.rawbtprinter;end;`;

  // coba intent spesifik RawBT dulu
  window.location.href = intentUrl;
}

export function getPrintMode(): "browser" | "rawbt" | "bluetooth" {
  if (typeof window === "undefined") return "rawbt";
  const mode = localStorage.getItem("runix_print_mode");
  if (mode === "rawbt") return "rawbt";
  if (mode === "bluetooth") return "bluetooth";
  return "rawbt";
}

export function setPrintMode(mode: "browser" | "rawbt" | "bluetooth") {
  if (typeof window === "undefined") return;
  localStorage.setItem("runix_print_mode", mode);
}
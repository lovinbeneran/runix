/**
 * ============================================================
 * RuniX - QR Batch PDF Generator
 * ============================================================
 * Generates a printable PDF with QR codes for all tables.
 * Uses canvas-based rendering (no external PDF library needed).
 * Opens print dialog for the user to print/save as PDF.
 * ============================================================
 */

import { generateTableQrUrl } from "./tables";

export type QRPdfItem = {
  tableNumber: string;
  tableName?: string;
};

/**
 * Generate and open a printable HTML page with all QR codes
 * User can then Ctrl+P / Print to save as PDF
 */
export function printQRBatchHTML(
  items: QRPdfItem[],
  tenantId: string,
  origin: string,
  storeName: string
): void {
  const qrSize = 180;
  const cols = 2; // 2 QR per row for A4

  let tableRows = "";
  for (let i = 0; i < items.length; i += cols) {
    let cells = "";
    for (let j = 0; j < cols; j++) {
      const item = items[i + j];
      if (!item) {
        cells += `<td></td>`;
        continue;
      }
      const url = generateTableQrUrl(origin, tenantId, item.tableNumber);
      cells += `
        <td style="text-align:center; padding:24px 16px; vertical-align:top;">
          <div style="border:2px solid #333; border-radius:16px; padding:20px; display:inline-block;">
            <div style="font-size:11px; color:#888; margin-bottom:8px;">${storeName}</div>
            <div id="qr-${i + j}" data-url="${url}" style="width:${qrSize}px; height:${qrSize}px; margin:0 auto;"></div>
            <div style="margin-top:12px; font-size:22px; font-weight:900;">Meja ${item.tableNumber}</div>
            ${item.tableName ? `<div style="font-size:12px; color:#666; margin-top:4px;">${item.tableName}</div>` : ""}
            <div style="margin-top:8px; font-size:10px; color:#999; word-break:break-all; max-width:${qrSize}px;">${url}</div>
            <div style="margin-top:10px; font-size:11px; color:#555; font-weight:600;">Scan untuk pesan</div>
          </div>
        </td>
      `;
    }
    tableRows += `<tr>${cells}</tr>`;
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>QR Meja - ${storeName}</title>
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"><\/script>
  <style>
    @media print {
      body { margin: 0; }
      .no-print { display: none !important; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0; padding: 20px;
      color: #1a1a1a;
    }
    .header {
      text-align: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 2px solid #eee;
    }
    .header h1 { margin: 0; font-size: 24px; }
    .header p { margin: 4px 0 0; color: #666; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; }
    .print-btn {
      position: fixed; bottom: 20px; right: 20px;
      padding: 14px 28px; background: #d59567; color: white;
      border: none; border-radius: 12px; font-size: 16px;
      font-weight: 800; cursor: pointer; box-shadow: 0 4px 20px rgba(0,0,0,0.2);
      z-index: 100;
    }
    .print-btn:hover { background: #b87a4f; }
  </style>
</head>
<body>
  <div class="header no-print">
    <h1>QR Meja — ${storeName}</h1>
    <p>${items.length} meja • Klik tombol Print atau Ctrl+P untuk mencetak/simpan PDF</p>
  </div>
  <table>${tableRows}</table>
  <button class="print-btn no-print" onclick="window.print()">🖨️ Print / Save PDF</button>
  <script>
    document.querySelectorAll('[id^="qr-"]').forEach(el => {
      const url = el.getAttribute('data-url');
      QRCode.toCanvas(document.createElement('canvas'), url, { width: ${qrSize}, margin: 1 }, (err, canvas) => {
        if (!err && canvas) {
          canvas.style.width = '${qrSize}px';
          canvas.style.height = '${qrSize}px';
          el.appendChild(canvas);
        }
      });
    });
  <\/script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
}

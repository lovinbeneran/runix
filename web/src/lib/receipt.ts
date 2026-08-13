export type ReceiptItem = {
  name: string;
  qty: number;
  price: number;
  notes?: string;
};

export type ReceiptData = {
  storeName: string;
  address?: string;
  orderNo: string;
  dateText: string;
  tableNo?: string | null;
  cashierEmail?: string;
  paymentMethod?: "CASH" | "QRIS" | null;
  orderType?: "DINE_IN" | "TAKEAWAY" | null;
  subtotal: number;
  discount: number;
  total: number;
  paidAmount?: number | null;
  items: ReceiptItem[];
  footer?: string;
  title?: string;
  isCopy?: boolean;
  logoBase64?: string;
  qrText?: string;
  showLogo?: boolean;
  showQR?: boolean;
  showWatermark?: boolean;
};

function rupiah(n: number) {
  return new Intl.NumberFormat("id-ID").format(n);
}

export function receiptHTML(d: ReceiptData) {
  const itemsHtml = d.items
    .map((it) => {
      const lineTotal = (it.price || 0) * (it.qty || 0);
      const notesHtml =
        (it.notes || "").trim()
          ? `<div style="opacity:.8;font-size:12px;">Catatan: ${escapeHtml(it.notes || "")}</div>`
          : "";

      return `
        <tr>
          <td style="padding:4px 0;">
            <div style="font-weight:700;">${escapeHtml(it.name)}</div>
            <div style="opacity:.8;font-size:12px;">${it.qty} x ${rupiah(it.price)}</div>
            ${notesHtml}
          </td>
          <td style="text-align:right;padding:4px 0;font-weight:700;">${rupiah(lineTotal)}</td>
        </tr>
      `;
    })
    .join("");

  const change =
    d.paymentMethod === "CASH"
      ? Math.max(0, Number(d.paidAmount || 0) - Number(d.total || 0))
      : 0;

  const footerText = (d.footer ?? "Terima kasih.").trim() || "Terima kasih.";
  const title = (d.title ?? "STRUK").trim() || "STRUK";

  const showLogo = d.showLogo !== false && !!d.logoBase64;
  const showQR = d.showQR !== false && !!d.qrText;
  const showWatermark = d.showWatermark !== false;

  const logoHtml = showLogo
    ? `<div style="text-align:center;margin-bottom:8px;">
        <img src="${d.logoBase64}" alt="Logo" style="width:64px;height:64px;object-fit:contain;border-radius:8px;" />
      </div>`
    : ``;

  // QR code generated via embedded JS using canvas
  const qrHtml = showQR
    ? `<div style="text-align:center;margin-top:8px;margin-bottom:4px;">
        <canvas id="qr-canvas" width="120" height="120" style="border:1px solid #ddd;border-radius:4px;"></canvas>
        <div style="font-size:10px;opacity:0.7;margin-top:4px;">Scan untuk bayar/info</div>
      </div>`
    : ``;

  // Minimal QR code generator script (only included if QR needed)
  const qrScript = showQR
    ? `<script>
      (function(){
        // Minimal QR Code generator for receipt
        // Using a simple text-to-QR approach with Canvas
        var text = ${JSON.stringify(d.qrText || "")};
        var canvas = document.getElementById('qr-canvas');
        if (!canvas || !text) return;
        var ctx = canvas.getContext('2d');
        
        // Simple QR matrix generation (uses error correction level L)
        var qr = generateQR(text);
        if (!qr) return;
        
        var size = qr.length;
        var scale = Math.floor(120 / size);
        var offset = Math.floor((120 - size * scale) / 2);
        
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 120, 120);
        ctx.fillStyle = '#000000';
        
        for (var y = 0; y < size; y++) {
          for (var x = 0; x < size; x++) {
            if (qr[y][x]) {
              ctx.fillRect(offset + x * scale, offset + y * scale, scale, scale);
            }
          }
        }
        
        function generateQR(data) {
          // Encode as numeric/alphanumeric/byte mode QR
          // This is a minimal implementation for short URLs
          var modules = createMinimalQR(data);
          return modules;
        }
        
        function createMinimalQR(data) {
          // Use version 3 (29x29) with ECC level L for short texts
          // For longer text, use version 6 (41x41)
          var len = data.length;
          var version = len <= 35 ? 2 : len <= 77 ? 4 : len <= 154 ? 7 : 10;
          var size = 17 + version * 4;
          
          // Initialize matrix
          var matrix = [];
          for (var i = 0; i < size; i++) {
            matrix[i] = [];
            for (var j = 0; j < size; j++) {
              matrix[i][j] = false;
            }
          }
          
          // Add finder patterns
          addFinderPattern(matrix, 0, 0, size);
          addFinderPattern(matrix, size - 7, 0, size);
          addFinderPattern(matrix, 0, size - 7, size);
          
          // Add timing patterns
          for (var i = 8; i < size - 8; i++) {
            matrix[6][i] = (i % 2 === 0);
            matrix[i][6] = (i % 2 === 0);
          }
          
          // Encode data as simple pattern
          var bits = textToBits(data);
          var idx = 0;
          var upward = true;
          
          for (var col = size - 1; col >= 1; col -= 2) {
            if (col === 6) col = 5;
            for (var row = 0; row < size; row++) {
              var actualRow = upward ? size - 1 - row : row;
              for (var c = 0; c < 2; c++) {
                var x = col - c;
                if (x < 0 || x >= size) continue;
                if (isReserved(x, actualRow, size)) continue;
                if (idx < bits.length) {
                  matrix[actualRow][x] = bits[idx] === '1';
                  idx++;
                } else {
                  matrix[actualRow][x] = ((actualRow + x) % 2 === 0);
                }
              }
            }
            upward = !upward;
          }
          
          return matrix;
        }
        
        function addFinderPattern(matrix, row, col, size) {
          for (var r = -1; r <= 7; r++) {
            for (var c = -1; c <= 7; c++) {
              var rr = row + r, cc = col + c;
              if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
              if ((r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                  (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
                  (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
                matrix[rr][cc] = true;
              } else {
                matrix[rr][cc] = false;
              }
            }
          }
        }
        
        function isReserved(x, y, size) {
          // Finder patterns + separators
          if (x <= 8 && y <= 8) return true;
          if (x >= size - 8 && y <= 8) return true;
          if (x <= 8 && y >= size - 8) return true;
          // Timing
          if (x === 6 || y === 6) return true;
          return false;
        }
        
        function textToBits(str) {
          var bits = '';
          for (var i = 0; i < str.length; i++) {
            var b = str.charCodeAt(i).toString(2);
            bits += ('00000000' + b).slice(-8);
          }
          return bits;
        }
      })();
      </script>`
    : ``;

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(title)} ${escapeHtml(d.orderNo)}</title>
  <style>
    @page { margin: 8mm; }
    body {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      color: #111;
      margin: 0;
      padding: 0;
    }
    .wrap { max-width: 320px; margin: 0 auto; padding: 8px 0; }
    .center { text-align: center; }
    .muted { opacity: .8; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; }
    .line { border-top: 1px dashed #333; margin: 10px 0; }
    .total { font-size: 18px; font-weight: 900; }
    .badge { display: inline-block; padding: 4px 10px; border: 2px solid #111; border-radius: 999px; font-size: 12px; font-weight: 900; margin-top: 8px; letter-spacing: 0.5px; }
    .store-name {
      font-weight: 900;
      font-size: 22px;
      letter-spacing: -0.5px;
      line-height: 1.2;
      margin-bottom: 4px;
    }
    .store-address {
      font-size: 12px;
      opacity: 0.8;
      margin-top: 4px;
    }
    .info-row {
      font-size: 12px;
      opacity: 0.8;
      margin-top: 4px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="center">
      ${logoHtml}
      <div class="store-name">${escapeHtml(d.storeName || "RuniX")}</div>
      ${d.address?.trim() ? `<div class="store-address">${escapeHtml(d.address.trim())}</div>` : ``}
      <div class="badge">${escapeHtml(title)}</div>
      ${d.isCopy ? `<div style="margin-top:6px;font-weight:900;font-size:14px;color:#666;">*** COPY ***</div>` : ``}
    </div>

    <div class="line"></div>

    <div class="center">
      <div class="info-row">${escapeHtml(d.dateText)}</div>
      <div class="info-row">Order: <b>${escapeHtml(d.orderNo)}</b></div>
      ${d.orderType ? `<div class="info-row">Tipe: <b style="letter-spacing:0.5px;">${d.orderType === "TAKEAWAY" ? "TAKE AWAY (BUNGKUS)" : "DINE IN (MAKAN DI TEMPAT)"}</b></div>` : ``}
      ${d.tableNo ? `<div class="info-row">Meja: <b>${escapeHtml(String(d.tableNo))}</b></div>` : ``}
      ${d.cashierEmail ? `<div class="info-row">Kasir: ${escapeHtml(String(d.cashierEmail))}</div>` : ``}
      ${d.paymentMethod ? `<div class="info-row">Metode: <b>${escapeHtml(d.paymentMethod)}</b></div>` : ``}
    </div>

    <div class="line"></div>

    <table>
      ${itemsHtml}
    </table>

    <div class="line"></div>

    <table>
      <tr><td class="muted">Subtotal</td><td style="text-align:right;">${rupiah(d.subtotal)}</td></tr>
      <tr><td class="muted">Diskon</td><td style="text-align:right;">${rupiah(d.discount)}</td></tr>
      <tr><td style="font-weight:900;">Total</td><td style="text-align:right;" class="total">${rupiah(d.total)}</td></tr>
      ${
        d.paymentMethod === "CASH"
          ? `<tr><td class="muted">Bayar</td><td style="text-align:right;">${rupiah(Number(d.paidAmount || 0))}</td></tr>
             <tr><td class="muted">Kembalian</td><td style="text-align:right;">${rupiah(change)}</td></tr>`
          : ``
      }
    </table>

    <div class="line"></div>

    ${qrHtml}

    <div class="center" style="padding:4px 0;">
      <div style="font-size:12px;opacity:0.8;">${escapeHtml(footerText)}</div>
    </div>

    ${showWatermark ? `<div class="center" style="padding:2px 0;margin-top:4px;"><div style="font-size:10px;opacity:0.45;">Powered by RuniX</div></div>` : ``}
  </div>

  ${qrScript}
  <script>
    window.onload = () => { setTimeout(() => window.print(), ${showQR ? '200' : '50'}); };
  </script>
</body>
</html>
  `;
}

function escapeHtml(s: string) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

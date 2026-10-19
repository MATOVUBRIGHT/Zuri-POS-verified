import { SaleItem, Product, Store as StoreType } from "@/types";

interface ReceiptTemplateParams {
  sale: SaleItem;
  storeInfo: StoreType | null;
  currentStaff: { id: string | null; name: string };
  getReceiptNumber: (sale: SaleItem) => string;
}

export function generateReceiptHTML({
  sale,
  storeInfo,
  currentStaff,
  getReceiptNumber
}: ReceiptTemplateParams): string {
  const savedPayment = sale.paymentDetails;
  const paymentMethod = sale.paidInCash ? (savedPayment?.paymentMethod || "Cash") : "CREDIT";
  const amountPaid = sale.paidInCash ? Number(savedPayment?.amountReceived ?? sale.totalAmount) : 0;
  const changeAmount = Math.max(0, amountPaid - sale.totalAmount);
  const receiptTotal = sale.totalAmount;
  const totalItems = sale.products.reduce((s, p) => s + p.quantity, 0);

  const originalDate = sale.created_at || sale.dateOfSale;
  const dateObj = new Date(originalDate);
  const dateStr = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'numeric', year: 'numeric' });
  const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

  const receiptNo = getReceiptNumber(sale);
  // Generate a verification code from the receipt number + total
  const verificationCode = `${receiptNo.replace(/\D/g,'').slice(-4)}${Math.floor(sale.totalAmount)}`.padEnd(20,'0').slice(0,20);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Receipt #${receiptNo}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Libre+Barcode+39+Text&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      color: #000;
      background: #fff;
      width: 76mm;
      margin: 0 auto;
      padding: 4mm 3mm;
    }
    .center { text-align: center; }
    .right  { text-align: right; }
    .left   { text-align: left; }
    .bold   { font-weight: bold; }
    .large  { font-size: 14px; font-weight: bold; }
    .xlarge { font-size: 16px; font-weight: bold; }
    .small  { font-size: 9px; }
    .dashed { border-top: 1px dashed #000; margin: 4px 0; }
    .solid  { border-top: 1px solid #000; margin: 4px 0; }
    .double { border-top: 3px double #000; margin: 4px 0; }
    /* barcode font */
    .barcode-font {
      font-family: 'Libre Barcode 39 Text', 'Libre Barcode 39', cursive;
      font-size: 36px;
      letter-spacing: 2px;
      line-height: 1;
    }
    /* items table */
    table { width: 100%; border-collapse: collapse; }
    .items-head th {
      font-size: 10px;
      font-weight: bold;
      border-top: 1px solid #000;
      border-bottom: 1px solid #000;
      padding: 2px 0;
    }
    .items-head th.r { text-align: right; }
    .item-row td { font-size: 10px; padding: 1px 0; vertical-align: top; }
    .item-row td.r { text-align: right; }
    .totals-row { display: flex; justify-content: space-between; padding: 1px 0; }
    .vat-table th, .vat-table td { font-size: 10px; padding: 1px 3px; text-align: right; }
    .vat-table th:first-child, .vat-table td:first-child { text-align: left; }
    .qr-placeholder {
      width: 64px; height: 64px;
      border: 1px solid #000;
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 8px; color: #555;
    }
    @media print {
      body { width: 76mm; margin: 0; padding: 2mm; }
      @page { size: 80mm auto; margin: 0; }
    }
  </style>
</head>
<body>

  <!-- BUSINESS HEADER -->
  <div class="center">
    <div class="xlarge">${storeInfo?.store_name || 'Zuri POS'}</div>
    ${storeInfo?.address ? `<div>${storeInfo.address}</div>` : ''}
    ${storeInfo?.tin_number ? `<div>Tin : ${storeInfo.tin_number} VAT: ${(storeInfo as any)?.vat_number || storeInfo.tin_number}</div>` : ''}
    ${storeInfo?.phone ? `<div>Tel: ${storeInfo.phone}</div>` : ''}
  </div>

  <!-- BARCODE OF RECEIPT NUMBER -->
  <div class="center" style="margin:4px 0 2px;">
    <div class="barcode-font">*${receiptNo}*</div>
  </div>

  <div class="dashed"></div>

  <!-- RECEIPT META -->
  <div class="totals-row"><span>Receipt No</span><span class="bold">${receiptNo}</span></div>
  <div class="totals-row"><span></span><span class="bold">TAX INVOICE / CASH SALE</span></div>
  <div class="totals-row"><span>Date</span><span>${dateStr}</span></div>

  <div class="dashed"></div>

  <!-- ITEMS TABLE -->
  <table>
    <thead class="items-head">
      <tr>
        <th class="left" style="width:40%">ITEM</th>
        <th class="r" style="width:10%">QTY</th>
        <th class="r" style="width:12%">PACK</th>
        <th class="r" style="width:18%">PRICE</th>
        <th class="r" style="width:20%">AMOUNT</th>
      </tr>
    </thead>
    <tbody>
      ${sale.products.map((p: Product) => {
        const unitPrice = p.sellingPrice;
        const lineTotal = p.quantity * unitPrice;
        return `<tr class="item-row">
          <td>${p.productName}</td>
          <td class="r">${p.quantity}</td>
          <td class="r">PACK</td>
          <td class="r">${unitPrice.toLocaleString()}</td>
          <td class="r">${lineTotal.toLocaleString()}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>

  <div class="dashed"></div>

  <!-- TOTALS -->
  <div class="totals-row"><span>Total items :</span><span>${totalItems}</span></div>
  <div class="dashed"></div>
  <div class="totals-row bold"><span>Total</span><span>${receiptTotal.toLocaleString()}</span></div>
  <div class="totals-row"><span>${paymentMethod}</span><span>${amountPaid.toLocaleString()}</span></div>
  <div class="totals-row"><span>Change</span><span>${changeAmount.toLocaleString()}</span></div>

  <div class="dashed"></div>

  <!-- VAT SECTION -->
  <table class="vat-table" style="width:100%">
    <thead>
      <tr>
        <th>VAT Rate</th>
        <th>Amt W/o VAT</th>
        <th>VAT Amt</th>
        <th>Net Amt</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>EXEMPT</td>
        <td>${receiptTotal.toLocaleString()}</td>
        <td>0.00</td>
        <td>${receiptTotal.toLocaleString()}</td>
      </tr>
    </tbody>
  </table>

  <div class="dashed"></div>

  <!-- NOTES -->
  <div class="small center" style="margin:4px 0;">
    <div>Note: GOODS ONCE SOLD ARE NOT</div>
    <div>RETURNABLE GOODS SOLD IN CONDITION AND</div>
    <div>CHECKED</div>
    <div style="margin-top:2px;">Prices Inclusive of Vat Where Applicable</div>
  </div>

  <div class="dashed"></div>

  <!-- VERIFICATION CODE -->
  <div class="totals-row small">
    <span>Verification Code :</span>
    <span>${verificationCode}</span>
  </div>

  <!-- QR + SERVED BY -->
  <div style="display:flex; align-items:center; gap:8px; margin:6px 0;">
    <div class="qr-placeholder">QR</div>
    <div>
      <div>You Were Served By &nbsp; <span class="bold">${currentStaff.name}</span></div>
      <div class="small" style="margin-top:4px;">Thank You !! Please come again.</div>
    </div>
  </div>

  <div class="dashed"></div>

  <!-- RECEIPT TIME -->
  <div class="center small">Receipt Time :- ${dateStr} ${timeStr}</div>

  <script>window.onload=function(){window.print();window.onafterprint=function(){window.close();};};</script>
</body>
</html>`;
}

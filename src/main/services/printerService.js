/**
 * Thermal Printer Service - ESC/POS USB
 * Saudi Cafe POS — PKR Currency
 * Supports: Epson TM-T88, Star TSP, SNBC, Xprinter, etc.
 */

let escpos, USBAdapter;
try {
  escpos = require('escpos');
  USBAdapter = require('escpos-usb');
  escpos.USB = USBAdapter;
} catch (e) {
  console.warn('ESC/POS libraries not loaded, printer will be simulated:', e.message);
}

const fmtPKR = (v) => `Rs. ${Number(v || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function listUSBDevices() {
  try {
    if (!USBAdapter) return { success: false, devices: [], message: 'USB module not loaded' };
    const devices = USBAdapter.findPrinter();
    return {
      success: true,
      devices: devices.map(d => ({
        vendorId: d.deviceDescriptor.idVendor,
        productId: d.deviceDescriptor.idProduct,
        name: `USB Printer (VID:${d.deviceDescriptor.idVendor.toString(16)} PID:${d.deviceDescriptor.idProduct.toString(16)})`,
      }))
    };
  } catch (e) {
    return { success: false, devices: [], message: e.message };
  }
}

async function printReceipt(receiptData) {
  if (!escpos || !USBAdapter) {
    // Simulate print — log receipt to console
    console.log('\n' + formatReceiptText(receiptData) + '\n');
    return { success: true, simulated: true };
  }

  return new Promise((resolve) => {
    try {
      const devices = USBAdapter.findPrinter();
      if (!devices.length) {
        return resolve({ success: false, message: 'No USB thermal printer found. Connect printer and try again.' });
      }

      const device = new escpos.USB(devices[0]);
      const printer = new escpos.Printer(device, { encoding: 'UTF-8' });

      device.open((err) => {
        if (err) return resolve({ success: false, message: `Printer open failed: ${err.message}` });

        const { cafe, invoice, items, subtotal, discount, discountAmount, taxRate, taxAmount, total, paymentMethod, paymentDetails, date } = receiptData;

        printer
          .font('a')
          .align('ct')
          .style('bu')
          .size(1, 1)
          .text(cafe?.name || 'SAUDI CAFE')
          .style('normal')
          .size(0, 0)
          .text(cafe?.address || '')
          .text(cafe?.phone || '')
          .text('================================')
          .align('lt')
          .text(`Invoice : ${invoice}`)
          .text(`Date    : ${date}`)
          .text(`Cashier : ${receiptData.staffName || 'Staff'}`)
          .text(`Payment : ${paymentMethod.toUpperCase()}`)
          .text('================================');

        items.forEach(item => {
          printer.text(item.product_name);
          printer.tableCustom([
            { text: `  ${item.quantity} x ${fmtPKR(item.price)}`, align: 'LEFT', width: 0.6 },
            { text: fmtPKR(item.subtotal), align: 'RIGHT', width: 0.4 },
          ]);
        });

        printer.text('--------------------------------');

        printer.tableCustom([
          { text: 'Subtotal:', align: 'LEFT', width: 0.6 },
          { text: fmtPKR(subtotal), align: 'RIGHT', width: 0.4 },
        ]);

        if (discountAmount > 0) {
          printer.tableCustom([
            { text: `Discount:`, align: 'LEFT', width: 0.6 },
            { text: `-${fmtPKR(discountAmount)}`, align: 'RIGHT', width: 0.4 },
          ]);
        }

        if (taxAmount > 0) {
          printer.tableCustom([
            { text: `Tax (${taxRate}%):`, align: 'LEFT', width: 0.6 },
            { text: fmtPKR(taxAmount), align: 'RIGHT', width: 0.4 },
          ]);
        }

        printer
          .text('================================')
          .style('bu')
          .tableCustom([
            { text: 'TOTAL:', align: 'LEFT', width: 0.6 },
            { text: fmtPKR(total), align: 'RIGHT', width: 0.4 },
          ])
          .style('normal');

        if (paymentMethod === 'cash' && receiptData.cashGiven) {
          const change = receiptData.cashGiven - total;
          printer.tableCustom([{ text: 'Cash Given:', align: 'LEFT', width: 0.6 }, { text: fmtPKR(receiptData.cashGiven), align: 'RIGHT', width: 0.4 }]);
          printer.tableCustom([{ text: 'Change:', align: 'LEFT', width: 0.6 }, { text: fmtPKR(change), align: 'RIGHT', width: 0.4 }]);
        }

        printer
          .text('================================')
          .align('ct')
          .text(cafe?.receipt_footer || 'Thank you for visiting Saudi Cafe!')
          .text(' ')
          .cut()
          .close(() => resolve({ success: true }));
      });
    } catch (e) {
      resolve({ success: false, message: e.message });
    }
  });
}

function formatReceiptText(data) {
  const { cafe, invoice, items, subtotal, discountAmount, taxRate, taxAmount, total, paymentMethod, date } = data;
  const line = '='.repeat(32);
  const lines = [
    line,
    (cafe?.name || 'SAUDI CAFE').padStart(24),
    (cafe?.address || '').padStart(24),
    line,
    `Invoice : ${invoice}`,
    `Date    : ${date}`,
    `Payment : ${paymentMethod?.toUpperCase()}`,
    '-'.repeat(32),
    ...items.map(i => `${i.product_name}\n  ${i.quantity} x ${fmtPKR(i.price)}  ${fmtPKR(i.subtotal).padStart(12)}`),
    '-'.repeat(32),
    `${'Subtotal:'.padEnd(20)}${fmtPKR(subtotal).padStart(12)}`,
    discountAmount > 0 ? `${'Discount:'.padEnd(20)}${('-' + fmtPKR(discountAmount)).padStart(12)}` : '',
    taxAmount > 0 ? `${'Tax:'.padEnd(20)}${fmtPKR(taxAmount).padStart(12)}` : '',
    line,
    `${'TOTAL:'.padEnd(20)}${fmtPKR(total).padStart(12)}`,
    line,
    cafe?.receipt_footer || 'Thank you for visiting Saudi Cafe!',
    line,
  ].filter(Boolean);
  return lines.join('\n');
}

async function testPrint() {
  return printReceipt({
    cafe: { name: 'SAUDI CAFE', address: 'Main Boulevard, Lahore', phone: '+92 300 0000000', receipt_footer: 'Test print successful!' },
    invoice: 'TEST-001',
    items: [{ product_name: 'Cappuccino', quantity: 2, price: 450, subtotal: 900 }],
    subtotal: 900, discount: 0, discountAmount: 0, taxRate: 0, taxAmount: 0, total: 900,
    paymentMethod: 'cash', cashGiven: 1000, date: new Date().toLocaleString('en-PK'),
    staffName: 'Admin',
  });
}

module.exports = { listUSBDevices, printReceipt, testPrint };

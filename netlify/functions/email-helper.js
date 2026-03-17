const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");

const ADMIN_EMAIL = "process@kongconcentrates.com";
const FROM = "Kong Concentrates <process@kongconcentrates.com>";

function getTransport() {
  return nodemailer.createTransport({
    host: "smtp-relay.brevo.com",
    port: 587,
    secure: false,
    auth: {
      user: "a53daf001@smtp-brevo.com",
      pass: process.env.BREVO_SMTP_KEY,
    },
  });
}

async function sendEmail({ to, subject, html, text, attachments }) {
  if (!process.env.BREVO_SMTP_KEY) {
    throw new Error("BREVO_SMTP_KEY environment variable is not set");
  }
  const transport = getTransport();
  await transport.sendMail({ from: FROM, to, subject, html, text, attachments });
}

// ── PDF Invoice generation ────────────────────────────────────────
function generateInvoicePDF({ order, items, dispensary }) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 50, size: "LETTER" });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const shortId = order.id.slice(-8).toUpperCase();
    const date = new Date(order.created_at).toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    });

    // ── Header
    doc.fontSize(22).font("Helvetica-Bold").fillColor("#111")
      .text("KONG CONCENTRATES LLC", 50, 50);
    doc.fontSize(9).font("Helvetica").fillColor("#888")
      .text("29141 S 647 Pl · Grove, OK 74344", 50, 76)
      .text("process@kongconcentrates.com · PAAA-NYSE-PYO4", 50, 88);

    doc.fontSize(18).font("Helvetica-Bold").fillColor("#444")
      .text("WHOLESALE INVOICE", 0, 50, { align: "right", width: 545 });
    doc.fontSize(9).font("Helvetica").fillColor("#666")
      .text(`Invoice #${shortId}`, 0, 76, { align: "right", width: 545 })
      .text(`Date: ${date}`, 0, 88, { align: "right", width: 545 });

    // ── Divider
    doc.moveTo(50, 110).lineTo(562, 110).lineWidth(1.5).strokeColor("#222").stroke();

    // ── Bill To
    doc.fontSize(8).font("Helvetica").fillColor("#aaa").text("BILL TO", 50, 126);
    doc.fontSize(15).font("Helvetica-Bold").fillColor("#111").text(dispensary.name, 50, 140);
    doc.fontSize(10).font("Helvetica").fillColor("#555");
    let billY = 160;
    if (dispensary.address) { doc.text(dispensary.address, 50, billY); billY += 14; }
    if (dispensary.phone)   { doc.text(dispensary.phone,   50, billY); billY += 14; }
    if (dispensary.email)   { doc.text(dispensary.email,   50, billY); }

    // ── Items table header
    const tTop = 230;
    doc.fontSize(8).font("Helvetica").fillColor("#999")
      .text("PRODUCT",    50,  tTop)
      .text("QTY",       370,  tTop, { width: 50, align: "right" })
      .text("UNIT PRICE", 430, tTop, { width: 65, align: "right" })
      .text("SUBTOTAL",   500, tTop, { width: 62, align: "right" });
    doc.moveTo(50, tTop + 13).lineTo(562, tTop + 13).lineWidth(0.5).strokeColor("#ccc").stroke();

    // ── Item rows
    let y = tTop + 22;
    items.forEach((it) => {
      doc.fontSize(11).font("Helvetica").fillColor("#222")
        .text(it.product_name, 50, y, { width: 300 });
      doc.text(String(it.quantity),                    370, y, { width: 50,  align: "right" });
      doc.text("$" + Number(it.unit_price).toFixed(2), 430, y, { width: 65,  align: "right" });
      doc.text("$" + Number(it.subtotal).toFixed(2),   500, y, { width: 62,  align: "right" });
      doc.moveTo(50, y + 17).lineTo(562, y + 17).lineWidth(0.3).strokeColor("#eee").stroke();
      y += 26;
    });

    // ── Total
    y += 8;
    doc.moveTo(380, y).lineTo(562, y).lineWidth(1).strokeColor("#222").stroke();
    y += 10;
    doc.fontSize(9).font("Helvetica").fillColor("#777").text("TOTAL", 380, y, { width: 110 });
    doc.fontSize(20).font("Helvetica-Bold").fillColor("#111")
      .text("$" + Number(order.total).toFixed(2), 430, y - 4, { width: 132, align: "right" });

    // ── Notes
    if (order.notes) {
      y += 46;
      doc.fontSize(9).font("Helvetica").fillColor("#888")
        .text("Notes: " + order.notes, 50, y, { width: 460 });
    }

    // ── Footer
    doc.fontSize(8).font("Helvetica").fillColor("#bbb")
      .text("Thank you for your partnership · Kong Concentrates LLC", 50, 720, {
        align: "center", width: 512,
      });

    doc.end();
  });
}

// ── Order placed confirmation (to dispensary + admin) ─────────────
async function sendOrderConfirmation({ order, items, dispensary }) {
  const shortId = order.id.slice(-8).toUpperCase();
  const date = new Date(order.created_at).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  const pdfBuffer = await generateInvoicePDF({ order, items, dispensary });
  const attachment = {
    filename: `Kong-Invoice-${shortId}.pdf`,
    content: pdfBuffer,
    contentType: "application/pdf",
  };

  const itemsTableRows = items.map((it) => `
    <tr>
      <td style="padding:8px 12px 8px 0;border-bottom:1px solid #eee;font-family:sans-serif;font-size:14px;">${it.product_name}</td>
      <td style="padding:8px 12px 8px 0;border-bottom:1px solid #eee;font-family:sans-serif;font-size:14px;text-align:center;">${it.quantity}</td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;font-family:sans-serif;font-size:14px;text-align:right;">$${Number(it.unit_price).toFixed(2)}</td>
      <td style="padding:8px 0 8px 12px;border-bottom:1px solid #eee;font-family:sans-serif;font-size:14px;text-align:right;">$${Number(it.subtotal).toFixed(2)}</td>
    </tr>`).join("");

  const itemsText = items.map((it) =>
    `  ${it.product_name} × ${it.quantity}  —  $${Number(it.subtotal).toFixed(2)}`
  ).join("\n");

  // To dispensary
  await sendEmail({
    to: dispensary.email,
    subject: `Order Received #${shortId} — Kong Concentrates`,
    attachments: [attachment],
    html: `
      <h2 style="font-family:sans-serif;">Order Received</h2>
      <p style="font-family:sans-serif;">Hi ${dispensary.contact_name || dispensary.name},</p>
      <p style="font-family:sans-serif;">We've received your order <strong>#${shortId}</strong> on ${date}. Your invoice is attached.</p>
      <table style="border-collapse:collapse;width:100%;max-width:480px;">
        <thead>
          <tr>
            <th style="font-family:sans-serif;font-size:11px;color:#888;text-align:left;padding:0 12px 8px 0;border-bottom:2px solid #222;">Product</th>
            <th style="font-family:sans-serif;font-size:11px;color:#888;text-align:center;padding:0 12px 8px 0;border-bottom:2px solid #222;">Qty</th>
            <th style="font-family:sans-serif;font-size:11px;color:#888;text-align:right;padding:0 0 8px;border-bottom:2px solid #222;">Price</th>
            <th style="font-family:sans-serif;font-size:11px;color:#888;text-align:right;padding:0 0 8px 12px;border-bottom:2px solid #222;">Subtotal</th>
          </tr>
        </thead>
        <tbody>${itemsTableRows}</tbody>
      </table>
      <p style="font-family:sans-serif;font-size:18px;font-weight:bold;margin-top:16px;">Total: $${Number(order.total).toFixed(2)}</p>
      ${order.notes ? `<p style="font-family:sans-serif;font-size:13px;color:#666;">Notes: ${order.notes}</p>` : ""}
      <p style="font-family:sans-serif;">We'll be in touch once your order is being processed.</p>
      <p style="font-family:sans-serif;color:#888;font-size:12px;">— Kong Concentrates LLC · 29141 S 647 Pl · Grove, OK 74344 · process@kongconcentrates.com</p>`,
    text: `Hi ${dispensary.contact_name || dispensary.name},\n\nOrder #${shortId} received on ${date}.\n\n${itemsText}\n\nTotal: $${Number(order.total).toFixed(2)}${order.notes ? "\nNotes: " + order.notes : ""}\n\nYour invoice is attached.\n\n— Kong Concentrates LLC`,
  });

  // To admin
  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `New Order #${shortId} — ${dispensary.name}`,
    attachments: [attachment],
    html: `
      <h2 style="font-family:sans-serif;">New Wholesale Order</h2>
      <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse;margin-bottom:16px;">
        <tr><td style="padding:4px 16px 4px 0;color:#888;">Order</td><td><strong>#${shortId}</strong></td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#888;">Dispensary</td><td>${dispensary.name}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#888;">Contact</td><td>${dispensary.contact_name || "—"}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#888;">Phone</td><td>${dispensary.phone || "—"}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#888;">Total</td><td><strong>$${Number(order.total).toFixed(2)}</strong></td></tr>
      </table>
      <table style="border-collapse:collapse;width:100%;max-width:480px;">
        <thead>
          <tr>
            <th style="font-family:sans-serif;font-size:11px;color:#888;text-align:left;padding:0 12px 8px 0;border-bottom:2px solid #222;">Product</th>
            <th style="font-family:sans-serif;font-size:11px;color:#888;text-align:center;padding:0 12px 8px 0;border-bottom:2px solid #222;">Qty</th>
            <th style="font-family:sans-serif;font-size:11px;color:#888;text-align:right;padding:0 0 8px 12px;border-bottom:2px solid #222;">Subtotal</th>
          </tr>
        </thead>
        <tbody>${items.map((it) => `
          <tr>
            <td style="padding:8px 12px 8px 0;border-bottom:1px solid #eee;font-family:sans-serif;font-size:14px;">${it.product_name}</td>
            <td style="padding:8px 12px 8px 0;border-bottom:1px solid #eee;font-family:sans-serif;font-size:14px;text-align:center;">${it.quantity}</td>
            <td style="padding:8px 0 8px 12px;border-bottom:1px solid #eee;font-family:sans-serif;font-size:14px;text-align:right;">$${Number(it.subtotal).toFixed(2)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
      ${order.notes ? `<p style="font-family:sans-serif;font-size:13px;color:#666;margin-top:12px;">Notes: ${order.notes}</p>` : ""}
      <p style="font-family:sans-serif;margin-top:20px;">
        <a href="https://kongconcentrates.com/wholesale/admin/" style="background:#c9a84c;color:#000;padding:10px 20px;text-decoration:none;font-weight:bold;">View in Admin Dashboard</a>
      </p>`,
    text: `New Order #${shortId}\n\nDispensary: ${dispensary.name}\nPhone: ${dispensary.phone || "—"}\nTotal: $${Number(order.total).toFixed(2)}\n\n${itemsText}${order.notes ? "\nNotes: " + order.notes : ""}\n\nhttps://kongconcentrates.com/wholesale/admin/`,
  });
}

// ── New application received ──────────────────────────────────────
async function sendApplicationReceived({ name, contact_name, email, phone, address, omma_license, obndd_license }) {
  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `New Wholesale Application — ${name}`,
    html: `
      <h2 style="font-family:sans-serif;">New Wholesale Application</h2>
      <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse;">
        <tr><td style="padding:6px 16px 6px 0;color:#888;">Dispensary</td><td><strong>${name}</strong></td></tr>
        <tr><td style="padding:6px 16px 6px 0;color:#888;">Contact</td><td>${contact_name}</td></tr>
        <tr><td style="padding:6px 16px 6px 0;color:#888;">Email</td><td>${email}</td></tr>
        <tr><td style="padding:6px 16px 6px 0;color:#888;">Phone</td><td>${phone}</td></tr>
        <tr><td style="padding:6px 16px 6px 0;color:#888;">Address</td><td>${address}</td></tr>
        <tr><td style="padding:6px 16px 6px 0;color:#888;">OMMA</td><td>${omma_license || "—"}</td></tr>
        <tr><td style="padding:6px 16px 6px 0;color:#888;">OBNDD</td><td>${obndd_license || "—"}</td></tr>
      </table>
      <p style="font-family:sans-serif;margin-top:20px;">
        <a href="https://kongconcentrates.com/wholesale/admin/" style="background:#c9a84c;color:#000;padding:10px 20px;text-decoration:none;font-weight:bold;">Review in Admin Dashboard</a>
      </p>`,
    text: `New Wholesale Application\n\nDispensary: ${name}\nContact: ${contact_name}\nEmail: ${email}\nPhone: ${phone}\nAddress: ${address}\nOMMA: ${omma_license || "—"}\nOBNDD: ${obndd_license || "—"}\n\nReview at https://kongconcentrates.com/wholesale/admin/`,
  });

  await sendEmail({
    to: email,
    subject: "Application Received — Kong Concentrates Wholesale",
    html: `
      <h2 style="font-family:sans-serif;">Application Received</h2>
      <p style="font-family:sans-serif;">Hi ${contact_name},</p>
      <p style="font-family:sans-serif;">We've received your wholesale application for <strong>${name}</strong>. Our team will review it and get back to you within 1–2 business days.</p>
      <p style="font-family:sans-serif;">Questions? Reply to this email or contact us at <a href="mailto:process@kongconcentrates.com">process@kongconcentrates.com</a>.</p>
      <p style="font-family:sans-serif;color:#888;font-size:12px;">— Kong Concentrates LLC · 29141 S 647 Pl · Grove, OK 74344</p>`,
    text: `Hi ${contact_name},\n\nWe've received your wholesale application for ${name}. Our team will review it within 1–2 business days.\n\nQuestions? Email process@kongconcentrates.com\n\n— Kong Concentrates LLC`,
  });
}

// ── Account approved / rejected ───────────────────────────────────
async function sendAccountApproved({ name, contact_name, email }) {
  await sendEmail({
    to: email,
    subject: "Wholesale Account Approved — Kong Concentrates",
    html: `
      <h2 style="font-family:sans-serif;">You're Approved!</h2>
      <p style="font-family:sans-serif;">Hi ${contact_name},</p>
      <p style="font-family:sans-serif;">Great news — your wholesale account for <strong>${name}</strong> has been approved. You can now sign in to place orders.</p>
      <p style="font-family:sans-serif;">
        <a href="https://kongconcentrates.com/wholesale/" style="background:#c9a84c;color:#000;padding:10px 20px;text-decoration:none;font-weight:bold;">Sign In to Wholesale Portal</a>
      </p>
      <p style="font-family:sans-serif;color:#888;font-size:12px;">— Kong Concentrates LLC · 29141 S 647 Pl · Grove, OK 74344</p>`,
    text: `Hi ${contact_name},\n\nYour wholesale account for ${name} has been approved! Sign in at https://kongconcentrates.com/wholesale/\n\n— Kong Concentrates LLC`,
  });
}

async function sendAccountRejected({ name, contact_name, email }) {
  await sendEmail({
    to: email,
    subject: "Wholesale Application Update — Kong Concentrates",
    html: `
      <h2 style="font-family:sans-serif;">Application Update</h2>
      <p style="font-family:sans-serif;">Hi ${contact_name},</p>
      <p style="font-family:sans-serif;">Thank you for applying for a wholesale account. After review, we're unable to approve the application for <strong>${name}</strong> at this time.</p>
      <p style="font-family:sans-serif;">If you have questions, please contact us at <a href="mailto:process@kongconcentrates.com">process@kongconcentrates.com</a>.</p>
      <p style="font-family:sans-serif;color:#888;font-size:12px;">— Kong Concentrates LLC · 29141 S 647 Pl · Grove, OK 74344</p>`,
    text: `Hi ${contact_name},\n\nWe're unable to approve the wholesale application for ${name} at this time. Questions? Email process@kongconcentrates.com\n\n— Kong Concentrates LLC`,
  });
}

// ── Order status change ───────────────────────────────────────────
const STATUS_LABELS = {
  received: "Received",
  processing: "Processing",
  out_for_delivery: "Out for Delivery",
  complete: "Complete",
};

async function sendOrderStatusUpdate({ dispensary, status, orderId }) {
  const label = STATUS_LABELS[status] || status;
  const shortId = orderId.slice(-8).toUpperCase();

  await sendEmail({
    to: dispensary.email,
    subject: `Order #${shortId} — ${label} · Kong Concentrates`,
    html: `
      <h2 style="font-family:sans-serif;">Order Update</h2>
      <p style="font-family:sans-serif;">Hi ${dispensary.contact_name || dispensary.name},</p>
      <p style="font-family:sans-serif;">Your order <strong>#${shortId}</strong> status has been updated to <strong>${label}</strong>.</p>
      <p style="font-family:sans-serif;">
        <a href="https://kongconcentrates.com/wholesale/portal/" style="background:#c9a84c;color:#000;padding:10px 20px;text-decoration:none;font-weight:bold;">View Order Details</a>
      </p>
      <p style="font-family:sans-serif;color:#888;font-size:12px;">— Kong Concentrates LLC · 29141 S 647 Pl · Grove, OK 74344 · process@kongconcentrates.com</p>`,
    text: `Hi ${dispensary.contact_name || dispensary.name},\n\nYour order #${shortId} status has been updated to: ${label}\n\nView at https://kongconcentrates.com/wholesale/portal/\n\n— Kong Concentrates LLC`,
  });
}

module.exports = {
  sendApplicationReceived,
  sendAccountApproved,
  sendAccountRejected,
  sendOrderStatusUpdate,
  sendOrderConfirmation,
};

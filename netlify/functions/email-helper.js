const nodemailer = require("nodemailer");

const ADMIN_EMAIL = "process@kongconcentrates.com";

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_SMTP_HOST,
    port: parseInt(process.env.EMAIL_SMTP_PORT || "587"),
    secure: process.env.EMAIL_SMTP_SECURE === "true",
    auth: {
      user: process.env.EMAIL_SMTP_USER,
      pass: process.env.EMAIL_SMTP_PASS,
    },
  });
}

async function sendEmail({ to, subject, html, text }) {
  if (!process.env.EMAIL_SMTP_HOST || !process.env.EMAIL_SMTP_USER) {
    console.log("Email not configured — skipping send:", subject);
    return;
  }
  const transporter = createTransport();
  await transporter.sendMail({
    from: `"Kong Concentrates" <${process.env.EMAIL_SMTP_USER}>`,
    to,
    subject,
    html,
    text,
  });
}

// ── New application received ──────────────────────────────────────
async function sendApplicationReceived({ name, contact_name, email, phone, address, omma_license, obndd_license }) {
  // To admin
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
        <tr><td style="padding:6px 16px 6px 0;color:#888;">OMMA</td><td>${omma_license || '—'}</td></tr>
        <tr><td style="padding:6px 16px 6px 0;color:#888;">OBNDD</td><td>${obndd_license || '—'}</td></tr>
      </table>
      <p style="font-family:sans-serif;margin-top:20px;">
        <a href="https://kongconcentrates.com/wholesale/admin/" style="background:#c9a84c;color:#000;padding:10px 20px;text-decoration:none;font-weight:bold;">Review in Admin Dashboard</a>
      </p>`,
    text: `New Wholesale Application\n\nDispensary: ${name}\nContact: ${contact_name}\nEmail: ${email}\nPhone: ${phone}\nAddress: ${address}\nOMMA: ${omma_license || '—'}\nOBNDD: ${obndd_license || '—'}\n\nReview at https://kongconcentrates.com/wholesale/admin/`,
  });

  // To applicant
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
};

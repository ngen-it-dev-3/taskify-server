// src/controllers/tender/security.controller.js
const mongoose = require("mongoose");
const TenderSecurity = require("../../models/TenderSecurity.model");
const Tender = require("../../models/Tender.model");
const { sendSecurityNotification } = require("../../utils/mailer");

/* ============================================================
 * LIST — with entity, type, docs filters
 * ============================================================ */
const listSecurity = async (req, res) => {
  try {
    const { entity, type, docs, page = 1, limit = 100 } = req.query;

    const query = {};
    if (entity && entity !== "all") query.entity = entity;
    if (type && type !== "all") query.type = type;
    if (docs && docs !== "all") query.docsStatus = docs;

    const [rows, total] = await Promise.all([
      TenderSecurity.find(query)
        .sort({ dueDate: 1 })
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit))
        .lean(),
      TenderSecurity.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("listSecurity error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * STATS — Calculates real numbers for the 6 stat tiles
 * ============================================================ */
const securityStats = async (_req, res) => {
  try {
    // Fetch all records to calculate the detailed stats
    const rows = await TenderSecurity.find({}).lean();
    const today = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(today.getDate() + 30);

    let paymentsOutstanding = 0;
    let countOutstanding = 0;

    let overduePayments = 0;
    let countOverdue = 0;

    let awaitingPurchase = 0;
    let countAwaiting = 0;

    let maturingIn30 = 0;
    let countMaturing = 0;

    let maturedCollect = 0;
    let countMatured = 0;

    let totalSecurityHeld = 0;
    let countSecurity = 0;

    rows.forEach((row) => {
      const amount = Number(row.amount) || 0;
      const received = Number(row.receivedAmount) || 0;
      const balance = amount - received;

      // Security held by banks (just using the amount for this stat)
      if (row.type !== "Tender Security") {
        totalSecurityHeld += amount;
        countSecurity++;
      }

      // Payment stats (only for records with an invoice)
      if (row.invoiceNo && row.invoiceNo !== "No invoice yet") {
        if (balance > 0) {
          paymentsOutstanding += balance;
          countOutstanding++;

          if (row.dueDate && new Date(row.dueDate) < today) {
            overduePayments += balance;
            countOverdue++;
          }
        }
      } else {
        awaitingPurchase += amount;
        countAwaiting++;
      }

      // Due date stats for bank guarantees/security
      if (row.dueDate) {
        const dueDate = new Date(row.dueDate);
        if (dueDate < today) {
          maturedCollect += amount;
          countMatured++;
        } else if (dueDate <= thirtyDaysFromNow) {
          maturingIn30 += amount;
          countMaturing++;
        }
      }
    });

    res.json({
      success: true,
      data: {
        paymentsOutstanding,
        countOutstanding,
        overduePayments,
        countOverdue,
        totalSecurityHeld,
        countSecurity,
        awaitingPurchase,
        countAwaiting,
        maturingIn30,
        countMaturing,
        maturedCollect,
        countMatured,
      },
    });
  } catch (error) {
    console.error("securityStats error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * CREATE
 * ============================================================ */
const createSecurity = async (req, res) => {
  try {
    const {
      entity, clientDescription, type, amount, currency, dueDate,
      docsStatus, tenderId, invoiceNo, invoiceDate, receivedAmount, delivery,
      purchaseDate, securityClosingDate, purchaseFrom, purchaseType, validityDate
    } = req.body;

    if (!entity || !clientDescription || !type) {
      return res.status(400).json({ success: false, message: "entity, clientDescription, and type are required" });
    }

    // ✅ req.file থাকলে সেখান থেকে পাথ নিন, অন্যথায় req.body থেকে
    const documentUrl = req.file ? `/uploads/security-docs/${req.file.filename}` : (req.body.documentUrl || "");
    const finalDocsStatus = req.file ? "Attached" : (docsStatus || "Missing");

    const row = await TenderSecurity.create({
      entity,
      clientDescription,
      type,
      amount: Number(amount) || 0,
      currency: currency || "BDT",
      dueDate: dueDate ? new Date(dueDate) : null,
      docsStatus: finalDocsStatus,
      documentUrl: documentUrl,
      tenderId: tenderId || null,
      invoiceNo: invoiceNo || "No invoice yet",
      invoiceDate: invoiceDate ? new Date(invoiceDate) : null,
      receivedAmount: Number(receivedAmount) || 0,
      delivery: delivery || "Pending",
      purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
      securityClosingDate: securityClosingDate ? new Date(securityClosingDate) : null,
      purchaseFrom: purchaseFrom || "",
      purchaseType: purchaseType || "",
      validityDate: validityDate ? new Date(validityDate) : null,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    res.status(201).json({ success: true, data: row });
  } catch (error) {
    console.error("createSecurity error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * UPDATE
 * ============================================================ */
const updateSecurity = async (req, res) => {
  try {
    const row = await TenderSecurity.findById(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Security record not found" });
    }

    const allowed = [
      "entity", "clientDescription", "type", "amount", "currency",
      "dueDate", "docsStatus", "documentUrl",
      "invoiceNo", "invoiceDate", "receivedAmount", "delivery",
      "purchaseDate", "securityClosingDate", "purchaseFrom", "purchaseType", "validityDate"
    ];

    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        if (["dueDate", "invoiceDate", "purchaseDate", "securityClosingDate", "validityDate"].includes(k)) {
          row[k] = req.body[k] ? new Date(req.body[k]) : null;
        } else {
          row[k] = req.body[k];
        }
      }
    }

    // ✅ নতুন ফাইল আপলোড হলে documentUrl আপডেট করুন
    if (req.file) {
      row.documentUrl = `/uploads/security-docs/${req.file.filename}`;
      row.docsStatus = "Attached";
    }

    row.updatedBy = req.user._id;
    await row.save();

    res.json({ success: true, data: row });
  } catch (error) {
    console.error("updateSecurity error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * DELETE
 * ============================================================ */
const deleteSecurity = async (req, res) => {
  try {
    const row = await TenderSecurity.findByIdAndDelete(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Security record not found" });
    }
    res.json({ success: true, message: "Security record deleted" });
  } catch (error) {
    console.error("deleteSecurity error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * NOTIFY FINANCE
 * ============================================================ */
const notifySecurity = async (req, res) => {
  try {
    const { emails, note } = req.body;

    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ success: false, message: "emails[] is required" });
    }

    const valid = emails
      .map((e) => String(e).trim())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

    if (!valid.length) {
      return res.status(400).json({ success: false, message: "No valid email addresses" });
    }

    const security = await TenderSecurity.findById(req.params.id).lean();
    if (!security) {
      return res.status(404).json({ success: false, message: "Security record not found" });
    }

    let tender = null;
    if (security.tenderId) {
      tender = await Tender.findById(security.tenderId).lean();
    }

    const info = await sendSecurityNotification({
      to: valid,
      security,
      tender,
      note: note || "",
      senderName: req.user?.fullName || req.user?.name || "",
    });

    res.json({
      success: true,
      message: `Notification sent to ${valid.length} recipient(s)`,
      data: {
        messageId: info.messageId,
        recipients: valid,
        accepted: info.accepted || [],
        rejected: info.rejected || [],
      },
    });
  } catch (error) {
    console.error("notifySecurity error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * RECORD PAYMENT
 * ============================================================ */
const recordPayment = async (req, res) => {
  try {
    const { amount, date, mode, reference, delivery, closeOrder } = req.body;
    const row = await TenderSecurity.findById(req.params.id);

    if (!row) return res.status(404).json({ success: false, message: "Record not found" });

    const userName = req.user?.fullName || "System";
    const userId = req.user?._id || null;

    const newPayment = {
      date: date ? new Date(date) : new Date(),
      amount: Number(amount) || 0,
      mode: mode || "Bank transfer",
      reference: reference || "",
      enteredBy: userName,
      enteredById: userId,
    };

    row.payments.push(newPayment);
    row.receivedAmount = (Number(row.receivedAmount) || 0) + newPayment.amount;

    const balance = row.amount - row.receivedAmount;
    if (balance <= 0 && closeOrder) {
      row.delivery = "Closed";
    } else if (delivery) {
      row.delivery = delivery;
    }

    row.updatedBy = req.user._id;
    await row.save();

    res.json({ success: true, data: row });
  } catch (error) {
    console.error("recordPayment error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  listSecurity,
  securityStats,
  createSecurity,
  updateSecurity,
  deleteSecurity,
  notifySecurity,
  recordPayment,
};
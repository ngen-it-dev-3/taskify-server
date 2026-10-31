// src/middleware/upload.middleware.js
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// ============================================================
// UPLOAD DIRECTORIES
//
// __dirname = backend/src/middleware
//   ../../  = backend               ← the backend root
// Both this file and server.js must point to the SAME folder:
//   backend/uploads/
// ============================================================

// ---------- Chat uploads ----------
const uploadDir = path.join(__dirname, "../../uploads/chat");
fs.mkdirSync(uploadDir, { recursive: true });

// Tender chat reuses the same folder, so alias it for clarity
const tenderChatUploadDir = uploadDir;

const subDirs = ["images", "documents", "audio", "videos", "others"];
subDirs.forEach((dir) => {
  fs.mkdirSync(path.join(uploadDir, dir), { recursive: true });
});

// ---------- Tender uploads ----------
const tenderUploadDir = path.join(__dirname, "../../uploads/tenders");
fs.mkdirSync(tenderUploadDir, { recursive: true });

// ---------- Tender advertisement uploads ----------
const advertisementUploadDir = path.join(
  __dirname,
  "../../uploads/tender-advertisements",
);
fs.mkdirSync(advertisementUploadDir, { recursive: true });

// ---------- Company doc uploads ----------
const companyDocUploadDir = path.join(
  __dirname,
  "../../uploads/company-docs",
);
fs.mkdirSync(companyDocUploadDir, { recursive: true });

// ---------- Boot logs ----------
console.log("[upload.middleware] uploadDir              :", uploadDir);
console.log("[upload.middleware] tenderUploadDir        :", tenderUploadDir);
console.log(
  "[upload.middleware] advertisementUploadDir :",
  advertisementUploadDir,
);
console.log(
  "[upload.middleware] companyDocUploadDir    :",
  companyDocUploadDir,
);

// ============================================================
// FILE FILTER — allow all types
// ============================================================
const fileFilter = (_req, _file, cb) => cb(null, true);

// ============================================================
// STORAGE — CHAT  (also used by tender chat)
// ============================================================
const chatStorage = multer.diskStorage({
  destination: (_req, file, cb) => {
    let subDir = "others";
    const mime = file.mimetype;
    if (mime.startsWith("image/")) subDir = "images";
    else if (mime.startsWith("audio/")) subDir = "audio";
    else if (mime.startsWith("video/")) subDir = "videos";
    else if (
      mime === "application/pdf" ||
      mime === "application/msword" ||
      mime.includes("wordprocessingml") ||
      mime === "text/plain" ||
      mime === "text/csv" ||
      mime === "application/rtf"
    ) {
      subDir = "documents";
    }
    const dest = path.join(uploadDir, subDir);
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (_req, file, cb) => {
    const id = crypto.randomBytes(8).toString("hex");
    const ext = path.extname(file.originalname) || "";
    cb(null, `${Date.now()}-${id}${ext}`);
  },
});

// ============================================================
// STORAGE — TENDERS
// ============================================================
const tenderStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(tenderUploadDir, { recursive: true });
    console.log("[tenderStorage.destination] →", tenderUploadDir);
    cb(null, tenderUploadDir);
  },
  filename: (_req, file, cb) => {
    const id = crypto.randomBytes(8).toString("hex");
    const ext = path.extname(file.originalname) || "";
    const base =
      path
        .basename(file.originalname, ext)
        .replace(/[^\w.\-]+/g, "_")
        .slice(0, 60) || "file";
    const name = `${Date.now()}-${id}-${base}${ext}`;
    console.log("[tenderStorage.filename] →", name);
    cb(null, name);
  },
});

// ============================================================
// STORAGE — ADVERTISEMENTS
// ============================================================
const advertisementStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(advertisementUploadDir, { recursive: true });
    cb(null, advertisementUploadDir);
  },
  filename: (_req, file, cb) => {
    const id = crypto.randomBytes(8).toString("hex");
    const ext = path.extname(file.originalname) || "";
    const base =
      path
        .basename(file.originalname, ext)
        .replace(/[^\w.\-]+/g, "_")
        .slice(0, 60) || "ad";
    cb(null, `${Date.now()}-${id}-${base}${ext}`);
  },
});

// ============================================================
// STORAGE — COMPANY DOCS
// ============================================================
const companyDocStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(companyDocUploadDir, { recursive: true });
    cb(null, companyDocUploadDir);
  },
  filename: (_req, file, cb) => {
    const id = crypto.randomBytes(8).toString("hex");
    const ext = path.extname(file.originalname) || "";
    const base =
      path
        .basename(file.originalname, ext)
        .replace(/[^\w.\-]+/g, "_")
        .slice(0, 60) || "doc";
    cb(null, `${Date.now()}-${id}-${base}${ext}`);
  },
});

// ============================================================
// MULTER INSTANCES
// ============================================================
const upload = multer({
  storage: chatStorage,
  limits: { fileSize: 50 * 1024 * 1024, files: 10 },
  fileFilter,
});

const tenderUpload = multer({
  storage: tenderStorage,
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter,
});

const advertisementUpload = multer({
  storage: advertisementStorage,
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter,
});

const companyDocUpload = multer({
  storage: companyDocStorage,
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter,
});

// Tender chat — same storage as chat, its own instance for limits
const tenderChatUpload = multer({
  storage: chatStorage,
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
  fileFilter,
});

// ============================================================
// HELPERS
// ============================================================
const getFileType = (mimeType) => {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "voice";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "pdf";
  if (
    mimeType === "application/msword" ||
    mimeType.includes("wordprocessingml")
  )
    return "document";
  if (
    mimeType === "application/vnd.ms-excel" ||
    mimeType.includes("spreadsheetml")
  )
    return "spreadsheet";
  if (
    mimeType === "application/vnd.ms-powerpoint" ||
    mimeType.includes("presentationml")
  )
    return "presentation";
  if (mimeType === "text/csv") return "spreadsheet";
  if (mimeType === "text/plain") return "document";
  if (
    mimeType === "application/zip" ||
    mimeType === "application/x-rar-compressed" ||
    mimeType === "application/x-7z-compressed"
  )
    return "archive";
  return "file";
};

const getFileIcon = (mimeType) => {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "pdf";
  if (
    mimeType === "application/msword" ||
    mimeType.includes("wordprocessingml")
  )
    return "word";
  if (
    mimeType === "application/vnd.ms-excel" ||
    mimeType.includes("spreadsheetml")
  )
    return "excel";
  if (
    mimeType === "application/vnd.ms-powerpoint" ||
    mimeType.includes("presentationml")
  )
    return "powerpoint";
  if (mimeType === "text/csv") return "csv";
  if (mimeType === "text/plain") return "text";
  if (
    mimeType === "application/zip" ||
    mimeType === "application/x-rar-compressed"
  )
    return "archive";
  return "file";
};

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  // Chat (generic)
  upload,
  uploadDir,

  // Tender
  tenderUpload,
  tenderUploadDir,

  // Advertisement
  advertisementUpload,
  advertisementUploadDir,

  // Company docs
  companyDocUpload,
  companyDocUploadDir,

  // Tender chat (support)
  tenderChatUpload,
  tenderChatUploadDir,

  // Utilities
  getFileType,
  getFileIcon,
};
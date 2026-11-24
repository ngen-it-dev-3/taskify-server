const express = require("express");
const router = express.Router();
const { employeeDocUpload } = require("../middleware/upload.middleware");
const {
  createFile,
  getEmployeeFiles,
  deleteFile,
  verifyFile,
  updateFile, // <-- import
} = require("../controllers/employeeFile.controller");
const { authenticate } = require("../middleware/auth.middleware");

router.post("/", authenticate, employeeDocUpload.single("file"), createFile);
router.get("/:employeeId", authenticate, getEmployeeFiles);
router.patch("/:id/verify", authenticate, verifyFile); // specific route first
router.patch("/:id", authenticate, employeeDocUpload.single("file"), updateFile); // <-- new
router.delete("/:id", authenticate, deleteFile);

module.exports = router;
const EmployeeFile = require("../models/EmployeeFile.model");
const fs = require("fs");
const path = require("path");

// Create a new file record
exports.createFile = async (req, res) => {
  try {
    const {
      title, category, issueDate, expiryDate, employeeId,
      documentNumber, notes, description, tags
    } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const fileUrl = `/uploads/employee-docs/${req.file.filename}`;

    // Parse tags if sent as comma-separated string
    let parsedTags = [];
    if (tags) {
      parsedTags = typeof tags === "string" ? tags.split(",").map(t => t.trim()) : tags;
    }

    const newFile = await EmployeeFile.create({
      employeeId: employeeId || req.user._id,
      title,
      category: category || "General",
      documentNumber: documentNumber || "",
      issueDate: issueDate || new Date(),
      expiryDate: expiryDate || null,
      description: description || "",
      notes: notes || "",
      tags: parsedTags,
      isVerified: false,
      fileUrl,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
    });

    res.status(201).json({ success: true, data: newFile });
  } catch (error) {
    console.error("Create File Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get files for a specific employee
exports.getEmployeeFiles = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const files = await EmployeeFile.find({ employeeId })
      .populate("verifiedBy", "fullName")
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: files });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update Verification Status (Admin/HR Only)
exports.verifyFile = async (req, res) => {
  try {
    const { id } = req.params;
    const { isVerified } = req.body;

    const file = await EmployeeFile.findById(id);
    if (!file) {
      return res.status(404).json({ success: false, message: "File not found" });
    }

    file.isVerified = isVerified;
    file.verifiedBy = isVerified ? req.user._id : null;
    await file.save();

    res.status(200).json({ success: true, data: file, message: "Verification status updated" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete a file
exports.deleteFile = async (req, res) => {
  try {
    const file = await EmployeeFile.findById(req.params.id);
    if (!file) {
      return res.status(404).json({ success: false, message: "File not found" });
    }

    const fileName = file.fileUrl.split("/").pop();
    const filePath = path.join(__dirname, "../../uploads/employee-docs", fileName);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await file.deleteOne();
    res.status(200).json({ success: true, message: "File deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update an existing file record (metadata + optional file replacement)
exports.updateFile = async (req, res) => {
  try {
    const { id } = req.params;
    const file = await EmployeeFile.findById(id);

    if (!file) {
      return res.status(404).json({ success: false, message: "File not found" });
    }

    // --- Update metadata fields (only if provided) ---
    const {
      title, category, issueDate, expiryDate,
      documentNumber, notes, description, tags,
    } = req.body;

    if (title !== undefined) file.title = title;
    if (category !== undefined) file.category = category;
    if (issueDate !== undefined) file.issueDate = issueDate;
    if (expiryDate !== undefined) file.expiryDate = expiryDate || null;
    if (documentNumber !== undefined) file.documentNumber = documentNumber;
    if (notes !== undefined) file.notes = notes;
    if (description !== undefined) file.description = description;

    if (tags !== undefined) {
      file.tags = typeof tags === "string"
        ? tags.split(",").map((t) => t.trim()).filter(Boolean)
        : tags;
    }

    // --- Handle optional file replacement ---
    if (req.file) {
      // Delete the old file from disk
      const oldFileName = file.fileUrl.split("/").pop();
      const oldFilePath = path.join(__dirname, "../../uploads/employee-docs", oldFileName);
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }

      // Point to the new file
      file.fileUrl = `/uploads/employee-docs/${req.file.filename}`;
      file.fileType = req.file.mimetype;
      file.fileSize = req.file.size;
    }

    await file.save();

    res.status(200).json({
      success: true,
      data: file,
      message: "File updated successfully",
    });
  } catch (error) {
    console.error("Update File Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
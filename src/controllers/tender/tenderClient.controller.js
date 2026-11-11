// src/controllers/tender/tenderClient.controller.js
const TenderClient = require("../../models/TenderClient.model");

const listClients = async (req, res) => {
  try {
    const clients = await TenderClient.find().sort({ updatedAt: -1 });
    res.json({ success: true, data: clients });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const getStats = async (req, res) => {
  try {
    const clients = await TenderClient.find({}, "status relationship isMustMake").lean();
    const stats = {
      served: clients.filter(c => c.status === "Served").length,
      notAttended: clients.filter(c => c.status === "Not attended").length,
      potential: clients.filter(c => c.status === "Potential").length,
      mustMake: clients.filter(c => c.isMustMake).length,
      strong: clients.filter(c => c.relationship === "Strong").length,
    };
    res.json({ success: true, data: stats });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const createClient = async (req, res) => {
  try {
    const client = await TenderClient.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json({ success: true, data: client });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const updateClient = async (req, res) => {
  try {
    const client = await TenderClient.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    res.json({ success: true, data: client });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const deleteClient = async (req, res) => {
  try {
    await TenderClient.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Deleted" });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

module.exports = { listClients, getStats, createClient, updateClient, deleteClient };
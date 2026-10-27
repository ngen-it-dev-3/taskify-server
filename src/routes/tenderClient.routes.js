// src/routes/tenderClient.routes.js
const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth.middleware");
const ctrl = require("../controllers/tender/tenderClient.controller");

router.use(authenticate);

router.get("/", ctrl.listClients);
router.get("/stats", ctrl.getStats);
router.post("/", ctrl.createClient);
router.put("/:id", ctrl.updateClient);
router.delete("/:id", ctrl.deleteClient);

module.exports = router;
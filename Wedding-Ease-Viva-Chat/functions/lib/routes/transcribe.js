"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const transcribeController_1 = require("../controllers/transcribeController");
const router = (0, express_1.Router)();
// POST /transcribe
router.post('/', auth_1.requireAuth, transcribeController_1.handleTranscribe);
exports.default = router;
//# sourceMappingURL=transcribe.js.map
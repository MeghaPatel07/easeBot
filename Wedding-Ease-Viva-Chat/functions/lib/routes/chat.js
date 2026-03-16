"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const chatController_1 = require("../controllers/chatController");
const router = (0, express_1.Router)();
// POST /chat
router.post('/', auth_1.requireAuth, chatController_1.handleChat);
exports.default = router;
//# sourceMappingURL=chat.js.map
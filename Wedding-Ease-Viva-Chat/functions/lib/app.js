"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const chat_1 = __importDefault(require("./routes/chat"));
const transcribe_1 = __importDefault(require("./routes/transcribe"));
const app = (0, express_1.default)();
exports.app = app;
// CORS — allow all origins (Firebase handles auth via Bearer token)
app.use((0, cors_1.default)({ origin: true }));
app.use(express_1.default.json({ limit: '10mb' })); // 10mb for audio base64 payloads
// Routes
app.use('/chat', chat_1.default);
app.use('/transcribe', transcribe_1.default);
// Health check
app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));
//# sourceMappingURL=app.js.map
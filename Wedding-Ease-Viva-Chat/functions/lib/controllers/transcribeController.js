"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleTranscribe = handleTranscribe;
const stt_1 = require("../services/stt");
async function handleTranscribe(req, res) {
    const { audioBase64 } = req.body;
    if (!audioBase64) {
        res.status(400).json({ error: 'audioBase64 is required' });
        return;
    }
    try {
        const result = await (0, stt_1.transcribeAudio)(audioBase64);
        res.status(200).json({
            text: result.text,
            detectedLanguage: result.detectedLanguageCode.split('-')[0],
        });
    }
    catch (err) {
        console.error('[transcribeController] error:', err);
        res.status(500).json({ error: err.message ?? 'Transcription failed' });
    }
}
//# sourceMappingURL=transcribeController.js.map
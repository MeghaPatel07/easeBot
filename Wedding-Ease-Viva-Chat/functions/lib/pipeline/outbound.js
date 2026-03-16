"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processOutbound = processOutbound;
const translation_1 = require("../services/translation");
const speechEnabled = () => process.env.ENABLE_SPEECH_TRANSLATION === 'true';
async function processOutbound(englishText, targetLanguage) {
    // ── Toggle OFF: return English text as-is ────────────────────────────────
    if (!speechEnabled()) {
        return { text: englishText, audioUrl: null };
    }
    // ── Toggle ON: translate back to user's original language ─────────────────
    let finalText = englishText;
    if (targetLanguage !== 'en') {
        try {
            finalText = await (0, translation_1.translateText)(englishText, targetLanguage);
        }
        catch (err) {
            console.warn('[outbound] Translation failed, returning English text:', err);
        }
    }
    return { text: finalText, audioUrl: null };
}
//# sourceMappingURL=outbound.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processInbound = processInbound;
const stt_1 = require("../services/stt");
const translation_1 = require("../services/translation");
const sttEnabled = () => process.env.ENABLE_SPEECH_TRANSLATION === 'true';
const fullPipelineEnabled = sttEnabled; // alias for readability
async function processInbound(message, audioBase64, hintLanguage) {
    let rawText = message;
    let detectedLanguage = hintLanguage ?? 'en';
    // ── Step 1: STT (only when ENABLE_SPEECH_TRANSLATION=true) ───────────────
    if (sttEnabled() && audioBase64) {
        try {
            const sttResult = await (0, stt_1.transcribeAudio)(audioBase64);
            rawText = sttResult.text;
            detectedLanguage = sttResult.detectedLanguageCode.split('-')[0];
        }
        catch (err) {
            console.warn('[inbound] STT failed, using typed text:', err);
        }
    }
    // ── Step 2: Language detection for text input (ALWAYS — graceful fallback) ─
    // Runs regardless of ENABLE_SPEECH_TRANSLATION so the system prompt can tell
    // GPT-4o which language to respond in, even without a translation pipeline.
    if (!audioBase64 && !hintLanguage) {
        try {
            detectedLanguage = await (0, translation_1.detectLanguage)(rawText);
        }
        catch {
            // Azure Translator not configured — system prompt language rule handles it
            detectedLanguage = 'en';
        }
    }
    // ── Step 3: Translate to English (only when full pipeline is enabled) ──────
    let englishText = rawText;
    if (fullPipelineEnabled() && detectedLanguage !== 'en') {
        try {
            englishText = await (0, translation_1.translateText)(rawText, 'en');
        }
        catch (err) {
            console.warn('[inbound] Translation to English failed, using raw text:', err);
        }
    }
    return { englishText, detectedLanguage };
}
//# sourceMappingURL=inbound.js.map
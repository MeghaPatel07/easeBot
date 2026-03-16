"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleChat = handleChat;
const admin = __importStar(require("firebase-admin"));
const inbound_1 = require("../pipeline/inbound");
const outbound_1 = require("../pipeline/outbound");
const azureAI_1 = require("../services/azureAI");
const products_1 = require("../services/products");
const modeRouter_1 = require("../modeRouter");
const planner_1 = require("../prompts/planner");
const stylist_1 = require("../prompts/stylist");
const therapist_1 = require("../prompts/therapist");
const knowledge_1 = require("../prompts/knowledge");
const consultant_1 = require("../prompts/consultant");
const assistant_1 = require("../prompts/assistant");
const db = admin.firestore();
// BCP-47 base code → human-readable language name for the system prompt
const LANGUAGE_NAMES = {
    hi: 'Hindi',
    gu: 'Gujarati',
    es: 'Spanish',
    fr: 'French',
    ar: 'Arabic',
    pt: 'Portuguese',
    de: 'German',
    zh: 'Chinese',
    it: 'Italian',
    ja: 'Japanese',
    ko: 'Korean',
    ru: 'Russian',
    tr: 'Turkish',
    nl: 'Dutch',
    pl: 'Polish',
};
function buildLanguageRule(detectedLanguage) {
    const name = LANGUAGE_NAMES[detectedLanguage];
    if (name) {
        return `\n\nLANGUAGE RULE: The user is writing in ${name}. You MUST respond entirely in ${name}. Do not switch to English or any other language under any circumstances.`;
    }
    // Fallback — instruct GPT-4o to self-detect from the message
    return `\n\nLANGUAGE RULE: Detect the language the user has written their message in and respond in that exact same language. Never switch to a different language.`;
}
async function buildSystemPrompt(mode, userMessage, detectedLanguage) {
    let base;
    if (mode === 'stylist') {
        try {
            const products = await (0, products_1.getRelevantProducts)(userMessage);
            const context = (0, products_1.formatProductsContext)(products);
            base = (0, stylist_1.getStylistPrompt)(context);
        }
        catch {
            base = (0, stylist_1.getStylistPrompt)();
        }
    }
    else {
        switch (mode) {
            case 'planner':
                base = (0, planner_1.getPlannerPrompt)();
                break;
            case 'therapist':
                base = (0, therapist_1.getTherapistPrompt)();
                break;
            case 'knowledge':
                base = (0, knowledge_1.getKnowledgePrompt)();
                break;
            case 'consultant':
                base = (0, consultant_1.getConsultantPrompt)();
                break;
            default: base = (0, assistant_1.getAssistantPrompt)();
        }
    }
    return base + buildLanguageRule(detectedLanguage);
}
async function getChatHistory(threadId, limit = 10) {
    const snap = await db
        .collection('chats').doc(threadId)
        .collection('messages')
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();
    return snap.docs
        .reverse()
        .map(d => ({ role: d.data().role, content: d.data().content }));
}
async function handleChat(req, res) {
    const { message, threadId, audioBase64, language, mode: requestedMode, history: clientHistory } = req.body;
    if (!message && !audioBase64) {
        res.status(400).json({ error: 'message or audioBase64 is required' });
        return;
    }
    try {
        const { englishText, detectedLanguage } = await (0, inbound_1.processInbound)(message, audioBase64, language);
        const mode = requestedMode ?? (0, modeRouter_1.detectMode)(englishText);
        // Guest mode (threadId null): use client-supplied history. Logged-in: fetch from Firestore.
        const history = threadId
            ? await getChatHistory(threadId)
            : (clientHistory ?? []);
        const systemPrompt = await buildSystemPrompt(mode, englishText, detectedLanguage);
        const aiEnglishText = await (0, azureAI_1.callAzureAI)(history, englishText, systemPrompt);
        const { text: finalText, audioUrl } = await (0, outbound_1.processOutbound)(aiEnglishText, detectedLanguage);
        const response = { text: finalText, audioUrl, mode, detectedLanguage };
        res.status(200).json(response);
    }
    catch (err) {
        console.error('[chatController] error:', err);
        res.status(500).json({ error: err.message ?? 'Internal server error' });
    }
}
//# sourceMappingURL=chatController.js.map
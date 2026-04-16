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
exports.transcribeAudio = transcribeAudio;
const sdk = __importStar(require("microsoft-cognitiveservices-speech-sdk"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
// Languages TheWeddingBot supports for auto-detection
const SUPPORTED_LANGUAGES = [
    'en-US', 'en-GB',
    'hi-IN', // Hindi
    'gu-IN', // Gujarati
    'es-ES', // Spanish
    'fr-FR', // French
    'ar-SA', // Arabic
    'pt-BR', // Portuguese
    'de-DE', // German
    'zh-CN', // Chinese (Simplified)
];
function getConfig() {
    const key = process.env.AZURE_SPEECH_KEY;
    const region = process.env.AZURE_SPEECH_REGION;
    if (!key || !region)
        throw new Error('AZURE_SPEECH_KEY or AZURE_SPEECH_REGION not configured');
    return { key, region };
}
async function transcribeAudio(audioBase64) {
    const { key, region } = getConfig();
    // Write base64 audio to a temp WAV/WebM file
    const buffer = Buffer.from(audioBase64, 'base64');
    const tmpPath = path.join(os.tmpdir(), `viva-audio-${Date.now()}.wav`);
    fs.writeFileSync(tmpPath, buffer);
    return new Promise((resolve, reject) => {
        const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
        // Continuous Language Identification — auto-detects spoken language
        const autoDetect = sdk.AutoDetectSourceLanguageConfig.fromLanguages(SUPPORTED_LANGUAGES);
        const audioConfig = sdk.AudioConfig.fromWavFileInput(fs.readFileSync(tmpPath));
        const recognizer = sdk.SpeechRecognizer.FromConfig(speechConfig, autoDetect, audioConfig);
        recognizer.recognizeOnceAsync((result) => {
            recognizer.close();
            try {
                fs.unlinkSync(tmpPath);
            }
            catch { }
            if (result.reason === sdk.ResultReason.RecognizedSpeech) {
                const langResult = sdk.AutoDetectSourceLanguageResult.fromResult(result);
                const detectedLanguageCode = langResult.language ?? 'en-US';
                resolve({ text: result.text, detectedLanguageCode });
            }
            else if (result.reason === sdk.ResultReason.NoMatch) {
                reject(new Error('Speech could not be recognized'));
            }
            else {
                const details = sdk.CancellationDetails.fromResult(result);
                reject(new Error(`STT cancelled: ${details.errorDetails}`));
            }
        }, (err) => {
            recognizer.close();
            try {
                fs.unlinkSync(tmpPath);
            }
            catch { }
            reject(new Error(`STT error: ${err}`));
        });
    });
}
//# sourceMappingURL=stt.js.map
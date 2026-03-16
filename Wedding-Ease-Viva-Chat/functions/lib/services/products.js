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
exports.getRelevantProducts = getRelevantProducts;
exports.formatProductsContext = formatProductsContext;
const admin = __importStar(require("firebase-admin"));
// Keywords that suggest the user is looking for a product category
const CATEGORY_KEYWORDS = {
    dress: ['dress', 'gown', 'lehenga', 'bridal wear', 'outfit', 'attire', 'wear', 'clothing'],
    rings: ['ring', 'rings', 'band', 'engagement', 'jewelry', 'jewellery'],
    venue: ['venue', 'hall', 'banquet', 'location', 'place', 'garden', 'resort'],
    florist: ['flower', 'floral', 'bouquet', 'centerpiece', 'decoration', 'decor'],
    cake: ['cake', 'dessert', 'sweet', 'bakery'],
    photo: ['photo', 'photograph', 'camera', 'videograph', 'film'],
};
function extractCategories(userMessage) {
    const lower = userMessage.toLowerCase();
    return Object.entries(CATEGORY_KEYWORDS)
        .filter(([, keywords]) => keywords.some(kw => lower.includes(kw)))
        .map(([category]) => category);
}
// Fetch up to 5 relevant products from Firestore for the user's message
async function getRelevantProducts(userMessage) {
    const db = admin.firestore();
    const categories = extractCategories(userMessage);
    let snap;
    if (categories.length > 0) {
        // Filter by detected category — take first match
        snap = await db
            .collection('products')
            .where('category', '==', categories[0])
            .limit(5)
            .get();
    }
    else {
        // No category detected — return latest 5 products
        snap = await db.collection('products').limit(5).get();
    }
    return snap.docs.map(d => {
        const data = d.data();
        return {
            uid: d.id,
            name: data.name ?? '',
            category: data.category ?? '',
            price: data.price ?? 0,
            currency: data.currency ?? 'INR',
            vendor: data.vendor ?? '',
            tags: data.tags ?? [],
            productUrl: `https://weddingease.ai/product-detail/${d.id}`,
        };
    });
}
// Format products as a context block injected into the Stylist system prompt
function formatProductsContext(products) {
    if (products.length === 0)
        return '';
    const lines = products.map(p => `- [${p.name}](${p.productUrl}) by ${p.vendor} — ${p.currency} ${p.price.toLocaleString()}`);
    return `\n\nAvailable products from WeddingEase catalogue:\n${lines.join('\n')}\n\nIMPORTANT: Only recommend products from the list above. Use the exact links provided. Never invent or hallucinate product links.`;
}
//# sourceMappingURL=products.js.map
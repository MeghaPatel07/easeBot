// ============================================================
// EaseBot – Wedding AI Chatbot UI (ChatGPT/Gemini Style)
// Paste this into Figma Scripter Plugin or Dev Console
// ============================================================

async function buildEaseBotUI() {
  const page = figma.currentPage;
  page.name = "EaseBot – Chat Interface";

  // Load fonts
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });
  await figma.loadFontAsync({ family: "Inter", style: "Medium" });
  await figma.loadFontAsync({ family: "Inter", style: "Light" });

  // ============================
  // COLOR TOKENS
  // ============================
  const C = {
    bgDeep:    { r: 0.075, g: 0.035, b: 0.05 },
    bgSidebar: { r: 0.055, g: 0.025, b: 0.035 },
    bgCard:    { r: 0.10,  g: 0.055, b: 0.07 },
    bgInput:   { r: 0.11,  g: 0.06,  b: 0.075 },
    bgHover:   { r: 0.14,  g: 0.08,  b: 0.10 },
    bgBot:     { r: 0.13,  g: 0.07,  b: 0.09 },
    border:    { r: 0.20,  g: 0.12,  b: 0.15 },
    borderSoft:{ r: 0.18,  g: 0.10,  b: 0.13 },
    gold:      { r: 0.78,  g: 0.58,  b: 0.29 },
    goldDark:  { r: 0.65,  g: 0.45,  b: 0.20 },
    textH:     { r: 0.92,  g: 0.86,  b: 0.80 },
    textP:     { r: 0.80,  g: 0.74,  b: 0.68 },
    textMuted: { r: 0.55,  g: 0.46,  b: 0.42 },
    textDim:   { r: 0.42,  g: 0.35,  b: 0.32 },
    textLabel: { r: 0.45,  g: 0.36,  b: 0.33 },
    green:     { r: 0.30,  g: 0.78,  b: 0.42 },
    dark:      { r: 0.10,  g: 0.05,  b: 0.05 },
  };

  // ============================
  // HELPERS
  // ============================
  function solid(color, opacity) {
    const fill = { type: "SOLID", color };
    if (opacity !== undefined) fill.opacity = opacity;
    return [fill];
  }

  function goldGradient() {
    return [{
      type: "GRADIENT_LINEAR",
      gradientStops: [
        { position: 0, color: { ...C.gold, a: 1 } },
        { position: 1, color: { ...C.goldDark, a: 1 } }
      ],
      gradientTransform: [[1, 0, 0], [0, 1, 0]]
    }];
  }

  function shadow(y, radius, alpha) {
    return [{
      type: "DROP_SHADOW",
      color: { r: 0, g: 0, b: 0, a: alpha || 0.25 },
      offset: { x: 0, y: y },
      radius: radius,
      visible: true,
      blendMode: "NORMAL",
      spread: 0
    }];
  }

  function text(chars, opts = {}) {
    const t = figma.createText();
    t.fontName = { family: "Inter", style: opts.style || "Regular" };
    t.characters = chars;
    t.fontSize = opts.size || 14;
    t.fills = solid(opts.color || C.textP);
    if (opts.x !== undefined) t.x = opts.x;
    if (opts.y !== undefined) t.y = opts.y;
    if (opts.lineHeight) t.lineHeight = { value: opts.lineHeight, unit: "PIXELS" };
    if (opts.letterSpacing) t.letterSpacing = { value: opts.letterSpacing, unit: "PIXELS" };
    return t;
  }

  function frame(name, w, h, opts = {}) {
    const f = figma.createFrame();
    f.name = name;
    f.resize(w, h);
    if (opts.fill) f.fills = solid(opts.fill);
    else if (opts.fills) f.fills = opts.fills;
    else f.fills = [];
    if (opts.radius) f.cornerRadius = opts.radius;
    if (opts.stroke) {
      f.strokes = solid(opts.stroke);
      f.strokeWeight = opts.strokeWeight || 1;
    }
    if (opts.x !== undefined) f.x = opts.x;
    if (opts.y !== undefined) f.y = opts.y;
    if (opts.shadow) f.effects = opts.shadow;
    return f;
  }

  function line(w, color) {
    const r = figma.createRectangle();
    r.resize(w, 1);
    r.fills = solid(color || C.borderSoft);
    return r;
  }

  function circle(size, opts = {}) {
    const e = figma.createEllipse();
    e.resize(size, size);
    if (opts.fill) e.fills = solid(opts.fill);
    else if (opts.fills) e.fills = opts.fills;
    else e.fills = [];
    if (opts.stroke) {
      e.strokes = solid(opts.stroke);
      e.strokeWeight = opts.strokeWeight || 1;
    }
    if (opts.x !== undefined) e.x = opts.x;
    if (opts.y !== undefined) e.y = opts.y;
    return e;
  }

  // ============================
  // BUILD SIDEBAR (shared)
  // ============================
  function buildSidebar(parent, activeIndex) {
    const sb = frame("Sidebar", 260, 900, { fill: C.bgSidebar, x: 0, y: 0 });
    parent.appendChild(sb);

    // Border
    const bdr = line(1, C.borderSoft);
    bdr.resize(1, 900);
    bdr.x = 259; bdr.y = 0;
    sb.appendChild(bdr);

    // Sidebar toggle + Logo
    const logoRow = frame("Logo Row", 228, 32, { x: 16, y: 18 });
    sb.appendChild(logoRow);
    const hamburger = text("☰", { size: 18, color: C.textMuted, x: 0, y: 4, style: "Regular" });
    logoRow.appendChild(hamburger);
    const logo = text("EaseBot", { size: 20, color: C.gold, x: 34, y: 2, style: "Bold" });
    logoRow.appendChild(logo);
    const sparkle = text("✦", { size: 12, color: C.gold, x: 28, y: 0, style: "Regular" });
    logoRow.appendChild(sparkle);

    // New Chat Button
    const newChatBtn = frame("New Chat", 228, 46, {
      fill: C.bgCard, radius: 12, stroke: C.border,
      x: 16, y: 64
    });
    sb.appendChild(newChatBtn);
    const plusIcon = text("+", { size: 20, color: C.gold, x: 16, y: 9, style: "Medium" });
    newChatBtn.appendChild(plusIcon);
    const newChatLabel = text("New Chat", { size: 14, color: C.textP, x: 42, y: 13, style: "Medium" });
    newChatBtn.appendChild(newChatLabel);

    // Search
    const search = frame("Search", 228, 38, {
      fill: C.bgInput, radius: 10, stroke: C.borderSoft,
      x: 16, y: 124
    });
    sb.appendChild(search);
    const searchT = text("🔍  Search chats...", { size: 12, color: C.textDim, x: 12, y: 10 });
    search.appendChild(searchT);

    // Today label
    const todayL = text("Today", { size: 11, color: C.textLabel, x: 20, y: 182, style: "Semi Bold" });
    sb.appendChild(todayL);

    // Chat history
    const allChats = [
      { title: "Beach Wedding – Goa", group: "today" },
      { title: "Budget Breakdown ₹25L", group: "today" },
      { title: "Lehenga Style Ideas", group: "today" },
      { title: "Guest List – 150 Pax", group: "prev" },
      { title: "Mehendi Artist Shortlist", group: "prev" },
      { title: "Catering Menu Options", group: "prev" },
      { title: "Wedding Timeline Draft", group: "prev" },
      { title: "Venue Comparison Table", group: "prev" },
      { title: "Sangeet Music Playlist", group: "older" },
      { title: "Invitation Card Design", group: "older" },
    ];

    let yPos = 202;
    let prevGroup = "today";

    for (let i = 0; i < allChats.length; i++) {
      // Group headers
      if (allChats[i].group !== prevGroup) {
        yPos += 10;
        const label = allChats[i].group === "prev" ? "Previous 7 Days" : "30 Days";
        const groupLabel = text(label, { size: 11, color: C.textLabel, x: 20, y: yPos, style: "Semi Bold" });
        sb.appendChild(groupLabel);
        yPos += 24;
        prevGroup = allChats[i].group;
      }

      const isActive = i === activeIndex;
      const item = frame(`Chat – ${allChats[i].title}`, 228, 38, {
        fill: isActive ? C.bgHover : { r: 0, g: 0, b: 0 },
        radius: 8, x: 16, y: yPos
      });
      if (isActive) {
        item.strokes = solid(C.gold);
        item.strokeWeight = 1;
        item.opacity = 1;
      }
      sb.appendChild(item);

      const itemT = text(allChats[i].title, {
        size: 13,
        color: isActive ? C.textH : C.textMuted,
        x: 14, y: 10,
        style: isActive ? "Medium" : "Regular"
      });
      item.appendChild(itemT);

      // Three dot menu on active
      if (isActive) {
        const dots = text("•••", { size: 12, color: C.textDim, x: 200, y: 8, style: "Bold" });
        item.appendChild(dots);
      }

      yPos += 42;
    }

    // ---- Bottom Section ----
    // Divider
    const bottomDiv = line(228, C.borderSoft);
    bottomDiv.x = 16; bottomDiv.y = 770;
    sb.appendChild(bottomDiv);

    // Quick links
    const links = ["⚙️  Settings", "🌐  Language: English", "❓  Help & FAQ"];
    for (let i = 0; i < links.length; i++) {
      const lnk = text(links[i], { size: 12, color: C.textMuted, x: 24, y: 786 + i * 26 });
      sb.appendChild(lnk);
    }

    // User profile
    const profArea = frame("User Profile", 260, 56, {
      fill: { r: 0.06, g: 0.03, b: 0.04 },
      x: 0, y: 844
    });
    sb.appendChild(profArea);
    const profBorder = line(260, C.borderSoft);
    profBorder.x = 0; profBorder.y = 0;
    profArea.appendChild(profBorder);

    const av = circle(34, { fill: C.gold, x: 16, y: 12 });
    profArea.appendChild(av);
    const avInit = text("K", { size: 14, color: C.dark, x: 28, y: 20, style: "Bold" });
    profArea.appendChild(avInit);
    const profName = text("Krish & Megha", { size: 13, color: C.textP, x: 60, y: 10, style: "Medium" });
    profArea.appendChild(profName);
    const profPlan = text("Premium  ✦", { size: 11, color: C.gold, x: 60, y: 30, style: "Regular" });
    profArea.appendChild(profPlan);
    const settingsGear = text("⚙", { size: 16, color: C.textMuted, x: 224, y: 18 });
    profArea.appendChild(settingsGear);

    return sb;
  }

  // ============================
  // BUILD TOP BAR (shared)
  // ============================
  function buildTopBar(parent, modeName) {
    const topBar = frame("Top Bar", 1180, 56, { fill: C.bgDeep, x: 0, y: 0 });
    parent.appendChild(topBar);

    const bdr = line(1180, C.borderSoft);
    bdr.x = 0; bdr.y = 55;
    topBar.appendChild(bdr);

    // Mode selector (like ChatGPT model picker)
    const picker = frame("Mode Selector", 200, 38, {
      fill: C.bgInput, radius: 10, x: 24, y: 9
    });
    topBar.appendChild(picker);

    const sparkle = text("✦", { size: 14, color: C.gold, x: 14, y: 9, style: "Bold" });
    picker.appendChild(sparkle);
    const modeT = text(`EaseBot  ${modeName}`, { size: 14, color: C.textH, x: 34, y: 10, style: "Semi Bold" });
    picker.appendChild(modeT);
    const arrow = text("▾", { size: 14, color: C.textMuted, x: 178, y: 10 });
    picker.appendChild(arrow);

    // Right side icons
    const shareBtn = frame("Share", 80, 34, {
      radius: 8, stroke: C.borderSoft, x: 1000, y: 11
    });
    topBar.appendChild(shareBtn);
    const shareT = text("↗ Share", { size: 13, color: C.textMuted, x: 14, y: 8, style: "Medium" });
    shareBtn.appendChild(shareT);

    const partnerBtn = frame("Partner", 110, 34, {
      radius: 8, stroke: C.border, x: 1050, y: 11
    });
    topBar.appendChild(partnerBtn);
    const partnerT = text("👫 Invite Partner", { size: 12, color: C.gold, x: 10, y: 8, style: "Medium" });
    partnerBtn.appendChild(partnerT);

    return topBar;
  }

  // ============================
  // BUILD INPUT BAR (shared)
  // ============================
  function buildInputBar(parent, yPos) {
    const container = frame("Input Container", 760, 56, {
      fill: C.bgInput, radius: 28, stroke: C.border,
      x: 210, y: yPos,
      shadow: shadow(4, 24, 0.3)
    });
    parent.appendChild(container);

    // Placeholder text
    const placeholder = text("Ask EaseBot anything about your wedding...", {
      size: 15, color: C.textDim, x: 24, y: 18
    });
    container.appendChild(placeholder);

    // Attach
    const attach = text("📎", { size: 18, color: C.textMuted, x: 610, y: 15 });
    container.appendChild(attach);

    // Image
    const imgIcon = text("🖼", { size: 16, color: C.textMuted, x: 640, y: 16 });
    container.appendChild(imgIcon);

    // Mic
    const mic = circle(34, { stroke: C.textDim, x: 666, y: 11 });
    container.appendChild(mic);
    const micIcon = text("🎙", { size: 15, x: 675, y: 17 });
    container.appendChild(micIcon);

    // Send
    const sendBg = circle(38, { x: 710, y: 9 });
    sendBg.fills = goldGradient();
    container.appendChild(sendBg);
    const sendArrow = text("↑", { size: 22, color: C.dark, x: 722, y: 14, style: "Bold" });
    container.appendChild(sendArrow);

    // Tool pills below input
    const tools = ["🖼️ Image Gen", "📊 Budget", "📅 Timeline", "🌐 Translate", "🎙️ Voice"];
    for (let i = 0; i < tools.length; i++) {
      const pill = frame(`Tool – ${tools[i]}`, 108, 30, {
        fill: C.bgCard, radius: 15, stroke: C.borderSoft,
        x: 195 + i * 120, y: yPos + 66
      });
      parent.appendChild(pill);
      const pillT = text(tools[i], { size: 11, color: C.textMuted, x: 10, y: 7, style: "Medium" });
      pill.appendChild(pillT);
    }

    // Disclaimer
    const disc = text("EaseBot can make mistakes. Always verify details with your vendors.", {
      size: 11, color: { r: 0.32, g: 0.26, b: 0.24 },
      x: 310, y: yPos + 104
    });
    parent.appendChild(disc);

    return container;
  }


  // ╔══════════════════════════════════════════════════════════╗
  // ║  SCREEN 1 — EMPTY STATE (Welcome / New Chat)           ║
  // ╚══════════════════════════════════════════════════════════╝

  const screen1 = frame("1 – Empty State", 1440, 900, { fill: C.bgDeep, x: 0, y: 0 });

  // Sidebar
  buildSidebar(screen1, -1);

  // Chat area
  const chat1 = frame("Chat Area", 1180, 900, { fill: C.bgDeep, x: 260, y: 0 });
  screen1.appendChild(chat1);

  // Top bar
  buildTopBar(chat1, "Auto");

  // Welcome illustration area
  const welcomeIcon = text("✦", { size: 64, color: C.gold, x: 558, y: 180, style: "Bold" });
  welcomeIcon.opacity = 0.3;
  chat1.appendChild(welcomeIcon);

  // Greeting
  const greet = text("Good evening, Krish", { size: 34, color: C.textH, x: 380, y: 270, style: "Light" });
  chat1.appendChild(greet);
  const greetSub = text("How can I help with your wedding planning today?", {
    size: 16, color: C.textMuted, x: 380, y: 318
  });
  chat1.appendChild(greetSub);

  // Suggestion cards (2x2 grid like Gemini)
  const suggestions = [
    { icon: "📍", title: "Find Venues", desc: "Search venues in Goa, Udaipur,\nJaipur by budget & capacity" },
    { icon: "💰", title: "Plan Budget", desc: "Create a detailed breakdown\nfor your ₹25L wedding budget" },
    { icon: "👗", title: "Style & Outfits", desc: "Browse lehenga, sherwani\nand decoration inspirations" },
    { icon: "📋", title: "Build Checklist", desc: "Generate a month-by-month\nwedding planning timeline" },
  ];

  for (let i = 0; i < suggestions.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const card = frame(`Suggestion – ${suggestions[i].title}`, 340, 100, {
      fill: C.bgCard, radius: 16, stroke: C.border,
      x: 235 + col * 360, y: 380 + row * 120
    });
    chat1.appendChild(card);

    const cIcon = text(suggestions[i].icon, { size: 24, x: 20, y: 18 });
    card.appendChild(cIcon);
    const cTitle = text(suggestions[i].title, { size: 15, color: C.textH, x: 56, y: 20, style: "Semi Bold" });
    card.appendChild(cTitle);
    const cDesc = text(suggestions[i].desc, {
      size: 12, color: C.textMuted, x: 20, y: 56, lineHeight: 18
    });
    card.appendChild(cDesc);

    // Hover arrow
    const hArrow = text("→", { size: 16, color: C.textDim, x: 304, y: 20, style: "Medium" });
    card.appendChild(hArrow);
  }

  // Input bar
  buildInputBar(chat1, 660);


  // ╔══════════════════════════════════════════════════════════╗
  // ║  SCREEN 2 — ACTIVE CHAT (Conversation in progress)     ║
  // ╚══════════════════════════════════════════════════════════╝

  const screen2 = frame("2 – Active Chat", 1440, 900, { fill: C.bgDeep, x: 1600, y: 0 });

  // Sidebar
  buildSidebar(screen2, 0);

  // Chat area
  const chat2 = frame("Chat Area", 1180, 900, { fill: C.bgDeep, x: 260, y: 0 });
  screen2.appendChild(chat2);

  // Top bar
  buildTopBar(chat2, "Planner");

  // ---- MESSAGES ----

  // User Message 1
  const user1 = frame("User Msg 1", 520, 52, {
    radius: 20, x: 580, y: 80,
    fills: goldGradient()
  });
  chat2.appendChild(user1);
  // Round the top-right corner less for chat bubble feel
  user1.topLeftRadius = 20;
  user1.topRightRadius = 6;
  user1.bottomLeftRadius = 20;
  user1.bottomRightRadius = 20;

  const user1T = text("We want a beach wedding in Goa for 150 guests, budget ₹25L 🏖️", {
    size: 14, color: C.dark, x: 20, y: 16, style: "Medium"
  });
  user1.appendChild(user1T);

  const user1Time = text("7:42 PM", { size: 10, color: { r: 0.5, g: 0.35, b: 0.15 }, x: 1038, y: 68 });
  chat2.appendChild(user1Time);

  // Bot Message 1 — Structured response card
  // Bot avatar
  const botAv1 = circle(32, { fill: C.bgCard, x: 40, y: 100 });
  chat2.appendChild(botAv1);
  const botAvT1 = text("✦", { size: 16, color: C.gold, x: 49, y: 106, style: "Bold" });
  chat2.appendChild(botAvT1);

  const bot1 = frame("Bot Msg 1", 620, 310, {
    fill: C.bgBot, radius: 20, x: 82, y: 100
  });
  bot1.topLeftRadius = 6;
  bot1.topRightRadius = 20;
  bot1.bottomLeftRadius = 20;
  bot1.bottomRightRadius = 20;
  chat2.appendChild(bot1);

  const bot1Title = text("🏖️  Beach Wedding Plan — Goa", {
    size: 16, color: C.gold, x: 20, y: 18, style: "Semi Bold"
  });
  bot1.appendChild(bot1Title);

  const bot1Divider = line(580, C.border);
  bot1Divider.x = 20; bot1Divider.y = 48;
  bot1.appendChild(bot1Divider);

  const bot1Body = text(
    "Here's a curated plan for your Goa beach wedding:\n\n" +
    "📍  Top Venues\n" +
    "     W Goa  •  Cidade de Goa  •  Planet Hollywood\n\n" +
    "💰  Budget Split (₹25,00,000)\n" +
    "     Venue ₹8L  •  Catering ₹5L  •  Decor ₹4L  •  Others ₹8L\n\n" +
    "📅  Best Months: October – February\n" +
    "👥  150 Guests  •  Accommodation options available\n" +
    "🎵  Mehendi + Sangeet + Reception (3-day affair)",
    { size: 13, color: C.textP, x: 20, y: 60, lineHeight: 22 }
  );
  bot1.appendChild(bot1Body);

  // Action buttons in bot message
  const actions1 = ["📍 View Venues", "💰 Budget Details", "📅 Timeline", "📸 Inspiration"];
  for (let i = 0; i < actions1.length; i++) {
    const aBtn = frame(`Action – ${actions1[i]}`, 132, 34, {
      radius: 17, stroke: C.gold,
      x: 20 + i * 146, y: 268
    });
    bot1.appendChild(aBtn);
    const aBtnT = text(actions1[i], { size: 12, color: C.gold, x: 14, y: 8, style: "Medium" });
    aBtn.appendChild(aBtnT);
  }

  const bot1Time = text("7:42 PM  •  Planner Mode", { size: 10, color: C.textDim, x: 82, y: 418 });
  chat2.appendChild(bot1Time);

  // User Message 2
  const user2 = frame("User Msg 2", 360, 46, {
    radius: 20, x: 740, y: 445,
    fills: goldGradient()
  });
  user2.topRightRadius = 6;
  chat2.appendChild(user2);

  const user2T = text("Show me the budget breakdown in detail 💰", {
    size: 14, color: C.dark, x: 20, y: 14, style: "Medium"
  });
  user2.appendChild(user2T);

  // Bot Message 2 — Budget breakdown with visual bars
  const botAv2 = circle(32, { fill: C.bgCard, x: 40, y: 510 });
  chat2.appendChild(botAv2);
  const botAvT2 = text("✦", { size: 16, color: C.gold, x: 49, y: 516, style: "Bold" });
  chat2.appendChild(botAvT2);

  const bot2 = frame("Bot Msg 2 – Budget", 620, 230, {
    fill: C.bgBot, radius: 20, x: 82, y: 510
  });
  bot2.topLeftRadius = 6;
  chat2.appendChild(bot2);

  const bot2Title = text("💰  Wedding Budget — ₹25,00,000", {
    size: 15, color: C.gold, x: 20, y: 16, style: "Semi Bold"
  });
  bot2.appendChild(bot2Title);

  const bot2Div = line(580, C.border);
  bot2Div.x = 20; bot2Div.y = 44;
  bot2.appendChild(bot2Div);

  // Budget bars
  const budgetItems = [
    { label: "Venue & Hospitality", amount: "₹8,00,000", pct: 0.32, pctLabel: "32%" },
    { label: "Catering & Bar", amount: "₹5,00,000", pct: 0.20, pctLabel: "20%" },
    { label: "Decoration & Flowers", amount: "₹4,00,000", pct: 0.16, pctLabel: "16%" },
    { label: "Photography & Video", amount: "₹3,00,000", pct: 0.12, pctLabel: "12%" },
    { label: "Outfits & Jewellery", amount: "₹3,00,000", pct: 0.12, pctLabel: "12%" },
    { label: "Music & Entertainment", amount: "₹2,00,000", pct: 0.08, pctLabel: "8%" },
  ];

  for (let i = 0; i < budgetItems.length; i++) {
    const yBase = 58 + i * 28;

    const bLabel = text(budgetItems[i].label, { size: 12, color: C.textP, x: 20, y: yBase, style: "Regular" });
    bot2.appendChild(bLabel);

    const bAmt = text(budgetItems[i].amount, { size: 12, color: C.textH, x: 440, y: yBase, style: "Semi Bold" });
    bot2.appendChild(bAmt);

    const bPct = text(budgetItems[i].pctLabel, { size: 11, color: C.textMuted, x: 550, y: yBase, style: "Regular" });
    bot2.appendChild(bPct);

    // Progress bar background
    const barBg = figma.createRectangle();
    barBg.resize(200, 4);
    barBg.cornerRadius = 2;
    barBg.fills = solid(C.border);
    barBg.x = 220; barBg.y = yBase + 7;
    bot2.appendChild(barBg);

    // Progress bar fill
    const barFill = figma.createRectangle();
    barFill.resize(Math.round(200 * budgetItems[i].pct), 4);
    barFill.cornerRadius = 2;
    barFill.fills = goldGradient();
    barFill.x = 220; barFill.y = yBase + 7;
    bot2.appendChild(barFill);
  }

  // Input bar
  buildInputBar(chat2, 780);


  // ╔══════════════════════════════════════════════════════════╗
  // ║  SCREEN 3 — MODE SELECTOR DROPDOWN                     ║
  // ╚══════════════════════════════════════════════════════════╝

  const screen3 = frame("3 – Mode Dropdown Open", 1440, 900, { fill: C.bgDeep, x: 3200, y: 0 });

  buildSidebar(screen3, 0);

  const chat3 = frame("Chat Area", 1180, 900, { fill: C.bgDeep, x: 260, y: 0 });
  screen3.appendChild(chat3);

  buildTopBar(chat3, "Auto");

  // Dropdown panel
  const dropdown = frame("Mode Dropdown", 320, 340, {
    fill: C.bgCard, radius: 16, stroke: C.border,
    x: 24, y: 56,
    shadow: shadow(8, 32, 0.4)
  });
  chat3.appendChild(dropdown);

  const ddTitle = text("Choose AI Mode", { size: 13, color: C.textMuted, x: 20, y: 16, style: "Semi Bold" });
  dropdown.appendChild(ddTitle);

  const ddDiv = line(280, C.borderSoft);
  ddDiv.x = 20; ddDiv.y = 42;
  dropdown.appendChild(ddDiv);

  const modes = [
    { icon: "🤖", name: "Auto", desc: "Automatically picks the best mode\nfor your question", active: true },
    { icon: "📋", name: "Planner", desc: "Timelines, checklists, vendor\ncoordination & task management", active: false },
    { icon: "👗", name: "Stylist", desc: "Outfit advice, decoration themes,\ncolor palettes & aesthetics", active: false },
    { icon: "📚", name: "Knowledge", desc: "Wedding etiquette, traditions,\ncustoms & cultural guidance", active: false },
  ];

  for (let i = 0; i < modes.length; i++) {
    const modeItem = frame(`Mode – ${modes[i].name}`, 288, 62, {
      fill: modes[i].active ? C.bgHover : { r: 0, g: 0, b: 0 },
      radius: 10,
      x: 16, y: 54 + i * 70
    });
    if (modes[i].active) {
      modeItem.strokes = solid(C.gold);
      modeItem.strokeWeight = 1;
    }
    dropdown.appendChild(modeItem);

    const mIcon = text(modes[i].icon, { size: 22, x: 14, y: 10 });
    modeItem.appendChild(mIcon);
    const mName = text(modes[i].name, {
      size: 14, color: modes[i].active ? C.gold : C.textH,
      x: 48, y: 8, style: "Semi Bold"
    });
    modeItem.appendChild(mName);
    const mDesc = text(modes[i].desc, {
      size: 11, color: C.textMuted, x: 48, y: 28, lineHeight: 16
    });
    modeItem.appendChild(mDesc);

    if (modes[i].active) {
      const check = text("✓", { size: 16, color: C.gold, x: 260, y: 10, style: "Bold" });
      modeItem.appendChild(check);
    }
  }

  // Grayed-out chat content behind dropdown
  const greetFaded = text("Good evening, Krish", { size: 34, color: C.textH, x: 380, y: 270, style: "Light" });
  greetFaded.opacity = 0.3;
  chat3.appendChild(greetFaded);

  buildInputBar(chat3, 660);


  // ╔══════════════════════════════════════════════════════════╗
  // ║  SCREEN 4 — STYLIST MODE (Image Gallery Response)      ║
  // ╚══════════════════════════════════════════════════════════╝

  const screen4 = frame("4 – Stylist Gallery", 1440, 900, { fill: C.bgDeep, x: 4800, y: 0 });

  buildSidebar(screen4, 2);

  const chat4 = frame("Chat Area", 1180, 900, { fill: C.bgDeep, x: 260, y: 0 });
  screen4.appendChild(chat4);
  buildTopBar(chat4, "Stylist");

  // User message
  const user4 = frame("User Msg", 380, 46, {
    radius: 20, x: 720, y: 80,
    fills: goldGradient()
  });
  user4.topRightRadius = 6;
  chat4.appendChild(user4);
  const user4T = text("Show me trending lehenga styles for 2026 👗", {
    size: 14, color: C.dark, x: 20, y: 14, style: "Medium"
  });
  user4.appendChild(user4T);

  // Bot avatar
  const botAv4 = circle(32, { fill: C.bgCard, x: 40, y: 150 });
  chat4.appendChild(botAv4);
  const botAvT4 = text("✦", { size: 16, color: C.gold, x: 49, y: 156, style: "Bold" });
  chat4.appendChild(botAvT4);

  // Bot response with image grid
  const bot4 = frame("Bot – Stylist", 640, 520, {
    fill: C.bgBot, radius: 20, x: 82, y: 150
  });
  bot4.topLeftRadius = 6;
  chat4.appendChild(bot4);

  const bot4Title = text("👗  Trending Lehenga Styles — 2026", {
    size: 16, color: C.gold, x: 20, y: 18, style: "Semi Bold"
  });
  bot4.appendChild(bot4Title);

  const bot4Desc = text("Here are the top 4 trending styles this wedding season:", {
    size: 13, color: C.textMuted, x: 20, y: 46
  });
  bot4.appendChild(bot4Desc);

  // Image grid (2x2 placeholder cards)
  const styles = [
    { title: "Pastel Ombré", tag: "🔥 Trending" },
    { title: "Royal Velvet", tag: "✨ Classic" },
    { title: "Mirror Work", tag: "💫 Glamour" },
    { title: "Minimalist Silk", tag: "🤍 Elegant" },
  ];

  for (let i = 0; i < 4; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const imgCard = frame(`Style – ${styles[i].title}`, 290, 180, {
      fill: C.bgCard, radius: 14, stroke: C.borderSoft,
      x: 20 + col * 306, y: 74 + row * 196
    });
    bot4.appendChild(imgCard);

    // Image placeholder area
    const imgArea = figma.createRectangle();
    imgArea.resize(290, 130);
    imgArea.cornerRadius = 14;
    imgArea.fills = solid({ r: 0.18, g: 0.1, b: 0.13 });
    imgArea.x = 0; imgArea.y = 0;
    imgCard.appendChild(imgArea);

    // Camera icon placeholder
    const camIcon = text("📷", { size: 32, x: 125, y: 44 });
    camIcon.opacity = 0.3;
    imgCard.appendChild(camIcon);

    // Title & tag
    const sTitle = text(styles[i].title, { size: 13, color: C.textH, x: 12, y: 140, style: "Semi Bold" });
    imgCard.appendChild(sTitle);
    const sTag = text(styles[i].tag, { size: 11, color: C.gold, x: 12, y: 160 });
    imgCard.appendChild(sTag);

    // Heart/save button
    const heart = text("♡", { size: 16, color: C.gold, x: 262, y: 140, style: "Regular" });
    imgCard.appendChild(heart);
  }

  // Action row
  const bot4Actions = ["🛒 Add to List", "📌 Save All", "🔄 Show More"];
  for (let i = 0; i < bot4Actions.length; i++) {
    const aBtn = frame(`Action`, 120, 34, {
      radius: 17, stroke: C.gold,
      x: 20 + i * 135, y: 478
    });
    bot4.appendChild(aBtn);
    const aBtnT = text(bot4Actions[i], { size: 12, color: C.gold, x: 12, y: 8, style: "Medium" });
    aBtn.appendChild(aBtnT);
  }

  // Input
  buildInputBar(chat4, 700);


  // ╔══════════════════════════════════════════════════════════╗
  // ║  SCREEN 5 — MOBILE VIEW (390x844)                      ║
  // ╚══════════════════════════════════════════════════════════╝

  const screen5 = frame("5 – Mobile Chat", 390, 844, { fill: C.bgDeep, x: 6400, y: 0 });

  // Mobile top bar
  const mTopBar = frame("Mobile Top Bar", 390, 56, { fill: C.bgSidebar, x: 0, y: 0 });
  screen5.appendChild(mTopBar);

  const mHamburger = text("☰", { size: 20, color: C.textMuted, x: 16, y: 16 });
  mTopBar.appendChild(mHamburger);
  const mLogo = text("✦ EaseBot", { size: 18, color: C.gold, x: 50, y: 16, style: "Bold" });
  mTopBar.appendChild(mLogo);
  const mMode = frame("Mode Pill", 80, 28, { fill: C.bgInput, radius: 14, x: 170, y: 14 });
  mTopBar.appendChild(mMode);
  const mModeT = text("Auto ▾", { size: 12, color: C.textMuted, x: 16, y: 6, style: "Medium" });
  mMode.appendChild(mModeT);

  const mTopBdr = line(390, C.borderSoft);
  mTopBdr.x = 0; mTopBdr.y = 55;
  mTopBar.appendChild(mTopBdr);

  const mNewChat = text("+", { size: 22, color: C.gold, x: 355, y: 14, style: "Bold" });
  mTopBar.appendChild(mNewChat);

  // Mobile – user message
  const mUser = frame("User Msg", 280, 46, {
    radius: 20, x: 94, y: 80,
    fills: goldGradient()
  });
  mUser.topRightRadius = 6;
  screen5.appendChild(mUser);
  const mUserT = text("Best venues in Goa under ₹10L? 🏖️", {
    size: 13, color: C.dark, x: 16, y: 14, style: "Medium"
  });
  mUser.appendChild(mUserT);

  // Mobile – bot message
  const mBotAv = circle(28, { fill: C.bgCard, x: 12, y: 145 });
  screen5.appendChild(mBotAv);
  const mBotAvT = text("✦", { size: 14, color: C.gold, x: 19, y: 150, style: "Bold" });
  screen5.appendChild(mBotAvT);

  const mBot = frame("Bot Msg", 330, 300, {
    fill: C.bgBot, radius: 18, x: 48, y: 145
  });
  mBot.topLeftRadius = 6;
  screen5.appendChild(mBot);

  const mBotTitle = text("📍 Top Venues Under ₹10L", {
    size: 14, color: C.gold, x: 16, y: 14, style: "Semi Bold"
  });
  mBot.appendChild(mBotTitle);

  const mBotBody = text(
    "Here are 3 beautiful beach venues:\n\n" +
    "1. Cidade de Goa — ₹7.5L\n" +
    "   ★ 4.6 • 200 pax • Beachfront\n\n" +
    "2. Resort Rio — ₹6.8L\n" +
    "   ★ 4.4 • 150 pax • River view\n\n" +
    "3. Novotel Goa — ₹8.2L\n" +
    "   ★ 4.5 • 180 pax • Pool + Beach\n\n" +
    "Want me to compare these in detail?",
    { size: 12, color: C.textP, x: 16, y: 42, lineHeight: 19 }
  );
  mBot.appendChild(mBotBody);

  // Mobile action buttons
  const mActions = ["Compare", "Book Visit"];
  for (let i = 0; i < mActions.length; i++) {
    const mABtn = frame(`Action`, 100, 30, {
      radius: 15, stroke: C.gold,
      x: 16 + i * 112, y: 264
    });
    mBot.appendChild(mABtn);
    const mABtnT = text(mActions[i], { size: 11, color: C.gold, x: 16, y: 7, style: "Medium" });
    mABtn.appendChild(mABtnT);
  }

  // Mobile input bar
  const mInput = frame("Mobile Input", 362, 50, {
    fill: C.bgInput, radius: 25, stroke: C.border,
    x: 14, y: 770,
    shadow: shadow(4, 16, 0.3)
  });
  screen5.appendChild(mInput);

  const mPlaceholder = text("Ask anything...", { size: 14, color: C.textDim, x: 20, y: 15 });
  mInput.appendChild(mPlaceholder);
  const mMic = text("🎙", { size: 16, x: 285, y: 14 });
  mInput.appendChild(mMic);
  const mSend = circle(34, { x: 320, y: 8 });
  mSend.fills = goldGradient();
  mInput.appendChild(mSend);
  const mSendArrow = text("↑", { size: 20, color: C.dark, x: 330, y: 13, style: "Bold" });
  mInput.appendChild(mSendArrow);


  // ============================
  // ZOOM TO FIT
  // ============================
  figma.viewport.scrollAndZoomIntoView(page.children);

  figma.notify("✦ EaseBot UI — 5 screens created successfully!");
}

buildEaseBotUI();

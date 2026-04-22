// NOTE: The hex values in this file are intentional creative content (user-selectable vibe gradients),
// not theme chrome. The `accentColor`, `gradientFrom`, and `gradientTo` fields on each VibePreset
// define the visual identity of each user-selectable vibe — the gradient IS the product.
// They are excluded from the theme migration by scope. — Theme Migration Sprint F, 2026-04-20

import type { VibePreset } from '@/types'

export const VIBE_PRESETS: VibePreset[] = [
  // ── Themes ────────────────────────────────────────────────────────────────
  {
    id: 'pastel-mughal',
    title: 'Pastel Mughal',
    subtitle: 'Ivory arches, gold filigree, soft window light',
    category: 'theme',
    descriptors: ['Ivory', 'Gold', 'Damask', 'Mughal arches', 'Soft window light', 'Floral motifs', 'Ornamental'],
    description:
      'Styled as an ornate Mughal-inspired wedding: ivory and blush palette with antique gold filigree, damask textiles, carved marble jaalis and pointed Mughal arches, scattered rose petals and jasmine garlands, a soft diffused window-light key, and a refined editorial composition with gentle film grain.',
    accentColor: '#c9a26a',
    gradientFrom: '#f5e9d6',
    gradientTo: '#c9a26a',
  },
  {
    id: 'coastal-boho',
    title: 'Coastal Boho',
    subtitle: 'Driftwood, pampas, sunset gold',
    category: 'theme',
    descriptors: ['Beach', 'Driftwood', 'Macrame', 'Pampas grass', 'Sunset gold', 'Barefoot', 'Linen'],
    description:
      'A relaxed coastal boho wedding: bare-sand ceremony under a driftwood arch draped with flowing ivory linen and macrame, pampas grass and dried palm bouquets, warm sunset gold-hour backlight, lens flare, turquoise ocean on the horizon, barefoot guests, natural earthy tones.',
    accentColor: '#e8a87c',
    gradientFrom: '#fef3e7',
    gradientTo: '#e8a87c',
  },
  {
    id: 'royal-rajputana',
    title: 'Royal Rajputana',
    subtitle: 'Maroon brocade, marigold, palace heritage',
    category: 'theme',
    descriptors: ['Maroon', 'Gold', 'Brocade', 'Carved jharokhas', 'Marigold garlands', 'Heritage palace', 'Regal'],
    description:
      'A regal Rajputana palace wedding: maroon and deep-red brocade with rich zari gold embroidery, carved sandstone jharokhas and latticed windows, cascading marigold and rose garlands, bejewelled elephants and brass lamps, heritage Rajasthani palace courtyard, dramatic chiaroscuro lighting and opulent editorial framing.',
    accentColor: '#7a1a2b',
    gradientFrom: '#f3c3a4',
    gradientTo: '#7a1a2b',
  },
  {
    id: 'minimalist-modern',
    title: 'Minimalist Modern',
    subtitle: 'Clean lines, monochrome, architectural',
    category: 'theme',
    descriptors: ['Clean lines', 'Monochrome', 'Negative space', 'Architectural', 'Restrained', 'Scandinavian', 'Geometric'],
    description:
      'A minimalist modern wedding: strict architectural geometry, generous negative space, a restrained monochrome palette of ivory, stone and charcoal, matte concrete surfaces, sparse sculptural floral installations, clean even daylight, Scandinavian restraint and high-end editorial composition.',
    accentColor: '#1f2937',
    gradientFrom: '#f3f4f6',
    gradientTo: '#9ca3af',
  },
  {
    id: 'tropical-garden',
    title: 'Tropical Garden',
    subtitle: 'Lush greens, bird-of-paradise, sunlit',
    category: 'theme',
    descriptors: ['Lush greenery', 'Bird-of-paradise', 'Tropical florals', 'Rattan', 'Sunlit', 'Outdoor', 'Vibrant'],
    description:
      'A vibrant tropical garden wedding: dense emerald monstera and palm foliage, bird-of-paradise and heliconia accents, rattan and bamboo furnishings, warm dappled sunlight filtering through canopy leaves, saturated tropical colors, outdoor lawn setting, lush editorial destination-wedding look.',
    accentColor: '#2f7d4f',
    gradientFrom: '#d8f0d6',
    gradientTo: '#2f7d4f',
  },
  {
    id: 'vintage-bollywood',
    title: 'Vintage Bollywood',
    subtitle: 'Sepia 1970s, velvet, brass, dramatic',
    category: 'theme',
    descriptors: ['Sepia tones', '1970s glamour', 'Velvet', 'Brass', 'Old-Bombay nostalgia', 'Filmi', 'Dramatic lighting'],
    description:
      'A vintage 1970s Bollywood wedding scene: warm sepia and amber tones, plush velvet drapes, polished brass accents, retro filmi posters and chandeliers, old-Bombay bungalow interiors, dramatic theatrical rim lighting, soft film grain and cinematic nostalgic composition.',
    accentColor: '#8b5a2b',
    gradientFrom: '#f0d6b3',
    gradientTo: '#8b5a2b',
  },
  {
    id: 'modern-indo-western',
    title: 'Modern Indo-Western',
    subtitle: 'Pastel pinks, champagne, fairy lights',
    category: 'theme',
    descriptors: ['Pastel pinks', 'Champagne', 'Statement florals', 'Fairy lights', 'Contemporary', 'Eclectic', 'Refined'],
    description:
      'A refined modern Indo-Western wedding: blush pink and champagne palette, statement hanging floral installations with roses and orchids, cascading fairy-light canopies, contemporary lounge seating, soft warm ambient glow at dusk, elegant fusion styling and polished editorial photography.',
    accentColor: '#d49ab0',
    gradientFrom: '#fce4ec',
    gradientTo: '#d49ab0',
  },
  {
    id: 'forest-whimsy',
    title: 'Forest Whimsy',
    subtitle: 'Deep greens, wildflowers, lanterns',
    category: 'theme',
    descriptors: ['Deep greens', 'Burgundy', 'Wildflowers', 'Lanterns', 'Moss', 'Storybook', 'Ethereal'],
    description:
      'An ethereal forest whimsy wedding: deep mossy greens with burgundy accents, wildflower bouquets and trailing greenery, hanging glass lanterns among tall trees, forest-floor aisle strewn with petals, soft dappled golden-hour light through the canopy, storybook dreamlike mood.',
    accentColor: '#365e3c',
    gradientFrom: '#cfe5d0',
    gradientTo: '#365e3c',
  },
  {
    id: 'desert-sunset',
    title: 'Desert Sunset',
    subtitle: 'Terracotta dunes, ochre, warm wind',
    category: 'theme',
    descriptors: ['Terracotta', 'Ochre', 'Sand dunes', 'Warm wind', 'Caravan tents', 'Copper lanterns', 'Golden hour'],
    description:
      'A dramatic desert-sunset wedding: endless terracotta sand dunes under a fiery golden-hour sky, flowing cream and ochre Bedouin tents, low-slung cushions and copper lanterns, muted desert tones with warm backlight and long shadows, cinematic wide composition with soft haze.',
    accentColor: '#c4733b',
    gradientFrom: '#fbe6cc',
    gradientTo: '#c4733b',
  },
  {
    id: 'winter-snow',
    title: 'Winter Snow',
    subtitle: 'Frost, evergreen, candlelight',
    category: 'theme',
    descriptors: ['Snow', 'Frosted evergreens', 'Candlelight', 'Silver', 'Icy blue', 'Fur wraps', 'Cozy'],
    description:
      'A serene winter wedding: soft snowfall and frosted evergreen branches, a pale icy-blue and silver palette, warm candlelight and fairy lights glowing against the cold, fur wraps and wool textures, clear breath in crisp air, cozy cinematic editorial look with muted contrast.',
    accentColor: '#7aa0c4',
    gradientFrom: '#e8f0f8',
    gradientTo: '#7aa0c4',
  },

  // ── Attire ────────────────────────────────────────────────────────────────
  {
    id: 'bridal-lehenga',
    title: 'Bridal Lehenga',
    subtitle: 'Couture lehenga, intricate zari',
    category: 'attire',
    descriptors: ['Couture lehenga', 'Zari embroidery', 'Dupatta', 'Heavy jewellery', 'Studio portrait'],
    description:
      'A full-length editorial portrait of a bride in a couture Indian bridal lehenga: intricate zari and sequin embroidery, richly embellished blouse, flowing dupatta draped over the head, heavy kundan jewellery, soft studio key light with subtle rim, neutral backdrop, high-fashion magazine styling.',
    accentColor: '#b8365c',
    gradientFrom: '#ffd9e3',
    gradientTo: '#b8365c',
  },
  {
    id: 'bridal-saree',
    title: 'Bridal Saree',
    subtitle: 'Banarasi silk, gold borders',
    category: 'attire',
    descriptors: ['Banarasi silk', 'Kanjivaram', 'Gold zari border', 'Temple jewellery', 'Traditional'],
    description:
      'An editorial portrait of a bride in a traditional South-Indian bridal saree: rich Kanjivaram or Banarasi silk with heavy gold zari borders, temple jewellery including long haaram necklace and jhumkas, jasmine gajra in the hair, warm golden lighting, classical composition.',
    accentColor: '#b5251f',
    gradientFrom: '#ffe1c9',
    gradientTo: '#b5251f',
  },
  {
    id: 'groom-sherwani',
    title: 'Groom Sherwani',
    subtitle: 'Regal sherwani, safa turban',
    category: 'attire',
    descriptors: ['Sherwani', 'Safa turban', 'Embroidered jutti', 'Pocket square', 'Regal'],
    description:
      'A full-length editorial portrait of a groom in an ornate Indian wedding sherwani: richly embroidered ivory or deep-jewel-tone sherwani, matching safa turban with kalgi pin, stole draped across one shoulder, embroidered juttis, confident pose, soft studio lighting, high-fashion composition.',
    accentColor: '#5a4632',
    gradientFrom: '#e8dcc6',
    gradientTo: '#5a4632',
  },
  {
    id: 'white-gown',
    title: 'White Wedding Gown',
    subtitle: 'A-line lace, cathedral veil',
    category: 'attire',
    descriptors: ['White gown', 'Lace', 'Cathedral veil', 'A-line', 'Elegant'],
    description:
      'A full-length editorial portrait of a bride in a classic white wedding gown: fitted lace bodice, A-line silhouette with a long cathedral-length veil, delicate bouquet of roses and eucalyptus, soft natural window light, timeless elegant styling, minimalist backdrop.',
    accentColor: '#dcc8b3',
    gradientFrom: '#fbf7f1',
    gradientTo: '#dcc8b3',
  },
  {
    id: 'mehendi-outfit',
    title: 'Mehendi Outfit',
    subtitle: 'Yellow, mirror work, carefree',
    category: 'attire',
    descriptors: ['Yellow', 'Mirror work', 'Gota patti', 'Floral jewellery', 'Playful'],
    description:
      'A vibrant mehendi ceremony portrait: bride in a bright yellow or leaf-green gota-patti lehenga with mirror-work embroidery, floral jewellery made of marigolds and jasmine, intricate henna on the hands, playful candid mood, sunlit outdoor setting with swings and marigold strings.',
    accentColor: '#e2b23a',
    gradientFrom: '#fff3c4',
    gradientTo: '#e2b23a',
  },

  // ── Venue ─────────────────────────────────────────────────────────────────
  {
    id: 'palace-venue',
    title: 'Palace Venue',
    subtitle: 'Heritage fort courtyard',
    category: 'venue',
    descriptors: ['Heritage palace', 'Sandstone', 'Courtyard', 'Arches', 'Chandeliers'],
    description:
      'A sweeping wide-angle shot of a heritage Indian palace wedding venue: sandstone fortress walls, grand central courtyard, scalloped arches and carved domes, enormous crystal chandeliers, long ceremonial walkway lined with florals and torches, dramatic dusk sky, cinematic destination-wedding photography.',
    accentColor: '#b5823b',
    gradientFrom: '#f4dfc2',
    gradientTo: '#b5823b',
  },
  {
    id: 'beach-venue',
    title: 'Beach Venue',
    subtitle: 'Ocean aisle, palm canopy',
    category: 'venue',
    descriptors: ['Beach', 'Ocean backdrop', 'Palm canopy', 'Sand aisle', 'Sunset'],
    description:
      'A dreamy tropical beach wedding venue: white-sand aisle lined with palm fronds leading to a floral arch by the ocean, turquoise water and soft waves in the background, tiki torches, palm-leaf canopy, sunset gold-hour lighting, wide cinematic destination-wedding composition.',
    accentColor: '#4dabb5',
    gradientFrom: '#d6f1f4',
    gradientTo: '#4dabb5',
  },
  {
    id: 'garden-venue',
    title: 'Garden Venue',
    subtitle: 'Flower arch, fairy lights',
    category: 'venue',
    descriptors: ['Garden', 'Floral arch', 'Lawn', 'Fairy lights', 'Outdoor'],
    description:
      'An elegant outdoor garden wedding venue: manicured lawn with rows of white chiavari chairs, a lush floral arch of roses, peonies and greenery at the altar, strings of warm fairy lights overhead, golden-hour backlight through trees, romantic editorial composition.',
    accentColor: '#6aa05e',
    gradientFrom: '#e4f2dc',
    gradientTo: '#6aa05e',
  },
  {
    id: 'ballroom-venue',
    title: 'Ballroom Venue',
    subtitle: 'Crystal chandeliers, tall florals',
    category: 'venue',
    descriptors: ['Ballroom', 'Chandeliers', 'Tall centerpieces', 'Draping', 'Opulent'],
    description:
      'An opulent grand ballroom wedding venue: crystal chandeliers cascading from a high ceiling, long banquet tables with towering floral centerpieces of roses and hydrangeas, champagne and ivory draping along walls, dramatic uplighting, mirrored dance floor, luxury editorial banquet photography.',
    accentColor: '#a48251',
    gradientFrom: '#f3e7d0',
    gradientTo: '#a48251',
  },

  // ── Decor ─────────────────────────────────────────────────────────────────
  {
    id: 'mandap',
    title: 'Mandap',
    subtitle: 'Floral canopy, sacred fire',
    category: 'decor',
    descriptors: ['Mandap', 'Floral canopy', 'Four pillars', 'Sacred fire', 'Ornate'],
    description:
      'A close-up of an ornate Indian wedding mandap: four pillars wrapped in marigolds, roses and jasmine, draped cascading florals forming the canopy, brass lamps and diyas along the base, sacred agni fire pit in the center, ornamental brass accents, warm golden evening glow, rich saturated colors.',
    accentColor: '#d26a3a',
    gradientFrom: '#fde1c8',
    gradientTo: '#d26a3a',
  },
  {
    id: 'floral-decor',
    title: 'Floral Decor',
    subtitle: 'Statement blooms, hanging pieces',
    category: 'decor',
    descriptors: ['Statement florals', 'Hanging installation', 'Roses', 'Orchids', 'Lush'],
    description:
      'A lavish wedding floral installation: an enormous suspended ceiling flower cloud of roses, orchids, hydrangeas and trailing amaranthus, soft pink and cream palette, dramatic uplighting, cascading greenery, editorial wide-angle shot of the decor piece, luxury destination-wedding aesthetic.',
    accentColor: '#d4668f',
    gradientFrom: '#fde0e8',
    gradientTo: '#d4668f',
  },
  {
    id: 'wedding-cake',
    title: 'Wedding Cake',
    subtitle: 'Multi-tier, sugar florals',
    category: 'decor',
    descriptors: ['Multi-tier cake', 'Sugar flowers', 'Buttercream', 'Gold leaf', 'Elegant'],
    description:
      'A luxurious multi-tier wedding cake hero shot: four or five ivory buttercream tiers with delicate sugar-flower roses and peonies, edible gold-leaf accents, styled on a marble cake table with a blush floral runner, soft natural light, shallow depth of field, high-end editorial food-photography composition.',
    accentColor: '#e0c384',
    gradientFrom: '#fff5dc',
    gradientTo: '#e0c384',
  },
  {
    id: 'tablescape',
    title: 'Reception Tablescape',
    subtitle: 'Long banquet, candlelight',
    category: 'decor',
    descriptors: ['Long banquet table', 'Candlelight', 'Runner florals', 'Gold cutlery', 'Linen'],
    description:
      'A romantic wedding reception tablescape: long wooden banquet table with a lush runner of roses, eucalyptus and taper candles in brass holders, gold-rimmed glassware, ivory linen napkins with calligraphed place cards, warm candlelight glow, wide-angle editorial reception photograph.',
    accentColor: '#c19660',
    gradientFrom: '#fbeacc',
    gradientTo: '#c19660',
  },

  // ── Stationery ────────────────────────────────────────────────────────────
  {
    id: 'invitation-card',
    title: 'Invitation Card',
    subtitle: 'Letterpress, gold foil',
    category: 'stationery',
    descriptors: ['Letterpress', 'Gold foil', 'Calligraphy', 'Envelope', 'Floral border'],
    description:
      'A flat-lay product shot of an elegant wedding invitation suite: main invitation card with letterpress typography and gold-foil accents, delicate floral border illustration, coordinating envelope with hand-calligraphed address, wax seal, arranged on a neutral linen background with loose petals and ribbon, soft diffused studio light.',
    accentColor: '#b69258',
    gradientFrom: '#faeecf',
    gradientTo: '#b69258',
  },
  {
    id: 'save-the-date',
    title: 'Save the Date',
    subtitle: 'Modern typography, illustrated',
    category: 'stationery',
    descriptors: ['Save the date', 'Modern typography', 'Illustration', 'Minimal', 'Mailer'],
    description:
      'A modern save-the-date card design shown flat-lay on a soft pastel background: clean contemporary typography, a small hand-illustrated floral or venue motif, minimal palette of ivory and sage, coordinating envelope and stamp, soft overhead studio light, editorial stationery photography.',
    accentColor: '#8ea889',
    gradientFrom: '#e8f0e6',
    gradientTo: '#8ea889',
  },
  {
    id: 'haldi-invite',
    title: 'Haldi Invite',
    subtitle: 'Turmeric yellow, marigold motif',
    category: 'stationery',
    descriptors: ['Turmeric yellow', 'Marigold motif', 'Traditional illustration', 'Handwritten'],
    description:
      'A festive Indian haldi ceremony invitation card: bright turmeric-yellow background with marigold illustrations along the border, traditional Devanagari and English calligraphy, small motifs of bangles and diyas, flat-lay shot on a yellow silk cloth with loose marigold petals, warm natural light.',
    accentColor: '#e2b23a',
    gradientFrom: '#fff4c4',
    gradientTo: '#e2b23a',
  },
]

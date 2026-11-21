'use strict';
// First-run content. Facts come from the existing Sri Suriya site (address, phones, sizes, products).
// Anything not known is left empty so the site shows a clean placeholder instead of an invented claim:
// no fake reviews, no certificates, no client counts you cannot back up.
const db = require('./db');
const crud = require('./crud');
const themes = require('./themes');
const settings = require('./settings');

const make = (model, input, ta) => {
  const data = { ...input };
  for (const [k, v] of Object.entries(ta || {})) data['ta__' + k] = v;
  const r = crud.create(model, data, null);
  if (r.errors) throw new Error(`seed ${model}: ${JSON.stringify(r.errors)}`);
  return r.id;
};

function seedBase() {
  themes.seedThemes();
  const done = db.prepare("SELECT 1 FROM settings WHERE key='seeded_v1'").get();
  if (done) return false;
  const cat = {};
  const C = (key, name, summary, icon, ta) => { cat[key] = make('categories', { name, summary, icon }, ta); };
  C('agri', 'High Pressure & Agri Pipes', 'Specialised PVC pipes for irrigation and agricultural water supply, available in blue, white and grey.', 'drop', { name: 'உயர் அழுத்த & விவசாய குழாய்கள்', summary: 'நீர்ப்பாசனம் மற்றும் விவசாய நீர் விநியோகத்திற்கான சிறப்பு PVC குழாய்கள் - நீலம், வெள்ளை, சாம்பல் நிறங்களில்.' });
  C('bore', 'Borewell Casing Pipes', 'Strong PVC casing pipes for borewells and tube wells in 5 to 10 inch sizes.', 'pipe', { name: 'போர்வெல் கேசிங் குழாய்கள்', summary: 'போர்வெல் மற்றும் குழாய்க் கிணறுகளுக்கான வலுவான PVC கேசிங் குழாய்கள் - 5 முதல் 10 அங்குலம் வரை.' });
  C('elec', 'Electrical Conduit Pipes', 'Fire-retardant conduit pipes for safe concealed and surface wiring in homes and commercial buildings.', 'bolt', { name: 'மின்சார கண்டூயிட் குழாய்கள்', summary: 'வீடுகள் மற்றும் வணிகக் கட்டிடங்களில் பாதுகாப்பான வயரிங்கிற்கான தீ தடுப்பு கண்டூயிட் குழாய்கள்.' });
  C('fit', 'PVC Fittings', 'Quality PVC fittings for plumbing, construction and irrigation systems.', 'wrench', { name: 'PVC பொருத்திகள் (Fittings)', summary: 'பிளம்பிங், கட்டுமானம் மற்றும் நீர்ப்பாசன அமைப்புகளுக்கான தரமான PVC பொருத்திகள்.' });
  C('tank', 'Water Tanks & Barrels', 'Durable water tanks and plastic barrels in various sizes and colours.', 'tank', { name: 'தண்ணீர் தொட்டிகள் & பேரல்கள்', summary: 'பல்வேறு அளவுகள் மற்றும் நிறங்களில் நீடித்த தண்ணீர் தொட்டிகள் மற்றும் பிளாஸ்டிக் பேரல்கள்.' });
  C('plumb', 'Plumbing & Domestic Pipes', 'Pipes for home water supply, sinks and bathrooms in 1/2 to 2 inch sizes.', 'drop', { name: 'பிளம்பிங் & வீட்டு குழாய்கள்', summary: 'வீட்டு நீர் விநியோகம், சின்க் மற்றும் குளியலறைகளுக்கான 1/2 முதல் 2 அங்குல குழாய்கள்.' });
  C('wall', 'Structured Wall & Drainage Pipes', 'Large 8 to 12 inch pipes for main drainage, heavy construction and city lines.', 'layers', { name: 'ஸ்ட்ரக்சர்டு வால் & வடிகால் குழாய்கள்', summary: 'பிரதான வடிகால், கனரக கட்டுமானம் மற்றும் நகர வழிகளுக்கான 8 முதல் 12 அங்குல பெரிய குழாய்கள்.' });
  C('raw', 'PVC Powder & Scrap', 'PVC powder and scrap supplied as industrial raw material (wholesale).', 'box', { name: 'PVC பவுடர் & ஸ்கிராப்', summary: 'தொழிற்சாலை மூலப்பொருளாக PVC பவுடர் மற்றும் ஸ்கிராப் (மொத்த விற்பனை).' });

  const P = (c, name, summary, sizes, colors, uses, specs, featured, ta) => make('products', {
    category_id: cat[c], name, summary, sizes, colors, uses, featured: featured ? 1 : 0,
    specs: ['Material: Rigid PVC', ...specs, 'Pressure class: Please ask for the class suited to your job'],
    body: `<p>${summary}</p><p>Tell us your size, colour, quantity and delivery location and our team will send a written quotation. Custom lengths and bulk orders are welcome.</p>`,
  }, ta);
  P('agri', 'Agricultural PVC Pipe', 'Leak-proof, weather-resistant pipes for farm water supply, irrigation lines and submersible pump connections.', ['2"', '2.5"', '3"', '4"', '6"'], ['Royal Blue'], ['Farm water supply', 'Irrigation lines', 'Submersible pumps'], ['Used for: Agriculture & irrigation'], true, { name: 'விவசாய PVC குழாய்', summary: 'பண்ணை நீர் விநியோகம், நீர்ப்பாசனம் மற்றும் மூழ்கு மோட்டார் இணைப்புகளுக்கான கசிவில்லாத, வானிலை தாங்கும் குழாய்கள்.' });
  P('agri', 'High Pressure PVC Pipe (PN10)', 'Heavy-duty pipes for industrial pressure lines and demanding water transfer applications.', ['3"', '4"', '5"', '6"', '8"'], ['Blue', 'White'], ['Industrial pressure lines', 'Water transfer'], ['Used for: High-pressure water lines'], true, { name: 'உயர் அழுத்த PVC குழாய் (PN10)', summary: 'தொழிற்சாலை அழுத்த வழிகள் மற்றும் அதிக நீர் பரிமாற்றத்திற்கான கனரக குழாய்கள்.' });
  P('bore', 'Borewell Casing Pipe', 'PVC casing pipes for borewells and tube wells, for farm and home water supply.', ['5"', '7"', '8"', '10"'], ['White', 'Grey', 'Blue'], ['Borewell casing', 'Tube wells', 'Home water supply'], ['Used for: Borewell casing'], true, { name: 'போர்வெல் கேசிங் குழாய்', summary: 'பண்ணை மற்றும் வீட்டு நீர் விநியோகத்திற்கான போர்வெல் மற்றும் குழாய்க் கிணறு கேசிங் PVC குழாய்கள்.' });
  P('elec', 'FR PVC Electrical Conduit Pipe', 'Fire-retardant conduit pipes that protect cables in concealed and surface wiring.', ['1/2"', '3/4"', '1"', '1.5"'], ['Grey', 'Ivory'], ['Concealed wiring', 'Surface wiring', 'Commercial buildings'], ['Used for: Electrical wiring protection'], true, { name: 'FR PVC மின்சார கண்டூயிட் குழாய்', summary: 'மறைமுக மற்றும் வெளிப்படையான வயரிங்கில் கேபிள்களைப் பாதுகாக்கும் தீ தடுப்பு கண்டூயிட் குழாய்கள்.' });
  P('plumb', 'PVC Plumbing Pipe', 'Everyday pipes for domestic cold-water supply, sinks and bathrooms.', ['1/2"', '3/4"', '1"', '1.5"', '2"'], ['White', 'Light Blue'], ['Home water supply', 'Bathrooms', 'Sinks'], ['Used for: Domestic cold-water supply'], false, { name: 'PVC பிளம்பிங் குழாய்', summary: 'வீட்டு குளிர்ந்த நீர் விநியோகம், சின்க் மற்றும் குளியலறைகளுக்கான குழாய்கள்.' });
  P('wall', 'Structured Wall Drainage Pipe', 'Large-diameter pipes for main drainage, heavy construction and city lines.', ['8"', '10"', '12"+'], ['Dark Grey'], ['Main drainage', 'Heavy construction', 'City lines'], ['Used for: Drainage & sewer lines'], false, { name: 'ஸ்ட்ரக்சர்டு வால் வடிகால் குழாய்', summary: 'பிரதான வடிகால், கனரக கட்டுமானம் மற்றும் நகர வழிகளுக்கான பெரிய விட்ட குழாய்கள்.' });
  P('fit', 'PVC Elbows & Bends', 'Elbows and bends in matching sizes for plumbing, construction and irrigation layouts.', ['1/2"', '3/4"', '1"', '2"', '3"', '4"'], ['White', 'Blue', 'Grey'], ['Plumbing', 'Construction', 'Irrigation'], ['Used for: Changing pipe direction'], false, { name: 'PVC எல்போ & பெண்ட்', summary: 'பிளம்பிங், கட்டுமானம் மற்றும் நீர்ப்பாசன அமைப்புகளுக்கான எல்போ மற்றும் பெண்ட் பொருத்திகள்.' });
  P('fit', 'PVC Tees, Couplers & Reducers', 'Tees, couplers and reducers to join, branch and resize pipe runs.', ['1/2"', '3/4"', '1"', '2"', '3"', '4"'], ['White', 'Blue', 'Grey'], ['Plumbing', 'Construction', 'Irrigation'], ['Used for: Joining and branching pipes'], false, { name: 'PVC டீ, கப்ளர் & ரெட்யூசர்', summary: 'குழாய்களை இணைக்க, பிரிக்க மற்றும் அளவு மாற்ற டீ, கப்ளர் மற்றும் ரெட்யூசர் பொருத்திகள்.' });
  P('tank', 'Water Storage Tanks', 'Durable water tanks in various sizes and colours for homes, farms and industry.', [], ['Blue', 'Black', 'White'], ['Home storage', 'Farm storage', 'Industrial storage'], ['Capacity: Various sizes available'], true, { name: 'தண்ணீர் சேமிப்பு தொட்டிகள்', summary: 'வீடு, பண்ணை மற்றும் தொழிற்சாலைக்கான பல்வேறு அளவுகள், நிறங்களில் நீடித்த தொட்டிகள்.' });
  P('tank', 'Industrial Plastic Barrels', 'Custom barrels for industrial water and chemical storage.', [], ['Blue', 'Blue / Black'], ['Chemical storage', 'Water storage'], ['Sizes: Custom'], false, { name: 'தொழிற்சாலை பிளாஸ்டிக் பேரல்கள்', summary: 'தொழிற்சாலை நீர் மற்றும் ரசாயன சேமிப்புக்கான தனிப்பயன் பேரல்கள்.' });
  P('raw', 'PVC Powder & Scrap', 'PVC powder and scrap for industrial raw-material buyers.', [], ['Multicolour', 'White'], ['Raw material'], ['Supply: Wholesale'], false, { name: 'PVC பவுடர் & ஸ்கிராப்', summary: 'தொழிற்சாலை மூலப்பொருள் வாங்குபவர்களுக்கான PVC பவுடர் மற்றும் ஸ்கிராப்.' });

  // size chart rows – taken from the current website
  const Z = (grp, name, sizes_text, colors_text, uses) => make('sizes', { grp, name, sizes_text, colors_text, uses });
  Z('Plumbing & Domestic Waterline', 'Standard Plumbing', '1/2", 3/4", 1", 1.5", 2"', 'White, Light Blue', 'Home water supply, sinks & bathrooms');
  Z('Electrical & Conduit Systems', 'Wiring Conduit (FR)', '1/2", 3/4", 1", 1.5"', 'Grey, Ivory', 'Fire-retardant concealed and surface wiring');
  Z('Agriculture & High Pressure', 'Agri Irrigation', '2", 2.5", 3", 4", 6"', 'Royal Blue', 'Farm water supply, submersible pumps');
  Z('Agriculture & High Pressure', 'High Pressure (PN10)', '3" to 8"', 'Blue, White', 'Industrial pressure lines, borewell casing');
  Z('Borewell Uses', 'Borewell', '5", 7", 8", 10"', 'White, Grey, Blue', 'Farm water supply, home water supply and more');
  Z('Large Industrial & Specialty', 'Structured Wall', '8" to 12"+', 'Dark Grey', 'Main drainage, heavy construction, city lines');
  Z('Large Industrial & Specialty', 'Industrial Storage', 'Custom barrels', 'Blue, Blue/Black', 'Industrial chemical & water storage');
  Z('Large Industrial & Specialty', 'Raw Material', 'Scrap & powder', 'Multicolour / White', 'Industrial raw material wholesale');

  const A = (title, summary, icon, ta) => make('applications', { title, summary, icon }, ta);
  A('Agricultural Irrigation', 'Reliable pipes for drip, sprinkler and flood irrigation lines across farms.', 'leaf', { title: 'விவசாய நீர்ப்பாசனம்', summary: 'பண்ணைகளில் சொட்டு, தெளிப்பு மற்றும் வெள்ள நீர்ப்பாசன வழிகளுக்கான நம்பகமான குழாய்கள்.' });
  A('Borewell Water Supply', 'Casing and delivery pipes for borewells and tube wells.', 'drop', { title: 'போர்வெல் நீர் விநியோகம்', summary: 'போர்வெல் மற்றும் குழாய்க் கிணறுகளுக்கான கேசிங் மற்றும் விநியோக குழாய்கள்.' });
  A('Farm Water Distribution', 'Move water from source to field and storage tanks efficiently.', 'tank', { title: 'பண்ணை நீர் விநியோகம்', summary: 'நீர் ஆதாரத்திலிருந்து வயல் மற்றும் தொட்டிகளுக்கு திறம்பட நீர் கொண்டு செல்ல.' });
  A('Construction & Plumbing', 'Pipes and fittings for buildings, plumbing and drainage.', 'wrench', { title: 'கட்டுமானம் & பிளம்பிங்', summary: 'கட்டிடங்கள், பிளம்பிங் மற்றும் வடிகாலுக்கான குழாய்கள் மற்றும் பொருத்திகள்.' });
  A('Electrical Wiring', 'Fire-retardant conduits that protect cables in homes and commercial buildings.', 'bolt', { title: 'மின் வயரிங்', summary: 'வீடுகள் மற்றும் வணிக கட்டிடங்களில் கேபிள்களைப் பாதுகாக்கும் தீ தடுப்பு கண்டூயிட்கள்.' });

  const F = (title, text, icon, ta) => make('features', { title, text, icon }, ta);
  F('Durable Pipes', 'Leak-proof, weather resistant and highly flexible.', 'shield', { title: 'நீடித்த குழாய்கள்', text: 'கசிவில்லாதது, வானிலை தாங்கும், அதிக நெகிழ்வுத்தன்மை.' });
  F('Multiple Sizes', 'From 1/2 inch up to 12 inches.', 'ruler', { title: 'பல அளவுகள்', text: '1/2 அங்குலம் முதல் 12 அங்குலம் வரை.' });
  F('Built for Irrigation', 'Perfect for irrigation fields and high-pressure water lines.', 'leaf', { title: 'நீர்ப்பாசனத்திற்கு ஏற்றது', text: 'நீர்ப்பாசன வயல்கள் மற்றும் உயர் அழுத்த நீர் வழிகளுக்கு ஏற்றது.' });
  F('Delivery Across Tamil Nadu', 'We deliver pipes all over Tamil Nadu.', 'truck', { title: 'தமிழ்நாடு முழுவதும் விநியோகம்', text: 'தமிழ்நாடு முழுவதும் குழாய்களை விநியோகிக்கிறோம்.' });

  const ST = (label, value, suffix, icon, ta) => make('stats', { label, value, suffix, icon }, ta);
  ST('Established', 2010, '', 'factory', { label: 'நிறுவப்பட்ட ஆண்டு' });
  ST('Product categories', 8, '+', 'layers', { label: 'தயாரிப்பு வகைகள்' });
  ST('Largest pipe size (inches)', 12, '"', 'ruler', { label: 'அதிகபட்ச குழாய் அளவு (அங்குலம்)' });
  ST('Specialised departments', 5, '', 'users', { label: 'சிறப்புத் துறைகள்' });

  const PS = (title, text, icon, ta) => make('process_steps', { title, text, icon }, ta);
  PS('Send your enquiry', 'Call, WhatsApp or fill the form with pipe type, size, colour and quantity.', 'chat', { title: 'விசாரணை அனுப்புங்கள்', text: 'குழாய் வகை, அளவு, நிறம், எண்ணிக்கையுடன் அழைக்கவும், வாட்ஸ்அப் அல்லது படிவம் நிரப்பவும்.' });
  PS('Receive a quotation', 'We reply with a clear price quotation and delivery time.', 'file', { title: 'விலைப்பட்டியல் பெறுங்கள்', text: 'தெளிவான விலைப்பட்டியல் மற்றும் விநியோக நேரத்துடன் பதிலளிக்கிறோம்.' });
  PS('Production & dispatch', 'Pipes are prepared, quality checked, packed and loaded.', 'factory', { title: 'தயாரிப்பு & அனுப்புதல்', text: 'குழாய்கள் தயாரிக்கப்பட்டு, தரம் சரிபார்க்கப்பட்டு, பேக் செய்து ஏற்றப்படும்.' });
  PS('Delivery to your site', 'Delivered anywhere in Tamil Nadu. Pay by cash, cheque, DD or bank transfer.', 'truck', { title: 'உங்கள் இடத்திற்கு விநியோகம்', text: 'தமிழ்நாட்டில் எங்கும் விநியோகம். பணம், காசோலை, DD அல்லது வங்கி பரிமாற்றம்.' });

  // Placeholder testimonials: INACTIVE by default so no fake reviews are ever shown.
  for (const [n, r] of [['Customer name', 'Farmer, Theni'], ['Customer name', 'Contractor, Madurai'], ['Customer name', 'Electrician, Dindigul']]) {
    make('testimonials', { name: n, role: r, text: 'Replace this placeholder with a real customer review, then switch it on.', rating: 5, active: 0 });
  }

  const Q = (question, answer, category, keywords, ta) => make('faqs', { question, answer: `<p>${answer}</p>`, category, keywords }, ta && { question: ta[0], answer: `<p>${ta[1]}</p>` });
  Q('Which PVC pipe is suitable for a borewell?', 'Borewell casing pipes in 5, 7, 8 and 10 inch sizes. Tell us the bore diameter, depth and pump size and we will recommend the right size and pressure class.', 'Products', ['borewell', 'bore', 'casing', 'tube well', 'well'], ['போர்வெல்லுக்கு எந்த PVC குழாய் பொருத்தமானது?', 'போர்வெல் கேசிங் குழாய்கள் 5, 7, 8 மற்றும் 10 அங்குல அளவுகளில் கிடைக்கும். போர் விட்டம், ஆழம் மற்றும் பம்ப் அளவைச் சொன்னால் சரியான அளவை பரிந்துரைப்போம்.']);
  Q('What sizes are available?', 'Our range runs from 1/2 inch up to 12 inches depending on the product. See the size chart for every category, size and colour.', 'Products', ['size', 'sizes', 'inch', 'diameter', 'range'], ['என்ன அளவுகள் கிடைக்கின்றன?', 'தயாரிப்பைப் பொறுத்து 1/2 அங்குலம் முதல் 12 அங்குலம் வரை கிடைக்கும். ஒவ்வொரு வகை, அளவு, நிறத்திற்கும் அளவு அட்டவணையைப் பாருங்கள்.']);
  Q('Do you deliver outside Madurai?', 'Yes. We deliver across Tamil Nadu from our Kappalur, Madurai factory. Share your delivery location with your enquiry for transport details.', 'Orders', ['deliver', 'delivery', 'transport', 'shipping', 'location'], ['மதுரைக்கு வெளியே விநியோகம் உண்டா?', 'ஆம். கப்பலூர், மதுரை தொழிற்சாலையிலிருந்து தமிழ்நாடு முழுவதும் விநியோகம் செய்கிறோம். போக்குவரத்து விவரங்களுக்கு உங்கள் இடத்தைத் தெரிவிக்கவும்.']);
  Q('How do I get a price quotation?', 'Use the quote form, call us or message us on WhatsApp with the product, size, colour, quantity and delivery location. We will reply with a written quotation.', 'Orders', ['price', 'quote', 'quotation', 'cost', 'rate', 'how much'], ['விலைப்பட்டியல் எப்படி பெறுவது?', 'தயாரிப்பு, அளவு, நிறம், எண்ணிக்கை, விநியோக இடத்துடன் படிவம், அழைப்பு அல்லது வாட்ஸ்அப் மூலம் தெரிவிக்கவும். எழுத்து வடிவில் விலைப்பட்டியல் அனுப்புவோம்.']);
  Q('Which payment methods do you accept?', 'We accept cash, cheque, demand draft (DD) and online bank transfers.', 'Orders', ['payment', 'pay', 'cash', 'cheque', 'dd', 'upi', 'bank'], ['எந்த பணம் செலுத்தும் முறைகளை ஏற்கிறீர்கள்?', 'பணம், காசோலை, டிமாண்ட் டிராஃப்ட் (DD) மற்றும் ஆன்லைன் வங்கி பரிமாற்றம் ஏற்கிறோம்.']);
  Q('Can I order custom sizes, colours or barrels?', 'Custom barrels and special requirements are possible. Send us the details and we will confirm what we can supply and the lead time.', 'Products', ['custom', 'special', 'barrel', 'colour', 'color'], null);
  Q('What is the difference between agricultural and electrical PVC pipes?', 'Agricultural and plumbing pipes are made to carry water, often under pressure. Electrical conduit pipes are made to protect cables and are fire-retardant; they are not meant to carry water. Never use one in place of the other.', 'Products', ['difference', 'electrical', 'conduit', 'agri', 'agricultural'], null);
  Q('Can PVC pipes be used for hot water?', 'Standard PVC pipes are intended for cold-water use. Do not use them for hot-water lines. Ask us if you need advice on a suitable alternative for hot water.', 'Products', ['hot water', 'hot', 'temperature', 'heat'], null);
  Q('How many pipes do I need for my project?', 'Use our pipe quantity calculator: enter the total pipeline length and the length of one pipe. It adds an allowance for wastage. Our team will confirm the exact quantity and fittings in your quotation.', 'Orders', ['how many', 'quantity', 'calculate', 'calculator', 'estimate'], null);
  Q('Where is your factory located?', 'D-42, SIDCO Industrial Estate, near SBI Bank, Kappalur, Madurai – 625008, Tamil Nadu.', 'General', ['address', 'where', 'location', 'factory', 'visit', 'map'], ['உங்கள் தொழிற்சாலை எங்கே உள்ளது?', 'D-42, சிட்கோ தொழிற்பேட்டை, SBI வங்கி அருகில், கப்பலூர், மதுரை – 625008, தமிழ்நாடு.']);
  Q('Do you sell PVC powder or scrap?', 'Yes, PVC powder and scrap are available as industrial raw material for wholesale buyers.', 'Products', ['powder', 'scrap', 'raw material', 'waste'], null);
  Q('How should PVC pipes be stored?', 'Store pipes flat on level ground, supported along their length, in shade and away from direct sun and heat. Do not stack heavy loads on top and keep them away from sharp objects.', 'General', ['store', 'storage', 'stack', 'sun', 'handling'], null);

  const G = (title, category) => make('gallery', { title, image: `/placeholder/800x600.svg?label=${encodeURIComponent(title)}`, category });
  G('Pipe stock yard', 'Factory'); G('Extrusion line', 'Factory'); G('Quality testing', 'Factory'); G('Agri pipes in the field', 'Farm & Field');
  G('Borewell casing pipes', 'Products'); G('Conduit pipes', 'Products'); G('Fittings display', 'Products'); G('Loading & dispatch', 'Delivery');

  make('team', { name: 'K. Sudhakar', role: 'Proprietor', bio: 'Founder and proprietor of Sri Suriya Polymers, Kappalur, Madurai.' }, { role: 'உரிமையாளர்' });

  // Articles: genuinely useful, general-purpose guides (edit freely)
  const body1 = '<p class="lead">The right pipe saves water, pumping cost and repair work. Here is a simple way to choose.</p><h2>1. Start with the job</h2><p>Irrigation mainlines, submersible pump delivery, borewell casing and drainage each need a different pipe. Agricultural pipes carry water under pressure; electrical conduits and drainage pipes are different products and should not be swapped.</p><h2>2. Match size to flow and pump</h2><p>A pipe that is too narrow increases friction loss and makes the pump work harder. Share your pump rating, flow requirement and run length with us and we will suggest a size.</p><h2>3. Think about pressure</h2><p>Ask for the pressure class that suits your pump and the height the water must travel. A higher class has thicker walls and costs more, but fails less under pressure.</p><h2>4. Protect from sun and impact</h2><p>Long exposure to strong sunlight ages PVC. Bury mainlines where possible or shade exposed runs, and support pipes properly so they do not sag.</p><h2>5. Use matching fittings and proper joints</h2><p>Most leaks happen at joints. Use fittings of the same size and class and follow the correct jointing method.</p><p>Not sure? <a href="/quote">Send us your details</a> and we will help you choose.</p>';
  const body2 = '<p class="lead">A borewell casing keeps the bore open and keeps soil and loose rock out of your water. Choosing the right diameter matters.</p><h2>Diameter</h2><p>The casing must be wide enough for your pump with room to spare so it can be lowered and pulled out safely. Common casing sizes are 5, 7, 8 and 10 inches.</p><h2>Strength</h2><p>Deeper bores and weaker soil need a stronger pipe. Tell us the depth and ground conditions when you ask for a quotation.</p><h2>Handling and installation</h2><p>Lower the casing slowly and keep it straight. Avoid dropping it or dragging it over rough ground, and keep joints clean and properly connected.</p><p>For help choosing, <a href="/contact">contact our team</a> with your bore diameter and depth.</p>';
  const body3 = '<p class="lead">Electrical conduit and water pipes can look similar, but they are made for completely different jobs.</p><h2>Conduit protects cables</h2><p>Electrical conduit pipes are fire-retardant and designed to protect wiring in concealed and surface installations. They are not tested to carry water under pressure.</p><h2>Water pipes carry liquid</h2><p>Plumbing and agricultural pipes are designed for water supply and pressure, which conduits are not made to handle.</p><h2>Use the right pipe, every time</h2><p>Mixing them can cause unsafe wiring or leaking water lines. Check the product label and ask us if you are unsure.</p>';
  make('posts', { title: 'How to choose the right PVC pipe for irrigation', excerpt: 'A short, practical checklist for choosing size, pressure class and fittings for farm irrigation.', body: body1, author: 'Sri Suriya Polymers', tags: ['irrigation', 'agriculture', 'guide'], status: 'published', published_at: '2026-01-10T09:00' });
  make('posts', { title: 'Borewell casing pipes: choosing the right diameter', excerpt: 'What to consider before you order casing for a new borewell or tube well.', body: body2, author: 'Sri Suriya Polymers', tags: ['borewell', 'guide'], status: 'published', published_at: '2026-01-24T09:00' });
  make('posts', { title: 'Electrical conduit vs water pipes: why you should never mix them', excerpt: 'Why conduit pipes and water pipes are not interchangeable.', body: body3, author: 'Sri Suriya Polymers', tags: ['electrical', 'safety'], status: 'published', published_at: '2026-02-05T09:00' });

  make('pages', { title: 'About Us', slug: 'about', in_footer: 0, body: '<p class="lead">Sri Suriya Polymers is a PVC pipe manufacturer and dealer in the SIDCO Industrial Estate, Kappalur, Madurai. Established in 2010 and managed by K. Sudhakar, we supply agricultural, borewell, electrical and plumbing pipes, fittings and water tanks across Tamil Nadu.</p><h2>What we do</h2><p>We make and supply PVC pipes for irrigation, borewells, plumbing, drainage and electrical wiring, together with fittings, water tanks, barrels and PVC raw material. Customers range from farmers and contractors to electricians, dealers and industries.</p><h2>Our facility</h2><p>Our unit is organised into dedicated departments so every order is handled with care:</p><ul><li>Manufacturing</li><li>Quality testing</li><li>Packing</li><li>R&amp;D</li><li>Logistics and dispatch</li></ul><h2>Our promise</h2><p>Durable products, clear quotations, honest advice on which pipe suits your job and dependable delivery across Tamil Nadu.</p>' }, { title: 'எங்களைப் பற்றி' });
  make('pages', { title: 'Privacy Policy', slug: 'privacy-policy', in_footer: 1, body: '<p><strong>Template – please review and edit before publishing.</strong></p><p>We collect only the information you submit through our enquiry forms (name, phone number, email, product details and message) to reply to your enquiry and process your order. We do not sell your information. Enquiries are stored securely and visible only to authorised staff. This website uses cookie-free, privacy-friendly analytics that do not store your IP address.</p><p>To ask us to correct or delete your enquiry data, contact us using the details on the Contact page.</p>' });
  make('pages', { title: 'Terms & Conditions', slug: 'terms', in_footer: 1, body: '<p><strong>Template – please review and edit before publishing.</strong></p><p>Information on this website is for general guidance. Product specifications, sizes, colours and availability may change without notice and are confirmed only in a written quotation or invoice. Prices are not displayed on the website; every order is subject to our quotation, acceptance and payment terms.</p>' });

  const AREAS = ['Madurai', 'Theni', 'Dindigul', 'Sivaganga', 'Virudhunagar', 'Ramanathapuram', 'Tirunelveli', 'Thoothukudi', 'Tiruchirappalli', 'Pudukkottai', 'Karur', 'Coimbatore'];
  for (const a of AREAS) {
    const home = a === 'Madurai';
    make('areas', {
      name: a,
      intro: home
        ? '<p>Madurai is our home. Our factory is in the SIDCO Industrial Estate, Kappalur, so Madurai customers get the quickest dispatch. We supply agricultural, borewell, electrical and plumbing PVC pipes, fittings and water tanks for farms, homes, contractors and industries.</p><p>Visit us, call, or send an enquiry for a written quotation.</p>'
        : `<p>Sri Suriya Polymers delivers agricultural, borewell, electrical and plumbing PVC pipes, fittings and water tanks to customers in ${a}. Orders are prepared and dispatched from our Kappalur, Madurai factory.</p><p>Tell us your required size, colour, quantity and delivery location in ${a} and we will send a written quotation with delivery details.</p>`,
    });
  }

  const N = (label, url, location, ta) => make('nav_items', { label, url, location }, ta);
  N('Home', '/', 'header', { label: 'முகப்பு' }); N('About Us', '/about', 'header', { label: 'எங்களைப் பற்றி' }); N('Products', '/products', 'both', { label: 'தயாரிப்புகள்' });
  N('Size Chart', '/sizes', 'both', { label: 'அளவு அட்டவணை' }); N('Applications', '/applications', 'header', { label: 'பயன்பாடுகள்' }); N('Gallery', '/gallery', 'header', { label: 'படத்தொகுப்பு' });
  N('News', '/blog', 'both', { label: 'செய்திகள்' }); N('Contact', '/contact', 'both', { label: 'தொடர்புக்கு' });
  N('FAQ', '/faq', 'footer', { label: 'கேள்வி பதில்' }); N('Pipe Calculator', '/calculator', 'footer', { label: 'குழாய் கணக்கீடு' }); N('Service Areas', '/areas', 'footer', { label: 'சேவை பகுதிகள்' });

  make('announcements', { text: 'Bulk orders & dealer enquiries welcome – call +91 99941 66671', link: '/quote', link_label: 'Get a quote', dismissible: 1 }, { text: 'மொத்த ஆர்டர் மற்றும் டீலர் விசாரணைகளுக்கு அழைக்கவும் - +91 99941 66671', link_label: 'விலைப்பட்டியல்' });

  const SEC = (type, title, subtitle, extra = {}, ta) => make('sections', { page: 'home', type, title, subtitle, ...extra }, ta);
  SEC('hero', 'PVC Pipes for Agriculture, Borewell & Electrical Use', "Tamil Nadu's trusted manufacturer and dealer since 2010. Durable, precision-made pipes and fittings, delivered across Tamil Nadu.", { btn_label: 'Get a Quote', btn_url: '/quote', btn2_label: 'Browse Products', btn2_url: '/products' },
    { title: 'விவசாயம், போர்வெல் மற்றும் மின் பயன்பாட்டிற்கான PVC குழாய்கள்', subtitle: '2010 முதல் தமிழ்நாட்டின் நம்பகமான உற்பத்தியாளர் மற்றும் விற்பனையாளர். நீடித்த, துல்லியமான குழாய்கள் மற்றும் பொருத்திகள் - தமிழ்நாடு முழுவதும் விநியோகம்.', btn_label: 'விலைப்பட்டியல் பெறுக', btn2_label: 'தயாரிப்புகளைக் காண' });
  SEC('features', 'Why choose Sri Suriya', 'Quality you can rely on, service you can count on.', { bg: 'alt' }, { title: 'ஏன் ஸ்ரீ சூர்யா?', subtitle: 'நம்பகமான தரம், நம்பகமான சேவை.' });
  SEC('categories', 'Our Products', 'Complete PVC solutions for every requirement.', { btn_label: 'View all products', btn_url: '/products' }, { title: 'எங்கள் தயாரிப்புகள்', subtitle: 'ஒவ்வொரு தேவைக்கும் முழுமையான PVC தீர்வுகள்.', btn_label: 'அனைத்து தயாரிப்புகள்' });
  SEC('about', 'Top-quality manufacturing since 2010', 'Based in Kappalur, Madurai', { body: 'Sri Suriya Polymers is managed by K. Sudhakar from the SIDCO Industrial Estate, Kappalur. We produce high-quality PVC pipes for agriculture, borewells, electrical wiring and construction.\n- Dedicated manufacturing and quality-testing departments\n- Wide range: 1/2 inch to 12 inches\n- Custom barrels, fittings and PVC raw material\n- Reliable delivery across Tamil Nadu', btn_label: 'About us', btn_url: '/about', bg: 'alt' },
    { title: '2010 முதல் சிறந்த தர உற்பத்தி', subtitle: 'கப்பலூர், மதுரை', body: 'ஸ்ரீ சூர்யா பாலிமர்ஸ் கப்பலூர் சிட்கோ தொழிற்பேட்டையிலிருந்து கே. சுதாகரால் நிர்வகிக்கப்படுகிறது. விவசாயம், போர்வெல், மின் வயரிங் மற்றும் கட்டுமானத்திற்கான உயர்தர PVC குழாய்களை உற்பத்தி செய்கிறோம்.', btn_label: 'எங்களைப் பற்றி' });
  SEC('stats', '', '', { bg: 'brand' });
  SEC('featured', 'Popular products', 'Our most requested pipes and tanks.', { extra: '{"limit":6}' }, { title: 'பிரபலமான தயாரிப்புகள்', subtitle: 'அதிகம் கேட்கப்படும் குழாய்கள் மற்றும் தொட்டிகள்.' });
  SEC('configurator', 'Pipe configurator', 'Pick a size, colour and length and preview your pipe in 3D, then add it to your quote.', { bg: 'alt' }, { title: 'குழாய் வடிவமைப்பாளர்', subtitle: 'அளவு, நிறம், நீளத்தைத் தேர்ந்து 3D-யில் பார்க்கவும்; பின்னர் விலைப்பட்டியலில் சேர்க்கவும்.' });
  SEC('process', 'How ordering works', 'Four simple steps from enquiry to delivery.', {}, { title: 'ஆர்டர் செய்வது எப்படி', subtitle: 'விசாரணையிலிருந்து விநியோகம் வரை நான்கு எளிய படிகள்.' });
  SEC('applications', 'Where our pipes are used', 'Built for farms, homes, buildings and industry.', { bg: 'alt' }, { title: 'எங்கள் குழாய்கள் பயன்படும் இடங்கள்', subtitle: 'பண்ணைகள், வீடுகள், கட்டிடங்கள் மற்றும் தொழிற்சாலைகளுக்காக.' });
  SEC('sizes', 'PVC pipe size chart', 'Sizes, colours and applications at a glance.', { btn_label: 'Full size chart', btn_url: '/sizes' }, { title: 'PVC குழாய் அளவு அட்டவணை', btn_label: 'முழு அட்டவணை' });
  SEC('testimonials', 'What customers say', '', { bg: 'alt' }, { title: 'வாடிக்கையாளர் கருத்துகள்' });
  SEC('gallery', 'Gallery', 'A look at our products and facility.', { btn_label: 'View gallery', btn_url: '/gallery' }, { title: 'படத்தொகுப்பு', btn_label: 'அனைத்தையும் காண்க' });
  SEC('areas', 'Areas we serve', 'We deliver across Tamil Nadu.', { bg: 'alt', btn_label: 'All service areas', btn_url: '/areas' }, { title: 'நாங்கள் சேவை செய்யும் பகுதிகள்', subtitle: 'தமிழ்நாடு முழுவதும் விநியோகம்.' });
  SEC('posts', 'Latest news & guides', 'Practical advice on choosing and using PVC pipes.', {}, { title: 'புதிய செய்திகள் & வழிகாட்டிகள்' });
  SEC('faq', 'Frequently asked questions', 'Quick answers about sizes, delivery and payment.', { bg: 'alt', btn_label: 'More questions', btn_url: '/faq' }, { title: 'அடிக்கடி கேட்கப்படும் கேள்விகள்' });
  SEC('cta', 'Ready to order? Get your quotation today', 'Call, WhatsApp or send an enquiry. We reply quickly with a clear written quotation.', { btn_label: 'Request a quote', btn_url: '/quote', btn2_label: 'Contact us', btn2_url: '/contact', bg: 'brand' }, { title: 'ஆர்டர் செய்யத் தயாரா? இன்றே விலைப்பட்டியல் பெறுங்கள்', btn_label: 'விலைப்பட்டியல் கோரு', btn2_label: 'தொடர்புக்கு' });

  db.prepare("INSERT OR REPLACE INTO settings(key,value,updated_at) VALUES('seeded_v1','1',datetime('now'))").run();
  settings.save({ active_theme: 'professional' }, ['active_theme']);
  return true;
}
// Content added in later versions is seeded separately (own flag), so sites created earlier get it too.
function runOnce(flag, fn) {
  if (db.prepare('SELECT 1 FROM settings WHERE key=?').get(flag)) return;
  try { fn(); } catch (e) { console.error('[seed]', flag, e.message); }
  db.prepare("INSERT OR REPLACE INTO settings(key,value,updated_at) VALUES(?,?,datetime('now'))").run(flag, '1');
}
function seed() {
  const first = seedBase(); require('./seed_seo').seedSeo();
  // v2.0: the home page no longer shows the pipe picture by default, and visitors no longer get a theme-picker icon.
  runOnce('migrated_home_v2', () => {
    const cur = (k) => (db.prepare('SELECT value FROM settings WHERE key=?').get(k) || {}).value;
    const put = (k, v) => db.prepare("INSERT OR REPLACE INTO settings(key,value,updated_at) VALUES(?,?,datetime('now'))").run(k, v);
    if (!cur('hero_style') || cur('hero_style') === 'split') put('hero_style', 'center');
    put('allow_visitor_theme', '0');
  });
  return first;
}
module.exports = { seed };

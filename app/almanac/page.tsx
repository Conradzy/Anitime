'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AppSidebar } from '@/components/AppSidebar';
import styles from './page.module.css';

/* ---------------------------------------------------------------- data ---- */

type CropType = { key: string; name: string; price: string; note: string; model: string };
type Crop = { key: string; name: string; img: string; hint: string; cue: string; types: CropType[] };

const CROP_SET: Crop[] = [
  {
    key: 'coconut',
    name: 'Coconut',
    img: '/images/crops/coconut.png',
    hint: 'Life-cycle model available',
    cue: 'Life-cycle model',
    types: [
      { key: 'copra', name: 'Copra', price: '₱63/kg', note: 'Dried meat pressed for oil. Peak yield at day 330.', model: 'cut' },
      { key: 'uling', name: 'Uling / Charcoal', price: '₱28/kg', note: 'Burned from the hard shell after the meat is taken.', model: 'charcoal' },
      { key: 'unpeeled', name: 'Unpeeled Coconut', price: '₱7/kg', note: 'Whole nut in husk, sold by the sack straight off the tree.', model: 'whole' },
      { key: 'peeled', name: 'Peeled Coconut', price: '₱9/kg', note: 'Husk removed, shell intact. Shows the white meat inside.', model: 'peeled' },
    ],
  },
  {
    key: 'banana',
    name: 'Banana',
    img: '/images/crops/banana.png',
    hint: 'Life-cycle model available',
    cue: 'Life-cycle model',
    types: [
      { key: 'latundan', name: 'Latundan', price: '₱18/kg', note: 'Sweet dessert banana. Harvested 75–85 days from the flower.', model: 'latundan' },
      { key: 'saba', name: 'Cardaba / Saba', price: '₱14/kg', note: 'Cooking banana for chips and turon. 90–100 days from the flower.', model: 'saba' },
      { key: 'lakatan', name: 'Lakatan / Binangay', price: '₱24/kg', note: 'Premium eating banana, highest farm-gate price. 105–120 days.', model: 'lakatan' },
    ],
  },
  {
    key: 'mango',
    name: 'Mango',
    img: '/images/crops/mango.png',
    hint: 'Life-cycle model available',
    cue: 'Life-cycle model',
    types: [
      { key: 'carabao', name: 'Carabao', price: '₱75/kg', note: 'Export grade, the benchmark Philippine mango. Pick firm at day 111–120.', model: 'carabao' },
      { key: 'cebu', name: 'Cebu', price: '₱65/kg', note: 'Firmer flesh, favoured for drying. Holds shape picked green at day 110.', model: 'cebu' },
      { key: 'pico', name: 'Pico', price: '₱70/kg', note: 'Sweet and aromatic, strong local demand. Best at day 115–125.', model: 'pico' },
      { key: 'indian', name: 'Indian / Katchamita', price: '₱60/kg', note: 'Eaten green with bagoong; pickling stock. Cut at day 76–100.', model: 'indian' },
    ],
  },
  {
    key: 'corn',
    name: 'Corn',
    img: '/images/crops/corn.png',
    hint: 'Life-cycle model available',
    cue: 'Life-cycle model',
    types: [
      { key: 'lagkitan', name: 'White Lagkitan / Native Glutinous', price: '₱30/kg', note: 'Picked green at day 72 — 18–22 days after silking. Sticky white kernels for boiling and binatog.', model: 'lagkitan' },
      { key: 'yellow', name: 'Yellow Sweet Corn', price: '₱35/kg', note: 'Ready about day 70, 18–22 days after silking. Pick early to keep the sugar.', model: 'yellow' },
      { key: 'grits', name: 'White Corn Grits / Tinigib', price: '₱40/kg', note: 'Milled from dent corn dried on the stalk — 105–110 days, about 60 days after silking.', model: 'grits' },
      { key: 'waxy', name: 'Purple / Bicolor Waxy Corn', price: '₱35/kg', note: 'Early at day 60–70, picked green. White and purple kernels, high anthocyanin.', model: 'waxy' },
    ],
  },
  {
    key: 'pineapple',
    name: 'Pineapple',
    img: '/images/crops/pineapple.png',
    hint: 'Life-cycle model available',
    cue: 'Life-cycle model',
    types: [
      { key: 'hawaiian', name: 'Hawaiian / Smooth Cayenne', price: '₱25/kg', note: 'Large cylindrical fruit, shallow eyes. Cannery and juice buyers.', model: 'pineapple' },
      { key: 'queen', name: 'Queen / Formosa', price: '₱30/kg', note: 'Smaller, deeper eyes, golden flesh. Fresh market premium.', model: 'pineapple' },
      { key: 'native', name: 'Native / Red Spanish', price: '₱22/kg', note: 'Fibrous local strain with spiny leaves. Also grown for piña fibre.', model: 'pineapple' },
    ],
  },
];

const CROP_CARD_META: Record<string, string> = {
  coconut: '4 types · ₱7–63/kg',
  banana: '3 types · ₱14–24/kg',
  mango: '4 types · ₱60–75/kg',
  corn: '4 types · ₱30–40/kg',
  pineapple: '3 types · ₱22–30/kg',
};

const MODULE_SET: Record<string, string> = {
  coconut: 'coconut3d.js',
  banana: 'banana3d.js',
  mango: 'mango3d.js',
  corn: 'corn3d.js',
  pineapple: 'pineapple3d.js',
};
const MODEL_MODULE_OVERRIDE: Record<string, string> = { grits: 'grits3d.js' };
const MAX_SET: Record<string, number> = { coconut: 600, banana: 150, mango: 150, corn: 130, pineapple: 200 };
const START_DAY: Record<string, number> = { coconut: 330, banana: 60, mango: 100, corn: 70, pineapple: 150 };

const LABEL_SET: Record<string, string> = {
  cut: 'Cut open — inner meat',
  peeled: 'Husk removed — bare shell',
  whole: 'Whole nut in husk',
  charcoal: 'Uling — carbonised shell',
  latundan: 'Latundan — flower to rot',
  saba: 'Cardaba / Saba — flower to rot',
  lakatan: 'Lakatan — flower to rot',
  carabao: 'Carabao — panicle to rot',
  cebu: 'Cebu — panicle to rot',
  pico: 'Pico — panicle to rot',
  indian: 'Indian / Katchamita — panicle to rot',
  lagkitan: 'White Lagkitan — planting to over-dry',
  yellow: 'Yellow Sweet Corn — planting to over-dry',
  pineapple: 'Pineapple — inflorescence to rot',
  grits: 'Tinigib — milled white corn grits',
  waxy: 'Purple Bicolor Waxy — planting to over-dry',
};

type Phase = { key: string; name: string; range: string; to: number; chipBg: string; look: string; product: string; sell?: string };
type Mark = { day: number; label: string };

const CORN_PHASES: Phase[] = [
  { key: 'veg', name: 'Vegetative growth', range: 'Days 0–34', to: 34, chipBg: '#E4EDC8', look: 'Leaves and stalk build up. The ear shoot is still a small green sheath of husk with no kernels inside.', product: 'Nothing to sell. Side-dress nitrogen and keep the field weed-free.' },
  { key: 'silk', name: 'Tasseling & silking (bunga)', range: 'Days 35–50', to: 50, chipBg: '#E4EDC8', look: 'Fine pale silks push out of the husk tip, one per ovule. Kernels are watery blisters; the husk is deep green and tight.', product: 'None yet. Silking day zero is what you count harvest from — 18 to 22 days for green corn.', sell: 'Mark the date. Note the silking day per block so pickers know which field is ready first.' },
  { key: 'milk', name: 'Milk stage — green harvest', range: 'Days 51–78', to: 78, chipBg: '#A7C641', look: 'Kernels are plump, glossy and full to the tip; pressing one releases a milky liquid. Husk still green, silks browning.', product: 'Boiled and grilled corn, binatog, maja blanca. Sweet corn also sells as fresh-shelled kernels.', sell: 'The green window, 18–22 days after silking: Purple waxy day 60–70, Sweet corn day 70, White Lagkitan day 72. Sugar and stickiness fall away fast after this.' },
  { key: 'dough', name: 'Dough & dent', range: 'Days 79–100', to: 100, chipBg: '#E4EDC8', look: 'Kernel tops dimple and harden, starch goes doughy then firm. The husk pales and loosens; silks are dry and dark.', product: 'Too starchy for fresh eating, too wet to mill. Feed corn if you must cut now.', sell: 'Hold. Grit varieties are still gaining dry weight on the stalk.' },
  { key: 'mature', name: 'Physiological maturity — dry on stalk', range: 'Days 101–115', to: 115, chipBg: '#A7C641', look: 'Kernels are hard, dented and chalk-white on dent types, with a black layer at the base. Husk is straw brown and papery.', product: 'White corn grits (bigas na mais) — Tinigib milled as a low-glycemic rice substitute. Also cornmeal and feed.', sell: 'The dry window: full-season white corn at day 105–110, about 60 days after silking. Harvest at 14% or lower moisture, or dry before storage.' },
  { key: 'over', name: 'Over-dry & spoilage', range: 'Days 116–130', to: 130, chipBg: '#EBD9CF', look: 'Ears droop and split open. Kernels shrink and crack, and grey-green mould creeps in from the tip where rain and weevils get in.', product: 'Downgraded to feed at best. Mouldy lots carry aflatoxin and are rejected by millers.', sell: 'No premium left. Get standing ears off the field — every week costs weight and grade.' },
];
const CORN_MARKS: Mark[] = [
  { day: 20, label: 'Vegetative' },
  { day: 42, label: 'Silking' },
  { day: 66, label: 'Waxy' },
  { day: 72, label: 'Lagkitan' },
  { day: 108, label: 'Grits' },
  { day: 125, label: 'Over-dry' },
];

const MANGO_PHASES: Phase[] = [
  { key: 'bud', name: 'Bud Initiation & Elongation', range: 'Days 1–14', to: 14, chipBg: '#EBD9CF', look: 'Small cone-shaped buds appear at the ends of branches and stretch out into pyramid-shaped clusters called panicles.', product: 'Nothing to sell yet. This is the window for flower induction and fungicide cover against anthracnose.', sell: 'Too early. Count 115–125 days forward from bud break to plan your harvest crew and buyer.' },
  { key: 'bloom', name: 'Full Bloom & Pollination', range: 'Days 15–25', to: 25, chipBg: '#EBD9CF', look: 'Thousands of tiny yellowish-white flowers open. Insects pollinate the female flowers, while unpollinated male flowers dry up and fall off.', product: 'Mango blossom honey, if you keep hives. The panicle itself has no market.', sell: 'Too early. Avoid spraying during bloom so pollinators can work.' },
  { key: 'pea', name: 'Pea-Stage (Fruit Set)', range: 'Days 26–35', to: 35, chipBg: '#EBD9CF', look: 'Tiny, mustard seed to pea-sized green mangoes form on the stalks. The tree naturally sheds over 95% of these excess baby fruits.', product: 'None. Bag the surviving fruit now to keep the skin clean and export-grade.', sell: 'Too early. Heavy fruit drop here is normal, not a loss.' },
  { key: 'rapid', name: 'Rapid Fruit Growth', range: 'Days 36–75', to: 75, chipBg: '#E4EDC8', look: 'The remaining baby mangoes rapidly expand into full-sized green fruits. The seed inside begins hardening.', product: 'Very young green mango for burong mangga and atsara, though yield per tree is low if you pick now.', sell: 'Sell only as thinnings. Every fruit you take now is one you cannot sell at ₱75/kg later.' },
  { key: 'mature', name: 'Maturation', range: 'Days 76–110', to: 110, chipBg: '#A7C641', look: 'Fruit growth stops. Mango "shoulders" flatten at the stem, skin turns a paler green, and the inside flesh turns yellow.', product: 'Green mango trade: Indian / Katchamita with bagoong, pickles, and dried green mango strips.', sell: 'First selling window. Full-sized but sour fruit moves now to green-mango buyers and picklers.' },
  { key: 'harvest', name: 'Harvest / Softening', range: 'Days 111–125', to: 125, chipBg: '#A7C641', look: 'Ideally harvested firm. Starch converts to sugar, making the mango sweet, fragrant, and soft to the touch as it turns bright yellow or orange.', product: 'Fresh dessert mango at peak price, plus dried mango, puree and juice from the same pick.', sell: 'The peak window. Pick firm and mature-green around day 111–120 — mangoes are climacteric and finish ripening in transit, so early picking buys you shipping days and the top price.' },
  { key: 'over', name: 'Over-ripening', range: 'Days 126–135', to: 135, chipBg: '#EBD9CF', look: 'The skin develops soft brown spots (often caused by natural fungi like anthracnose), the flesh gets mushy, and a fermented odor develops.', product: 'Process immediately: puree, jam, ice cream base, vinegar. The flesh is still sweet even where the skin is marked.', sell: 'Past prime for fresh trade. Sell at a discount to processors the same day rather than holding.' },
  { key: 'decomp', name: 'Decomposition', range: 'Days 136–150', to: 150, chipBg: '#EBD9CF', look: 'The skin collapses completely. Mold takes over, and the flesh turns to liquid, exposing the hard fibrous husk enclosing the seed beneath.', product: 'Compost, or save the stone for grafting rootstock.', sell: 'No market value. Clear fallen fruit from the orchard floor — it carries anthracnose into next season.' },
];
const MANGO_MARKS: Mark[] = [
  { day: 7, label: 'Buds' },
  { day: 20, label: 'Bloom' },
  { day: 30, label: 'Pea' },
  { day: 90, label: 'Mature' },
  { day: 118, label: 'Harvest' },
  { day: 140, label: 'Rotten' },
];

const BANANA_PHASES: Phase[] = [
  { key: 'puso', name: 'Flower / Puso (Bunga)', range: 'Days 0–25', to: 25, chipBg: '#EBD9CF', look: 'The purple-maroon bud breaks from the pseudostem and hangs from the stalk, bracts still tightly closed and waxy.', product: 'Puso ng Saging: the blossom itself is cut and cooked as a vegetable — kilawin, ginataan, or minced for burger patties.' },
  { key: 'bracts', name: 'Bract Opening', range: 'Days 26–75', to: 75, chipBg: '#E4EDC8', look: 'Bracts lift and drop away one rank at a time, outermost first. Each one uncovers a hand of cream-white fingers with yellow stamen tips that darken to green and curve upward.', product: 'None yet. The bud can still be cut for puso once the last hands have set.' },
  { key: 'filling', name: 'Fruit Filling', range: 'Days 76–120', to: 120, chipBg: '#A7C641', look: 'The fingers grow from tiny green flowers into full, rounded, angular-free fruits. They are harvested while still completely green.', product: 'Green Saba for chips and flour. Latundan harvests at 75–85 days, Saba at 90–100, Cavendish and Lakatan at 105–120.' },
  { key: 'ripe', name: 'Green to Ripe (Yellow)', range: 'Days 121–130', to: 130, chipBg: '#A7C641', look: 'Within 5 to 10 days after cutting, the green fruit softens and turns bright yellow (ripening faster if kept in a warm room or inside a bag).', product: 'Fresh dessert trade at peak price. Turon, banana cue and maruya from the softer fruit.' },
  { key: 'rotten', name: 'Ripe to Rotten', range: 'Days 131–150', to: 150, chipBg: '#EBD9CF', look: 'About 5 to 10 days after turning yellow, the peel develops brown spots, the flesh turns into mush, and it eventually rots with a fermented smell or visible mold.', product: 'Overripe fruit goes to banana ketchup, vinegar and livestock feed. Past that, compost.' },
];
const BANANA_MARKS: Mark[] = [
  { day: 0, label: 'Flower' },
  { day: 30, label: 'Bracts' },
  { day: 85, label: 'Latundan' },
  { day: 120, label: 'Lakatan' },
  { day: 128, label: 'Yellow' },
  { day: 142, label: 'Rotten' },
];

const COCONUT_PHASES: Phase[] = [
  { key: 'flower', name: 'Flower Opening', range: 'Day 0', to: 0, chipBg: '#E4EDC8', look: 'Canoe-shaped sheath opens to reveal tiny green buttons (female) and rice-like tips (male).', product: 'Coconut Sap / Toddy (Tuba / Coconut Vinegar): Collected by cutting the unopened flower stalk before it blooms.' },
  { key: 'garing', name: 'Immature / "Garing"', range: 'Days 1–150 / Months 1–5', to: 150, chipBg: '#E4EDC8', look: 'Small, bright green buttons grow into full-sized nuts. Inside is 100% water; no meat has formed yet. Shell is soft and white.', product: 'None. Too early for any commercial use.' },
  { key: 'buko', name: 'Young Coconut (Buko)', range: 'Days 180–240 / Months 6–8', to: 270, chipBg: '#A7C641', look: 'Perfect Green Stage. Skin is smooth, solid green. Stalk base is still green. Inside: Water is at maximum volume/sweetness. Meat is translucent, jelly-like (malamukut).', product: 'Buko Juice & Salad: Harvested at Day 210. Virgin Coconut Oil (VCO): Best at Day 240 for wet-milling because the meat is fresh and easy to grate.' },
  { key: 'niyog', name: 'Mature Coconut (Niyog)', range: 'Days 300–360 / Months 10–12', to: 380, chipBg: '#A7C641', look: 'Perfect Copra Stage. Outer husk turns 75% to 100% dark brown and wrinkled. Shaking it produces a loud, clear sloshing sound. Meat is thick, hard, pure white, and highly oily.', product: 'Premium Copra & Coconut Oil: Day 330 (11 months) is the absolute peak. Highest oil yield. Desiccated Coconut: Shredded dried meat for baking.' },
  { key: 'tubuan', name: 'Sprouting (Tubuan)', range: 'Days 400–500 / Months 13–16', to: 520, chipBg: '#F7ECCB', look: 'Nut falls to the ground. A green shoot bursts through the husk. Inside, a spongy, sweet white ball (coconut apple / buwa) grows, absorbing the remaining water and meat.', product: 'Planting / Seedlings: Best time to transfer to soil. Buwa Eating: The spongy core is eaten as a local delicacy, though the copra meat quality is completely gone.' },
  { key: 'rot', name: 'Rotting & Decomposition', range: 'Days 550+ / Month 18+', to: 600, chipBg: '#EBD9CF', look: 'Husk becomes fragile and black. If the sprout dies (due to lack of soil/water), bacteria and fungi enter. Inside, the oil turns rancid, smelling sour or foul. The shell cracks and caves in.', product: 'Compost / Waste: No commercial value. Burned for fuel or left to decompose.' },
];
const COCONUT_MARKS: Mark[] = [
  { day: 0, label: 'Flower' },
  { day: 210, label: 'Buko' },
  { day: 240, label: 'VCO' },
  { day: 330, label: 'Copra peak' },
  { day: 450, label: 'Sprout' },
  { day: 580, label: 'Rot' },
];

const PINEAPPLE_PHASES: Phase[] = [
  { key: 'cone', name: 'Inflorescence (red cone)', range: 'Days 0–25', to: 25, chipBg: '#EBD9CF', look: 'A dense red-pink cone pushes up from the centre of the rosette on a short stalk. No fruit yet — just tightly packed bracts, each hiding one flower.', product: 'Nothing to sell. This is day zero for counting harvest.', sell: 'Forcing date matters more than planting date. Tag the block so you know which fruits mature together.' },
  { key: 'bloom', name: 'Flowering (anthesis)', range: 'Days 26–45', to: 45, chipBg: '#EBD9CF', look: 'Violet-blue tubular florets open in a spiral from the base upward, a few rows a day, each lasting about a day. The cone is still red between them.', product: 'None. Fruit set is happening now.', sell: 'Avoid spraying here. The spiral bloom order is why the fruit later ripens bottom-up.' },
  { key: 'set', name: 'Fruit set & fusion', range: 'Days 46–95', to: 95, chipBg: '#E4EDC8', look: 'Florets wither and the individual fruitlets swell and fuse into one body. The shell is hard, dark green and matte, with raised pointed eyes. The crown is small and upright.', product: 'Too acidic and starchy to eat. Nothing harvestable.', sell: 'Hold. Sugar is only laid down in the last third of the cycle.' },
  { key: 'fill', name: 'Fruit filling', range: 'Days 96–130', to: 130, chipBg: '#E4EDC8', look: 'The fruit reaches close to full size. Eyes flatten and broaden, the shell goes from dark to mid green with a faint sheen, and the crown fans out.', product: 'Still green. Cut now and it never sweetens — pineapple does not ripen off the plant.', sell: 'Watch the base. The first yellow at the peduncle end is your signal, about 3 weeks out.' },
  { key: 'harvest', name: 'Degreening — harvest window', range: 'Days 131–170', to: 170, chipBg: '#A7C641', look: 'Gold climbs from the base upward, eye by eye. The shell smells sweet, sounds dull when tapped, and the flesh under it turns translucent yellow.', product: "Fresh fruit, juice, jam, halo-halo and hopia fillings. Crown suckers become next season's planting material.", sell: 'Cannery buyers take it at a quarter yellow, roughly day 140. Fresh market pays best at half to three-quarters yellow, around day 150–160. Cut with a short stub of stalk and keep the crown on.' },
  { key: 'over', name: 'Overripe', range: 'Days 171–188', to: 188, chipBg: '#EBD9CF', look: 'The whole shell is deep amber-orange. Flesh goes translucent and soft, juice weeps at the base, and the aroma turns fermented. Lower crown leaves dry and curl.', product: 'Vinegar, wine, tepache and syrup. Still fine for juice if pressed the same day.', sell: 'No fresh premium left. Move it to processing buyers, not the market stall.' },
  { key: 'rot', name: 'Rot & collapse', range: 'Days 189–200', to: 200, chipBg: '#EBD9CF', look: 'Water-soaked brown patches spread from the base and the eyes. Black rot sinks in, the shell caves where the flesh has liquefied, and the crown is brown and brittle.', product: 'Compost only. Fermenting fruit also draws fruit flies into the block.', sell: "Cull and bury. Leaving rotten fruit in the field seeds next season's problems." },
];
const PINEAPPLE_MARKS: Mark[] = [
  { day: 12, label: 'Red cone' },
  { day: 35, label: 'Flowering' },
  { day: 110, label: 'Filling' },
  { day: 140, label: 'Cannery' },
  { day: 155, label: 'Fresh' },
  { day: 195, label: 'Rotten' },
];

const CHARCOAL_STEPS = [
  { n: '1', name: 'Accumulation & sun-drying', time: '2–3 weeks', text: 'Shells (banga) left after the meat is scooped for copra are laid out under the sun until completely dry and brittle — wet shells smoke heavily and carbonise poorly.' },
  { n: '2', name: 'Burning & carbonization', time: '4–24 hours', text: 'Shells are packed over a husk fire in a pit or drum. Once the load glows red — or the white smoke thins to blue — it is sealed with banana leaves, yero and damp soil, or the lid is beaten shut and the vents packed with mud.' },
  { n: '3', name: 'Cooling & smothering', time: '12–24 hours', text: 'Left untouched overnight so the embers die without oxygen. Any air leak turns the batch to worthless gray ash. The vessel must be cold to the touch before opening.' },
  { n: '4', name: 'Harvesting & sieving', time: '2–3 hours', text: 'The seal is raked away and the uling shovelled onto a coarse mesh screen, shaken to sift out ash, dirt and unburned pieces.' },
];
const CHARCOAL_METHODS = [
  { name: 'Hukay — pit', time: '8–12 hours', text: 'Fire lit with dried husks at the bottom of a dug pit, shells layered on as the batch chars.' },
  { name: 'Piloto — drum', time: '4–8 hours', text: 'A vented 55-gallon drum packed tight. Faster than a pit, but needs closer watching.' },
];
const GRITS_METHODS = [
  { name: 'Kudkuran — village mill', time: '1–2 hours / sack', text: 'A local disc mill cracks and grades the dry grain. Most farmers pay in kind, leaving a share of the bran.' },
  { name: 'Degerminated mill', time: '3–4 hours / batch', text: 'Germ and bran stripped first for a whiter, longer-keeping grit. Lower yield, higher price.' },
];
const GRITS_STEPS = [
  { n: '1', name: 'Field drying on the stalk', time: '105–110 days', text: 'Dent varieties are never picked green. The ear is left standing until a black layer forms at the kernel base — full maturity, about 60 days after silking.' },
  { n: '2', name: 'Harvest & shelling', time: '4–6 hours / hectare', text: 'Ears are snapped, husked and run through a corn sheller. Kernels should already be hard enough to crack rather than dent under a thumbnail.' },
  { n: '3', name: 'Sun drying (bulad)', time: '2–3 days', text: 'Spread on a concrete pavement or tarpaulin and raked every hour down to 14% moisture or lower. Under-dried grain moulds in the sack and mills into a pasty grit.' },
  { n: '4', name: 'Milling & grading', time: '1–2 hours / sack', text: 'Grain is cracked, the bran and germ sifted off, then screened into sizes — coarse for the rice-substitute grit, fine for cornmeal and native delicacies.' },
];

function phaseListFor(crop: string): Phase[] {
  if (crop === 'banana') return BANANA_PHASES;
  if (crop === 'mango') return MANGO_PHASES;
  if (crop === 'corn') return CORN_PHASES;
  if (crop === 'pineapple') return PINEAPPLE_PHASES;
  return COCONUT_PHASES;
}
function markListFor(crop: string): Mark[] {
  if (crop === 'banana') return BANANA_MARKS;
  if (crop === 'mango') return MANGO_MARKS;
  if (crop === 'corn') return CORN_MARKS;
  if (crop === 'pineapple') return PINEAPPLE_MARKS;
  return COCONUT_MARKS;
}

type Viewer = { setDay: (d: number) => void; dispose?: () => void; ready?: Promise<unknown> };

/* ------------------------------------------------------------- component --- */

export default function AlmanacPage() {
  const [mini, setMini] = useState(false);
  const [crop, setCrop] = useState('coconut');
  const [type, setType] = useState('peeled');
  const [day, setDay] = useState(330);
  const [loading, setLoading] = useState(true);

  const canvasHostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const dayRef = useRef(day);

  const cropObj = CROP_SET.filter((x) => x.key === crop)[0];
  const typeObj = cropObj.types.filter((t) => t.key === type)[0] || null;
  const model = typeObj ? typeObj.model : null;
  const maxDay = MAX_SET[crop] || 600;

  // Build (or tear down + rebuild) the 3D viewer whenever the selected
  // crop/model changes — mirrors the original's sync()/componentDidUpdate.
  useEffect(() => {
    const host = canvasHostRef.current;
    if (!model || !host) return;
    let cancelled = false;
    setLoading(true);
    const src = MODEL_MODULE_OVERRIDE[model] || MODULE_SET[crop] || 'coconut3d.js';
    const url = new URL(src, window.location.origin).href;
    import(/* webpackIgnore: true */ url)
      .then((mod) => {
        if (cancelled || !canvasHostRef.current) return;
        const viewer: Viewer = mod.createViewer(canvasHostRef.current, model);
        viewerRef.current = viewer;
        viewer.setDay(dayRef.current);
        const done = () => {
          if (!cancelled) setLoading(false);
        };
        if (viewer.ready) viewer.ready.then(done, done);
        else done();
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (viewerRef.current) {
        viewerRef.current.dispose?.();
        viewerRef.current = null;
      }
      if (host) host.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crop, model]);

  // Scrub the existing viewer's day without rebuilding it.
  useEffect(() => {
    dayRef.current = day;
    viewerRef.current?.setDay(day);
  }, [day]);

  function pickCrop(key: string) {
    const cropDef = CROP_SET.filter((x) => x.key === key)[0];
    setCrop(key);
    setType(cropDef.types[0].model ? cropDef.types[0].key : '');
    setDay(START_DAY[key] || 0);
  }

  const studioOn = !!model;
  const isUling = model === 'charcoal' || model === 'grits';
  const showTimeline = !!model && model !== 'charcoal' && model !== 'grits';
  const steps = model === 'grits' ? GRITS_STEPS : CHARCOAL_STEPS;
  const procTitle = model === 'grits' ? 'How grits are made' : 'How uling is made';
  const procHead = model === 'grits' ? 'Tinigib white corn, milled Visayan style' : 'Traditional Filipino shell charcoal';
  const procIntro =
    model === 'grits'
      ? 'Dent corn is left to dry on the stalk to full maturity, then shelled, dried down and passed through a mill. A sack moves from stalk to sellable grits in 3 to 5 days.'
      : 'Shells left over from copra are carbonised by the mangingiling in one of two ancestral setups. Burning to cold harvest takes 3 to 4 days.';
  const methods = model === 'grits' ? GRITS_METHODS : CHARCOAL_METHODS;
  const useHead = 'Where it is used';
  const useText =
    model === 'grits'
      ? 'Cooked like rice as the everyday Visayan staple — low-glycemic and slower-digesting, so it holds a steady market with diabetic and health buyers. Also ground finer for binignit, puto maya and corn coffee.'
      : 'Packed into woven sacks and sold to lechon houses, barbecue vendors and transport hubs. Premium uling rings metallic and black; unburned brown pieces (hilaw) are screened out.';
  const stageNote = model === 'grits' ? 'Milled grain — no fresh window' : 'Carbonised shell';
  const stageChip = model === 'grits' ? '105–110 days on the stalk' : '3–4 days end to end';
  const modelLabel = model ? LABEL_SET[model] || '' : '';

  const monthLabel =
    crop === 'banana'
      ? 'Day ' + day + ' since the flower appeared'
      : crop === 'mango'
        ? 'Day ' + day + ' since the bud appeared'
        : crop === 'corn'
          ? 'Day ' + day + ' after planting'
          : crop === 'pineapple'
            ? 'Day ' + day + ' since the red cone appeared'
            : 'Month ' + (Math.floor(day / 30) || 0) + ' after flowering';
  const dayLabel =
    crop === 'mango'
      ? 'Days since the bud broke'
      : crop === 'corn'
        ? 'Days after planting'
        : crop === 'pineapple'
          ? 'Days since forcing'
          : 'Days since the flower opened';

  const pct = Math.round((day / maxDay) * 100) + '%';
  const marks = markListFor(crop).map((m) => {
    const on = Math.abs(day - m.day) <= (crop === 'coconut' ? 12 : 4);
    return { ...m, border: on ? '#A7C641' : 'rgba(6,47,36,.1)', bg: on ? '#F1F5E4' : '#FFFFFF' };
  });
  const phaseList = phaseListFor(crop);
  const phase = phaseList.filter((p) => day <= p.to)[0] || phaseList[phaseList.length - 1];

  return (
    <div data-shell="" className={styles.shell} style={{ '--cols': mini ? '76px' : '246px' } as CSSProperties}>
      <AppSidebar active="almanac" mini={mini} onToggle={() => setMini((m) => !m)} />

      <div className={styles.content}>
        <header>
          <h1 className={styles.pageTitle}>
            Crop almanac
          </h1>
          <p className={styles.pageSubtitle}>
            Product types, listing prices and harvest windows for every crop on AniTime. Every crop here includes a
            day-by-day life-cycle model you can scrub through.
          </p>
        </header>

        <div className={styles.cropGrid}>
          {CROP_SET.map((cr) => {
            const on = cr.key === crop;
            return (
              <button
                key={cr.key}
                type="button"
                onClick={() => pickCrop(cr.key)}
                className={styles.cropBtn}
                style={{ '--cb-border': on ? '#A7C641' : 'rgba(6,47,36,.1)', '--cb-bg': on ? '#F6F9EC' : '#FFFFFF' } as CSSProperties}
              >
                <span className={styles.cropImgWrap}>
                  <img src={cr.img} alt={cr.name} className={styles.cropImg} />
                </span>
                <span className={styles.cropName}>
                  {cr.name}
                </span>
                <span className={styles.cropMeta}>
                  {CROP_CARD_META[cr.key]}
                </span>
                <span className={styles.cropCue}>Life-cycle model</span>
              </button>
            );
          })}
        </div>

        <section className={styles.typesSection}>
          <div className={styles.typesHeadRow}>
            <span className={styles.typesIcon}>
              <img src={cropObj.img} alt={cropObj.name} className={styles.typesIconImg} />
            </span>
            <div className={styles.typesTitleWrap}>
              <div className={styles.typesKicker}>
                Product types
              </div>
              <h2 className={styles.typesTitle}>
                {cropObj.name}
              </h2>
            </div>
            <span className={styles.typesHint}>{cropObj.hint}</span>
          </div>

          <div className={styles.typesGrid}>
            {cropObj.types.map((t) => {
              const on = t.key === type;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setType(t.key)}
                  className={styles.typeBtn}
                  style={{ '--tb-border': on ? '#A7C641' : 'rgba(255,255,255,.16)', '--tb-bg': on ? '#F6F9EC' : '#FFFFFF' } as CSSProperties}
                >
                  <span className={styles.typeTopRow}>
                    <span className={styles.typeName}>{t.name}</span>
                    {!!t.model && (
                      <span className={styles.type3dBadge}>
                        3D
                      </span>
                    )}
                  </span>
                  <span className={styles.typePrice}>
                    {t.price}
                  </span>
                  <span className={styles.typeNote}>{t.note}</span>
                </button>
              );
            })}
          </div>
        </section>

        {studioOn && (
          <section data-studio="" className={styles.studioGrid}>
            <div className={styles.viewerCard}>
              <span aria-hidden="true" className={styles.viewerGradient1} />
              <span aria-hidden="true" className={styles.viewerGradient2} />
              <div ref={canvasHostRef} className={styles.canvasHost} />

              <div className={styles.viewerBadgesRow}>
                <span className={styles.modelLabelBadge}>
                  {modelLabel}
                </span>
                <span className={styles.dragHintBadge}>
                  Drag to rotate
                </span>
              </div>

              {loading && (
                <span className={styles.loadingOverlay}>
                  Preparing 3D model…
                </span>
              )}

              {showTimeline && (
                <div className={styles.viewerOverlayRow}>
                  <span className={styles.dayBig}>Day {day}</span>
                  <span className={styles.monthLabelText}>{monthLabel}</span>
                  <span className={styles.phaseChip} style={{ '--chip-bg': phase.chipBg } as CSSProperties}>
                    {phase.name}
                  </span>
                </div>
              )}

              {isUling && (
                <div className={styles.viewerOverlayRow}>
                  <span className={styles.stageNoteText}>{stageNote}</span>
                  <span className={styles.stageChipBadge}>
                    {stageChip}
                  </span>
                </div>
              )}
            </div>

            <div className={styles.sideCol}>
              {isUling && (
                <>
                  <div className={styles.infoCard}>
                    <div className={styles.infoKicker}>
                      {procTitle}
                    </div>
                    <h3 className={styles.infoTitle}>{procHead}</h3>
                    <p className={styles.infoBody}>{procIntro}</p>
                    <div className={styles.methodsGrid}>
                      {methods.map((m) => (
                        <div key={m.name} className={styles.methodCard}>
                          <div className={styles.methodName}>{m.name}</div>
                          <div className={styles.methodTime}>{m.time}</div>
                          <p className={styles.methodText}>{m.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className={styles.infoCardFlex}>
                    <div className={styles.infoKicker}>
                      Process &amp; hours
                    </div>
                    <div className={styles.stepsList}>
                      {steps.map((s) => (
                        <div key={s.n} className={styles.stepRow}>
                          <span className={styles.stepNumBadge}>
                            {s.n}
                          </span>
                          <span className={styles.stepContent}>
                            <span className={styles.stepTopRow}>
                              <span className={styles.stepName}>{s.name}</span>
                              <span className={styles.stepTime}>{s.time}</span>
                            </span>
                            <span className={styles.stepText}>
                              {s.text}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className={styles.calloutBox}>
                      <div className={styles.infoKickerGreen}>
                        {useHead}
                      </div>
                      <p className={styles.infoBodyDark}>{useText}</p>
                    </div>

                    <div className={styles.viewingRow}>
                      <span className={styles.viewingLabel}>Viewing</span>
                      <span className={styles.viewingName}>{typeObj?.name}</span>
                      <span className={styles.viewingPrice}>{typeObj?.price}</span>
                    </div>
                  </div>
                </>
              )}

              {showTimeline && (
                <>
                  <div className={styles.infoCard}>
                    <div className={styles.dayHeadRow}>
                      <span className={styles.dayLabelText}>{dayLabel}</span>
                      <span className={styles.dayCountText}>
                        {day} / {maxDay}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={maxDay}
                      step={1}
                      value={day}
                      onChange={(e) => setDay(parseInt(e.target.value, 10))}
                      aria-label="Day of the life cycle"
                      className={styles.rangeInput}
                      style={{ '--p': pct } as CSSProperties}
                    />
                    <div className={styles.marksRow}>
                      {marks.map((mk) => (
                        <button
                          key={mk.day}
                          type="button"
                          onClick={() => setDay(mk.day)}
                          className={styles.markBtn}
                          style={{ '--mk-border': mk.border, '--mk-bg': mk.bg } as CSSProperties}
                        >
                          <span className={styles.markDay}>{mk.day}</span>
                          <span className={styles.markLabel}>{mk.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={styles.infoCardFlex}>
                    <div className={styles.phaseHeadRow}>
                      <h3 className={styles.phaseName}>{phase.name}</h3>
                      <span className={styles.phaseRange}>{phase.range}</span>
                    </div>

                    <div className={styles.blockMt14}>
                      <div className={styles.infoKicker}>
                        Visual appearance &amp; internal context
                      </div>
                      <p className={styles.infoBody}>{phase.look}</p>
                    </div>

                    <div className={styles.blockMt16Border}>
                      <div className={styles.infoKicker}>
                        Best product to make
                      </div>
                      <p className={styles.infoBodyDark}>{phase.product}</p>
                    </div>

                    {!!phase.sell && (
                      <div className={styles.calloutBox}>
                        <div className={styles.infoKickerGreen}>
                          When to harvest &amp; sell
                        </div>
                        <p className={styles.infoBodyDark}>{phase.sell}</p>
                      </div>
                    )}

                    <div className={styles.viewingRow}>
                      <span className={styles.viewingLabel}>Viewing</span>
                      <span className={styles.viewingName}>{typeObj?.name}</span>
                      <span className={styles.viewingPrice}>{typeObj?.price}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

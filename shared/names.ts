// Carrier names: a title plus a name, like "Sir Pickles". All friendly and kid-safe.
// Uniqueness among carriers in transit is enforced by the server when a letter is saved.

export const TITLES = [
  'Sir', 'Dame', 'Captain', 'Professor', 'Lady', 'Duke', 'Duchess', 'Agent', 'Admiral', 'Little',
  'Big', 'Count', 'Countess', 'Doctor', 'Baron', 'Baroness', 'Major', 'Colonel', 'Sergeant', 'Chef',
  'Judge', 'Mayor', 'Coach', 'Auntie', 'Uncle', 'Granny', 'Grandpa', 'Princess', 'Prince', 'Queen',
  'King', 'Lord', 'Madame', 'Monsieur', 'Senor', 'Officer', 'Pilot', 'Skipper', 'Commodore', 'Wizard',
];

export const NAMES = [
  'Pickles', 'Biscuit', 'Noodle', 'Waffles', 'Pebble', 'Mochi', 'Turnip', 'Gizmo', 'Peaches', 'Crumpet',
  'Nugget', 'Sprout', 'Dumpling', 'Clementine', 'Bean', 'Pretzel', 'Muffin', 'Pistachio', 'Bramble', 'Toffee',
  'Kiwi', 'Marbles', 'Puddle', 'Scone', 'Butterbean', 'Cobbler', 'Custard', 'Doughnut', 'Fig', 'Fudge',
  'Gumdrop', 'Hazelnut', 'Jellybean', 'Kumquat', 'Lentil', 'Macaroon', 'Meringue', 'Nutmeg', 'Oatcake', 'Pancake',
  'Parsnip', 'Peanut', 'Pudding', 'Radish', 'Rhubarb', 'Sesame', 'Snickerdoodle', 'Sprinkles', 'Strudel', 'Tapioca',
  'Teacake', 'Truffle', 'Walnut', 'Wasabi', 'Yam', 'Zucchini', 'Acorn', 'Apricot', 'Bagel', 'Basil',
  'Blueberry', 'Brioche', 'Brownie', 'Cashew', 'Cheddar', 'Chestnut', 'Chickpea', 'Cinnamon', 'Clover', 'Coconut',
  'Cookie', 'Cranberry', 'Cupcake', 'Daisy', 'Dandelion', 'Dimsum', 'Eclair', 'Edamame', 'Falafel', 'Fennel',
  'Gingersnap', 'Granola', 'Guava', 'Honeydew', 'Jam', 'Kale', 'Lemon', 'Lychee', 'Mango', 'Maple',
  'Marshmallow', 'Melon', 'Mint', 'Miso', 'Moss', 'Mustard', 'Nectarine', 'Olive', 'Paprika', 'Papaya',
  'Pepper', 'Pinecone', 'Plum', 'Popcorn', 'Potato', 'Pumpkin', 'Quince', 'Raisin', 'Ravioli', 'Saffron',
  'Sage', 'Shortbread', 'Sorbet', 'Soybean', 'Sugarsnap', 'Taco', 'Tangerine', 'Tater', 'Thistle', 'Tofu',
  'Tortellini', 'Udon', 'Vanilla', 'Wombat', 'Wonton', 'Ziti', 'Button', 'Pom Pom', 'Whiskers', 'Bubbles',
  'Doodle', 'Fizz', 'Gadget', 'Jingles', 'Kazoo', 'Lollipop', 'Moonbeam', 'Nimbus', 'Pip', 'Pogo',
  'Puffin', 'Rascal', 'Ripple', 'Scooter', 'Sparkle', 'Sunny', 'Tinsel', 'Tumble', 'Twinkle', 'Wiggles',
  'Zigzag', 'Bloop', 'Breezy', 'Comet', 'Domino', 'Echo', 'Flapjack', 'Hopscotch', 'Jumble', 'Marzipan',
];

export const BOTTLE_PREFIXES = ['The S.S.', 'The H.M.S.', 'The Good Ship', 'Bottle No.'];

// A name is valid only if it came from these lists (kid-safe by construction).
export function isValidName(name: string, carrier: 'pigeon' | 'bottle'): boolean {
  if (carrier === 'pigeon') {
    const t = TITLES.find(t => name.startsWith(t + ' '));
    return !!t && NAMES.includes(name.slice(t.length + 1));
  }
  if (/^Bottle No\. [1-9]\d{2}$/.test(name)) return true;
  const p = BOTTLE_PREFIXES.find(p => p !== 'Bottle No.' && name.startsWith(p + ' '));
  return !!p && NAMES.includes(name.slice(p.length + 1));
}

function pick<T>(a: T[]): T {
  const u = new Uint32Array(1);
  crypto.getRandomValues(u);
  return a[u[0] % a.length];
}

export function pigeonName(exclude: Set<string> = new Set()): string {
  for (let i = 0; i < 200; i++) {
    const n = pick(TITLES) + ' ' + pick(NAMES);
    if (!exclude.has(n)) return n;
  }
  return pick(TITLES) + ' ' + pick(NAMES);
}

export function bottleName(exclude: Set<string> = new Set()): string {
  for (let i = 0; i < 200; i++) {
    const p = pick(BOTTLE_PREFIXES);
    const n = p === 'Bottle No.' ? p + ' ' + (100 + Math.floor(Math.random() * 900)) : p + ' ' + pick(NAMES);
    if (!exclude.has(n)) return n;
  }
  return 'Bottle No. ' + (100 + Math.floor(Math.random() * 900));
}

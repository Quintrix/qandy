// gfx-itemid.js - Item ID lookup module for gfx.js
// Returns the human-readable name for a two-character item code.

window.ItemID = function(item) {
  var items = {
    // A - Arrows / Ammo
    "Aa": "Arrow",
    "Ab": "Steel Arrow",
    "Ac": "Fire Arrow",
    "Ad": "Ice Arrow",
    "Ae": "Poison Arrow",
    "Af": "Magic Arrow",

    // B - Blunt weapons
    "Bd": "Club",
    "Be": "Mace",

    // C - Chests / Containers
    "Cg": "Chest",

    // E - Energy / Equipment
    "Ek": "Energy Orb",
    "El": "Energy Staff",

    // F - Fishing / Food / Slot items
    "Fa": "Fishing Rod",
    "Fb": "Lucky Rod",
    "Fc": "Master Rod",
    "Fd": "Golden Rod",
    "Fe": "Fishing Lure",

    // J - Jewels
    "Jc": "Jewel",

    // K - Keys
    "Ka": "Key",
    "Kf": "Skeleton Key",

    // L - Loot / Special
    "La": "Sysop Key",
    "Lb": "Lock",
    "Lc": "Locked Chest",
    "Ld": "Lock Pick",
    "Le": "Lever",
    "Lf": "Lantern",
    "Lg": "Ladder",

    // M - Misc
    "Ma": "Map",
    "Mb": "Treasure Map",

    // O - Objects
    "Ob": "Barrel",
    "OZa": "Overlay A",
    "OZb": "Overlay B",
    "OZe": "Overlay E",
    "OZf": "Overlay F",
    "OZi": "Overlay I",
    "OZj": "Overlay J",
    "OZn": "Overlay N",
    "OZo": "Overlay O",

    // P - Potions / Plants
    "Pj": "Potion",

    // R - Rare items
    "Re": "Ruby",

    // V - Valuables
    "Va": "Copper Coin",
    "Vb": "Silver Coin",
    "Vc": "Gold Coin",
    "Vd": "Platinum Coin",

    // Y - Yield items / Crafting
    "Ya": "Wood",
    "Yb": "Stone",
    "Yc": "Iron Ore",
    "Yd": "Coal",
    "Ye": "Gold Ore",
    "Yf": "Diamond",
    "Yg": "Herb",
    "Yh": "Flower",
    "Yi": "Mushroom",
    "Yj": "Berry",

    // Z - Zone/Special items
    "Za": "Empty Slot",
    "Zb": "Sign",
    "Zc": "Notice Board",
    "Zd": "Door",
    "Ze": "Portal",
    "Zf": "Fire",
    "Zg": "Gate",
    "Zh": "House",
    "Zi": "Inn",
    "Zj": "Shop",
    "Zk": "Bank",
    "Zl": "Library",
    "Zm": "City Marker",
    "Zn": "NPC Spawn",
    "Zo": "Object Spawn"
  };

  return items[item] || item;
};

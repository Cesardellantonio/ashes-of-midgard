'use strict';
/* =========================================================
   Data: elements and skills
   Loaded before js/core.js. Skill use() functions run at play time and may
   call any engine function (physHit, magicHit, bolts, addBuff, burst...).
   ========================================================= */
const ELEM_TABLE = {
  neutral: { ghost: 0.5 },
  fire: { earth: 1.5, undead: 1.5, fire: 0.25, water: 0.5 },
  water: { fire: 1.5, water: 0.25, wind: 0.5 },
  earth: { wind: 1.5, earth: 0.25, fire: 0.5 },
  wind: { water: 1.5, wind: 0.25, earth: 0.5 },
  holy: { shadow: 1.5, undead: 2, holy: 0 },
  shadow: { holy: 1.5, shadow: 0, undead: 0.5 },
  ghost: { ghost: 1.5, neutral: 0.75 },
};
const elemMod = (a, d) => (ELEM_TABLE[a] && ELEM_TABLE[a][d] !== undefined) ? ELEM_TABLE[a][d] : 1;
const ELCOL = { neutral: '#a89a88', fire: '#e0582a', water: '#4aa0e0', wind: '#d8cf5a', earth: '#9a7442', holy: '#efe0a0', ghost: '#9a7ad8', shadow: '#7a55a0', undead: '#8a9a7a' };

function healAmt(lv) { return Math.max(1, Math.floor((P.lvl + S.int) / 8)) * (4 + 8 * lv); }
const SKILLS = {
  basic: { name: 'Basic Skill', max: 9, passive: true, rune: 'ᛗ', el: 'neutral', desc: () => 'What every Unkindled must learn again. Lv 3 lets you sit (X) to recover twice as fast. Lv 9 is required to take a job.' },
  // Round 5: a passive any path can learn from Brokkr's quest (The Smith's Apprentice). Raised by crafting practice
  // (P.flags.craftXp, craftXpGain in core.js) or with skill points. Read by craftChance / craftQualityOdds.
  craftsmanship: { name: 'Craftsmanship', max: 10, passive: true, rune: 'ᚷ', el: 'fire', desc: lv => `The smith's craft. Lv ${lv}: +${lv * 4} % success over a recipe's level, Fine gear ${15 + lv * 3} % and Masterwork ${Math.round(3 + lv * 1.5)} % (before DEX and LUK). Unlocks recipes up to Lv ${lv}. Rises with practice at the forge.` },
  first_aid: { name: 'First Aid', max: 1, rune: 'ᛒ', el: 'holy', tgt: 'self', sp: () => 3, cd: 1, desc: () => 'Bind your wounds. Restores 5 HP plus 3% of Max HP.', use() { healP(5 + S.maxhp * 0.03); } },
  sword_mastery: { name: 'Sword Mastery', max: 10, passive: true, rune: 'ᛏ', el: 'neutral', desc: lv => `+${lv * 4} ATK while wielding a dagger or sword.` },
  bash: { name: 'Bash', max: 10, rune: 'ᚦ', el: 'neutral', tgt: 'enemy', range: 'weapon', sp: lv => lv < 6 ? 8 : 15, cd: 0.35, desc: lv => `A crushing blow for ${100 + 30 * lv}% ATK with +${lv * 5} HIT.`,
    use(lv, t) { P.atkAnim = 0; after(0.12, () => { if (!t.dead) { physHit(t, 1 + 0.3 * lv, { hit: lv * 5 }); burst(t.x, t.y, 24, '#ffd27a', 10, 2.5); } }); } },
  magnum: { name: 'Magnum Break', max: 10, rune: 'ᚲ', el: 'fire', tgt: 'self', sp: () => 30, cd: 2, desc: lv => `Erupt in flame: ${100 + 20 * lv}% fire ATK to every enemy within 2.5 cells, knocking them back.`,
    use(lv) { ring(P.x, P.y, 2.5, '#ff7a2a'); burst(P.x, P.y, 6, '#ff8a3a', 30, 4); for (const m of mobsNear(P.x, P.y, 2.5)) physHit(m, 1 + 0.2 * lv, { elem: 'fire', sure: true, knock: 2, from: { x: P.x, y: P.y } }); Sfx.fire(); } },
  endure: { name: 'Endure', max: 10, rune: 'ᛉ', el: 'earth', tgt: 'self', sp: () => 10, cd: 10, desc: lv => `Brace for ${7 + lv * 3}s: +${lv * 2} DEF and +${lv} MDEF.`,
    use(lv) { addBuff('endure', 'Endure', 'endure', 7 + lv * 3, { def: lv * 2, mdef: lv }); burst(P.x, P.y, 20, '#e8c07a', 14, 1.6); } },
  hp_recovery: { name: 'Increase HP Recovery', max: 10, passive: true, rune: 'ᚢ', el: 'earth', desc: lv => `+${lv * 5} HP and +${(lv * 0.2).toFixed(1)}% Max HP on each regeneration tick.` },
  fire_bolt: { name: 'Fire Bolt', max: 10, rune: 'ᚲ', el: 'fire', tgt: 'enemy', range: 9, sp: lv => 10 + 2 * lv, cast: lv => 0.35 + 0.28 * lv, cd: 0.5, desc: lv => `Hurl ${lv} bolt${lv > 1 ? 's' : ''} of fire, each 100% fire MATK.`, use(lv, t) { bolts(t, lv, 'fire', 1); } },
  cold_bolt: { name: 'Cold Bolt', max: 10, rune: 'ᛁ', el: 'water', tgt: 'enemy', range: 9, sp: lv => 10 + 2 * lv, cast: lv => 0.35 + 0.28 * lv, cd: 0.5, desc: lv => `Hurl ${lv} shard${lv > 1 ? 's' : ''} of ice, each 100% water MATK.`, use(lv, t) { bolts(t, lv, 'water', 1); } },
  lightning_bolt: { name: 'Lightning Bolt', max: 10, rune: 'ᛊ', el: 'wind', tgt: 'enemy', range: 9, sp: lv => 10 + 2 * lv, cast: lv => 0.35 + 0.28 * lv, cd: 0.5, desc: lv => `Call ${lv} lightning strike${lv > 1 ? 's' : ''} on the target, each 100% wind MATK.`, use(lv, t) { bolts(t, lv, 'wind', 1); } },
  soul_strike: { name: 'Soul Strike', max: 10, rune: 'ᛟ', el: 'ghost', tgt: 'enemy', range: 9, sp: lv => 14 + 2 * lv, cast: () => 0.5, cd: 0.7, desc: lv => `Loose ${Math.ceil(lv / 2)} spirit sphere${lv > 2 ? 's' : ''}, each 100% ghost MATK, +${lv * 5}% against the undead.`, use(lv, t) { bolts(t, Math.ceil(lv / 2), 'ghost', 1, { undeadBonus: lv * 0.05 }); } },
  frost_diver: { name: 'Frost Diver', max: 10, rune: 'ᚾ', el: 'water', tgt: 'enemy', range: 9, sp: lv => 25 - lv, cast: () => 0.8, cd: 1, desc: lv => `${100 + 10 * lv}% water MATK with a ${35 + 3 * lv}% chance to freeze the target for ${(3 + lv * 0.3).toFixed(1)}s. Bosses and undead resist.`,
    use(lv, t) { shot(P, t, 'ice', () => { magicHit(t, 1 + 0.1 * lv, 'water'); if (!t.dead && !t.d.boss && t.d.elem !== 'undead' && Math.random() * 100 < 35 + 3 * lv) { t.frozen = 3 + lv * 0.3; t.path = null; floatText(t, 'Frozen', 'info'); } }); } },
  thunderstorm: { name: 'Thunderstorm', max: 10, rune: 'ᚺ', el: 'wind', tgt: 'ground', range: 9, sp: lv => 22 + 4 * lv, cast: lv => 0.9 + lv * 0.2, cd: 1.2, desc: lv => `Call ${lv} lightning strike${lv > 1 ? 's' : ''} down on an area (2.5 cells). Each hits every enemy inside for 80% wind MATK.`,
    use(lv, t, pos) { for (let i = 0; i < lv; i++) after(i * 0.2, () => { strike(pos.x + rand(-1.2, 1.2), pos.y + rand(-1.2, 1.2)); for (const m of mobsNear(pos.x, pos.y, 2.5)) magicHit(m, 0.8, 'wind'); }); } },
  sp_recovery: { name: 'Increase SP Recovery', max: 10, passive: true, rune: 'ᛃ', el: 'water', desc: lv => `+${lv * 3} SP on each regeneration tick.` },
  owls_eye: { name: 'Owl’s Eye', max: 10, passive: true, rune: 'ᛞ', el: 'wind', desc: lv => `+${lv} DEX.` },
  vultures_eye: { name: 'Vulture’s Eye', max: 10, passive: true, rune: 'ᛇ', el: 'wind', desc: lv => `+${(lv * 0.5).toFixed(1)} cells of bow range and +${lv} HIT.` },
  double_strafe: { name: 'Double Strafe', max: 10, rune: 'ᚱ', el: 'neutral', tgt: 'enemy', range: 'weapon', sp: () => 12, cd: 0.35, desc: lv => `Loose two arrows at once, each ${100 + 10 * lv}% ATK.`,
    use(lv, t) { P.atkAnim = 0; shot(P, t, 'arrow', () => physHit(t, 1 + 0.1 * lv)); after(0.1, () => { if (!t.dead) shot(P, t, 'arrow', () => physHit(t, 1 + 0.1 * lv)); }); Sfx.bow(); } },
  arrow_shower: { name: 'Arrow Shower', max: 10, rune: 'ᛜ', el: 'neutral', tgt: 'ground', range: 'weapon', sp: () => 15, cd: 0.7, desc: lv => `Rain arrows on an area (2 cells) for ${80 + 5 * lv}% ATK, pushing enemies back.`,
    use(lv, t, pos) { P.atkAnim = 0; fxs.push({ k: 'rain', x: pos.x, y: pos.y, t: 0, dur: 0.4 }); Sfx.bow(); after(0.3, () => { for (const m of mobsNear(pos.x, pos.y, 2)) physHit(m, 0.8 + 0.05 * lv, { knock: 2, from: { x: pos.x, y: pos.y } }); }); } },
  concentration: { name: 'Improve Concentration', max: 10, rune: 'ᚨ', el: 'wind', tgt: 'self', sp: lv => 20 + 5 * lv, cd: 3, desc: lv => `For ${40 + 20 * lv}s: +${2 + lv} AGI and +${2 + lv} DEX.`,
    use(lv) { addBuff('conc', 'Concentration', 'concentration', 40 + 20 * lv, { agi: 2 + lv, dex: 2 + lv }); burst(P.x, P.y, 20, '#cfe07a', 16, 1.8); } },
  heal: { name: 'Heal', max: 10, rune: 'ᛒ', el: 'holy', tgt: 'heal', range: 9, sp: lv => 10 + 3 * lv, cd: 0.4, desc: lv => `Restore ${P && S ? healAmt(lv) : '?'} HP. Cast on an undead enemy to burn it for half that as holy damage.`,
    use(lv, t) { const a = healAmt(lv); if (t && t.kind === 'mob') { const dmg = Math.round(a * 0.5 * elemMod('holy', mobElem(t))); pillar(t, '#fff2b8'); aggro(t); finishHit(t, dmg, false, {}); }
      else if (allyOf(t)) { if (!t.dead) { healHero(t, a); pillar(t, '#bff0b0'); } else if (P.skills.resurrection && typeof squadRevive === 'function') squadRevive(t, [0.1, 0.3, 0.5, 0.8][P.skills.resurrection - 1], P); }   // cycle 8: an ally (a fallen one rises with Resurrection)
      else { healP(a); pillar(P, '#bff0b0'); } Sfx.heal(); } },
  blessing: { name: 'Blessing', max: 10, rune: 'ᚷ', el: 'holy', tgt: 'self', sp: lv => 24 + 4 * lv, cd: 2, desc: lv => `For ${40 + 20 * lv}s: +${lv} STR, DEX and INT.`,
    use(lv, t) { onParty(t, 3, () => { addBuff('bless', 'Blessing', 'blessing', 40 + 20 * lv, { str: lv, dex: lv, int: lv }); pillar(P, '#f5e6a0'); }); Sfx.heal(); } },
  inc_agi: { name: 'Increase AGI', max: 10, rune: 'ᛖ', el: 'holy', tgt: 'self', sp: lv => 18 + 3 * lv, cd: 2, desc: lv => `For ${40 + 20 * lv}s: +${2 + lv} AGI and 25% movement speed.`,
    use(lv, t) { onParty(t, 3, () => { addBuff('agi', 'Increase AGI', 'inc_agi', 40 + 20 * lv, { agi: 2 + lv, move: 25 }); pillar(P, '#bfe8ff'); }); Sfx.heal(); } },
  holy_light: { name: 'Holy Light', max: 5, rune: 'ᛊ', el: 'holy', tgt: 'enemy', range: 9, sp: () => 15, cast: () => 0.9, cd: 0.5, desc: lv => `A lance of light for ${125 + 25 * lv}% holy MATK.`, use(lv, t) { shot(P, t, 'holy', () => magicHit(t, 1.25 + 0.25 * lv, 'holy')); } },
  divine_protection: { name: 'Divine Protection', max: 10, passive: true, rune: 'ᛉ', el: 'holy', desc: lv => `Take ${lv * 3} less damage from each undead or demon attack.` },
  demon_bane: { name: 'Demon Bane', max: 10, passive: true, rune: 'ᛏ', el: 'holy', desc: lv => `+${lv * 3} ATK against undead and demons.` },

  /* =========================================================
     Second classes. Extra fields used below (see docs/CONTENT.md):
       tgt: 'dir'      aimed where you face (keyboard) or at the cursor (mouse); never walks to it
       range: lv => n  range may depend on the level
       need(lv)        returns an error string when the skill cannot be used (weapon, shield, spheres)
     Engine helpers (js/core.js): zoneAdd, trapAdd, trueHit, dashTo, setSpheres, songStart,
     freezeMob, snareMob, markMob, mobsInCone, addBuff(..., extra).
     ========================================================= */
  // ---------- Ash Knight ----------
  spear_mastery: { name: 'Spear Mastery', max: 10, passive: true, rune: 'ᛏ', el: 'neutral', desc: lv => `+${lv * 4} ATK while wielding a spear.` },
  pierce: { name: 'Pierce', max: 10, rune: 'ᛊ', el: 'neutral', tgt: 'enemy', range: 'weapon', sp: () => 9, cd: 0.45, need: needW('spear'),
    desc: lv => `Drive the spear through: ${100 + 7 * lv}% ATK with +${lv * 5} HIT, once against small foes, twice against man-sized ones, three times against giants. Riding a warg: +25%.`,
    use(lv, t) { P.atkAnim = 0; const n = mobSize(t); after(0.12, () => { for (let i = 0; i < n; i++) after(i * 0.09, () => { if (!t.dead) { physHit(t, (1 + 0.07 * lv) * mountSpear(), { hit: lv * 5 }); burst(t.x, t.y, 24, '#e8e0ff', 6, 2); } }); }); Sfx.swing(); } },
  spear_boomerang: { name: 'Spear Boomerang', max: 5, rune: 'ᚷ', el: 'neutral', tgt: 'enemy', range: lv => 3 + lv * 1.5, sp: () => 10, cd: 0.6, need: needW('spear'),
    desc: lv => `Hurl the spear up to ${3 + lv * 1.5} cells for ${100 + 50 * lv}% ATK. It comes back.`,
    use(lv, t) { P.atkAnim = 0; shot(P, t, 'spear', () => { physHit(t, (1 + 0.5 * lv) * mountSpear()); if (!t.dead) shot(t, P, 'spear', () => {}, { spd: 20 }); }, { spd: 18 }); Sfx.bow(); } },
  brandish_spear: { name: 'Brandish Spear', max: 10, rune: 'ᛗ', el: 'neutral', tgt: 'dir', range: 3, sp: () => 12, cast: () => 0.35, cd: 1, need: needW('spear'),
    desc: lv => `Sweep the spear through a wide arc in front of you (${(2.6 + lv * 0.1).toFixed(1)} cells): ${100 + 20 * lv}% ATK to every enemy in it, pushing them back.`,
    use(lv, t, pos) { P.atkAnim = 0; const r = 2.6 + lv * 0.1 + (P.mounted ? 0.1 * (P.skills.warg_mastery || 0) : 0), d = dirTo(pos); for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.35, cx = Math.cos(a) * d.x - Math.sin(a) * d.y, cy = Math.sin(a) * d.x + Math.cos(a) * d.y; burst(P.x + cx * r * 0.7, P.y + cy * r * 0.7, 20, '#e8e0ff', 5, 2.4); }
      ring(P.x + d.x * r * 0.5, P.y + d.y * r * 0.5, r * 0.8, '#d8d0ff'); for (const m of mobsInCone(P.x, P.y, d.x, d.y, r, 0.35)) physHit(m, (1 + 0.2 * lv) * mountSpear(), { sure: true, knock: 1.5, from: P }); SHAKE_(0.12); Sfx.slam(); } },
  two_hand_quicken: { name: 'Two-Hand Quicken', max: 10, rune: 'ᚱ', el: 'wind', tgt: 'self', sp: lv => 10 + 4 * lv, cd: 2, need: needW('twohand'),
    desc: lv => `For ${30 * lv}s: +${12 + 2 * lv}% attack speed, +${lv} CRIT and +${2 * lv} HIT with a two-hand sword.`,
    use(lv) { addBuff('thq', 'Two-Hand Quicken', 'two_hand_quicken', 30 * lv, { aspd: 12 + 2 * lv, crit: lv, hit: 2 * lv }, { wtype: 'twohand' }); pillar(P, '#ffe070'); Sfx.heal(); } },
  bowling_bash: { name: 'Bowling Bash', max: 10, rune: 'ᛒ', el: 'neutral', tgt: 'enemy', range: 'weapon', sp: lv => 12 + lv, cast: () => 0.3, cd: 0.8,
    desc: lv => `Smash a foe twice for ${100 + 30 * lv}% ATK each and bowl it backwards. Anything it crashes into takes ${Math.round((100 + 30 * lv) * 0.8)}% and is knocked away too.`,
    use(lv, t) { P.atkAnim = 0; const mul = 1 + 0.3 * lv; after(0.12, () => { if (t.dead) return; physHit(t, mul); physHit(t, mul, { knock: 2.5, from: P }); burst(t.x, t.y, 24, '#ffd27a', 14, 3); SHAKE_(0.15);
      after(0.12, () => { ring(t.x, t.y, 1.6, '#ffd27a'); for (const m of mobsNear(t.x, t.y, 1.7)) if (m !== t) physHit(m, mul * 0.8, { knock: 2, from: t }); }); }); Sfx.slam(); } },
  // ---------- Oathkeeper ----------
  faith: { name: 'Faith', max: 10, passive: true, rune: 'ᛉ', el: 'holy', desc: lv => `+${lv * 2}% Max HP and +${lv} MDEF. Tyr keeps count of those who keep their word.` },
  holy_cross: { name: 'Holy Cross', max: 10, rune: 'ᛏ', el: 'holy', tgt: 'enemy', range: 'weapon', sp: lv => 10 + Math.ceil(lv / 2), cd: 0.4,
    desc: lv => `Carve a burning cross into a foe: two holy strikes of ${100 + 20 * lv}% ATK each. Doubly painful for the undead.`,
    use(lv, t) { P.atkAnim = 0; for (let i = 0; i < 2; i++) after(0.1 + i * 0.12, () => { if (!t.dead) { physHit(t, 1 + 0.2 * lv, { elem: 'holy' }); burst(t.x, t.y, 30, '#fff2b0', 10, 2.5); } }); after(0.2, () => { if (!t.dead) pillar(t, '#fff2b8'); }); Sfx.heal(); } },
  grand_cross: { name: 'Grand Cross', max: 10, rune: 'ᛣ', el: 'holy', tgt: 'self', sp: lv => 30 + 4 * lv, cast: () => 0.6, cd: 1.5,
    desc: lv => `Pay 10% of your current HP to raise a cross of holy fire (3 cells): ${100 + 10 * lv}% holy ATK plus ${60 + 8 * lv}% holy MATK to every enemy in it.`,
    use(lv) { const cost = Math.floor(P.hp * 0.1); if (cost > 0) { P.hp -= cost; floatText(P, cost, 'hurt'); } pillar(P, '#fff2b0', true); ring(P.x, P.y, 3, '#fff0a0');
      for (let i = 1; i <= 3; i++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) burst(P.x + dx * i, P.y + dy * i, 10, '#fff0b0', 6, 1.8);
      for (const m of mobsNear(P.x, P.y, 3)) { physHit(m, 1 + 0.1 * lv, { elem: 'holy', sure: true }); magicHit(m, 0.6 + 0.08 * lv, 'holy'); } Sfx.fire(); } },
  auto_guard: { name: 'Auto Guard', max: 10, rune: 'ᛉ', el: 'earth', tgt: 'self', sp: lv => 12 + 2 * lv, cd: 3, need: needShield,
    desc: lv => `For 5 minutes: a ${lv * 3}% chance to block any blow outright with your shield.`,
    use(lv) { addBuff('autoguard', 'Auto Guard', 'auto_guard', 300, {}, { guard: lv * 3, needShield: true }); ring(P.x, P.y, 1.4, '#e8c07a'); Sfx.equip(); } },
  oath_of_tyr: { name: 'Oath of Tyr', max: 5, rune: 'ᛏ', el: 'holy', tgt: 'self', sp: lv => 25 + 5 * lv, cast: () => 0.5, cd: 5,
    desc: lv => `Swear on Tyr’s hand for ${30 + 15 * lv}s: ${15 + 5 * lv}% of every blow you take is shouldered by the god. It drains half as much SP instead of HP, and the attacker takes it back as holy damage.`,
    use(lv) { addBuff('oath', 'Oath of Tyr', 'oath_of_tyr', 30 + 15 * lv, {}, { share: 15 + 5 * lv, aura: { r: 1.1, col: '#ffe8a0' } }); pillar(P, '#ffe8a0', true); Sfx.heal(); } },
  shield_charge: { name: 'Shield Charge', max: 5, rune: 'ᚦ', el: 'neutral', tgt: 'enemy', range: lv => 3 + lv, sp: lv => 10 + 2 * lv, cd: 1.2, need: needShield,
    desc: lv => `Charge up to ${3 + lv} cells behind your shield and slam into a foe: ${100 + 30 * lv}% ATK, stunned for ${(1 + 0.2 * lv).toFixed(1)}s (bosses briefly).`,
    use(lv, t) { dashTo(t.x, t.y, 3 + lv + 1, 1, false, () => { if (t.dead) return; P.atkAnim = 0; physHit(t, 1 + 0.3 * lv, { sure: true, knock: 1.2, from: P }); if (!t.dead) t.stun = Math.max(t.stun || 0, t.d.boss ? 0.5 : 1 + 0.2 * lv); ring(t.x, t.y, 1.2, '#e8c07a'); burst(t.x, t.y, 24, '#e8c07a', 14, 3); SHAKE_(0.15); Sfx.slam(); }); } },
  // ---------- Runecaster ----------
  storm_gust: { name: 'Storm Gust', max: 10, rune: 'ᚺ', el: 'water', tgt: 'ground', range: 9, sp: lv => 48 + 4 * lv, cast: lv => 1.6 + 0.2 * lv, cd: 2,
    desc: lv => `A blizzard over an area (3 cells) for 4.5s: 10 gusts of ${50 + 5 * lv}% water MATK. The third gust to hit a foe freezes it. Bosses and undead resist the freeze.`,
    use(lv, t, pos) { zoneAdd({ kind: 'storm', x: pos.x, y: pos.y, r: 3, dur: 4.5, every: 0.45, col: '#bfe6ff', rune: 'ᚺ',
      tick(z) { for (let i = 0; i < 3; i++) burst(z.x + rand(-2.5, 2.5), z.y + rand(-2.5, 2.5), rand(10, 60), '#e8f6ff', 4, 3); for (const m of mobsNear(z.x, z.y, z.r)) { magicHit(m, 0.5 + 0.05 * lv, 'water'); if (m.dead) continue; m.sg = (m.sg || 0) + 1; if (m.sg % 3 === 0) freezeMob(m, 4); else if (!m.d.boss) knock(m, { x: m.x + rand(-1, 1), y: m.y + rand(-1, 1) }, 0.3); } },
      end() { for (const m of mobs) m.sg = 0; } }); Sfx.cast(); } },
  meteor_storm: { name: 'Meteor Storm', max: 10, rune: 'ᛋ', el: 'fire', tgt: 'ground', range: 9, sp: lv => 40 + 4 * lv, cast: lv => 1.2 + 0.15 * lv, cd: 2,
    desc: lv => `Call down ${2 + Math.ceil(lv / 2)} meteors around an area. Each hits everything within 1.6 cells for ${100 + 10 * lv}% fire MATK, with a ${3 * lv}% chance to stun.`,
    use(lv, t, pos) { const n = 2 + Math.ceil(lv / 2); for (let i = 0; i < n; i++) { const x = pos.x + (i ? rand(-2.2, 2.2) : 0), y = pos.y + (i ? rand(-2.2, 2.2) : 0); after(0.15 + i * 0.28, () => {
      fxs.push({ k: 'meteor', x, y, t: 0, dur: 0.45, col: '#ff7a2a' }); ring(x, y, 1.6, '#ff8a3a'); burst(x, y, 30, '#ff9a4a', 16, 3.5); Sfx.fire(); SHAKE_(0.08);
      for (const m of mobsNear(x, y, 1.6)) { magicHit(m, 1 + 0.1 * lv, 'fire'); if (!m.dead && !m.d.boss && Math.random() * 100 < 3 * lv) { m.stun = Math.max(m.stun || 0, 1.5); floatText(m, 'Stun', 'info'); } } }); } } },
  lord_of_vermilion: { name: 'Lord of Vermilion', max: 10, rune: 'ᚦ', el: 'wind', tgt: 'ground', range: 9, sp: lv => 55 + 5 * lv, cast: lv => 2 + 0.25 * lv, cd: 3,
    desc: lv => `Thor’s own storm over a wide area (3.5 cells): 4 waves of lightning, each ${80 + 12 * lv}% wind MATK to everything inside.`,
    use(lv, t, pos) { zoneAdd({ kind: 'vermilion', x: pos.x, y: pos.y, r: 3.5, dur: 2.1, every: 0.5, col: '#fff6a0', rune: 'ᚦ',
      tick(z) { for (let i = 0; i < 4; i++) strike(z.x + rand(-3, 3), z.y + rand(-3, 3)); for (const m of mobsNear(z.x, z.y, z.r)) magicHit(m, 0.8 + 0.12 * lv, 'wind'); SHAKE_(0.06); } }); } },
  jupitel_thunder: { name: 'Jupitel Thunder', max: 10, rune: 'ᛃ', el: 'wind', tgt: 'enemy', range: 9, sp: lv => 18 + 2 * lv, cast: lv => 0.5 + 0.15 * lv, cd: 0.8,
    desc: lv => `A ball of lightning that hits ${2 + lv} times for 100% wind MATK each and hurls the target ${(2 + lv * 0.3).toFixed(1)} cells away.`,
    use(lv, t) { const n = 2 + lv; shot(P, t, 'bolt', () => { for (let i = 0; i < n; i++) after(i * 0.07, () => { if (t.dead) return; magicHit(t, 1, 'wind'); burst(t.x, t.y, 30, '#fff6a0', 6, 2.5); if (i === n - 1 && !t.dead && !t.d.boss) knock(t, P, 2 + lv * 0.3); }); Sfx.zap(); }, { spd: 14 }); Sfx.cast(); } },
  rune_attunement: { name: 'Runic Attunement', max: 10, passive: true, rune: 'ᚨ', el: 'ghost', desc: lv => `+${lv * 2}% MATK. The elder runes answer faster to one who has written them in the sky.` },
  quagmire: { name: 'Quagmire', max: 5, rune: 'ᛚ', el: 'earth', tgt: 'ground', range: 9, sp: lv => 10 + 5 * lv, cast: () => 0.4, cd: 2,
    desc: lv => `Turn the ground to mud (2.5 cells) for ${5 + 3 * lv}s. Enemies in it move at half speed, attack ${10 * lv}% slower and lose ${10 * lv}% FLEE.`,
    use(lv, t, pos) { zoneAdd({ kind: 'quagmire', x: pos.x, y: pos.y, r: 2.5, dur: 5 + 3 * lv, every: 0.25, col: '#8a6a3a', rune: 'ᛚ', lv,
      tick(z) { if (Math.random() < 0.5) burst(z.x + rand(-2, 2), z.y + rand(-2, 2), 2, '#6a5030', 3, 0.8); for (const m of mobsNear(z.x, z.y, z.r)) { if (!(m.slow > 0)) floatText(m, 'Mired', 'info'); m.slow = 0.4; m.slowLv = lv; } } }); Sfx.slam(); } },
  // ---------- Seiðr Sage ----------
  endow_blaze: endow('fire', 'Endow Blaze', 'ᚲ', 'Muspel’s fire'),
  endow_frost: endow('water', 'Endow Frost', 'ᛁ', 'Niflheim’s frost'),
  endow_lightning: endow('wind', 'Endow Lightning', 'ᛊ', 'Thor’s lightning'),
  endow_quake: endow('earth', 'Endow Quake', 'ᛃ', 'the weight of the mountains'),
  dispel: { name: 'Dispel', max: 5, rune: 'ᚾ', el: 'ghost', tgt: 'enemy', range: 9, sp: lv => 10 + 2 * lv, cast: () => 1, cd: 2,
    desc: lv => `Unravel a foe’s wards (${60 + 8 * lv}% chance, halved on bosses): for ${10 + 4 * lv}s its DEF and MDEF are halved, and any spell it is preparing fizzles.`,
    use(lv, t) { shot(P, t, 'soul', () => { if (t.dead) return; const ch = (60 + 8 * lv) * (t.d.boss ? 0.5 : 1); if (Math.random() * 100 >= ch) { floatText(t, 'Resisted', 'miss'); return; }
      t.dispel = 10 + 4 * lv; floatText(t, 'Dispelled', 'info'); pillar(t, '#c8a8ff'); aggro(t);
      for (let i = teles.length - 1; i >= 0; i--) if (teles[i].m === t) { burst(teles[i].x, teles[i].y, 4, '#c8a8ff', 10, 2); teles.splice(i, 1); }
      if (t.d.abil) for (const a of t.d.abil) t.abil[a.id] = Math.max(t.abil[a.id] || 0, a.cd * 0.5); t.leap = null; t.z = 0; }); Sfx.cast(); } },
  magic_rod: { name: 'Magic Rod', max: 5, rune: 'ᛟ', el: 'ghost', tgt: 'self', sp: () => 5, cd: 1.5,
    desc: lv => `For ${(0.8 + 0.3 * lv).toFixed(1)}s, drink any spell cast at you (ground blasts and boss magic): no damage, and ${20 * lv}% of it returns as SP.`,
    use(lv) { addBuff('mrod', 'Magic Rod', 'magic_rod', 0.8 + 0.3 * lv, {}, { absorb: 20 * lv, aura: { r: 0.9, col: '#c8a8ff' } }); ring(P.x, P.y, 1.2, '#c8a8ff'); Sfx.cast(); } },
  norn_ward: { name: 'Ward of the Norns', max: 5, rune: 'ᚹ', el: 'earth', tgt: 'ground', range: 5, sp: lv => 40 + 5 * lv, cast: () => 1, cd: 5,
    desc: lv => `Weave a ward (${(2.5 + 0.3 * lv).toFixed(1)} cells) that lasts ${30 + 15 * lv}s. Enemy ground blasts that land inside it fizzle.`,
    use(lv, t, pos) { zoneAdd({ kind: 'ward', ward: true, x: pos.x, y: pos.y, r: 2.5 + 0.3 * lv, dur: 30 + 15 * lv, every: 1.2, col: '#9fe0c0', rune: 'ᚹ', tick(z) { ring(z.x, z.y, z.r, '#9fe0c0'); } }); pillar({ x: pos.x, y: pos.y, kind: 'fx' }, '#9fe0c0'); Sfx.heal(); } },
  // ---------- Wolfhunter ----------
  blitz_beat: { name: 'Blitz Beat', max: 5, rune: 'ᚺ', el: 'neutral', tgt: 'enemy', range: 9, sp: lv => 10 + 4 * lv, cd: 1.2,
    desc: lv => `Send Huginn the raven: ${lv} dive${lv > 1 ? 's' : ''} of ${P && S ? blitzDmg(lv) : '?'} damage that ignore DEF. Learned, Huginn also dives by himself on ${P && S ? (1 + S.luk / 3).toFixed(0) : '1 + LUK/3'}% of your normal attacks.`,
    use(lv, t) { raven(t, lv); } },
  ankle_snare: { name: 'Ankle Snare', max: 5, rune: 'ᛜ', el: 'earth', tgt: 'ground', range: 3, sp: () => 12, cd: 0.8,
    desc: lv => `Set a snare (lasts 60s). The first enemy to step on it is held in place for ${4 + 2 * lv}s (bosses a quarter as long). Up to 4 traps at a time.`,
    use(lv, t, pos) { trapAdd(pos, 'ᛜ', '#c8a060', m => { snareMob(m, (4 + 2 * lv) * (m.d.boss ? 0.25 : 1)); ring(m.x, m.y, 1, '#c8a060'); }); } },
  blast_mine: { name: 'Blast Mine', max: 5, rune: 'ᚹ', el: 'wind', tgt: 'ground', range: 3, sp: () => 10, cd: 0.8,
    desc: lv => `Bury a mine (lasts 60s). It bursts under the first enemy, dealing ${P && S ? trapDmg(lv, 2) : '?'} wind damage to everything within 2 cells. Scales with DEX and INT.`,
    use(lv, t, pos) { trapAdd(pos, 'ᚹ', '#e8e070', (m, z) => { ring(z.x, z.y, 2, '#fff6a0'); burst(z.x, z.y, 10, '#fff6a0', 24, 4); strike(z.x, z.y); SHAKE_(0.1); for (const e of mobsNear(z.x, z.y, 2)) trueHit(e, trapDmg(lv, 2), 'wind'); }); } },
  freezing_trap: { name: 'Freezing Trap', max: 5, rune: 'ᛁ', el: 'water', tgt: 'ground', range: 3, sp: () => 10, cd: 0.8,
    desc: lv => `Set a frost trap (lasts 60s): ${P && S ? trapDmg(lv, 3) : '?'} water damage within 1.5 cells, freezing them for ${3 + lv}s. Bosses and undead resist the freeze.`,
    use(lv, t, pos) { trapAdd(pos, 'ᛁ', '#9fd8ff', (m, z) => { ring(z.x, z.y, 1.5, '#bfe6ff'); burst(z.x, z.y, 10, '#e8f6ff', 20, 3); for (const e of mobsNear(z.x, z.y, 1.5)) { trueHit(e, trapDmg(lv, 3), 'water'); freezeMob(e, 3 + lv); } }); } },
  detect: { name: 'Huginn’s Eye', max: 4, rune: 'ᛞ', el: 'wind', tgt: 'self', sp: () => 8, cd: 5,
    desc: lv => `Huginn marks every enemy within ${6 + 2 * lv} cells for ${15 + 5 * lv}s. You never miss a marked enemy and deal it ${5 + 5 * lv}% more damage.`,
    use(lv) { let n = 0; ring(P.x, P.y, 6 + 2 * lv, '#cfe07a'); for (const m of mobsNear(P.x, P.y, 6 + 2 * lv)) { markMob(m, 15 + 5 * lv, 5 + 5 * lv); n++; } floatText(P, n ? `${n} marked` : 'Nothing', 'info'); Sfx.bow(); } },
  beast_bane: { name: 'Beast Bane', max: 10, passive: true, rune: 'ᚢ', el: 'earth', desc: lv => `+${lv * 4} ATK against brutes and insects.` },
  // ---------- Skald ----------
  music_lessons: { name: 'Music Lessons', max: 10, passive: true, rune: 'ᛚ', el: 'wind', desc: lv => `+${lv * 3} ATK and +${lv}% attack speed with a lute or a whip.` },
  poem_of_bragi: song('poem_of_bragi', 'Poem of Bragi', 'ᛒ', '#c8a8ff', lv => `Sing Bragi’s poem for 120s: casting takes ${3 * lv}% less time and cooldowns are ${2 * lv}% shorter.`, lv => ({}), lv => ({ castCut: 3 * lv, cdCut: 2 * lv })),
  apple_of_idun: song('apple_of_idun', 'Apple of Iðunn', 'ᛃ', '#9fe07a', lv => `Sing of Iðunn’s apples for 120s: +${5 + lv}% Max HP, and every 2s you recover ${30 + 5 * lv} HP plus ${(1 + 0.2 * lv).toFixed(1)}% of Max HP.`, lv => ({ maxhpPct: 5 + lv }), lv => ({ every: 2, onTick() { healP(30 + 5 * lv + S.maxhp * (0.01 + 0.002 * lv), true); } })),
  sunset_dirge: song('sunset_dirge', 'Dirge of the Setting Sun', 'ᛋ', '#ffb060', lv => `Sing Sól’s last evening for 120s: +${10 + 2 * lv}% attack speed.`, lv => ({ aspd: 10 + 2 * lv }), lv => ({})),
  arrow_vulcan: { name: 'Arrow Vulcan', max: 10, rune: 'ᚨ', el: 'neutral', tgt: 'enemy', range: lv => Math.max(S ? S.range : 5, 5), sp: lv => 12 + 2 * lv, cast: lv => 0.6 + 0.08 * lv, cd: 1.8,
    desc: lv => `Loose a storm of nine strikes at one foe for ${200 + 80 * lv}% ATK in total. Works with bows, lutes and whips.`,
    use(lv, t) { const each = (2 + 0.8 * lv) / 9; for (let i = 0; i < 9; i++) after(i * 0.08, () => { if (t.dead) return; P.atkAnim = 0; shot(P, t, 'arrow', () => physHit(t, each, {}), { spd: 24 }); if (i % 3 === 0) Sfx.bow(); }); } },
  frost_joker: { name: 'Frost Joker', max: 5, rune: 'ᛁ', el: 'water', tgt: 'self', sp: lv => 12 + 2 * lv, cd: 3,
    desc: lv => `Tell a joke so cold that every enemy within 7 cells has a ${20 + 10 * lv}% chance to freeze for ${3 + lv * 0.5}s. Bosses and undead do not laugh.`,
    use(lv) { floatText(P, 'Ha!', 'shout'); ring(P.x, P.y, 7, '#bfe6ff'); for (const m of mobsNear(P.x, P.y, 7)) if (Math.random() * 100 < 20 + 10 * lv) freezeMob(m, 3 + lv * 0.5); Sfx.zap(); } },
  // ---------- Valkyrie Priest ----------
  resurrection: { name: 'Resurrection', max: 4, passive: true, rune: 'ᛟ', el: 'holy', desc: lv => `When you fall, a Valkyrie refuses to carry you: you rise at once with ${[10, 30, 50, 80][lv - 1]}% HP. Then ${240 - 30 * lv}s must pass before it can happen again.` },
  magnificat: { name: 'Magnificat', max: 5, rune: 'ᛗ', el: 'holy', tgt: 'self', sp: () => 30, cast: () => 1, cd: 3,
    desc: lv => `Sing the Valkyries’ hymn for ${30 + 15 * lv}s: SP and HP recover twice as often.`,
    use(lv, t) { onParty(t, 5, () => { addBuff('magnificat', 'Magnificat', 'magnificat', 30 + 15 * lv, {}, { regen: 2 }); pillar(P, '#bfe0ff', true); }); Sfx.heal(); } },
  sanctuary: { name: 'Sanctuary', max: 10, rune: 'ᛒ', el: 'holy', tgt: 'ground', range: 9, sp: lv => 15 + 3 * lv, cast: () => 1.2, cd: 3,
    desc: lv => `Hallow the ground (2.5 cells) for ${4 + lv}s. Each second you recover ${P && S ? Math.round(healAmt(lv) * 0.35) : '?'} HP while you stand in it, and undead or demons inside burn for half that.`,
    use(lv, t, pos) { zoneAdd({ kind: 'sanctuary', x: pos.x, y: pos.y, r: 2.5, dur: 4 + lv, every: 1, col: '#bff0b0', rune: 'ᛒ',
      tick(z) { const a = healAmt(lv) * 0.35; ring(z.x, z.y, z.r, '#bff0b0'); for (const h of heroes()) if (dist(h, z) <= z.r && !h.dead) healHero(h, a);   // cycle 8: everyone standing in it
 for (const m of mobsNear(z.x, z.y, z.r)) if (isUndeadish(m)) trueHit(m, a * 0.5, 'holy'); } }); Sfx.heal(); } },
  kyrie_eleison: { name: 'Kyrie Eleison', max: 10, rune: 'ᚴ', el: 'holy', tgt: 'self', sp: lv => 20 + lv, cast: () => 0.8, cd: 2,
    desc: lv => `A shield of prayer for 120s. It absorbs up to ${10 + 2 * lv}% of your Max HP in damage, or ${5 + Math.ceil(lv / 2)} blows, whichever comes first.`,
    use(lv, t) { onHero(t, () => { addBuff('kyrie', 'Kyrie Eleison', 'kyrie_eleison', 120, {}, { shield: Math.round(S.maxhp * (0.1 + 0.02 * lv)), hits: 5 + Math.ceil(lv / 2), aura: { r: 0.8, col: '#fff2b8', bubble: true } }); pillar(P, '#fff2b8'); }); Sfx.heal(); } },
  magnus_exorcismus: { name: 'Magnus Exorcismus', max: 10, rune: 'ᛣ', el: 'holy', tgt: 'ground', range: 9, sp: lv => 45 + 4 * lv, cast: lv => 2 + 0.2 * lv, cd: 4,
    desc: lv => `A cross of judgement (3 cells) for ${3 + Math.ceil(lv / 2)} waves. Each wave deals 100% holy MATK to undead, demons and shadow things inside, and 35% to anything else.`,
    use(lv, t, pos) { zoneAdd({ kind: 'magnus', x: pos.x, y: pos.y, r: 3, dur: (3 + Math.ceil(lv / 2)) * 0.8 - 0.05, every: 0.8, col: '#fff2b0', rune: 'ᛣ', first: 0.05,
      tick(z) { pillar({ x: z.x, y: z.y, kind: 'fx' }, '#fff2b0'); for (const [dx, dy] of [[0, 0], [1.4, 0], [-1.4, 0], [0, 1.4], [0, -1.4]]) burst(z.x + dx, z.y + dy, 20, '#fff6c8', 5, 1.6);
        for (const m of mobsNear(z.x, z.y, z.r)) magicHit(m, isUndeadish(m) || m.d.elem === 'shadow' ? 1 : 0.35, 'holy'); } }); Sfx.heal(); } },
  lex_aeterna: { name: 'Lex Aeterna', max: 1, rune: 'ᛚ', el: 'holy', tgt: 'enemy', range: 9, sp: () => 10, cd: 1,
    desc: () => 'Write a foe’s name in the eternal law: the next blow it takes, from any source, deals double damage.',
    use(lv, t) { t.lex = true; aggro(t); floatText(t, 'Lex Aeterna', 'info'); pillar(t, '#fff2b8'); Sfx.cast(); } },
  // ---------- Einherjar Monk ----------
  iron_fists: { name: 'Iron Fists', max: 10, passive: true, rune: 'ᚦ', el: 'neutral', desc: lv => `+${lv * 3} ATK with knuckles or bare hands.` },
  summon_sphere: { name: 'Summon Spirit Sphere', max: 5, rune: 'ᛟ', el: 'ghost', tgt: 'self', sp: () => 5, cast: () => 0.4, cd: 0.3,
    desc: lv => `Call one spirit sphere (hold up to ${lv}). Each sphere adds 3 ATK. Monk skills spend them.`,
    use(lv) { if ((P.spheres || 0) >= lv) { floatText(P, 'Full', 'miss'); return; } setSpheres((P.spheres || 0) + 1); burst(P.x, P.y, 30, '#9fd0ff', 10, 1.5); Sfx.cast(); } },
  triple_attack: { name: 'Triple Attack', max: 10, passive: true, rune: 'ᛞ', el: 'neutral', desc: lv => `Each normal attack has a ${30 - lv}% chance to flow into a three-blow combo for ${100 + 20 * lv}% ATK in total.` },
  investigate: { name: 'Investigate', max: 5, rune: 'ᛁ', el: 'neutral', tgt: 'enemy', range: 'weapon', sp: lv => 10 + lv, cd: 0.5, need: needSpheres(1),
    desc: lv => `Spend a sphere to strike through armour: ${100 + 40 * lv}% ATK that ignores DEF, and hits harder the thicker the armour.`,
    use(lv, t) { setSpheres(P.spheres - 1); P.atkAnim = 0; after(0.12, () => { if (t.dead) return; physHit(t, (1 + 0.4 * lv) * (1 + t.d.def / 100), { sure: true, ignoreDef: true }); burst(t.x, t.y, 30, '#9fd0ff', 16, 3); ring(t.x, t.y, 0.9, '#9fd0ff'); }); Sfx.crit(); } },
  finger_offensive: { name: 'Finger Offensive', max: 5, rune: 'ᛊ', el: 'neutral', tgt: 'enemy', range: 9, sp: lv => 10 + 2 * lv, cast: lv => 0.5 + 0.2 * lv, cd: 0.8, need: needSpheres(1),
    desc: lv => `Flick up to ${lv} spirit sphere${lv > 1 ? 's' : ''} at a foe, each ${100 + 50 * lv}% ATK.`,
    use(lv, t) { const n = Math.min(lv, P.spheres || 0); setSpheres(P.spheres - n); for (let i = 0; i < n; i++) after(i * 0.12, () => { if (!t.dead) shot(P, t, 'sphere', () => physHit(t, 1 + 0.5 * lv), { spd: 16 }); }); Sfx.cast(); } },
  asura_strike: { name: 'Asura Strike', max: 5, rune: 'ᚨ', el: 'neutral', tgt: 'enemy', range: 'weapon', sp: () => 10, cast: () => 0.6, cd: 6, need: needSpheres(1),
    desc: lv => `Burn every sphere and all your SP on one blow: ${(3 + lv) * 100}% ATK, +1% per 2.5 SP spent, +12% per sphere. Ignores DEF and never misses. Your SP will not recover for 10s.`,
    use(lv, t) { const spent = P.sp, sph = P.spheres || 0; P.sp = 0; P.spT = -10; setSpheres(0); P.atkAnim = 0;
      const mul = (3 + lv) * (1 + spent / 250) * (1 + 0.12 * sph); pillar(P, '#9fd0ff', true); SHAKE_(0.1);
      after(0.15, () => { if (t.dead) return; physHit(t, mul, { sure: true, ignoreDef: true }); ring(t.x, t.y, 2, '#9fd0ff'); burst(t.x, t.y, 30, '#e8f6ff', 40, 5); SHAKE_(0.35); HITSTOP_(0.15); Sfx.slam(); }); } },
  body_relocation: { name: 'Body Relocation', max: 1, rune: 'ᚱ', el: 'ghost', tgt: 'dir', range: 6, sp: () => 14, cd: 2, need: needSpheres(1),
    desc: () => 'Spend a sphere to vanish and reappear up to 6 cells away, untouchable for a moment.',
    use(lv, t, pos) { setSpheres(P.spheres - 1); burst(P.x, P.y, 30, '#9fd0ff', 16, 2); dashTo(pos.x, pos.y, 6, 0, true); burst(P.x, P.y, 30, '#9fd0ff', 16, 2); Sfx.warp(); } },
  /* =========================================================
     Content round 6: tier-3 (reborn) signature skills, five per class (design/tier3.md). They reuse the VFX data
     shapes the renderer already reads: zones[] (kind + col + rune), P.buffs[*].aura / song, projs[] kinds, fxs
     'strike' / 'pillar' / 'ring' / 'meteor'. New engine hooks (js/core.js): physHit o.crit, mob m.weak / m.hexT,
     buffs with noSpRegen, count (Foresight), martyr (Tyr's Sacrifice), sight (Völva's Sight), revive (Einherjar's
     Call), bladestop, harmonize; soul_drain in killMob; huginnDive() for the ravens.
     ========================================================= */
  // ---------- Rune Jarl (knight) ----------
  spiral_pierce: { name: 'Spiral Pierce', max: 5, rune: 'ᛉ', el: 'neutral', tgt: 'enemy', range: 4, sp: lv => 18 + 4 * lv, cast: () => 0.3, cd: 1.2, need: needW('spear'),
    desc: lv => `Spin the spear into a foe up to 4 cells away: five thrusts of ${70 + 20 * lv}% ATK that never miss (${350 + 100 * lv}% in all), then it is pinned in place for 1s. Riding a warg: +25%.`,
    use(lv, t) { P.atkAnim = 0; const mul = (0.7 + 0.2 * lv) * mountSpear(); shot(P, t, 'spear', () => {}, { spd: 30 }); Sfx.swing();
      for (let i = 0; i < 5; i++) after(0.1 + i * 0.09, () => { if (t.dead) return; physHit(t, mul, { sure: true }); burst(t.x, t.y, 26, '#e8e0ff', 6, 2.6); if (i === 4 && !t.dead) { snareMob(t, t.d.boss ? 0.3 : 1); ring(t.x, t.y, 1, '#d8d0ff'); SHAKE_(0.1); } }); } },
  einherjar_fury: { name: 'Einherjar’s Fury', max: 5, rune: 'ᛟ', el: 'fire', tgt: 'self', sp: () => 60, cd: 60,
    desc: lv => `The fury of the einherjar for ${15 + 5 * lv}s: +${30 + 10 * lv}% ATK, +${20 + 4 * lv}% attack speed and +${40 + 20 * lv}% Max HP. You cannot dodge (FLEE 0), your SP does not recover and every 2s you lose 2% of your HP.`,
    use(lv) { const add = Math.round((S.atkStatus + S.watk + S.atkBonus) * (0.3 + 0.1 * lv)); const hpk = P.hp / S.maxhp;
      addBuff('fury', 'Einherjar’s Fury', 'einherjar_fury', 15 + 5 * lv, { atk: add, aspd: 20 + 4 * lv, maxhpPct: 40 + 20 * lv, flee: -999 }, { noSpRegen: true, every: 2, onTick() { if (P.hp > S.maxhp * 0.05) P.hp = Math.max(1, P.hp - S.maxhp * 0.02); }, aura: { r: 1.2, col: '#ff4a2a' } });
      P.hp = Math.round(S.maxhp * hpk); pillar(P, '#ff5a3a', true); burst(P.x, P.y, 30, '#ff7a3a', 30, 3.5); ring(P.x, P.y, 2, '#ff4a2a'); SHAKE_(0.2); floatText(P, 'FURY!', 'shout'); Sfx.slam(); } },
  gungnir_charge: { name: 'Gungnir Charge', max: 5, rune: 'ᚷ', el: 'neutral', tgt: 'enemy', range: lv => 4 + lv, sp: lv => 20 + 3 * lv, cd: 2.5,
    desc: lv => `Charge up to ${4 + lv} cells and strike: ${200 + 60 * lv}% ATK, up to +50% the farther you ran, knocking the foe back and stunning it for 1s (bosses briefly). Riding a warg: +25%.`,
    use(lv, t) { const d0 = dist(P, t), far = 1 + Math.min(0.5, d0 / (4 + lv) * 0.5); dashTo(t.x, t.y, 4 + lv + 1, 1, false, () => { if (t.dead) return; P.atkAnim = 0;
      physHit(t, (2 + 0.6 * lv) * far * mountSpear(true), { sure: true, knock: 2, from: P }); if (!t.dead) t.stun = Math.max(t.stun || 0, t.d.boss ? 0.4 : 1);
      ring(t.x, t.y, 1.4, '#ffe070'); burst(t.x, t.y, 30, '#ffe8a0', 20, 3.5); SHAKE_(0.2); HITSTOP_(0.08); Sfx.slam(); }); Sfx.swing(); } },
  thurisaz_rune: { name: 'Thurisaz Rune', max: 5, rune: 'ᚦ', el: 'wind', tgt: 'ground', range: 5, sp: lv => 25 + 5 * lv, cast: () => 0.4, cd: 3,
    desc: lv => `Carve the thorn-rune into the ground (2.5 cells). A breath later it bursts with Thor’s lightning: ${150 + 50 * lv}% wind ATK that never misses to everything on it, with a ${10 * lv}% chance to stun.`,
    use(lv, t, pos) { zoneAdd({ kind: 'thurisaz', x: pos.x, y: pos.y, r: 2.5, dur: 0.75, col: '#ffe070', rune: 'ᚦ',
      end(z) { for (let i = 0; i < 3; i++) strike(z.x + rand(-1, 1), z.y + rand(-1, 1)); ring(z.x, z.y, z.r, '#fff6a0'); SHAKE_(0.12);
        for (const m of mobsNear(z.x, z.y, z.r)) { physHit(m, 1.5 + 0.5 * lv, { elem: 'wind', sure: true }); if (!m.dead && !m.d.boss && Math.random() * 100 < 10 * lv) { m.stun = Math.max(m.stun || 0, 1.5); floatText(m, 'Stun', 'info'); } } } }); Sfx.cast(); } },
  warg_mastery: { name: 'Warg Riding', max: 5, passive: true, rune: 'ᛖ', el: 'earth', desc: lv => `While riding a warg: +${lv * 3} ATK, +${lv * 2}% attack speed and +${lv * 2} HIT, and Brandish Spear sweeps ${(0.1 * lv).toFixed(1)} cells wider.` },
  // ---------- Paladin of Tyr (oathkeeper) ----------
  gloria: { name: 'Gloria', max: 5, rune: 'ᛊ', el: 'holy', tgt: 'self', sp: lv => 20 + 5 * lv, cast: () => 0.6, cd: 4,
    desc: lv => `Sing Tyr’s glory for ${30 + 10 * lv}s: +${10 + 4 * lv} LUK and +${lv} CRIT.`,
    use(lv, t) { onParty(t, 5, () => { addBuff('gloria', 'Gloria', 'gloria', 30 + 10 * lv, { luk: 10 + 4 * lv, crit: lv }, { aura: { r: 1.4, col: '#fff0a0' } }); pillar(P, '#fff0a0'); }); ring(P.x, P.y, 1.6, '#fff0a0'); Sfx.heal(); } },
  shield_chain: { name: 'Shield Chain', max: 5, rune: 'ᛜ', el: 'neutral', tgt: 'enemy', range: 5, sp: lv => 20 + 3 * lv, cd: 1.4, need: needShield,
    desc: lv => `Hurl your shield five times in a chain: each ${60 + 20 * lv}% ATK, more the heavier your shield (+1% per shield DEF).`,
    use(lv, t) { P.atkAnim = 0; const sd = P.equip.shield ? itemBase(P.equip.shield).def : 0, mul = (0.6 + 0.2 * lv) * (1 + sd / 100);
      for (let i = 0; i < 5; i++) after(i * 0.12, () => { if (t.dead) return; shot(P, t, 'spear', () => { if (t.dead) return; physHit(t, mul, { sure: i > 0 }); burst(t.x, t.y, 26, '#e8c07a', 8, 2.6); }, { spd: 22 }); }); Sfx.equip(); } },
  pressure: { name: 'Pressure', max: 5, rune: 'ᛏ', el: 'holy', tgt: 'enemy', range: 6, sp: lv => 30 + 5 * lv, cast: () => 0.8, cd: 2,
    desc: lv => `Press Tyr’s judgement on a foe: ${P && S ? Math.round((S.atkStatus + S.watk) * (1 + 0.4 * lv) + 150 * lv) : '?'} damage that ignores DEF and MDEF and never misses, and a brief stun.`,
    use(lv, t) { const dmg = (S.atkStatus + S.watk) * (1 + 0.4 * lv) + 150 * lv; pillar(t, '#fff2b8', true); for (const [dx, dy] of [[0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]]) burst(t.x + dx, t.y + dy, 20, '#fff6c8', 6, 1.6);
      after(0.15, () => { if (t.dead) return; trueHit(t, dmg, 'neutral'); if (!t.dead) t.stun = Math.max(t.stun || 0, t.d.boss ? 0.3 : 0.8); SHAKE_(0.1); }); Sfx.heal(); } },
  tyrs_sacrifice: { name: 'Tyr’s Sacrifice', max: 5, rune: 'ᛗ', el: 'holy', tgt: 'self', sp: () => 25, cd: 6,
    desc: lv => `Give your blood as Tyr gave his hand: your next 5 normal attacks each cost 9% of your Max HP and add ${9 + 3 * lv}% of your Max HP as holy damage.`,
    use(lv) { addBuff('martyr', 'Tyr’s Sacrifice', 'tyrs_sacrifice', 30, {}, { martyr: lv, count: 5, aura: { r: 0.9, col: '#ff9a8a' } }); pillar(P, '#ffb0a0'); Sfx.heal(); } },
  tyrs_aegis: { name: 'Tyr’s Aegis', max: 5, rune: 'ᛉ', el: 'holy', tgt: 'ground', range: 4, sp: lv => 40 + 5 * lv, cast: () => 1, cd: 10,
    desc: lv => `Raise the god’s ward over the ground (3 cells) for ${12 + 3 * lv}s: enemy blasts that land in it fizzle, and while you stand in it you take ${15 + 5 * lv}% less damage.`,
    use(lv, t, pos) { zoneAdd({ kind: 'ward', ward: true, x: pos.x, y: pos.y, r: 3, dur: 12 + 3 * lv, every: 0.5, col: '#ffe08a', rune: 'ᛉ',
      tick(z) { for (const h of heroes()) if (!h.dead && dist(h, z) <= z.r) withHero(h, () => { const b = P.buffs.aegis; if (b) b.t = 0.9; else addBuff('aegis', 'Tyr’s Aegis', 'tyrs_aegis', 0.9, { dmgRed: 15 + 5 * lv }); }); } });   /* cycle 8: every hero in it */ pillar({ x: pos.x, y: pos.y, kind: 'fx' }, '#ffe08a', true); Sfx.heal(); } },
  // ---------- Galdr Master (runecaster) ----------
  muspel_vulcan: { name: 'Muspel’s Vulcan', max: 5, rune: 'ᚲ', el: 'ghost', tgt: 'enemy', range: 9, sp: lv => 20 + 6 * lv, cast: lv => 0.6 + 0.1 * lv, cd: 1,
    desc: lv => `Ghost-fire from Muspelheim, ${lv} strike${lv > 1 ? 's' : ''}: each ${100 + 20 * lv}% ghost MATK to the target and everything within 1.5 cells, with a 10% chance to curse (ATK −20% for 10s).`,
    use(lv, t) { for (let i = 0; i < lv; i++) after(i * 0.18, () => { if (t.dead) return; shot(P, t, 'soul', () => { const x = t.x, y = t.y; ring(x, y, 1.5, '#b89aff'); burst(x, y, 20, '#c8a8ff', 10, 2.5);
      for (const m of mobsNear(x, y, 1.5)) { magicHit(m, 1 + 0.2 * lv, 'ghost'); if (!m.dead && Math.random() < 0.1) weakenMob(m, 10, 20); } }, { spd: 15 }); }); Sfx.cast(); } },
  unmake: { name: 'Unmake', max: 5, rune: 'ᚾ', el: 'ghost', tgt: 'ground', range: 9, sp: lv => 40 + 5 * lv, cast: () => 1.2, cd: 4,
    desc: lv => `Speak the anti-rune over an area (3.5 cells): every enemy spell and ground curse in it is erased, and every enemy inside takes ${150 + 50 * lv}% ghost MATK and loses its wards (DEF and MDEF halved) for 10s.`,
    use(lv, t, pos) { const r = 3.5; let n = 0;
      for (let i = teles.length - 1; i >= 0; i--) if (Math.hypot(teles[i].x - pos.x, teles[i].y - pos.y) <= r + teles[i].r * 0.5) { burst(teles[i].x, teles[i].y, 4, '#c8a8ff', 10, 2); teles.splice(i, 1); n++; }
      zones = zones.filter(z => { const hit = z.hostile && Math.hypot(z.x - pos.x, z.y - pos.y) <= r + z.r; if (hit) n++; return !hit; });
      pillar({ x: pos.x, y: pos.y, kind: 'fx' }, '#c8a8ff', true); ring(pos.x, pos.y, r, '#c8a8ff'); SHAKE_(0.1);
      for (const m of mobsNear(pos.x, pos.y, r)) { magicHit(m, 1.5 + 0.5 * lv, 'ghost'); if (!m.dead) { m.dispel = Math.max(m.dispel || 0, 10); m.leap = null; m.z = 0; } }
      if (n) floatText(P, `${n} unmade`, 'info'); Sfx.cast(); } },
  soul_drain: { name: 'Soul Drain', max: 5, passive: true, rune: 'ᛟ', el: 'ghost', desc: lv => `+${lv * 2}% Max SP. Killing a foe with a spell drinks its soul: you recover SP equal to its level × ${(1 + 0.4 * lv).toFixed(1)}.` },
  ginnungagap: { name: 'Ginnungagap', max: 5, rune: 'ᛜ', el: 'ghost', tgt: 'ground', range: 9, sp: lv => 50 + 6 * lv, cast: lv => 1.6 + 0.1 * lv, cd: 3,
    desc: lv => `Open the yawning void that was before the worlds (3 cells) for 4s: it drags enemies toward its heart and deals ${50 + 12 * lv}% ghost MATK every half second.`,
    use(lv, t, pos) { zoneAdd({ kind: 'void', x: pos.x, y: pos.y, r: 3, dur: 4, every: 0.5, col: '#9a7ad8', rune: 'ᛜ',
      tick(z) { burst(z.x + rand(-1.5, 1.5), z.y + rand(-1.5, 1.5), rand(5, 40), '#6a4aa8', 4, 1.2); for (const m of mobsNear(z.x, z.y, z.r + 0.5)) { magicHit(m, 0.5 + 0.12 * lv, 'ghost'); if (!m.dead && !m.d.boss) pullMob(m, z, 0.4); } } }); Sfx.cast(); } },
  galdr_amplify: { name: 'Galdr Amplify', max: 5, rune: 'ᚨ', el: 'ghost', tgt: 'self', sp: lv => 20 + 4 * lv, cast: () => 0.7, cd: 5,
    desc: lv => `Chant the galdr louder for 10s: +${10 + 6 * lv}% MATK.`,
    use(lv) { addBuff('amplify', 'Galdr Amplify', 'galdr_amplify', 10, { matk: Math.round(S.matkMax * (0.1 + 0.06 * lv)) }, { aura: { r: 1, col: '#c8a8ff' } }); pillar(P, '#c8a8ff'); Sfx.cast(); } },
  // ---------- Völva (sage) ----------
  foresight: { name: 'Foresight', max: 5, rune: 'ᛈ', el: 'ghost', tgt: 'self', sp: () => 30, cast: () => 0.5, cd: 10,
    desc: lv => `The völva sees the next spells before they are spoken: your next ${1 + lv} spells with a cast time are cast in half the time (within 60s).`,
    use(lv) { addBuff('foresight', 'Foresight', 'foresight', 60, {}, { castCut: 50, count: 1 + lv, aura: { r: 0.9, col: '#a8c8ff' } }); pillar(P, '#a8c8ff'); Sfx.cast(); } },
  spell_breaker: { name: 'Spell Breaker', max: 5, rune: 'ᚺ', el: 'ghost', tgt: 'enemy', range: 9, sp: lv => 10 + 2 * lv, cast: () => 0.6, cd: 1.5,
    desc: lv => `Break a foe’s spell as it is spoken: its telegraphed blasts and leaps are cancelled and its next ability delayed, it takes ${100 + 30 * lv}% ghost MATK, and you drink ${3 * lv}% of your Max SP from the broken spell.`,
    use(lv, t) { shot(P, t, 'soul', () => { if (t.dead) return; let n = 0; for (let i = teles.length - 1; i >= 0; i--) if (teles[i].m === t) { burst(teles[i].x, teles[i].y, 4, '#c8a8ff', 10, 2); teles.splice(i, 1); n++; }
      if (t.d.abil) for (const a of t.d.abil) { const k = a.key || a.id; t.abil[k] = Math.max(t.abil[k] || 0, a.cd * 0.5); } t.leap = null; t.z = 0;
      magicHit(t, 1 + 0.3 * lv, 'ghost'); const g = Math.round(S.maxsp * 0.03 * lv); P.sp = Math.min(S.maxsp, P.sp + g); floatText(P, '+' + g, 'sp'); if (n) floatText(t, 'Broken!', 'info'); ring(t.x, t.y, 1.2, '#c8a8ff'); }, { spd: 16 }); Sfx.cast(); } },
  seidr_hex: { name: 'Seiðr Hex', max: 5, rune: 'ᚺ', el: 'shadow', tgt: 'enemy', range: 9, sp: lv => 20 + 3 * lv, cast: () => 0.5, cd: 2,
    desc: lv => `Hex a foe for ${12 + 3 * lv}s: its attacks deal ${10 + 5 * lv}% less, it moves at half speed, and every second it takes ${30 + 10 * lv}% shadow MATK.`,
    use(lv, t) { const dur = 12 + 3 * lv; shot(P, t, 'soul', () => { if (t.dead) return; weakenMob(t, dur, 10 + 5 * lv); t.hexT = dur; t.slow = Math.max(t.slow || 0, dur); t.slowLv = Math.max(t.slowLv || 1, 1); floatText(t, 'Hexed', 'info'); aggro(t); ring(t.x, t.y, 1, '#7a55a0');
      for (let i = 1; i <= dur; i++) after(i, () => { if (!t.dead && t.hexT > 0) { magicHit(t, 0.3 + 0.1 * lv, 'shadow'); burst(t.x, t.y, 20, '#7a55a0', 4, 1.2); } }); }, { spd: 14 }); Sfx.cast(); } },
  vardlokkur: { name: 'Varðlokkur', max: 5, rune: 'ᚹ', el: 'water', tgt: 'ground', range: 6, sp: lv => 30 + 5 * lv, cast: () => 1, cd: 8,
    desc: lv => `Sing the ward-song over the ground (3 cells) for ${15 + 3 * lv}s: while you stand in it you recover ${(1 + 0.5 * lv).toFixed(1)}% of your Max SP each second, and enemies in it are slowed.`,
    use(lv, t, pos) { zoneAdd({ kind: 'ward', x: pos.x, y: pos.y, r: 3, dur: 15 + 3 * lv, every: 1, col: '#a8c8ff', rune: 'ᚹ',
      tick(z) { for (const h of heroes()) if (!h.dead && dist(h, z) <= z.r) withHero(h, () => { const g = S.maxsp * (0.01 + 0.005 * lv); P.sp = Math.min(S.maxsp, P.sp + g); });   // cycle 8: every hero in it
 for (const m of mobsNear(z.x, z.y, z.r)) { m.slow = Math.max(m.slow || 0, 1.2); m.slowLv = Math.max(m.slowLv || 1, 2); } } }); Sfx.heal(); } },
  volva_sight: { name: 'Völva’s Sight', max: 5, rune: 'ᛞ', el: 'wind', tgt: 'self', sp: () => 40, cast: () => 0.8, cd: 5,
    desc: lv => `For ${60 + 30 * lv}s your normal attacks have a ${6 + 3 * lv}% chance to loose a bolt you know (Fire, Cold or Lightning Bolt, up to Lv ${2 * lv}) for free.`,
    use(lv) { addBuff('sight', 'Völva’s Sight', 'volva_sight', 60 + 30 * lv, {}, { sight: lv, aura: { r: 0.9, col: '#d8cf5a' } }); pillar(P, '#d8cf5a'); Sfx.cast(); } },
  // ---------- Fenris Stalker (wolfhunter) ----------
  sharp_shooting: { name: 'Sharp Shooting', max: 5, rune: 'ᛏ', el: 'neutral', tgt: 'dir', range: 9, sp: lv => 18 + 2 * lv, cast: () => 0.4, cd: 1.5, need: needW('bow'),
    desc: lv => `One arrow that does not stop: it flies 9 cells and strikes everything in its line for ${200 + 50 * lv}% ATK, with +${20 + 5 * lv}% critical chance.`,
    use(lv, t, pos) { P.atkAnim = 0; const d = dirTo(pos), hit = lineMobs(P.x, P.y, d.x, d.y, 9, 0.9); Sfx.bow();
      for (let k = 1; k <= 9; k += 1.5) burst(P.x + d.x * k, P.y + d.y * k, 26, '#e8e8ff', 2, 0.8);
      hit.forEach((m, i) => after(i * 0.04, () => { if (!m.dead) shot(P, m, 'arrow', () => physHit(m, 2 + 0.5 * lv, { crit: 20 + 5 * lv }), { spd: 34 }); }));
      if (!hit.length) floatText(P, 'No target', 'miss'); } },
  huginn_muninn: { name: 'Huginn & Muninn', max: 5, rune: 'ᚺ', el: 'neutral', tgt: 'enemy', range: 9, sp: lv => 30 + 4 * lv, cd: 3, need: () => P.skills.blitz_beat ? null : 'Needs Blitz Beat',
    desc: lv => `Thought and Memory dive together: ${P && S ? Math.round(blitzDmg(Math.max(1, P.skills.blitz_beat || 1)) * (2 + 0.6 * lv)) : '?'} damage in all that ignores DEF (scales with Blitz Beat, DEX and INT).`,
    use(lv, t) { const dmg = blitzDmg(Math.max(1, P.skills.blitz_beat || 1)) * (2 + 0.6 * lv); huginnDive(t, 2, dmg / 4, { muninn: true }); floatText(P, 'Huginn! Muninn!', 'info'); Sfx.bow(); } },
  gleipnir_snare: { name: 'Gleipnir Snare', max: 5, rune: 'ᛝ', el: 'shadow', tgt: 'ground', range: 3, sp: () => 15, cd: 0.8,
    desc: lv => `Set a trap woven like Gleipnir (lasts 60s). The first enemy on it binds everything within 2 cells for ${3 + lv}s (bosses a third as long) and deals ${P && S ? Math.round(trapDmg(lv, 2) * 1.5) : '?'} shadow damage.`,
    use(lv, t, pos) { trapAdd(pos, 'ᛝ', '#b8a8ff', (m, z) => { ring(z.x, z.y, 2, '#b8a8ff'); burst(z.x, z.y, 10, '#c8b8ff', 20, 3); for (const e of mobsNear(z.x, z.y, 2)) { snareMob(e, (3 + lv) * (e.d.boss ? 0.33 : 1)); trueHit(e, trapDmg(lv, 2) * 1.5, 'shadow'); } }); } },
  fenris_howl: { name: 'Fenrir’s Howl', max: 5, rune: 'ᚠ', el: 'shadow', tgt: 'self', sp: () => 30, cd: 8,
    desc: lv => `Howl with the Wolf’s voice: every enemy within 5 cells is marked for 10s (you never miss it and deal ${5 + 3 * lv}% more), and all but the mightiest freeze in fear for ${(1.5 + 0.3 * lv).toFixed(1)}s.`,
    use(lv) { ring(P.x, P.y, 5, '#7a55a0'); ring(P.x, P.y, 2.5, '#b8a8ff'); burst(P.x, P.y, 40, '#7a55a0', 24, 3); SHAKE_(0.15); floatText(P, 'AWOOO!', 'shout');
      for (const m of mobsNear(P.x, P.y, 5)) { markMob(m, 10, 5 + 3 * lv); if (!m.d.boss) { m.stun = Math.max(m.stun || 0, 1.5 + 0.3 * lv); m.atkAnim = -1; } aggro(m); } Sfx.boss(); } },
  wolf_instinct: { name: 'Wolf’s Instinct', max: 5, passive: true, rune: 'ᚢ', el: 'earth', desc: lv => `+${lv * 3} ATK and +${(lv * 0.5).toFixed(1)} CRIT with a bow; +${lv * 2}% attack speed with a dagger.` },
  // ---------- Voice of Bragi (skald) ----------
  norns_draw: { name: 'Norns’ Draw', max: 5, rune: 'ᚾ', el: 'ghost', tgt: 'enemy', range: 9, sp: () => 40, cast: () => 0.4, cd: 3,
    desc: lv => `Draw blind from the Norns’ loom. One of seven fates falls on the foe: Urðr’s Thread (${P && S ? nornDmg(lv) : '?'} damage), Verðandi’s Stillness (frozen in time), Skuld’s Debt (armour halved, marked), the Wolf (its attacks halved), the Raven (three lightning strikes), the Wheel (you are healed), or the Fool (nothing at all).`,
    use(lv, t) { nornsCard(t, lv, Math.floor(Math.random() * NORN_CARDS.length)); } },
  harmonize: { name: 'Harmonize', max: 5, rune: 'ᛚ', el: 'wind', tgt: 'self', sp: () => 30, cd: 5,
    desc: lv => `Weave two sagas into one for ${60 + 30 * lv}s: two of your songs can play at the same time.`,
    use(lv) { addBuff('harmonize', 'Harmonize', 'harmonize', 60 + 30 * lv, {}, { harmonize: true, aura: { r: 0.8, col: '#ffd070' } }); ring(P.x, P.y, 2.2, '#ffd070'); Sfx.heal(); } },
  song_of_valhalla: song('song_of_valhalla', 'Song of Valhalla', 'ᚢ', '#ffe08a', lv => `Sing the welcome of the Hall of the Slain for 120s: +${5 + 3 * lv} ATK, +${5 + 3 * lv} MATK and ${2 * lv}% less damage taken.`, lv => ({ atk: 5 + 3 * lv, matk: 5 + 3 * lv, dmgRed: 2 * lv }), lv => ({})),
  bragis_verse: { name: 'Bragi’s Verse', max: 5, rune: 'ᛒ', el: 'neutral', tgt: 'self', sp: lv => 30 + 4 * lv, cd: 4,
    desc: lv => `A verse so sharp it cuts: for ${8 + lv}s, every enemy within 3 cells of you takes ${30 + 10 * lv}% ATK each second. It ignores DEF.`,
    use(lv) { zoneAdd({ kind: 'verse', follow: true, x: P.x, y: P.y, r: 3, dur: 8 + lv, every: 1, first: 0.3, col: '#ffd070', rune: 'ᛒ',
      tick(z) { ring(z.x, z.y, z.r, '#ffd070'); for (const m of mobsNear(z.x, z.y, z.r)) { trueHit(m, (S.atkStatus + S.watk) * (0.3 + 0.1 * lv), 'neutral'); burst(m.x, m.y, 30, '#ffe0a0', 4, 1.5); } } }); floatText(P, '♪', 'skill'); Sfx.heal(); } },
  skald_volley: { name: 'Rune-Strung Volley', max: 5, rune: 'ᚨ', el: 'neutral', tgt: 'enemy', range: lv => Math.max(S ? S.range : 5, 5), sp: lv => 16 + 3 * lv, cast: () => 0.4, cd: 1.5, need: needW('lute', 'whip', 'bow'),
    desc: lv => `Five rune-strung strikes at a foe: each ${60 + 20 * lv}% ATK to it and everything within 2 cells of it. Works with lutes, whips and bows.`,
    use(lv, t) { for (let i = 0; i < 5; i++) after(i * 0.1, () => { if (t.dead) return; P.atkAnim = 0; shot(P, t, 'arrow', () => { for (const m of mobsNear(t.x, t.y, 2)) physHit(m, 0.6 + 0.2 * lv, {}); burst(t.x, t.y, 26, '#ffd070', 6, 2); }, { spd: 26 }); if (i % 2 === 0) Sfx.bow(); }); } },
  // ---------- Valkyrie (priest) ----------
  assumptio: { name: 'Assumptio', max: 5, rune: 'ᛉ', el: 'holy', tgt: 'self', sp: lv => 40 + 5 * lv, cast: () => 1, cd: 5,
    desc: lv => `Wrap yourself in a Valkyrie’s mantle for ${60 + 20 * lv}s: you take ${25 + 5 * lv}% less damage.`,
    use(lv, t) { onHero(t, () => { addBuff('assumptio', 'Assumptio', 'assumptio', 60 + 20 * lv, { dmgRed: 25 + 5 * lv }, { aura: { r: 1, col: '#ffd8f0' } }); pillar(P, '#ffe0f4', true); }); Sfx.heal(); } },
  basilica: { name: 'Basilica', max: 5, rune: 'ᛒ', el: 'holy', tgt: 'self', sp: lv => 60 + 5 * lv, cast: () => 2, cd: 20,
    desc: lv => `Raise a hall of light around you (3 cells) for ${10 + 2 * lv}s: enemies are pushed out and cannot strike inside it, and enemy blasts that land in it fizzle. Bosses are not pushed.`,
    use(lv) { zoneAdd({ kind: 'sanctuary', ward: true, x: P.x, y: P.y, r: 3, dur: 10 + 2 * lv, every: 0.25, col: '#fff2c0', rune: 'ᛒ',
      tick(z) { for (const m of mobsNear(z.x, z.y, z.r)) { m.atkCD = Math.max(m.atkCD, 0.4); if (!m.d.boss) knock(m, z, 0.5); } } }); pillar(P, '#fff2c0', true); ring(P.x, P.y, 3, '#fff2c0'); Sfx.heal(); } },
  einherjar_call: { name: 'Einherjar’s Call', max: 5, rune: 'ᛟ', el: 'holy', tgt: 'self', sp: () => 50, cast: () => 1.5, cd: 60,
    desc: lv => `Call the einherjar to your side for 120s: +${5 + 3 * lv} ATK and MATK, +${4 * lv}% Max HP, and the first time you fall you are carried back to your feet with ${30 + 10 * lv}% HP.`,
    use(lv) { addBuff('einherjar', 'Einherjar’s Call', 'einherjar_call', 120, { atk: 5 + 3 * lv, matk: 5 + 3 * lv, maxhpPct: 4 * lv }, { revive: 0.3 + 0.1 * lv, aura: { r: 1.3, col: '#ffe8a0' } }); pillar(P, '#ffe8a0', true); burst(P.x, P.y, 40, '#fff6d8', 24, 2.5); Sfx.level(); } },
  chooser_spear: { name: 'Spear of the Chooser', max: 5, rune: 'ᛏ', el: 'holy', tgt: 'enemy', range: 7, sp: lv => 25 + 3 * lv, cast: () => 0.5, cd: 1.2,
    desc: lv => `Throw a spear of light: ${200 + 40 * lv}% holy ATK and ${100 + 20 * lv}% holy MATK. A foe under 30% HP has been chosen: double damage.`,
    use(lv, t) { P.atkAnim = 0; shot(P, t, 'spear', () => { if (t.dead) return; const k = t.hp < t.maxhp * 0.3 ? 2 : 1; if (k > 1) floatText(t, 'Chosen', 'info'); physHit(t, (2 + 0.4 * lv) * k, { elem: 'holy', sure: true }); magicHit(t, (1 + 0.2 * lv) * k, 'holy'); pillar(t, '#fff2b8'); }, { spd: 20 }); Sfx.bow(); } },
  wings_of_valhalla: { name: 'Wings of Valhalla', max: 5, rune: 'ᚹ', el: 'holy', tgt: 'dir', range: 6, sp: () => 25, cd: 4,
    desc: lv => `Spread your wings and glide up to 6 cells, untouchable; you land healed for ${P && S ? Math.round(healAmt(lv * 2)) : '?'} HP, and enemies within 1.5 cells of the landing are knocked away.`,
    use(lv, t, pos) { burst(P.x, P.y, 30, '#ffffff', 20, 2.5); dashTo(pos.x, pos.y, 6, 0, false, () => { healP(healAmt(lv * 2)); ring(P.x, P.y, 1.5, '#fff6d8'); burst(P.x, P.y, 30, '#fff6d8', 20, 2.5); for (const m of mobsNear(P.x, P.y, 1.5)) knock(m, P, 1.5); }); Sfx.warp(); } },
  // ---------- Berserkr (monk) ----------
  blade_stop: { name: 'Blade Stop', max: 5, rune: 'ᛁ', el: 'neutral', tgt: 'self', sp: () => 10, cd: 3,
    desc: lv => `Open your hands for ${(1 + 0.3 * lv).toFixed(1)}s: the next melee blow is caught barehanded. It does no harm, the attacker is locked for ${(2 + 0.5 * lv).toFixed(1)}s (bosses briefly), and you gain a spirit sphere.`,
    use(lv) { addBuff('bladestop', 'Blade Stop', 'blade_stop', 1 + 0.3 * lv, {}, { bladestop: lv, aura: { r: 0.8, col: '#9fd0ff' } }); ring(P.x, P.y, 1, '#9fd0ff'); Sfx.equip(); } },
  chain_crush: { name: 'Chain Crush Combo', max: 5, rune: 'ᛞ', el: 'neutral', tgt: 'enemy', range: 'weapon', sp: lv => 15 + 2 * lv, cd: 0.8, need: needSpheres(2),
    desc: lv => `Spend 2 spheres on six blows in a chain: each ${60 + 25 * lv}% ATK; the last knocks the foe back.`,
    use(lv, t) { setSpheres(P.spheres - 2); for (let i = 0; i < 6; i++) after(0.08 + i * 0.08, () => { if (t.dead) return; P.atkAnim = 0; physHit(t, 0.6 + 0.25 * lv, i === 5 ? { knock: 1.5, from: P } : {}); burst(t.x, t.y, 26, '#ffe0b0', 6, 2.2); if (i === 5) { ring(t.x, t.y, 1, '#9fd0ff'); SHAKE_(0.1); } }); Sfx.crit(); } },
  asura_plus: { name: 'Asura Strike: Ragnarök', max: 5, rune: 'ᚨ', el: 'neutral', tgt: 'enemy', range: 'weapon', sp: () => 10, cast: () => 0.4, cd: 6, need: needSpheres(1),
    desc: lv => `The Berserkr’s Asura: burn every sphere and all your SP on one blow of ${(4 + lv) * 100}% ATK, +1% per 2 SP spent, +15% per sphere. It ignores DEF and never misses, and the shockwave hits everything within 2.5 cells for half. Your SP will not recover for 10s.`,
    use(lv, t) { const spent = P.sp, sph = P.spheres || 0; P.sp = 0; P.spT = -10; setSpheres(0); P.atkAnim = 0;
      const mul = (4 + lv) * (1 + spent / 200) * (1 + 0.15 * sph); pillar(P, '#ff8a4a', true); SHAKE_(0.12);
      after(0.15, () => { if (t.dead) return; const x = t.x, y = t.y; physHit(t, mul, { sure: true, ignoreDef: true }); ring(x, y, 2.5, '#ff8a4a'); burst(x, y, 30, '#fff0d0', 44, 5.5); fxs.push({ k: 'meteor', x, y, t: 0, dur: 0.4, col: '#ff8a4a' });
        for (const m of mobsNear(x, y, 2.5)) if (m !== t) physHit(m, mul * 0.5, { sure: true, ignoreDef: true, knock: 1.5, from: { x, y } }); SHAKE_(0.4); HITSTOP_(0.18); Sfx.slam(); }); } },
  bear_rage: { name: 'Bear-Skin Rage', max: 5, rune: 'ᛒ', el: 'fire', tgt: 'self', sp: () => 20, cd: 30,
    desc: lv => `Put on the bear: five spirit spheres at once, and for ${45 + 15 * lv}s +${5 + 3 * lv} CRIT, +${2 * lv}% attack speed and +${3 * lv} ATK. Your SP does not recover while it lasts.`,
    use(lv) { setSpheres(5); addBuff('bearrage', 'Bear-Skin Rage', 'bear_rage', 45 + 15 * lv, { crit: 5 + 3 * lv, aspd: 2 * lv, atk: 3 * lv }, { noSpRegen: true, aura: { r: 1.1, col: '#e0582a' } }); pillar(P, '#e0582a', true); floatText(P, 'RAAAH!', 'shout'); SHAKE_(0.15); Sfx.boss(); } },
  thors_palm: { name: 'Thor’s Palm', max: 5, rune: 'ᚦ', el: 'wind', tgt: 'enemy', range: 2.2, sp: lv => 12 + 2 * lv, cd: 1, need: needSpheres(1),
    desc: lv => `Spend a sphere on an open-palm blow like Thor’s hammer: ${150 + 40 * lv}% ATK that ignores DEF (harder the thicker the armour), hurling the foe 4 cells and stunning it for 1s.`,
    use(lv, t) { setSpheres(P.spheres - 1); P.atkAnim = 0; after(0.1, () => { if (t.dead) return; physHit(t, (1.5 + 0.4 * lv) * (1 + t.d.def / 100), { sure: true, ignoreDef: true, knock: 4, from: P }); if (!t.dead) t.stun = Math.max(t.stun || 0, t.d.boss ? 0.3 : 1); strike(t.x, t.y); ring(t.x, t.y, 1.2, '#fff6a0'); SHAKE_(0.2); HITSTOP_(0.1); }); Sfx.crit(); } },
};
// ---------- Skill helpers (run at play time) ----------
/* Cycle 8 (squad mode): support skills on allies. A skill's target may be a party member (the companion AI passes one,
   the player's heals pick one: partyHealTarget in js/core.js). onHero runs the effect in that hero's context (its Max HP
   for Kyrie, its buff bar), else on the caster; onParty also touches every ally within r cells of the caster when no
   one in particular was chosen. Solo, both are a plain call. */
const allyOf = t => t && t.kind === 'player' && t !== P && typeof inParty === 'function' && inParty(t) ? t : null;
function onHero(t, fn) { const h = allyOf(t); if (h) { if (!h.dead) withHero(h, fn); } else fn(); }
function onParty(t, r, fn) {
  const h = allyOf(t); if (h) { if (!h.dead) withHero(h, fn); return; }
  fn(); if (typeof PARTY === 'undefined' || !PARTY || PARTY.members.length < 2) return;
  const c = P; for (const a of PARTY.members) if (a !== c && !a.dead && Math.hypot(a.x - c.x, a.y - c.y) <= r) withHero(a, fn);
}
function needW(...ws) { return () => ws.includes(S.wtype) ? null : `Needs a ${ws.map(w => WNAME[w] || w).join(' or ')}`; }
function needShield() { return P.equip.shield ? null : 'Needs a shield'; }
function needSpheres(n) { return () => (P.spheres || 0) >= n ? null : 'No spirit spheres'; }
function endow(el, name, rune, what) {
  return { name, max: 5, rune, el, tgt: 'self', sp: lv => 28 + 2 * lv, cast: () => 1, cd: 1,
    desc: lv => `Bind ${what} into your weapon for ${60 * lv + 60}s: your attacks become ${el === 'wind' ? 'wind' : el}, and your ${el === 'wind' ? 'wind' : el} spells deal ${5 * lv}% more damage. Replaces any other endow.`,
    use(lv) { for (const k of ['endow_fire', 'endow_water', 'endow_wind', 'endow_earth']) delete P.buffs[k];
      addBuff('endow_' + el, name, 'endow_' + { fire: 'blaze', water: 'frost', wind: 'lightning', earth: 'quake' }[el], 60 * lv + 60, {}, { endow: el, amp: 5 * lv }); pillar(P, ELCOL[el]); burst(P.x, P.y, 30, ELCOL[el], 14, 1.8); Sfx.cast(); } };
}
// Songs: one at a time (songStart ends the others). id = the skill id, also the buff icon.
function song(id, name, rune, col, desc, bonus, extra) {
  return { name, max: 10, rune, el: 'wind', tgt: 'self', sp: lv => 36 + 4 * lv, cd: 3, desc, song: true,
    use(lv) { songStart('song_' + id, name, id, 120, bonus(lv), Object.assign({ song: true, aura: { r: 2.2, col } }, extra(lv))); } };
}
const mobSize = m => m.d.boss || (m.d.size || 1) >= 2 || (m.d.look && (m.d.look.scale || 1) >= 1.8) ? 3 : m.d.spr === 'human' || m.d.spr === 'wolf' || m.d.spr === 'ghost' || m.d.spr === 'tree' ? 2 : 1;
function blitzDmg(lv) { return Math.round((S.dex / 8 + S.int / 2 + 40 + 4 * lv) * 2); }
function trapDmg(lv, div) { return Math.round(S.dex * (3 + lv) / div * (1 + S.int / 100) + 40); }
function dirTo(pos) { const dx = pos.x - P.x, dy = pos.y - P.y, d = Math.hypot(dx, dy); return d > 0.05 ? { x: dx / d, y: dy / d } : { x: P.fx || 1, y: P.fy || 0 }; }
const SHAKE_ = v => { if (typeof SHAKE !== 'undefined') SHAKE = Math.max(SHAKE, v); };
const HITSTOP_ = v => { if (typeof HITSTOP !== 'undefined') HITSTOP = Math.max(HITSTOP, v); };

/* ---------- Content round 6 helpers (tier-3 skills) ---------- */
// Spear skills hit 25% harder from a warg's back (any weapon with `any`, e.g. Gungnir Charge).
const mountSpear = any => (typeof P !== 'undefined' && P && P.mounted && (any || (S && S.wtype === 'spear'))) ? 1.25 : 1;
// Enemies along a line from (x, y) in direction (fx, fy): within `len` cells ahead and `w` cells of the line, nearest first.
function lineMobs(x, y, fx, fy, len, w) {
  return mobs.filter(m => { if (m.dead) return false; const dx = m.x - x, dy = m.y - y, a = dx * fx + dy * fy, p = Math.abs(dx * fy - dy * fx); return a > -0.3 && a <= len && p <= w + ((m.d.look && m.d.look.scale) || m.d.size || 1) * 0.25; })
    .sort((a, b) => dist(a, { x, y }) - dist(b, { x, y }));
}
// Monster debuffs: weaken (its blows deal pct% less for secs; mobStrike reads m.weak / m.weakAmt) and pull (toward a point).
function weakenMob(m, secs, pct) { if (m.dead) return; const old = m.weak > 0 ? m.weakAmt || 0 : 0; m.weak = Math.max(m.weak || 0, secs); m.weakAmt = Math.max(old, pct); floatText(m, 'Weakened', 'info'); }
function pullMob(m, to, step) { const dx = to.x - m.x, dy = to.y - m.y, d = Math.hypot(dx, dy); if (d < 0.35) return; const k = Math.min(step, d - 0.3), nx = m.x + dx / d * k, ny = m.y + dy / d * k; if (!blocked(nx, ny)) { m.x = nx; m.y = ny; m.path = null; } }
// Norns' Draw (Voice of Bragi): seven fates. nornsCard(t, lv, index) is deterministic for tests.
const nornDmg = lv => Math.round(P.lvl * 25 + 250 * lv);
const NORN_CARDS = [
  { name: 'Urðr’s Thread', col: '#ffd070', run(t, lv) { trueHit(t, nornDmg(lv), 'neutral'); pillar(t, '#ffd070', true); } },
  { name: 'Verðandi’s Stillness', col: '#bfe6ff', run(t) { if (!freezeMob(t, 4)) { t.stun = Math.max(t.stun || 0, t.d.boss ? 0.6 : 3); floatText(t, 'Still', 'info'); } } },
  { name: 'Skuld’s Debt', col: '#c8a8ff', run(t, lv) { t.dispel = Math.max(t.dispel || 0, 20); markMob(t, 20, 10 + 4 * lv); aggro(t); } },
  { name: 'The Wolf', col: '#7a55a0', run(t) { weakenMob(t, 20, 50); aggro(t); } },
  { name: 'The Raven', col: '#fff6a0', run(t, lv) { for (let i = 0; i < 3; i++) after(i * 0.2, () => { if (!t.dead) { strike(t.x, t.y); magicHit(t, 1 + 0.3 * lv, 'wind'); } }); } },
  { name: 'The Wheel', col: '#bff0b0', run() { healP(S.maxhp * 0.3); pillar(P, '#bff0b0'); } },
  { name: 'The Fool', col: '#a89a88', run(t) { floatText(t, 'The Norns laugh', 'miss'); } },
];
function nornsCard(t, lv, k) {
  const c = NORN_CARDS[clamp(k | 0, 0, NORN_CARDS.length - 1)];
  floatText(P, c.name, 'skill'); ring(t.x, t.y, 1.2, c.col); burst(t.x, t.y, 40, c.col, 12, 2); Sfx.cast();
  c.run(t, lv); if (!t.dead) aggro(t);
  return c.name;
}

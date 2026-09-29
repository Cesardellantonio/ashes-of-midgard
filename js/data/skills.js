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
    use(lv, t) { const a = healAmt(lv); if (t && t.kind === 'mob') { const dmg = Math.round(a * 0.5 * elemMod('holy', mobElem(t))); pillar(t, '#fff2b8'); aggro(t); finishHit(t, dmg, false, {}); } else { healP(a); pillar(P, '#bff0b0'); } Sfx.heal(); } },
  blessing: { name: 'Blessing', max: 10, rune: 'ᚷ', el: 'holy', tgt: 'self', sp: lv => 24 + 4 * lv, cd: 2, desc: lv => `For ${40 + 20 * lv}s: +${lv} STR, DEX and INT.`,
    use(lv) { addBuff('bless', 'Blessing', 'blessing', 40 + 20 * lv, { str: lv, dex: lv, int: lv }); pillar(P, '#f5e6a0'); Sfx.heal(); } },
  inc_agi: { name: 'Increase AGI', max: 10, rune: 'ᛖ', el: 'holy', tgt: 'self', sp: lv => 18 + 3 * lv, cd: 2, desc: lv => `For ${40 + 20 * lv}s: +${2 + lv} AGI and 25% movement speed.`,
    use(lv) { addBuff('agi', 'Increase AGI', 'inc_agi', 40 + 20 * lv, { agi: 2 + lv, move: 25 }); pillar(P, '#bfe8ff'); Sfx.heal(); } },
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
    desc: lv => `Drive the spear through: ${100 + 7 * lv}% ATK with +${lv * 5} HIT, once against small foes, twice against man-sized ones, three times against giants.`,
    use(lv, t) { P.atkAnim = 0; const n = mobSize(t); after(0.12, () => { for (let i = 0; i < n; i++) after(i * 0.09, () => { if (!t.dead) { physHit(t, 1 + 0.07 * lv, { hit: lv * 5 }); burst(t.x, t.y, 24, '#e8e0ff', 6, 2); } }); }); Sfx.swing(); } },
  spear_boomerang: { name: 'Spear Boomerang', max: 5, rune: 'ᚷ', el: 'neutral', tgt: 'enemy', range: lv => 3 + lv * 1.5, sp: () => 10, cd: 0.6, need: needW('spear'),
    desc: lv => `Hurl the spear up to ${3 + lv * 1.5} cells for ${100 + 50 * lv}% ATK. It comes back.`,
    use(lv, t) { P.atkAnim = 0; shot(P, t, 'spear', () => { physHit(t, 1 + 0.5 * lv); if (!t.dead) shot(t, P, 'spear', () => {}, { spd: 20 }); }, { spd: 18 }); Sfx.bow(); } },
  brandish_spear: { name: 'Brandish Spear', max: 10, rune: 'ᛗ', el: 'neutral', tgt: 'dir', range: 3, sp: () => 12, cast: () => 0.35, cd: 1, need: needW('spear'),
    desc: lv => `Sweep the spear through a wide arc in front of you (${(2.6 + lv * 0.1).toFixed(1)} cells): ${100 + 20 * lv}% ATK to every enemy in it, pushing them back.`,
    use(lv, t, pos) { P.atkAnim = 0; const r = 2.6 + lv * 0.1, d = dirTo(pos); for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.35, cx = Math.cos(a) * d.x - Math.sin(a) * d.y, cy = Math.sin(a) * d.x + Math.cos(a) * d.y; burst(P.x + cx * r * 0.7, P.y + cy * r * 0.7, 20, '#e8e0ff', 5, 2.4); }
      ring(P.x + d.x * r * 0.5, P.y + d.y * r * 0.5, r * 0.8, '#d8d0ff'); for (const m of mobsInCone(P.x, P.y, d.x, d.y, r, 0.35)) physHit(m, 1 + 0.2 * lv, { sure: true, knock: 1.5, from: P }); SHAKE_(0.12); Sfx.slam(); } },
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
    use(lv) { addBuff('magnificat', 'Magnificat', 'magnificat', 30 + 15 * lv, {}, { regen: 2 }); pillar(P, '#bfe0ff', true); Sfx.heal(); } },
  sanctuary: { name: 'Sanctuary', max: 10, rune: 'ᛒ', el: 'holy', tgt: 'ground', range: 9, sp: lv => 15 + 3 * lv, cast: () => 1.2, cd: 3,
    desc: lv => `Hallow the ground (2.5 cells) for ${4 + lv}s. Each second you recover ${P && S ? Math.round(healAmt(lv) * 0.35) : '?'} HP while you stand in it, and undead or demons inside burn for half that.`,
    use(lv, t, pos) { zoneAdd({ kind: 'sanctuary', x: pos.x, y: pos.y, r: 2.5, dur: 4 + lv, every: 1, col: '#bff0b0', rune: 'ᛒ',
      tick(z) { const a = healAmt(lv) * 0.35; ring(z.x, z.y, z.r, '#bff0b0'); if (dist(P, z) <= z.r && !P.dead) healP(a); for (const m of mobsNear(z.x, z.y, z.r)) if (isUndeadish(m)) trueHit(m, a * 0.5, 'holy'); } }); Sfx.heal(); } },
  kyrie_eleison: { name: 'Kyrie Eleison', max: 10, rune: 'ᚴ', el: 'holy', tgt: 'self', sp: lv => 20 + lv, cast: () => 0.8, cd: 2,
    desc: lv => `A shield of prayer for 120s. It absorbs up to ${10 + 2 * lv}% of your Max HP in damage, or ${5 + Math.ceil(lv / 2)} blows, whichever comes first.`,
    use(lv) { addBuff('kyrie', 'Kyrie Eleison', 'kyrie_eleison', 120, {}, { shield: Math.round(S.maxhp * (0.1 + 0.02 * lv)), hits: 5 + Math.ceil(lv / 2), aura: { r: 0.8, col: '#fff2b8', bubble: true } }); pillar(P, '#fff2b8'); Sfx.heal(); } },
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
};
// ---------- Skill helpers (run at play time) ----------
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

// The playable monsters. Stats are tradeoffs, not a power ladder.
// sheet: which sprite sheet (assets.js); dirs8: sheet has all 8 facings (no mirroring).
// portrait: [image, x, y] of a 40x40 face for the pick screen.
// swim: can move through the moat instead of being rung out.
// float: levitates (Levitate): drifts over the moat without a ring-out, quake rings + bone spikes pass under.
// fly: always airborne (Sky high): everything float does, plus ground zones (fire floor, sludge, wet) can't touch it.
//   Light bodies, so the bird line also takes extra knockback (knockMul).
// phase: dashing makes it intangible for a moment (attacks pass through).
// knockMul: scales knockback taken (rock line is heavy: harder to ring out).
// blink: psychic line passive — the dash is an instant short teleport (see fighter.js BLINK).
// fury: dragon line passive — landing hits builds Fury on yourself (see fighter.js FURY).
// poisonProof: half poison damage, at most 2 stacks (ground line's bone armour).
import { CHARMANDER, CHARMELEON, CHARIZARD, BULBASAUR, IVYSAUR, VENUSAUR, SQUIRTLE, WARTORTLE, BLASTOISE, GEODUDE, GRAVELER, GOLEM, CUBONE, MAROWAK, PICHU, PIKACHU, RAICHU, GASTLY, HAUNTER, GENGAR, PIDGEY, PIDGEOTTO, PIDGEOT, DRATINI, DRAGONAIR, DRAGONITE, ABRA, KADABRA, ALAKAZAM } from './frames.js';

export const SPECIES = {
  charmander: {
    name: 'Charmander', role: 'all-rounder', line: 'fire', element: 'fire', sheet: 'charmander',
    frames: CHARMANDER, hp: 100, speed: 72, hurtR: 6, size: 1, mouth: [8, 5], mouthH: 10,
    kit: { light: 'scratch', heavy: 'ember', special: 'flame' },
    portrait: ['charmander.png', 5, 4], hover: 62,
  },
  charmeleon: {
    name: 'Charmeleon', role: 'fast brawler', line: 'fire', element: 'fire', sheet: 'charmander',
    frames: CHARMELEON, hp: 110, speed: 82, hurtR: 7, size: 1.15, mouth: [9, 6], mouthH: 12,
    kit: { light: 'slash', heavy: 'flameWheel', special: 'fireSpin' },
    portrait: ['charmander.png', 5, 207], hover: 48,
  },
  charizard: {
    name: 'Charizard', role: 'slow heavy zoner', line: 'fire', element: 'fire', sheet: 'charmander',
    frames: CHARIZARD, hp: 140, speed: 60, hurtR: 9, size: 1.45, mouth: [12, 7], mouthH: 17,
    kit: { light: 'wingAttack', heavy: 'fireBlast', special: 'blastBurn' },
    portrait: ['charmander.png', 5, 430], hover: 90,
  },
  bulbasaur: {
    name: 'Bulbasaur', role: 'sustain all-rounder', line: 'grass', element: 'grass', sheet: 'bulbasaur', dirs8: true,
    frames: BULBASAUR, hp: 105, speed: 70, hurtR: 6, size: 1, mouth: [7, 4], mouthH: 8,
    kit: { light: 'tackle', heavy: 'razorLeaf', special: 'leechSeed' },
    portrait: ['protraits.png', 0, 0], hover: 64,
  },
  ivysaur: {
    name: 'Ivysaur', role: 'mid-range controller', line: 'grass', element: 'grass', sheet: 'bulbasaur', dirs8: true,
    frames: IVYSAUR, hp: 120, speed: 66, hurtR: 7, size: 1.15, mouth: [8, 5], mouthH: 10,
    kit: { light: 'vineWhip', heavy: 'poisonPowder', special: 'petalDance' },
    portrait: ['protraits.png', 640, 0], hover: 46,
  },
  venusaur: {
    name: 'Venusaur', role: 'slow fortress', line: 'grass', element: 'grass', sheet: 'bulbasaur', dirs8: true,
    frames: VENUSAUR, hp: 160, speed: 52, hurtR: 9, size: 1.4, mouth: [10, 6], mouthH: 12,
    kit: { light: 'bodySlam', heavy: 'sludgeBomb', special: 'solarBeam' },
    portrait: ['protraits.png', 680, 0], hover: 100,
  },
  squirtle: {
    name: 'Squirtle', role: 'agile skirmisher', line: 'water', element: 'water', sheet: 'squirtle', swim: true,
    frames: SQUIRTLE, hp: 95, speed: 78, hurtR: 6, size: 1, mouth: [7, 4], mouthH: 9,
    kit: { light: 'waterGun', heavy: 'rapidSpin', special: 'bubbleBeam' },
    portrait: ['squirtle.png', 5, 4], hover: 70,
  },
  wartortle: {
    name: 'Wartortle', role: 'counter fighter', line: 'water', element: 'water', sheet: 'squirtle', swim: true, dirs8: true,
    frames: WARTORTLE, hp: 115, speed: 74, hurtR: 7, size: 1.15, mouth: [8, 5], mouthH: 11,
    kit: { light: 'bite', heavy: 'waterPulse', special: 'withdraw' },
    portrait: ['squirtle.png', 5, 195], hover: 56,
  },
  blastoise: {
    name: 'Blastoise', role: 'slow artillery tank', line: 'water', element: 'water', sheet: 'squirtle', swim: true,
    frames: BLASTOISE, hp: 150, speed: 56, hurtR: 9, size: 1.4, mouth: [10, 6], mouthH: 15,
    kit: { light: 'skullBash', heavy: 'hydroPump', special: 'surf' },
    portrait: ['squirtle.png', 5, 436], hover: 84,
  },
  geodude: {
    name: 'Geodude', role: 'scrappy brawler', line: 'rock', element: 'rock', sheet: 'geodude', knockMul: 0.7,
    frames: GEODUDE, hp: 105, speed: 64, hurtR: 6, size: 1, mouth: [8, 4], mouthH: 9,
    kit: { light: 'rockSmash', heavy: 'rockThrow', special: 'magnitude' },
    portrait: ['geodude.png', 5, 5], hover: 60,
  },
  graveler: {
    name: 'Graveler', role: 'rock gunner', line: 'rock', element: 'rock', sheet: 'geodude', knockMul: 0.7,
    frames: GRAVELER, hp: 125, speed: 58, hurtR: 7, size: 1.15, mouth: [9, 5], mouthH: 12,
    kit: { light: 'megaPunch', heavy: 'rockBlast', special: 'rockSlide' },
    portrait: ['geodude.png', 5, 193], hover: 72,
  },
  golem: {
    name: 'Golem', role: 'slow siege tank', line: 'rock', element: 'rock', sheet: 'geodude', knockMul: 0.7,
    frames: GOLEM, hp: 165, speed: 48, hurtR: 9, size: 1.3, mouth: [10, 5], mouthH: 12,
    kit: { light: 'bodyPress', heavy: 'rollout', special: 'earthquake' },
    portrait: ['geodude.png', 4, 399], hover: 52,
  },
  cubone: {
    name: 'Cubone', role: 'plucky glass cannon', line: 'ground', element: 'ground', sheet: 'cubone', dirs8: true, poisonProof: true,
    frames: CUBONE, hp: 95, speed: 74, hurtR: 6, size: 1, mouth: [7, 4], mouthH: 9,
    kit: { light: 'boneClub', heavy: 'bonemerang', special: 'focusEnergy' },
    portrait: ['cubone.png', 5, 4], hover: 60,
  },
  marowak: {
    name: 'Marowak', role: 'bone keeper bruiser', line: 'ground', element: 'ground', sheet: 'cubone', dirs8: true, poisonProof: true,
    frames: MAROWAK, hp: 135, speed: 60, hurtR: 7, size: 1.2, mouth: [9, 5], mouthH: 12,
    kit: { light: 'boneRush', heavy: 'bonemerangPlus', special: 'boneSpikes' },
    portrait: ['cubone.png', 5, 256], hover: 64,
  },
  pichu: {
    name: 'Pichu', role: 'reckless glass cannon', line: 'electric', element: 'electric', sheet: 'pichu', dirs8: true,
    frames: PICHU, hp: 80, speed: 84, hurtR: 5, size: 0.9, mouth: [6, 4], mouthH: 7,
    kit: { light: 'thunderShock', heavy: 'nuzzle', special: 'voltTackle' },
    portrait: ['pichu.png', 5, 5], hover: 60,
  },
  pikachu: {
    name: 'Pikachu', role: 'speedy duelist', line: 'electric', element: 'electric', sheet: 'pichu', dirs8: true,
    frames: PIKACHU, hp: 100, speed: 80, hurtR: 6, size: 1, mouth: [7, 4], mouthH: 9,
    kit: { light: 'quickAttack', heavy: 'thunderbolt', special: 'thunder' },
    portrait: ['pichu.png', 6, 376], hover: 72,
  },
  raichu: {
    name: 'Raichu', role: 'heavy hitter', line: 'electric', element: 'electric', sheet: 'pichu', dirs8: true,
    frames: RAICHU, hp: 130, speed: 66, hurtR: 8, size: 1.2, mouth: [9, 5], mouthH: 12,
    kit: { light: 'spark', heavy: 'thunderWave', special: 'wildCharge' },
    portrait: ['pichu.png', 11, 961], hover: 50,
  },
  gastly: {
    name: 'Gastly', role: 'slippery trickster', line: 'ghost', element: 'ghost', sheet: 'gastly', float: true, phase: true,
    frames: GASTLY, hp: 75, speed: 76, hurtR: 6, size: 1, mouth: [7, 4], mouthH: 10,
    kit: { light: 'lick', heavy: 'confuseRay', special: 'hypnosis' },
    portrait: ['gastly.png', 4, 4], hover: 62,
  },
  haunter: {
    name: 'Haunter', role: 'ambush skirmisher', line: 'ghost', element: 'ghost', sheet: 'gastly', float: true, phase: true,
    frames: HAUNTER, hp: 95, speed: 72, hurtR: 7, size: 1.15, mouth: [8, 5], mouthH: 12,
    kit: { light: 'shadowClaw', heavy: 'shadowHand', special: 'phantomForce' },
    portrait: ['gastly.png', 5, 264], hover: 58,
  },
  gengar: {
    name: 'Gengar', role: 'curse-stacking bruiser', line: 'ghost', element: 'ghost', sheet: 'gastly', float: true, phase: true,
    frames: GENGAR, hp: 115, speed: 62, hurtR: 8, size: 1.25, mouth: [9, 5], mouthH: 13,
    kit: { light: 'shadowPunch', heavy: 'shadowBall', special: 'nightmare' },
    portrait: ['gastly.png', 5, 518], hover: 60,
  },
  pidgey: {
    name: 'Pidgey', role: 'zippy wind pusher', line: 'flying', element: 'flying', sheet: 'pidgey', fly: true, knockMul: 1.25,
    frames: PIDGEY, hp: 80, speed: 86, hurtR: 5, size: 1, mouth: [7, 4], mouthH: 17, // mouthH includes the flight height
    kit: { light: 'peck', heavy: 'gust', special: 'whirlwind' },
    portrait: ['pidgey.png', 4, 3], hover: 58,
  },
  pidgeotto: {
    name: 'Pidgeotto', role: 'tornado controller', line: 'flying', element: 'flying', sheet: 'pidgey', fly: true, knockMul: 1.25,
    frames: PIDGEOTTO, hp: 105, speed: 80, hurtR: 7, size: 1.15, mouth: [8, 5], mouthH: 20,
    kit: { light: 'wingSlash', heavy: 'airCutter', special: 'twister' },
    portrait: ['pidgey.png', 5, 193], hover: 66,
  },
  pidgeot: {
    name: 'Pidgeot', role: 'ace striker', line: 'flying', element: 'flying', sheet: 'pidgey', fly: true, knockMul: 1.25,
    frames: PIDGEOT, hp: 125, speed: 76, hurtR: 8, size: 1.3, mouth: [9, 5], mouthH: 23,
    kit: { light: 'aerialAce', heavy: 'airSlash', special: 'hurricane' },
    portrait: ['pidgey.png', 7, 418], hover: 70,
  },
  dratini: {
    name: 'Dratini', role: 'binding skirmisher', line: 'dragon', element: 'dragon', sheet: 'dratini', swim: true,
    frames: DRATINI, hp: 90, speed: 80, hurtR: 6, size: 1, mouth: [7, 4], mouthH: 10,
    kit: { light: 'wrap', heavy: 'dragonTwister', special: 'dragonRage' },
    portrait: ['dratini.png', 6, 5], hover: 64,
  },
  dragonair: {
    name: 'Dragonair', role: 'snowballing duelist', line: 'dragon', element: 'dragon', sheet: 'dratini', swim: true,
    frames: DRAGONAIR, hp: 115, speed: 76, hurtR: 7, size: 1.15, mouth: [8, 5], mouthH: 14,
    kit: { light: 'dragonTail', heavy: 'dragonPulse', special: 'dragonDance' },
    portrait: ['dratini.png', 6, 239], hover: 70,
  },
  dragonite: {
    name: 'Dragonite', role: 'heavy all-in bruiser', line: 'dragon', element: 'dragon', sheet: 'dratini', swim: true,
    frames: DRAGONITE, hp: 145, speed: 62, hurtR: 9, size: 1.35, mouth: [10, 6], mouthH: 15,
    kit: { light: 'dragonClaw', heavy: 'hyperBeam', special: 'dracoMeteor' },
    portrait: ['dratini.png', 5, 501], hover: 60,
  },
  abra: {
    name: 'Abra', role: 'blinking glass cannon', line: 'psychic', element: 'psychic', sheet: 'abra', blink: true,
    frames: ABRA, hp: 75, speed: 74, hurtR: 6, size: 1, mouth: [7, 4], mouthH: 10,
    kit: { light: 'confusion', heavy: 'teleportStrike', special: 'psyshock' },
    portrait: ['abra.png', 5, 4], hover: 90,
  },
  kadabra: {
    name: 'Kadabra', role: 'telekinetic controller', line: 'psychic', element: 'psychic', sheet: 'abra', blink: true,
    frames: KADABRA, hp: 100, speed: 72, hurtR: 7, size: 1.15, mouth: [8, 5], mouthH: 13,
    kit: { light: 'psybeam', heavy: 'kinesis', special: 'futureSight' },
    portrait: ['abra.png', 5, 219], hover: 80,
  },
  alakazam: {
    name: 'Alakazam', role: 'psychic artillery', line: 'psychic', element: 'psychic', sheet: 'abra', blink: true,
    frames: ALAKAZAM, hp: 120, speed: 66, hurtR: 8, size: 1.25, mouth: [9, 5], mouthH: 14,
    kit: { light: 'psychoCut', heavy: 'psychic', special: 'psystrike' },
    portrait: ['abra.png', 4, 474], hover: 75,
  },
};

export const SLOTS = ['light', 'heavy', 'special'];

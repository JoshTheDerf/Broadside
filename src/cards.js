// ═══════════════════════════════════════════════════════════════
// BROADSIDE — cards.js
// Crew card effect resolution. Called when a player taps a card
// then taps a target on the board.
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve a card effect at world position (wx, wy).
 * @param {string} cardId  Key into CARD_DEFS
 * @param {number} wx, wy  World coords of the tapped target
 * @param {number} ap      Active player (1 or 2)
 * @returns {boolean}       True if the card was successfully played
 */
function resolveCard(cardId, wx, wy, ap) {
  const def = CARD_DEFS[cardId];
  if (!def) return false;

  const myShip   = findShipNear(wx, wy, ap, SHIP_RADIUS * 2.5);
  const enemy    = ap === 1 ? 2 : 1;
  const enemyHit = findShipNear(wx, wy, enemy, SHIP_RADIUS * 2.5);
  const { x: tx, y: ty } = w2s(wx, wy);

  sfxCardPlay();
  hapticTap();

  switch (cardId) {

    case 'lookout': {
      if (!myShip) return false;
      const s = myShip.ship;
      let minD = Infinity, closest = null;
      G.players[enemy].ships.forEach(es => {
        if (es.hp <= 0) return;
        const d = dist(s.x, s.y, es.x, es.y);
        if (d < minD) { minD = d; closest = es; }
      });
      if (closest) {
        const a = w2s(s.x, s.y), b = w2s(closest.x, closest.y);
        animDottedLine(a.x, a.y, b.x, b.y, minD);
      }
      return true;
    }

    case 'brace':
      if (!myShip) return false;
      myShip.ship.braced = true;
      animGoldenRing(tx, ty);
      return true;

    case 'signal_flags':
      if (!myShip) return false;
      myShip.ship.hasActed = false;
      myShip.ship.signaled = true;
      animFlags(tx, ty);
      return true;

    case 'full_sail':
      if (!myShip || myShip.ship.hasActed) return false;
      moveRings = [1, 1.8, 2.6, 3.5];
      actionMode = 'move';
      selectedShip = myShip.ship;
      return true;

    case 'evasive':
      if (!myShip || myShip.ship.hasActed) return false;
      moveRings = [SHIP_EVASIVE_DIST];
      actionMode = 'move';
      selectedShip = myShip.ship;
      selectedShip._evasive = true;
      return true;

    case 'skilled_gunner':
      if (!myShip) return false;
      myShip.ship._doubleShot = true;
      selectedShip = myShip.ship;
      actionMode = 'fire';
      showAimPanel();
      return true;

    case 'repair_crew':
      if (!myShip || myShip.ship.hp >= myShip.ship.maxHp) return false;
      myShip.ship.hp++;
      animSparkle(tx, ty);
      return true;

    case 'boarding_party': {
      if (!enemyHit) return false;
      const es = enemyHit.ship;
      const adj = G.players[ap].ships.find(s =>
        s.hp > 0 && dist(s.x, s.y, es.x, es.y) <= SHIP_ADJACENT_DIST
      );
      if (!adj) return false;
      const a = w2s(adj.x, adj.y);
      animBoarding(a.x, a.y, tx, ty);
      let dmg = 1;
      if (es.braced) { dmg = Math.max(0, dmg - 1); es.braced = false; }
      if (es.smoked) dmg = Math.max(0, dmg - 1);
      es.hp = Math.max(0, es.hp - dmg);
      animDamageNumber(tx, ty - 8, dmg > 0 ? `-${dmg}` : 'Blocked!');
      if (es.hp <= 0) {
        stats[ap].shipsSunk++;
        animSinking(tx, ty);
        if (allShipsSunk(enemy)) setTimeout(() => triggerGameOver(ap), 1600);
      }
      return true;
    }

    case 'spotter':
      if (!myShip) return false;
      myShip.ship._spotterShot = true;
      selectedShip = myShip.ship;
      actionMode = 'fire';
      showAimPanel();
      return true;

    case 'smokescreen':
      if (!myShip) return false;
      myShip.ship.smoked = true;
      animSmoke(tx, ty);
      return true;

    default:
      return false;
  }
}

const N_DELTAS = [-33,-31,-18,-14,14,18,31,33];
const A_DELTAS = [-34,-30,30,34];
const B_DIRS   = [-17,-15,15,17];
const R_DIRS   = [-16,-1,1,16];
const Q_DIRS   = B_DIRS.concat(R_DIRS);
const DIRS  = [0, 0, N_DELTAS, A_DELTAS, R_DIRS, B_DIRS, Q_DIRS];
const SLIDE = [0, 0, 0, 0, 1, 0, 0];
const CK = [
  [N_DELTAS, 0, 2, 0],
  [A_DELTAS, 0, 3, 0],
  [B_DIRS,   0, 5, 0],
  [Q_DIRS,   0, 6, 0],
  [R_DIRS,   1, 4, 0]
];
const FEN_PIECES = " PNBRQK  pnbrqk";
const sq  = s => (8 - +s[1]) * 16 + (s.charCodeAt(0) - 97);
const alg = i => String.fromCharCode(97 + (i & 7), 56 - (i >> 4));

export class Shatranj {
  constructor(fen) {
    this.load(fen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1");
  }

  load(fen) {
    const [pos, turn, , , half, full] = fen.split(" ");
    this.b = new Uint8Array(128);
    let i = 0;
    for (const ch of pos)
      if (ch === "/") i += 8;
      else if (ch >= "1" && ch <= "8") i += +ch;
      else this.b[i++] = FEN_PIECES.indexOf(ch);
    this.t = turn === "w" ? 0 : 8;
    this.h = +half; this.n = +full;
    this.hist = []; this.pos = [this.key()];
    this.wk = this._findKing(0); this.bk = this._findKing(8);
  }

  fen() {
    let pos = "";
    for (let r = 0; r < 8; r++) {
      let em = 0;
      for (let f = 0; f < 8; f++) {
        const v = this.b[r * 16 + f];
        if (!v) em++;
        else { if (em) pos += em, em = 0; pos += FEN_PIECES[v]; }
      }
      if (em) pos += em;
      if (r < 7) pos += "/";
    }
    return `${pos} ${this.t ? "b" : "w"} - - ${this.h} ${this.n}`;
  }

  key() { return this.b.join(",") + "|" + this.t; }
  _findKing(col) {
    const k = 6 | col;
    for (let r = 0; r < 8; r++)
      for (let f = 0; f < 8; f++)
        if (this.b[r * 16 + f] === k) return r * 16 + f;
  }
  king(col) { return col ? this.bk : this.wk; }

  atk(sq, by) {
    for (const d of by ? [-15, -17] : [15, 17]) {
      const x = sq + d; if (!(x & 0x88) && this.b[x] === (1 | by)) return true;
    }
    for (const [dirs, slide, t1, t2] of CK)
      for (const d of dirs) {
        let x = sq + d;
        while (!(x & 0x88)) {
          const p = this.b[x];
          if (p) {
            if ((p & 8) === by && ((p & 7) === t1 || (p & 7) === t2)) return true;
            break;
          }
          if (!slide) break;
          x += d;
        }
      }
    return false;
  }

  pseudo(from) {
    const p = this.b[from]; if (!p) return [];
    const me = p & 8, type = p & 7, r = from >> 4, out = [];
    if (type === 1) {
      const dir = me ? 16 : -16, promoR = me ? 7 : 0;
      const add = to => (to >> 4) === promoR
        ? out.push([from, to, 5])
        : out.push([from, to]);
      const one = from + dir;
      if (!(one & 0x88) && !this.b[one]) add(one);
      for (const d of [dir - 1, dir + 1]) {
        const to = from + d; if (to & 0x88) continue;
        const tp = this.b[to];
        if (tp && (tp & 8) !== me) add(to);
      }
      return out;
    }
    for (const d of DIRS[type]) {
      let to = from + d;
      while (!(to & 0x88)) {
        const tp = this.b[to];
        if (!tp) out.push([from, to]);
        else { if ((tp & 8) !== me) out.push([from, to]); break; }
        if (!SLIDE[type]) break;
        to += d;
      }
    }
    return out;
  }

  apply(m, light = false) {
    const [from, to, promo] = m, p = this.b[from], me = p & 8, type = p & 7;
    const u = { from, to, p, cap: this.b[to], h: this.h, n: this.n, wk: this.wk, bk: this.bk };
    this.b[to] = promo ? (promo | me) : p;
    this.b[from] = 0;
    if (type === 6) me ? (this.bk = to) : (this.wk = to);
    this.h = (type === 1 || u.cap) ? 0 : this.h + 1;
    if (this.t === 8) this.n++;
    this.t ^= 8;
    if (!light) { this.hist.push(u); this.pos.push(this.key()); }
    return u;
  }

  unapply(u, light = false) {
    const { from, to, p, cap, h: oh, n: on, wk, bk } = u;
    this.b[from] = p;
    this.b[to] = cap;
    if ((p & 7) === 6) { if (p & 8) this.bk = from; else this.wk = from; }
    this.h = oh; this.n = on; this.wk = wk; this.bk = bk; this.t ^= 8;
    if (!light) { this.hist.pop(); this.pos.pop(); }
  }

  moves(from) {
    if (!this.b[from] || (this.b[from] & 8) !== this.t) return [];
    const me = this.b[from] & 8, opp = me ^ 8;
    return this.pseudo(from).filter(m => {
      const u = this.apply(m, true);
      const ok = !this.atk(this.king(me), opp);
      this.unapply(u, true);
      return ok;
    });
  }

  _all(legal) {
    const out = [];
    for (let r = 0; r < 8; r++)
      for (let f = 0; f < 8; f++) {
        const i = r * 16 + f;
        if (this.b[i] && (this.b[i] & 8) === this.t)
          for (const m of (legal ? this.moves(i) : this.pseudo(i))) out.push(m);
      }
    return out;
  }

  move(from, to, promo) {
    const m = this.moves(from).find(x => x[1] === to && (!promo || x[2] === promo));
    if (!m) return false;
    this.apply(m); return true;
  }
  undo() { if (this.hist.length) this.unapply(this.hist[this.hist.length - 1]); }
  isCheck() { return this.atk(this.king(this.t), this.t ^ 8); }

  hasLegal() {
    const me = this.t, opp = me ^ 8;
    for (let r = 0; r < 8; r++)
      for (let f = 0; f < 8; f++) {
        const i = r * 16 + f;
        if (this.b[i] && (this.b[i] & 8) === me)
          for (const m of this.pseudo(i)) {
            const u = this.apply(m, true);
            const ok = !this.atk(this.king(me), opp);
            this.unapply(u, true);
            if (ok) return true;
          }
      }
    return false;
  }

  bareKing() {
    const me = this.t, opp = me ^ 8;
    let myNon = 0, oppNon = 0, oppSq = -1;
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const p = this.b[r*16+f];
      if (!p || (p & 7) === 6) continue;
      if ((p & 8) === me) myNon++;
      else { oppNon++; oppSq = r*16+f; }
    }
    if (myNon > 0) return null;
    if (oppNon === 0) return "draw";
    if (oppNon === 1) {
      for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
        const i = r*16+f;
        if (this.b[i] && (this.b[i] & 8) === me) {
          for (const m of this.pseudo(i)) {
            if (m[1] === oppSq) {
              const u = this.apply(m, true);
              const ok = !this.atk(this.king(me), opp);
              this.unapply(u, true);
              if (ok) return "draw";
            }
          }
        }
      }
    }
    return "bareWin";
  }

  threefold() {
    const cur = this.pos[this.pos.length - 1];
    let c = 0; for (const p of this.pos) if (p === cur) c++;
    return c >= 3;
  }

  status() {
    const checked = this.isCheck();
    if (!this.hasLegal()) return checked ? "checkmate" : "stalemateWin";
    const bare = this.bareKing();
    if (bare === "bareWin") return "bareWin";
    if (bare === "draw") return "drawBare";
    if (this.h >= 100) return "draw50";
    if (this.threefold()) return "draw3fold";
    return checked ? "check" : "ok";
  }
}

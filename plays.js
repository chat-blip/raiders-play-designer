/* Raiders Game 3 seed playbook — formations + 29 plays */
(function (global) {
  const CX = 600;
  const LOS = 338;
  const GAP = 46;

  function uid(prefix) {
    return prefix + "-" + Math.random().toString(36).slice(2, 9);
  }

  function P(id, label, side, x, y, fill) {
    return { id, label, side, x, y, fill: fill || "white" };
  }

  function resolveDefName(name) {
    if (name === "6-2 Base" || name === "6-2 Bear") return "6-2";
    return name;
  }

  function markDefenseLabels(players, teSide) {
    const strong = (players || []).find(function (p) {
      return p && p.id === "dS";
    });
    const strongRight = strong ? strong.x >= CX : teSide !== "left";
    (players || []).forEach(function (p) {
      if (!p) return;
      if (p.id === "dCB1" || p.id === "dCB2") {
        p.label = (p.x >= CX) === strongRight ? "SC" : "WC";
      } else if (p.id === "dDE1" || p.id === "dDE2") {
        p.label = (p.x >= CX) === strongRight ? "SDE" : "WDE";
      } else if (p.id === "dW") {
        p.label = "WLB";
      } else if (p.id === "dS") {
        p.label = "SLB";
      } else if (p.id === "dM1" || p.id === "dM2") {
        p.label = "MLB";
      }
    });
    return players;
  }

  function defensePlayers(name, teSide) {
    const s = teSide === "left" ? -1 : 1;
    const dl = LOS - 54;
    const lb = LOS - 120;
    const layouts = {
      "4-4 Base": [
        P("dDE1", "DE", "def", CX - 128, LOS - 58),
        P("dDT1", "DT", "def", CX - 42, LOS - 52),
        P("dDT2", "DT", "def", CX + 42, LOS - 52),
        P("dDE2", "DE", "def", CX + 128, LOS - 58),
        P("dW", "W", "def", CX - 175 * s, lb),
        P("dM1", "M", "def", CX - 70, LOS - 122),
        P("dM2", "M", "def", CX + 70, LOS - 122),
        P("dS", "S", "def", CX + 175 * s, lb),
        P("dCB1", "CB", "def", 168, LOS - 70),
        P("dCB2", "CB", "def", 1032, LOS - 70),
        P("dFS", "FS", "def", CX, LOS - 210),
      ],
      "5-3 Base": [
        P("dDE1", "DE", "def", CX - 150, dl),
        P("dDT1", "DT", "def", CX - 74, dl),
        P("dNT", "NT", "def", CX, dl),
        P("dDT2", "DT", "def", CX + 74, dl),
        P("dDE2", "DE", "def", CX + 150, dl),
        P("dW", "W", "def", CX - 145, lb),
        P("dM1", "M", "def", CX, lb - 4),
        P("dS", "S", "def", CX + 145, lb),
        P("dCB1", "CB", "def", 168, LOS - 70),
        P("dCB2", "CB", "def", 1032, LOS - 70),
        P("dFS", "FS", "def", CX, LOS - 210),
      ],
      "5-3 Bear": [
        P("dDE1", "DE", "def", CX - 112, dl + 2),
        P("dDT1", "DT", "def", CX - GAP, dl + 2),
        P("dNT", "NT", "def", CX, dl + 2),
        P("dDT2", "DT", "def", CX + GAP, dl + 2),
        P("dDE2", "DE", "def", CX + 112, dl + 2),
        P("dW", "W", "def", CX - 88, lb - 6),
        P("dM1", "M", "def", CX, lb - 8),
        P("dS", "S", "def", CX + 88, lb - 6),
        P("dCB1", "CB", "def", 210, LOS - 72),
        P("dCB2", "CB", "def", 990, LOS - 72),
        P("dFS", "FS", "def", CX, LOS - 205),
      ],
      "6-2": [
        P("dDE1", "DE", "def", 426, dl),
        P("dDT1", "DT", "def", 506, dl),
        P("dNT", "NT", "def", CX - 24 * s, dl),
        P("dM1", "MLB", "def", CX + 36 * s, dl),
        P("dDT2", "DT", "def", 698, dl),
        P("dDE2", "DE", "def", 762, dl),
        P("dW", "W", "def", CX - 101 * s, lb),
        P("dS", "S", "def", CX + 101 * s, lb),
        P("dCB1", "CB", "def", 168, LOS - 70),
        P("dCB2", "CB", "def", 1032, LOS - 70),
        P("dFS", "FS", "def", CX, LOS - 210),
      ],
    };
    const key = resolveDefName(name);
    return markDefenseLabels(layouts[key] || layouts["4-4 Base"], teSide);
  }

  const DEF_FORMATIONS = ["4-4 Base", "5-3 Base", "5-3 Bear", "6-2"];

  function oLine(teSide) {
    const line = [
      P("LT", "LT", "off", CX - 2 * GAP, LOS),
      P("LG", "LG", "off", CX - GAP, LOS),
      P("C", "C", "off", CX, LOS),
      P("RG", "RG", "off", CX + GAP, LOS),
      P("RT", "RT", "off", CX + 2 * GAP, LOS),
    ];
    const yx = teSide === "right" ? CX + 2 * GAP + 50 : CX - 2 * GAP - 50;
    line.push(P("Y", "Y", "off", yx, LOS));
    return line;
  }

  function backs(kind, teSide) {
    if (kind === "pistol") {
      return [
        P("QB", "QB", "off", CX, LOS + 52),
        P("B", "B", "off", CX, LOS + 108),
        P("A", "A", "off", CX, LOS + 168),
      ];
    }
    if (kind === "split") {
      const s = teSide === "left" ? -1 : 1;
      return [
        P("QB", "QB", "off", CX, LOS + 48),
        P("B", "B", "off", CX - 58 * s, LOS + 128),
        P("A", "A", "off", CX + 58 * s, LOS + 128),
      ];
    }
    return [
      P("QB", "QB", "off", CX, LOS + 48),
      P("B", "B", "off", CX, LOS + 108),
      P("A", "A", "off", CX, LOS + 172),
    ];
  }

  function receivers(style, teSide) {
    if (style === "twins") {
      if (teSide === "right") {
        return [P("X", "X", "off", 150, LOS + 8), P("Z", "Z", "off", 230, LOS + 8)];
      }
      return [P("X", "X", "off", 1050, LOS + 8), P("Z", "Z", "off", 970, LOS + 8)];
    }
    if (teSide === "right") {
      return [P("X", "X", "off", 155, LOS + 14), P("Z", "Z", "off", 1045, LOS + 14)];
    }
    return [P("Z", "Z", "off", 155, LOS + 14), P("X", "X", "off", 1045, LOS + 14)];
  }

  const FORMATIONS = {
    "I Right": { family: "I-formation", te: "right", backs: "under", rec: "split" },
    "I Left": { family: "I-formation", te: "left", backs: "under", rec: "split" },
    "Split Right": { family: "Split formation", te: "right", backs: "split", rec: "split" },
    "Split Left": { family: "Split formation", te: "left", backs: "split", rec: "split" },
    "Batman Right": { family: "Batman formation", te: "right", backs: "batman" },
    "Batman Left": { family: "Batman formation", te: "left", backs: "batman" },
    "QIP I Right": { family: "QIP formation", te: "right", backs: "pistol", rec: "twins" },
    "QIP I Left": { family: "QIP formation", te: "left", backs: "pistol", rec: "twins" },
    "ZIP I Right": { family: "ZIP formation", te: "right", backs: "under", rec: "split" },
    "ZIP I Left": { family: "ZIP formation", te: "left", backs: "under", rec: "split" },
    "Maryland Right": { family: "Maryland formation", te: "right", backs: "maryland" },
    "Maryland Left": { family: "Maryland formation", te: "left", backs: "maryland" },
    "Tight Right": { family: "Tight formation", te: "right", backs: "tight" },
    "Tight Left": { family: "Tight formation", te: "left", backs: "tight" },
  };

  function batmanOffense(teSide) {
    function mx(x) {
      return teSide === "right" ? x : 2 * CX - x;
    }
    return [
      P("LT", "LT", "off", 508, 338),
      P("LG", "LG", "off", 554, 338),
      P("C", "C", "off", 600, 338),
      P("RG", "RG", "off", 646, 338),
      P("RT", "RT", "off", 692, 338),
      P("Y", "Y", "off", mx(742), 338),
      P("QB", "QB", "off", 600, 386),
      P("B", "B", "off", 600, 446),
      P("A", "A", "off", 600, 510),
      P("X", "X", "off", mx(459), 336),
      P("Z", "Z", "off", mx(785), 376),
    ];
  }

  function marylandOffense(teSide) {
    function mx(x) {
      return teSide === "right" ? x : 2 * CX - x;
    }
    return [
      P("LT", "LT", "off", 508, 338),
      P("LG", "LG", "off", 554, 338),
      P("C", "C", "off", 600, 338),
      P("RG", "RG", "off", 646, 338),
      P("RT", "RT", "off", 692, 338),
      P("Y", "Y", "off", mx(742), 338),
      P("QB", "QB", "off", 600, 386),
      P("B", "B", "off", mx(598), 438),
      P("A", "A", "off", mx(598), 486),
      P("X", "X", "off", mx(163), 340),
      P("Z", "Z", "off", mx(597), 536),
    ];
  }

  function tightOffense(teSide) {
    function mx(x) {
      return teSide === "right" ? x : 2 * CX - x;
    }
    return [
      P("LT", "LT", "off", 508, 338),
      P("LG", "LG", "off", 554, 338),
      P("C", "C", "off", 600, 338),
      P("RG", "RG", "off", 646, 338),
      P("RT", "RT", "off", 692, 338),
      P("Y", "Y", "off", mx(750), 342),
      P("QB", "QB", "off", 600, 386),
      P("B", "B", "off", mx(640), 378),
      P("A", "A", "off", mx(556), 378),
      P("X", "X", "off", mx(167), 340),
      P("Z", "Z", "off", mx(1025), 384),
    ];
  }

  function pinOLine(players) {
    const spots = {
      LT: { x: CX - 2 * GAP, y: LOS, label: "LT" },
      LG: { x: CX - GAP, y: LOS, label: "LG" },
      C: { x: CX, y: LOS, label: "C" },
      RG: { x: CX + GAP, y: LOS, label: "RG" },
      RT: { x: CX + 2 * GAP, y: LOS, label: "RT" },
    };
    (players || []).forEach(function (p) {
      if (!p || p.side !== "off") return;
      const s = spots[p.id] || spots[p.label];
      if (!s) return;
      p.x = s.x;
      p.y = s.y;
      p.label = s.label;
    });
    return players;
  }

  function isOLine(p) {
    if (!p) return false;
    return p.id === "LT" || p.id === "LG" || p.id === "C" || p.id === "RG" || p.id === "RT" ||
      p.label === "LT" || p.label === "LG" || p.label === "C" || p.label === "RG" || p.label === "RT";
  }

  function formationPlayers(name, defName) {
    const f = FORMATIONS[name] || FORMATIONS["I Right"];
    let players;
    if (f.backs === "batman") {
      players = batmanOffense(f.te).concat(defensePlayers(defName || "4-4 Base", f.te));
    } else if (f.backs === "maryland") {
      players = marylandOffense(f.te).concat(defensePlayers(defName || "4-4 Base", f.te));
    } else if (f.backs === "tight") {
      players = tightOffense(f.te).concat(defensePlayers(defName || "4-4 Base", f.te));
    } else {
      players = [
        ...oLine(f.te),
        ...backs(f.backs, f.te),
        ...receivers(f.rec, f.te),
        ...defensePlayers(defName || "4-4 Base", f.te),
      ];
    }
    return pinOLine(players);
  }

  function findP(players, id) {
    return players.find((p) => p.id === id);
  }

  function assign(players, from, type, offsets, extra) {
    const p = findP(players, from);
    if (!p) return null;
    const points = [{ x: p.x, y: p.y }].concat(
      offsets.map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy }))
    );
    return Object.assign({ id: uid("a"), from, type, points, smooth: type === "ball" || type === "motion" }, extra || {});
  }

  function olReach(players, flow) {
    const f = flow;
    return [
      assign(players, "LT", "block", [[-18 + (f < 0 ? -12 : 8), -62]]),
      assign(players, "LG", "block", [[-8 + f * 6, -60]]),
      assign(players, "C", "block", [[f * 10, -58]]),
      assign(players, "RG", "block", [[8 + f * 6, -60]]),
      assign(players, "RT", "block", [[18 + (f > 0 ? 12 : -8), -62]]),
      assign(players, "Y", "block", [[f * 22, -64]]),
    ].filter(Boolean);
  }

  function wrStalk(players) {
    return [
      assign(players, "X", "block", [[6, -42], [2, -68]]),
      assign(players, "Z", "block", [[-6, -42], [-2, -68]]),
    ].filter(Boolean);
  }

  function paint(players, id, fill) {
    const p = findP(players, id);
    if (p) p.fill = fill;
  }

  function makePlay(spec) {
    const f = FORMATIONS[spec.formation] || FORMATIONS["I Right"];
    const players = formationPlayers(spec.formation, spec.defense || "4-4 Base");
    if (spec.ball) paint(players, spec.ball, "red");
    if (spec.primary) paint(players, spec.primary, "gold");
    const assignments = [];
    (spec.assigns || []).forEach((row) => {
      const a = assign(players, row[0], row[1], row[2], row[3]);
      if (a) assignments.push(a);
    });
    if (spec.ol !== false) olReach(players, spec.flow || -1).forEach((a) => assignments.push(a));
    if (spec.wr !== false) wrStalk(players).forEach((a) => assignments.push(a));
    return {
      id: spec.id,
      number: spec.number,
      formation: spec.formation,
      family: f.family,
      defense: spec.defense || "4-4 Base",
      name: spec.name,
      type: spec.type,
      star: !!spec.star,
      notes: spec.notes || "",
      players,
      assignments,
    };
  }

  function belly(flow) {
    const s = flow;
    return [
      ["A", "motion", [[s * -95, -8], [s * -108, -52]]],
      ["QB", "ball", [[s * -18, -28], [s * -70, -118], [s * -155, -228]]],
      ["B", "block", [[s * 12, -36]]],
    ];
  }

  function dive(flow) {
    const s = flow;
    return [
      ["A", "ball", [[s * 8, -40], [s * 18, -110], [s * 70, -210]]],
      ["B", "route", [[s * -70, -8], [s * -210, -18]]],
      ["QB", "block", [[s * 6, 18], [s * 10, 36]]],
    ];
  }

  function motionDive(flow) {
    const s = flow;
    return [
      ["A", "motion", [[s * 110, -6], [s * 210, -10]]],
      ["B", "ball", [[s * 10, -50], [s * 22, -130], [s * 80, -215]]],
      ["QB", "block", [[0, 16]]],
    ];
  }

  function power(flow) {
    const s = flow;
    const puller = s > 0 ? "LG" : "RG";
    return {
      skipOl: false,
      extra: [
        ["A", "ball", [[s * 20, -35], [s * 55, -95], [s * 110, -200]]],
        ["B", "block", [[s * 70, -40], [s * 120, -70]]],
        ["QB", "block", [[s * -12, 10]]],
        [puller, "route", [[s * 40, 8], [s * 110, -20], [s * 145, -55]]],
      ],
    };
  }

  function sweep(flow) {
    const s = flow;
    return [
      ["A", "ball", [[s * 40, -8], [s * 140, -30], [s * 220, -90], [s * 250, -200]]],
      ["B", "block", [[s * 90, -20], [s * 160, -50]]],
      ["QB", "route", [[s * 30, 8], [s * 70, 4]]],
    ];
  }

  function qipSweep(flow) {
    const s = flow;
    return [
      ["B", "ball", [[s * -50, -10], [s * -160, -40], [s * -240, -150], [s * -270, -250]]],
      ["A", "block", [[s * -80, -30], [s * -150, -80]]],
      ["QB", "motion", [[s * 90, 0], [s * 150, -8]]],
      ["Y", "block", [[s * -30, -55]]],
    ];
  }

  function yOut(flow) {
    const s = flow;
    return [
      ["Y", "route", [[s * 8, -8], [s * 12, -55], [s * 95, -55]], { smooth: false }],
      ["QB", "block", [[s * -20, 8]]],
      ["B", "block", [[s * -8, 6]]],
      ["A", "route", [[s * -40, 4]]],
      ["X", "route", [[0, -90], [8, -150]], { smooth: false }],
      ["Z", "route", [[0, -40], [s * -20, -48]], { smooth: false }],
    ];
  }

  function qCorner(flow) {
    const s = flow;
    return [
      ["Y", "route", [[10, -8], [14, -58], [110, -58]], { smooth: false }],
      ["A", "ball", [[s * 90, -40], [s * 150, -70], [s * 155, -130], [s * 200, -210]], { smooth: false }],
      ["X", "route", [[8, -80], [4, -160]], { smooth: false }],
      ["Z", "route", [[40, -20], [70, -55]], { smooth: false }],
      ["QB", "motion", [[s * 70, 0], [s * 130, -6]]],
      ["B", "block", [[0, 8]]],
    ];
  }

  function qbSweep(flow) {
    const s = flow;
    return [
      ["QB", "ball", [[s * -40, 6], [s * -140, -10], [s * -230, -80], [s * -250, -200]]],
      ["B", "block", [[s * -70, -15]]],
      ["A", "block", [[s * 20, -10]]],
    ];
  }

  function xReverse(flow) {
    const s = flow;
    return [
      ["X", "ball", [[s * 80, 40], [s * 220, 70], [s * 360, 50], [s * 430, -40], [s * 450, -180]]],
      ["Z", "motion", [[s * -180, 8], [s * -280, 12]]],
      ["B", "route", [[s * 80, -8], [s * 180, -20]]],
      ["A", "block", [[s * 10, 8]]],
      ["QB", "block", [[s * 8, 16]]],
    ];
  }

  function zSweep(flow) {
    const s = flow;
    return [
      ["Z", "ball", [[s * -60, 20], [s * -180, 40], [s * -280, 10], [s * -320, -120]]],
      ["A", "block", [[s * -40, -10]]],
      ["B", "block", [[s * 30, -20]]],
    ];
  }

  function doubleHook(flow) {
    const s = flow;
    return [
      ["Y", "route", [[s * 6, -70], [s * 4, -95], [s * -40, -95]], { smooth: false }],
      ["Z", "route", [[0, -80], [s * 8, -110], [s * -36, -110]], { smooth: false }],
      ["X", "route", [[s * 10, -90], [s * 6, -150]], { smooth: false }],
      ["A", "motion", [[s * 120, -6], [s * 200, -12]]],
      ["QB", "block", [[0, 10]]],
    ];
  }

  function flood(flow) {
    const s = flow;
    return [
      ["Y", "route", [[s * 20, -40], [s * 90, -70]], { smooth: false }],
      ["Z", "route", [[s * 10, -100], [s * 40, -160]], { smooth: false }],
      ["X", "route", [[s * 8, -50], [s * 70, -55]], { smooth: false }],
      ["A", "motion", [[s * 100, 0], [s * 180, -8]]],
      ["B", "route", [[s * 40, 10], [s * 90, 20]]],
      ["QB", "block", [[s * 20, 8]]],
    ];
  }

  const SPECS = [
    { number: "01", formation: "I Right", name: "A-Motion QB Belly Left", type: "run", star: true, flow: -1, ball: "QB", assigns: belly(-1) },
    { number: "02", formation: "I Left", name: "A-Motion QB Belly Right", type: "run", flow: 1, ball: "QB", assigns: belly(1) },
    { number: "03", formation: "I Left", name: "A Dive Left", type: "run", flow: -1, ball: "A", assigns: dive(-1) },
    { number: "04", formation: "I Right", name: "A Dive Right", type: "run", flow: 1, ball: "A", assigns: dive(1) },
    { number: "05", formation: "I Right", name: "A Dive Left", type: "run", flow: -1, ball: "A", assigns: dive(-1) },
    { number: "06", formation: "I Left", name: "A Dive Right", type: "run", flow: 1, ball: "A", assigns: dive(1) },
    { number: "07", formation: "I Left", name: "A Motion B Dive Left", type: "run", star: true, flow: -1, ball: "B", assigns: motionDive(-1) },
    { number: "08", formation: "I Right", name: "A Motion B Dive Right", type: "run", flow: 1, ball: "B", assigns: motionDive(1) },
    { number: "09", formation: "I Left", name: "Power Left", type: "run", flow: -1, ball: "A", assigns: power(-1).extra },
    { number: "10", formation: "I Right", name: "Power Right", type: "run", star: true, flow: 1, ball: "A", assigns: power(1).extra },
    { number: "11", formation: "I Left", name: "Sweep Left", type: "run", star: true, flow: -1, ball: "A", assigns: sweep(-1) },
    { number: "12", formation: "I Right", name: "Sweep Right", type: "run", flow: 1, ball: "A", assigns: sweep(1) },
    { number: "13", formation: "QIP I Right", name: "Direct B Sweep Left", type: "run", star: true, flow: -1, ball: "B", wr: false, assigns: qipSweep(-1) },
    { number: "14", formation: "QIP I Left", name: "Direct B Sweep Right", type: "run", star: true, flow: 1, ball: "B", wr: false, assigns: qipSweep(1) },
    { number: "15", formation: "QIP I Right", name: "Direct B Sweep Left", type: "run", star: true, flow: -1, ball: "B", wr: false, assigns: qipSweep(-1) },
    { number: "16", formation: "QIP I Left", name: "Direct B Sweep Right", type: "run", star: true, flow: 1, ball: "B", wr: false, assigns: qipSweep(1) },
  ];

  function buildSeedPlaybook() {
    const rest = [
      { number: "18", formation: "ZIP I Right", name: "QB Sweep Left", type: "run", flow: -1, ball: "QB", assigns: qbSweep(-1) },
      { number: "19", formation: "ZIP I Left", name: "QB Sweep Right", type: "run", flow: 1, ball: "QB", assigns: qbSweep(1) },
      { number: "20", formation: "ZIP I Left", name: "X-Reverse Left", type: "run", flow: -1, ball: "X", primary: "A", wr: false, assigns: xReverse(-1) },
      { number: "21", formation: "ZIP I Right", name: "X-Reverse Right", type: "run", flow: 1, ball: "X", primary: "A", wr: false, assigns: xReverse(1) },
      { number: "22", formation: "ZIP I Right", name: "Z-Sweep Left", type: "run", flow: -1, ball: "Z", wr: false, assigns: zSweep(-1) },
      { number: "23", formation: "ZIP I Left", name: "Z-Sweep Right", type: "run", star: true, flow: 1, ball: "Z", wr: false, assigns: zSweep(1) },
      { number: "24", formation: "ZIP I Left", name: "Y Out", type: "pass", star: true, flow: -1, ball: "QB", primary: "Y", wr: false, assigns: yOut(-1) },
      { number: "25", formation: "ZIP I Right", name: "Y Out", type: "pass", flow: 1, ball: "QB", primary: "Y", wr: false, assigns: yOut(1) },
      { number: "26", formation: "I Left", name: "A Motion Double Hook", type: "pass", flow: 1, ball: "QB", primary: "Y", wr: false, assigns: doubleHook(1) },
      { number: "27", formation: "I Right", name: "A Motion Double Hook", type: "pass", flow: -1, ball: "QB", primary: "Y", wr: false, assigns: doubleHook(-1) },
      { number: "28", formation: "I Left", name: "A Motion Flood Right", type: "pass", flow: 1, ball: "QB", primary: "Y", wr: false, assigns: flood(1) },
      { number: "29", formation: "I Right", name: "A Motion Flood Left", type: "pass", flow: -1, ball: "QB", primary: "Y", wr: false, assigns: flood(-1) },
    ];

    const q17 = {
      number: "17",
      formation: "QIP I Right",
      name: "QCorner Y Out",
      type: "pass",
      flow: 1,
      ball: "B",
      primary: "Y",
      ol: true,
      wr: false,
      assigns: qCorner(1),
    };

    const all = SPECS.filter((s) => s.number !== "17").concat([q17], rest);
    return {
      title: "Raiders · 4th Grade",
      subtitle: "Game 3 · Sat Sept 12",
      school: "St. Regis Catholic School",
      plays: all.map((spec) => {
        const play = makePlay(spec);
        play.id = "play-" + spec.number;
        return play;
      }),
    };
  }

  function blankPlay(formation, number, name, type, defense) {
    const f = FORMATIONS[formation] || FORMATIONS["I Right"];
    const def = defense || "4-4 Base";
    return {
      id: uid("play"),
      number: number || "30",
      formation: formation,
      family: f.family,
      defense: def,
      name: name || "New Play",
      type: type || "run",
      star: false,
      notes: "",
      createdAt: Date.now(),
      players: formationPlayers(formation, def),
      assignments: [],
    };
  }

  function flipPlay(play) {
    const copy = JSON.parse(JSON.stringify(play));
    copy.id = uid("play");
    copy.formation = copy.formation.replace("Right", "¤").replace("Left", "Right").replace("¤", "Left");
    copy.name = copy.name.replace(/Left/g, "¤").replace(/Right/g, "Left").replace(/¤/g, "Right");
    copy.players.forEach((p) => {
      if (p.side === "off" && isOLine(p)) return;
      p.x = 2 * CX - p.x;
    });
    copy.assignments.forEach((a) => {
      if (a.from === "LT" || a.from === "LG" || a.from === "C" || a.from === "RG" || a.from === "RT") return;
      a.points.forEach((pt) => {
        pt.x = 2 * CX - pt.x;
      });
    });
    pinOLine(copy.players);
    return copy;
  }

  global.RaidersPlays = {
    CX,
    LOS,
    FORMATIONS,
    DEF_FORMATIONS,
    resolveDefName,
    formationPlayers,
    defensePlayers,
    buildSeedPlaybook,
    blankPlay,
    flipPlay,
    uid,
  };
})(window);

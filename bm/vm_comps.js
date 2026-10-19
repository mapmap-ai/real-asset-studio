// 밸류맵(www.valueupmap.com) 화면 위에 '실거래 비교사례' 패널을 얹는다. 북마클릿(또는 F12 콘솔)으로 실행.
// 로그인한 사용자 브라우저 안에서 밸류맵이 화면에 쓰는 주소를 그대로 부른다(같은 출처라 CORS·쿠키 문제 없음).
//   주소검색 /api/properties/addresses · 마커 /api/lots/markers(zoomLevel=20 = 필지별 최신 거래 1건)
//   법정동 경계 /api/properties/cadastrals/districts/polygons · 상세 /properties/trades/{pnu}(SSR, histories 포함)
// 수집 원리·자동 판정은 valuemap-helper 스킬(collect.js·collect_radius.js·build_xlsx.py)과 같다.
(function () {
  if (!/(^|\.)valueupmap\.com$/.test(location.hostname)) {
    if (confirm("밸류맵(www.valueupmap.com) 화면에서 눌러야 합니다. 밸류맵을 열까요?")) location.href = "https://www.valueupmap.com/";
    return;
  }
  if (window.__VM_COMPS) { window.__VM_COMPS.show(); return; }

  var KEY = "vmCompsLast", M2P = 0.3025;
  var V = window.__VM_COMPS = { stop: false, data: null, rows: [] };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var fmt = function (v, d) { return v == null || v === "" || isNaN(v) ? "" : Number(v).toLocaleString("ko-KR", { maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 }); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var getJSON = async function (u) {
    for (var i = 0; i < 3; i++) { var r = await fetch(u); if (r.ok) return r.json(); await sleep(800); }
    throw new Error("조회 실패: " + u.split("?")[0]);
  };
  var TYPES = [["BUILDING", "상업업무"], ["HOUSING", "단독/다가구"]];
  var EXCL = {
    BUILDING: "단독,다가구,다세대,연립,아파트",
    HOUSING: "근린,토지,다세대,연립,아파트,상가,공장,창고"
  };
  var ZONES = [["", "대상지와 같게"], ["C14", "2종일주"], ["C15", "3종일주"], ["C22", "일반상업"]];
  var thisYear = new Date().getFullYear();

  // ── 패널
  var css = document.createElement("style");
  css.textContent = "#vmc{position:fixed;right:16px;bottom:16px;z-index:2147483000;width:640px;max-width:calc(100vw - 32px);max-height:80vh;display:flex;flex-direction:column;background:#fff;color:#1d2433;border:1px solid #d0d5dd;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.25);font:13px/1.45 'Malgun Gothic',sans-serif}" +
    "#vmc *{box-sizing:border-box;font-family:inherit}#vmc .hd{display:flex;align-items:center;gap:8px;padding:8px 10px;background:#0f766e;color:#fff;border-radius:10px 10px 0 0;cursor:move;user-select:none}" +
    "#vmc .hd b{flex:1;font-size:14px}#vmc .hd button{background:none;border:none;color:#fff;font-size:16px;cursor:pointer;padding:0 4px}" +
    "#vmc .bd{padding:8px 10px;display:flex;flex-direction:column;gap:7px;overflow:auto}" +
    "#vmc .f{display:flex;gap:8px;flex-wrap:wrap;align-items:center}#vmc label{display:inline-flex;align-items:center;gap:4px}" +
    "#vmc input[type=text],#vmc input[type=number],#vmc select{border:1px solid #d0d5dd;border-radius:6px;padding:4px 6px;font-size:12.5px}" +
    "#vmc input.addr{flex:1;min-width:180px}#vmc input.yr{width:64px}#vmc input.km{width:52px}#vmc input.ex{width:250px}" +
    "#vmc .row{display:flex;gap:5px;flex-wrap:wrap}#vmc .row button{padding:5px 10px;border:1px solid #d0d5dd;background:#fff;border-radius:6px;cursor:pointer;font-size:12.5px}" +
    "#vmc .row button.pri{background:#0f766e;border-color:#0f766e;color:#fff;font-weight:700}#vmc .row button:disabled{opacity:.45;cursor:default}" +
    "#vmc .msg{min-height:16px;font-size:12px;color:#b45309;white-space:pre-line}#vmc .sum{font-size:12.5px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:6px;padding:6px 8px}" +
    "#vmc table{border-collapse:collapse;width:100%;font-size:12px}#vmc th,#vmc td{border-bottom:1px solid #eaecf0;padding:4px 5px;text-align:left;white-space:nowrap}" +
    "#vmc th{background:#f6f7f9;position:sticky;top:0}#vmc td.n,#vmc th.n{text-align:right}#vmc tr.subj td{background:#fff7d6}#vmc tr.out td{color:#98a2b3}" +
    "#vmc td.note{white-space:normal;min-width:300px;font-size:11.5px;color:#b45309}#vmc a{color:#0f766e}#vmc .tw{overflow:auto;max-height:38vh;border:1px solid #eaecf0;border-radius:6px}" +
    "#vmc.min .bd{display:none}#vmc .hint{font-size:11.5px;color:#667085}";
  document.head.appendChild(css);

  var P = document.createElement("div");
  P.id = "vmc";
  P.innerHTML = '<div class="hd"><b>밸류맵 실거래 비교사례</b><button data-a="min" title="접기">–</button><button data-a="close" title="닫기">×</button></div>' +
    '<div class="bd">' +
    '<div class="f"><input class="addr" type="text" placeholder="대상 지번 (예: 도곡동 903-9)">' +
    '<label>기간 <input class="yr" type="number" data-k="y1" value="' + (thisYear - 5) + '">~<input class="yr" type="number" data-k="y2" value="' + thisYear + '"></label></div>' +
    '<div class="f"><label><input type="radio" name="vmcsc" value="dong" checked>같은 법정동</label>' +
    '<label><input type="radio" name="vmcsc" value="radius">반경 <input class="km" type="number" step="0.5" min="0.5" value="1">km</label>' +
    '<label>유형 <select data-k="pt">' + TYPES.map(function (t) { return '<option value="' + t[0] + '">' + t[1] + '</option>'; }).join("") + '</select></label>' +
    '<label>용도지역 <select data-k="zn">' + ZONES.map(function (z) { return '<option value="' + z[0] + '">' + z[1] + '</option>'; }).join("") + '</select></label></div>' +
    '<div class="f"><label title="거래 당시 유형이 이 목록에 있으면 비교사례에서 뺍니다">제외 유형 <input class="ex" type="text"></label></div>' +
    '<div class="row"><button class="pri" data-a="run">수집 시작</button><button data-a="stop" disabled>멈춤</button>' +
    '<button data-a="copy" disabled>표 복사</button><button data-a="csv" disabled>엑셀(CSV) 저장</button>' +
    '<button data-a="map" disabled>지도 열기</button><button data-a="maps" disabled>지도 HTML 저장</button><button data-a="json" disabled>원본 JSON</button></div>' +
    '<div class="msg"></div><div class="sum" hidden></div><div class="tw" hidden></div>' +
    '<div class="hint">숫자는 밸류맵 상세페이지 값입니다. 지번을 누르면 그 상세페이지(근거 화면)가 새 탭으로 열립니다. 체크를 풀면 요약에서 빠집니다.</div>' +
    '</div>';
  document.body.appendChild(P);
  var $ = function (s) { return P.querySelector(s); };
  var msg = function (t) { $(".msg").textContent = t || ""; };
  $(".ex").value = EXCL.BUILDING;
  $('[data-k="pt"]').onchange = function () { $(".ex").value = EXCL[this.value] || ""; };
  V.show = function () { P.style.display = "flex"; P.classList.remove("min"); };

  // 끌어서 옮기기
  (function () {
    var hd = $(".hd"), sx, sy, ox, oy;
    hd.addEventListener("mousedown", function (e) {
      if (e.target.tagName === "BUTTON") return;
      var r = P.getBoundingClientRect(); sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      var mv = function (ev) { P.style.left = (ox + ev.clientX - sx) + "px"; P.style.top = (oy + ev.clientY - sy) + "px"; P.style.right = "auto"; P.style.bottom = "auto"; };
      var up = function () { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); };
      document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
    });
  })();

  // ── 상세페이지(SSR) 파싱: Next.js flight 데이터에 이스케이프된 JSON 으로 들어 있다
  async function parseDetail(pnu) {
    var h = null;
    for (var i = 0; i < 3 && !h; i++) {
      try { var r = await fetch("/properties/trades/" + pnu); if (r.ok) h = await r.text(); } catch (e) {}
      if (!h) await sleep(1000);
    }
    if (!h) return { pnu: pnu, ok: false, histories: [] };
    var t = h.replace(/\\"/g, '"');
    var g = function (re) { var m = t.match(re); return m ? m[1] : null; };
    var J = function (s) { try { return JSON.parse(s); } catch (e) { return null; } };
    var hist = J(g(/"histories":(\{"count".*?"hasNext":(?:true|false)\})/));
    var summ = J(g(/"summaryAttributes":(\[.*?\]),"annexedLands"/));
    var zone = t.match(/"useDistrict":\{"code":"([^"]*)","label":"([^"]*)"/);
    var ptype = t.match(/"trade":\{"trade":\{"id":\d+,"propertyType":\{"code":"([^"]*)","label":"([^"]*)"/);
    var lands = J(g(/"lands":(\[[^\]]*\])/));
    var attr = {};
    (summ || []).forEach(function (a) { attr[a.title] = a.content.description || a.content.squareMeter; });
    return {
      pnu: pnu, address: g(/"address":"([^"]*)","shortAddress"/), roadAddress: g(/"roadAddress":"([^"]*)"/),
      zoneCode: zone ? zone[1] : null, zoneLabel: zone ? zone[2] : null,
      propertyTypeCode: ptype ? ptype[1] : null, propertyTypeLabel: ptype ? ptype[2] : null,
      approvalDate: attr["사용승인일"] || null, lands: (lands || []).map(function (l) { return l.address; }),
      histories: hist ? hist.contents : [], historiesHasNext: hist ? hist.hasNext : null, ok: !!summ
    };
  }

  // ── 수집
  async function collect(cfg) {
    var me = await fetch("/api/accounts/users/me");
    if (!me.ok) throw new Error("밸류맵에 로그인한 뒤 다시 눌러 주세요. (오른쪽 위 MY → 로그인)");
    var ad = await getJSON("/api/properties/addresses?keyword=" + encodeURIComponent(cfg.address));
    if (!ad.addresses || !ad.addresses.length) throw new Error("지번을 찾지 못했습니다: " + cfg.address);
    var S = ad.addresses[0], lat0 = S.latitude, lng0 = S.longitude, subjectPnu = S.pnu;
    msg("대상지 확인 중… " + S.address);
    var subject = await parseDetail(subjectPnu);
    Object.assign(subject, { lat: lat0, lng: lng0, distKm: 0 });
    var zoneCode = cfg.useDistricts || subject.zoneCode;
    var districtCode = subjectPnu.slice(0, 10);
    var dist = function (la, lo) {
      var r = Math.PI / 180, dLa = (la - lat0) * r, dLo = (lo - lng0) * r;
      var a = Math.pow(Math.sin(dLa / 2), 2) + Math.cos(lat0 * r) * Math.cos(la * r) * Math.pow(Math.sin(dLo / 2), 2);
      return 2 * 6371.0088 * Math.asin(Math.sqrt(a));
    };
    var bbox;
    if (cfg.radiusKm) {
      var dLat = cfg.radiusKm / 111.2 + 0.002, dLng = cfg.radiusKm / (111.32 * Math.cos(lat0 * Math.PI / 180)) + 0.002;
      bbox = [lng0 - dLng, lat0 - dLat, lng0 + dLng, lat0 + dLat];
    } else {
      var poly = await (await fetch("/api/properties/cadastrals/districts/polygons?depth=3&districtCode=" + districtCode)).text();
      var pts = Array.from(poly.matchAll(/\[(1[23]\d\.\d+),\s*(3[3-8]\.\d+)\]/g)).map(function (m) { return [+m[1], +m[2]]; });
      if (!pts.length) throw new Error("법정동 경계를 받지 못했습니다(" + districtCode + "). 반경으로 해 보세요.");
      var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
      bbox = [Math.min.apply(null, xs) - 0.0005, Math.min.apply(null, ys) - 0.0005, Math.max.apply(null, xs) + 0.0005, Math.max.apply(null, ys) + 0.0005];
    }
    // 마커 타일 조회: 한 타일 결과가 25개 이상이면 4분할해 다시 묻는다(누락 방지)
    var seen = {}, calls = 0, saturated = 0;
    var q = function (lx, ly, rx, ry) {
      return "/api/lots/markers?areaUnitType=PYEONG&leftBottomPointX=" + lx + "&leftBottomPointY=" + ly + "&rightTopPointX=" + rx + "&rightTopPointY=" + ry +
        (cfg.propertyTypes ? "&propertyTypes=" + cfg.propertyTypes : "") + "&tradeYears=" + cfg.years.join(",") + "&types=TRADE" +
        (zoneCode ? "&useDistricts=" + zoneCode : "") + "&zoomLevel=20";
    };
    var tileOut = function (lx, ly, rx, ry) {
      if (!cfg.radiusKm) return false;
      var cx = Math.min(Math.max(lng0, lx), rx), cy = Math.min(Math.max(lat0, ly), ry);
      return dist(cy, cx) > cfg.radiusKm + 0.05;
    };
    var tile = async function (lx, ly, rx, ry, depth) {
      if (V.stop) return;
      if (tileOut(lx, ly, rx, ry)) return;
      var a = await getJSON(q(lx, ly, rx, ry)); calls++;
      if (calls % 10 === 0) msg("필지 찾는 중… 조회 " + calls + "회, " + Object.keys(seen).length + "건");
      if (a.length >= 25 && depth < 6) {
        var mx = (lx + rx) / 2, my = (ly + ry) / 2;
        await Promise.all([[lx, ly, mx, my], [mx, ly, rx, my], [lx, my, mx, ry], [mx, my, rx, ry]].map(function (b) { return tile(b[0], b[1], b[2], b[3], depth + 1); }));
        return;
      }
      if (a.length >= 25) saturated++;
      a.forEach(function (m) { seen[m.targetId] = m; });
    };
    var N = cfg.radiusKm ? 6 : 8, jobs = [];
    for (var i = 0; i < N; i++) for (var j = 0; j < N; j++)
      jobs.push([bbox[0] + (bbox[2] - bbox[0]) * i / N, bbox[1] + (bbox[3] - bbox[1]) * j / N, bbox[0] + (bbox[2] - bbox[0]) * (i + 1) / N, bbox[1] + (bbox[3] - bbox[1]) * (j + 1) / N]);
    for (var k = 0; k < jobs.length; k += 4) await Promise.all(jobs.slice(k, k + 4).map(function (b) { return tile(b[0], b[1], b[2], b[3], 0); }));
    if (V.stop) throw new Error("멈췄습니다.");
    var byPnu = {};
    Object.values(seen).forEach(function (m) {
      m.distKm = dist(m.latitude, m.longitude);
      if (cfg.radiusKm ? m.distKm > cfg.radiusKm : !m.pnu.startsWith(districtCode)) return;
      if (!byPnu[m.pnu] || byPnu[m.pnu].distKm > m.distKm) byPnu[m.pnu] = m;
    });
    var pnus = Object.keys(byPnu).filter(function (p) { return p !== subjectPnu; });
    if (!pnus.length) throw new Error("조건에 맞는 거래 필지가 없습니다. 기간·범위·용도지역을 넓혀 보세요.");
    if (pnus.length > 150 && !confirm(pnus.length + "개 필지의 상세를 불러옵니다(약 " + Math.ceil(pnus.length / 120) + "분). 계속할까요?\n취소하고 반경을 줄이면 더 가까운 사례만 빨리 볼 수 있습니다."))
      throw new Error("취소했습니다 — 필지 " + pnus.length + "개. 반경이나 기간을 줄여 보세요.");
    var lots = [];
    for (var s = 0; s < pnus.length; s += 4) {
      if (V.stop) throw new Error("멈췄습니다.");
      msg("거래내역 읽는 중… " + Math.min(s + 4, pnus.length) + " / " + pnus.length + " 필지");
      var part = await Promise.all(pnus.slice(s, s + 4).map(parseDetail));
      part.forEach(function (l) { var m = byPnu[l.pnu]; Object.assign(l, { lat: m.latitude, lng: m.longitude, distKm: m.distKm }); lots.push(l); });
      await sleep(150);
    }
    return {
      generatedAt: new Date().toISOString(), config: cfg, subject: subject, zoneCode: zoneCode,
      districtCode: cfg.radiusKm ? null : districtCode, bbox: bbox,
      meta: { tileCalls: calls, saturatedLeaves: saturated, lotCount: lots.length, center: [lat0, lng0],
        parseFailures: lots.filter(function (l) { return !l.ok; }).map(function (l) { return l.pnu; }),
        pagedHistories: lots.filter(function (l) { return l.historiesHasNext; }).map(function (l) { return l.pnu; }) },
      lots: lots
    };
  }

  // ── 표로 바꾸기 + 자동 판정(build_xlsx.py 와 같은 규칙)
  var short = function (a) { var p = (a || "").split(" "); return p.length > 2 ? p.slice(2).join(" ") : (a || ""); };
  function toRows(d) {
    var excl = (d.config.excludeTypes || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    var tz = d.subject.zoneLabel, y1 = d.config.years[0], y2 = d.config.years[d.config.years.length - 1];
    var rows = [], seenKey = {};
    d.lots.forEach(function (lot) {
      var nl = (lot.lands || []).length;
      (lot.histories || []).forEach(function (t) {
        var y = +t.tradeDate.slice(0, 4);
        if (y < y1 || y > y2) return;
        var key = lot.pnu + "|" + t.tradePrice, ms = Date.parse(t.tradeDate);
        var typ = t.propertyTypeDetail ? t.propertyTypeDetail.label : "", inc = true, notes = [];
        var twin = (seenKey[key] || []).filter(function (x) { return Math.abs(x - ms) <= 548 * 864e5; });
        if (twin.length) { inc = false; notes.push("같은 필지·같은 가격 거래가 1년 반 안에 또 있음 → 중복 신고 의심(맞으면 체크)"); }
        (seenKey[key] = seenKey[key] || []).push(ms);
        if (excl.indexOf(typ) >= 0) { inc = false; notes.push("거래당시 유형 " + typ + " → 대상 유형 아님"); }
        if (tz && lot.zoneLabel && lot.zoneLabel !== tz) { inc = false; notes.push("현재 용도지역 " + lot.zoneLabel + "(대상지 " + tz + ") — 확인 필요"); }
        var ap = (lot.approvalDate || "").replace(/\./g, "-");
        if (ap && ap > t.tradeDate) notes.push("거래 후 신축 → 사용승인일은 신축건물 기준");
        if (t.tradePrice % 1000000) notes.push("거래가 끝자리 비정형 → 지분·특수거래 확인");
        if ((t.buildingPricePerPyeong || 0) >= 1e8) notes.push("연면적단가 1억/평 이상 → 토지가치 위주 거래");
        if (nl > 1) notes.push(nl + "필지 일괄거래 — 단가 직접비교 유의");
        if (t.annexedBuildings && t.annexedBuildings.length) notes.push("부속건물 포함");
        if (lot.historiesHasNext) notes.push("거래내역이 더 있음 — 상세페이지 확인");
        rows.push({ date: t.tradeDate, jibun: short(lot.address) + (nl > 1 ? " 외 " + (nl - 1) + "필지" : ""), road: short(lot.roadAddress),
          typ: typ, zone: lot.zoneLabel || "", price: t.tradePrice, land: t.landArea, bldg: t.buildingTotalArea,
          appr: lot.approvalDate || "", inc: inc, note: notes.join("; "), pnu: lot.pnu, lat: lot.lat, lng: lot.lng,
          dist: lot.distKm });
      });
    });
    rows.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    rows.forEach(function (r, i) { r.no = i + 1; });
    return rows;
  }
  var unitLand = function (r) { return r.price && r.land ? r.price / (r.land * M2P) / 1e4 : null; };   // 만원/평
  var unitBldg = function (r) { return r.price && r.bldg ? r.price / (r.bldg * M2P) / 1e4 : null; };
  function subjRow(d) {
    var s = d.subject, h = (s.histories || [])[0];
    return { no: "대상", date: h ? h.tradeDate : "-", jibun: short(s.address), road: short(s.roadAddress), typ: h ? h.propertyTypeDetail.label : (s.propertyTypeLabel || ""),
      zone: s.zoneLabel || "", price: h ? h.tradePrice : null, land: h ? h.landArea : null, bldg: h ? h.buildingTotalArea : null,
      appr: s.approvalDate || "", note: h ? "대상지 직전 거래" : "대상지 거래 이력 없음", pnu: s.pnu, lat: s.lat, lng: s.lng, dist: 0 };
  }
  function stats(rows) {
    var a = rows.filter(function (r) { return r.inc; }).map(unitLand).filter(function (v) { return v; });
    var b = rows.filter(function (r) { return r.inc; }).map(unitBldg).filter(function (v) { return v; });
    var f = function (x) { return x.length ? { n: x.length, avg: x.reduce(function (p, c) { return p + c; }, 0) / x.length, min: Math.min.apply(null, x), max: Math.max.apply(null, x) } : null; };
    return { land: f(a), bldg: f(b), n: rows.filter(function (r) { return r.inc; }).length };
  }
  function scopeText(d) {
    var c = d.config, z = d.subject.zoneLabel || "";
    return (c.radiusKm ? "대상지 반경 " + c.radiusKm + "km" : "같은 법정동") + " · " + (c.useDistrictsLabel || z || "용도지역 전체") + " · " + c.typeLabel + " · " + c.years[0] + "~" + c.years[c.years.length - 1] + " 실거래";
  }

  var HEAD = ["No", "포함", "거래일", "지번", "거래시 유형", "용도지역", "실거래가(억)", "대지(평)", "연면적(평)", "토지단가(만원/평)", "연면적단가(만원/평)", "사용승인일", "거리(km)", "비고"];
  function cells(r) {
    return [r.no, r.no === "대상" ? "-" : (r.inc ? "Y" : "N"), r.date, r.jibun, r.typ, r.zone, r.price ? fmt(r.price / 1e8, 2) : "",
      r.land ? fmt(r.land * M2P, 1) : "", r.bldg ? fmt(r.bldg * M2P, 1) : "", fmt(unitLand(r)), fmt(unitBldg(r)), r.appr,
      r.dist != null ? fmt(r.dist, 2) : "", r.note];
  }

  function render() {
    var d = V.data; if (!d) return;
    var rows = V.rows, st = stats(rows), sr = subjRow(d), su = unitLand(sr);
    var sum = $(".sum"); sum.hidden = false;
    sum.innerHTML = "<b>" + esc(sr.jibun) + "</b> (" + esc(sr.zone) + ", " + esc(d.subject.propertyTypeLabel || "") + ") · " + esc(scopeText(d)) + "<br>" +
      "전체 " + rows.length + "건 중 비교사례 <b>" + st.n + "건</b>" +
      (st.land ? " · 토지단가 평균 <b>" + fmt(st.land.avg) + "</b> (최소 " + fmt(st.land.min) + " ~ 최대 " + fmt(st.land.max) + ") 만원/평" : "") +
      (st.bldg ? " · 연면적단가 평균 " + fmt(st.bldg.avg) + " 만원/평" : "") +
      (su && st.land ? "<br>대상지 직전 거래(" + esc(sr.date) + ") 토지단가 " + fmt(su) + " 만원/평 → 사례 평균은 그 <b>" + fmt(st.land.avg / su, 2) + "배</b>" : "") +
      (d.meta.parseFailures.length ? "<br>상세를 못 읽은 필지 " + d.meta.parseFailures.length + "개 — 다시 수집하거나 직접 확인" : "");
    var link = function (r) { return '<a href="/properties/trades/' + r.pnu + '" target="_blank" rel="noopener">' + esc(r.jibun) + "</a>"; };
    var tr = function (r, cls) {
      var c = cells(r);
      return '<tr class="' + cls + '"><td>' + esc(c[0]) + "</td><td>" + (r.no === "대상" ? "-" : '<input type="checkbox" data-i="' + (r.no - 1) + '"' + (r.inc ? " checked" : "") + ">") +
        "</td><td>" + esc(c[2]) + "</td><td>" + link(r) + "</td>" + c.slice(4, 13).map(function (v, k) { return "<td" + (k >= 2 && k <= 6 || k === 8 ? ' class="n"' : "") + ">" + esc(v) + "</td>"; }).join("") +
        '<td class="note">' + esc(c[13]) + "</td></tr>";
    };
    var tw = $(".tw"); tw.hidden = false;
    tw.innerHTML = "<table><thead><tr>" + HEAD.map(function (h, k) { return "<th" + (k >= 6 && k <= 10 || k === 12 ? ' class="n"' : "") + ">" + h + "</th>"; }).join("") + "</tr></thead><tbody>" +
      tr(sr, "subj") + rows.map(function (r) { return tr(r, r.inc ? "" : "out"); }).join("") + "</tbody></table>";
    tw.querySelectorAll("input[type=checkbox]").forEach(function (cb) {
      cb.onchange = function () { V.rows[+cb.dataset.i].inc = cb.checked; save(); render(); };
    });
    P.querySelectorAll('[data-a="copy"],[data-a="csv"],[data-a="map"],[data-a="maps"],[data-a="json"]').forEach(function (b) { b.disabled = false; });
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ data: V.data, inc: V.rows.map(function (r) { return r.inc; }) })); } catch (e) {} }

  // ── 내보내기
  function table2d() { return [HEAD].concat([subjRow(V.data)].concat(V.rows).map(cells)); }
  function download(name, text, type) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  function baseName() { var d = V.data; return ("밸류맵_" + short(d.subject.address) + "_" + d.config.years[0] + "-" + d.config.years[d.config.years.length - 1]).replace(/[\\/:*?"<>|\s]+/g, "_"); }
  function mapHtml() {
    var d = V.data, sr = subjRow(d), st = stats(V.rows);
    var pts = [sr].concat(V.rows).filter(function (r) { return r.lat && r.lng; }).map(function (r) {
      return { no: r.no, inc: r.no === "대상" ? null : r.inc, lat: r.lat, lng: r.lng, t: cells(r) };
    });
    var body = table2d();
    return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(sr.jibun) + " 실거래 비교사례</title>" +
      '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">' +
      ["leaflet/1.9.4/leaflet.min.js", "proj4js/2.11.0/proj4.min.js", "proj4leaflet/1.0.2/proj4leaflet.min.js"].map(function (u) { return '<script src="https://cdnjs.cloudflare.com/ajax/libs/' + u + '"></scr' + 'ipt>'; }).join("") +
      "<style>body{margin:0;font:13px/1.5 'Malgun Gothic',sans-serif;color:#1d2433;background:#f6f7f9}header{padding:14px 18px;background:#fff;border-bottom:1px solid #e4e7ec}h1{font-size:18px;margin:0 0 4px}" +
      "#map{height:58vh}.wrap{padding:12px 18px}table{border-collapse:collapse;width:100%;background:#fff;font-size:12px}th,td{border:1px solid #e4e7ec;padding:4px 6px;white-space:nowrap}th{background:#f2f4f7}" +
      "td.note{white-space:normal}tr.subj td{background:#fff7d6}tr.out td{color:#98a2b3}.pin{border-radius:50%;color:#fff;font-weight:700;font-size:11px;text-align:center;line-height:22px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)}" +
      ".lay{position:absolute;z-index:1000;top:10px;right:10px;background:#fff;border-radius:6px;padding:4px;box-shadow:0 1px 4px rgba(0,0,0,.3)}.lay button{border:0;background:#fff;padding:4px 8px;cursor:pointer}.lay button.on{background:#0f766e;color:#fff;border-radius:4px}</style></head><body>" +
      "<header><h1>" + esc(sr.jibun) + " 주변 실거래 비교사례</h1><div>" + esc(scopeText(d)) + " · 비교사례 " + st.n + "건" +
      (st.land ? " · 토지단가 평균 " + fmt(st.land.avg) + "만원/평(" + fmt(st.land.min) + "~" + fmt(st.land.max) + ")" : "") +
      " · 출처 밸류맵(valueupmap.com) " + d.generatedAt.slice(0, 10) + " 조회</div></header>" +
      '<div style="position:relative"><div id="map"></div><div class="lay"><button class="on" data-l="0">일반</button><button data-l="1">위성</button><button data-l="2">지적편집도</button></div></div>' +
      '<div class="wrap"><table><thead><tr>' + body[0].map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      body.slice(1).map(function (c, i) { return '<tr class="' + (i === 0 ? "subj" : (c[1] === "N" ? "out" : "")) + '">' + c.map(function (v, k) { return "<td" + (k === 13 ? ' class="note"' : "") + ">" + esc(v) + "</td>"; }).join("") + "</tr>"; }).join("") +
      "</tbody></table><p style=\"color:#667085\">○ 속 빈 마커 = 비교사례에서 뺀 거래, ★ = 대상지. 단가는 실거래가 ÷ (면적㎡ × 0.3025).</p></div><script>" +
      "var P=" + JSON.stringify(pts).replace(/</g, "\\u003c") + ",R=" + (d.config.radiusKm || 0) + ";" +
      "var crs=new L.Proj.CRS('EPSG:5181','+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=500000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',{resolutions:[2048,1024,512,256,128,64,32,16,8,4,2,1,0.5,0.25],origin:[-30000,-60000],bounds:L.bounds([-30000-Math.pow(2,19)*4,-60000],[-30000+Math.pow(2,19)*5,-60000+Math.pow(2,19)*5])});" +
      "var K=function(u){return L.tileLayer(u,{minZoom:3,maxZoom:13,zoomReverse:true,zoomOffset:1,tms:true,continuousWorld:true,attribution:'지도 &copy; Kakao · 자료 밸류맵'})},T='https://mts.kakaocdn.net/api/v1/tile/';" +
      "var B=[[K(T+'PNG02/v26_blse3/latest/{z}/{y}/{x}.png')],[K('https://map.kakaocdn.net/map_skyview_hd/L{z}/{y}/{x}.jpg?v=160107'),K(T+'PNG_SKYH02/v24_kikr3/latest/{z}/{y}/{x}.png')],[K(T+'PNG02/v26_blse3/latest/{z}/{y}/{x}.png'),K(T+'PNG_CAD02/v22_53657/latest/{z}/{y}/{x}.png')]];" +
      "var m=L.map('map',{crs:crs}),cur=[];function base(i){cur.forEach(function(l){m.removeLayer(l)});cur=B[i];cur.forEach(function(l,k){l.addTo(m);l.setZIndex(k+1)})}base(0);" +
      "document.querySelectorAll('.lay button').forEach(function(b){b.onclick=function(){base(+b.dataset.l);document.querySelectorAll('.lay button').forEach(function(x){x.classList.toggle('on',x===b)})}});" +
      "var g=[];P.forEach(function(p){var s=p.inc===null,c=s?'#e5383b':(p.inc?'#0f766e':'#fff'),f=s||p.inc?'#fff':'#0f766e';" +
      "var ic=L.divIcon({className:'',html:'<div class=\"pin\" style=\"width:'+(s?28:24)+'px;height:'+(s?28:24)+'px;line-height:'+(s?24:20)+'px;background:'+c+';color:'+f+';border-color:'+(s?'#fff':'#0f766e')+'\">'+(s?'★':p.no)+'</div>',iconSize:[s?28:24,s?28:24]});" +
      "L.marker([p.lat,p.lng],{icon:ic,zIndexOffset:s?1000:0}).addTo(m).bindPopup('<b>'+p.t[0]+'. '+p.t[3]+'</b><br>'+p.t[2]+' · '+p.t[4]+'<br>'+p.t[6]+'억 · 토지 '+p.t[9]+'만원/평'+(p.t[13]?'<br><span style=\"color:#b45309\">'+p.t[13]+'</span>':''));g.push([p.lat,p.lng])});" +
      "if(R&&P.length){L.circle([P[0].lat,P[0].lng],{radius:R*1000,color:'#e5383b',weight:1.5,dashArray:'6 6',fill:false}).addTo(m)}" +
      "if(g.length>1)m.fitBounds(g,{padding:[30,30]});else if(g.length)m.setView(g[0],11);</scr" + "ipt></body></html>";
  }

  P.addEventListener("click", async function (e) {
    var b = e.target.closest("button"); if (!b) return;
    var a = b.dataset.a;
    if (a === "min") P.classList.toggle("min");
    else if (a === "close") P.style.display = "none";
    else if (a === "stop") { V.stop = true; msg("멈추는 중…"); }
    else if (a === "run") {
      var addr = $(".addr").value.trim(); if (!addr) { msg("대상 지번을 넣어 주세요."); return; }
      var y1 = +$('[data-k="y1"]').value, y2 = +$('[data-k="y2"]').value;
      if (!(y1 >= 2006 && y2 >= y1 && y2 <= thisYear + 1)) { msg("기간을 확인해 주세요."); return; }
      var years = []; for (var y = y1; y <= y2; y++) years.push(y);
      var pt = $('[data-k="pt"]'), zn = $('[data-k="zn"]');
      var radius = P.querySelector('input[name="vmcsc"]:checked').value === "radius" ? +$(".km").value : 0;
      var cfg = { address: addr, years: years, propertyTypes: pt.value, typeLabel: pt.options[pt.selectedIndex].text,
        useDistricts: zn.value || null, useDistrictsLabel: zn.value ? zn.options[zn.selectedIndex].text : null,
        radiusKm: radius || null, excludeTypes: $(".ex").value };
      V.stop = false; b.disabled = true; $('[data-a="stop"]').disabled = false;
      try {
        V.data = await collect(cfg); V.rows = toRows(V.data); save(); render();
        msg(V.data.meta.saturatedLeaves ? "주의: 거래가 아주 촘촘한 곳이 있어 일부가 빠졌을 수 있습니다. 반경을 줄여 다시 해 보세요." : "다 모았습니다. 필지 " + V.data.meta.lotCount + "개, 거래 " + V.rows.length + "건.");
      } catch (err) { msg(err.message || String(err)); }
      b.disabled = false; $('[data-a="stop"]').disabled = true;
    }
    else if (a === "copy") {
      var tsv = table2d().map(function (r) { return r.map(function (v) { return String(v == null ? "" : v).replace(/[\t\n]/g, " "); }).join("\t"); }).join("\n");
      try { await navigator.clipboard.writeText(tsv); msg("표를 복사했습니다. 엑셀에 붙여 넣으세요."); } catch (err) { msg("복사가 막혔습니다. 엑셀(CSV) 저장을 쓰세요."); }
    }
    else if (a === "csv") {
      var csv = table2d().map(function (r) { return r.map(function (v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }).join("\r\n");
      download(baseName() + ".csv", "﻿" + csv, "text/csv;charset=utf-8");
    }
    else if (a === "map") { var w = window.open(URL.createObjectURL(new Blob([mapHtml()], { type: "text/html" })), "_blank"); if (!w) msg("팝업이 막혔습니다. 지도 HTML 저장을 쓰세요."); }
    else if (a === "maps") download(baseName() + "_지도.html", mapHtml(), "text/html;charset=utf-8");
    else if (a === "json") download(baseName() + "_valuemap_result.json", JSON.stringify(V.data), "application/json");
  });

  // 지난번 결과 다시 보이기
  try {
    var last = JSON.parse(localStorage.getItem(KEY) || "null");
    if (last && last.data) {
      V.data = last.data; V.rows = toRows(V.data);
      (last.inc || []).forEach(function (v, i) { if (V.rows[i]) V.rows[i].inc = v; });
      $(".addr").value = V.data.config.address; render();
      msg("지난번 결과(" + V.data.generatedAt.slice(0, 10) + ")입니다. 새로 하려면 조건을 고치고 수집 시작.");
    }
  } catch (e) {}
})();

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
  // 유형·용도지역 목록 = 밸류맵 지도 필터와 같은 값(2026-10-19 밸류맵 화면 코드에서 확인). 여러 개는 쉼표로 묶어 한 번에 묻는다.
  var TYPES = [["BUILDING", "상업업무"], ["HOUSING", "단독/다가구"], ["LAND", "토지"], ["FACTORY", "공장/창고"], ["STORE", "상가"], ["APT", "APT/연립"]];
  // 필지(상세페이지)의 유형 코드 → 위 값. 대상지와 같게를 고를 때 쓴다
  // 뜻이 확실한 코드만(2026-10-22: MH 를 APT 로 짐작했다가 다가구가 APT/연립으로 잡힘 — MH·OF·AF 는 뜻을 몰라 뺐다. 거래 한 건은 글자(label)로 먼저 판단)
  var CODE2PT = { CB: "BUILDING", HD: "HOUSING", LD: "LAND", FW: "FACTORY", CP: "STORE", AP: "APT" };
  // 거래 한 건의 '거래 당시 유형'(propertyTypeDetail.label) → 위 값. 고른 유형에 없으면 비교사례에서 뺀다(예전 '제외 유형' 칸 대신)
  var DETAIL2PT = [[/단독|다가구/, "HOUSING"], [/아파트|연립|다세대|오피스텔|공동주택/, "APT"], [/공장|창고/, "FACTORY"], [/상가|점포/, "STORE"],
    [/^토지|나대지|대지$|임야|전$|답$/, "LAND"], [/근린|업무|판매|숙박|교육|의료|문화|종교|위락|운동|노유자|자동차|기타|상업/, "BUILDING"]];
  var ZONES = [["C11", "1종전주"], ["C12", "2종전주"], ["C13", "1종일주"], ["C14", "2종일주"], ["C15", "3종일주"], ["C16", "준주거"],
    ["C21", "중심상업"], ["C22", "일반상업"], ["C23", "근린상업"], ["C24", "유통상업"], ["C31", "전용공업"], ["C32", "일반공업"], ["C33", "준공업"],
    ["C41", "보전녹지"], ["C42", "생산녹지"], ["C43", "자연녹지"], ["C44", "개발제한"], ["C51", "미정"], ["C61", "관리지역"], ["C62", "보전관리"],
    ["C63", "생산관리"], ["C64", "계획관리"], ["C71", "농림지역"], ["C81", "자연환경"]];
  var zoneLabel = function (c) { var z = ZONES.find(function (x) { return x[0] === c; }); return z ? z[1] : c; };
  var typeLabel = function (c) { var t = TYPES.find(function (x) { return x[0] === c; }); return t ? t[1] : c; };
  var thisYear = new Date().getFullYear();

  // ── 패널
  if (!document.getElementById("rasFont")) { var fl = document.createElement("link"); fl.id = "rasFont"; fl.rel = "stylesheet";
    fl.href = "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap"; document.head.appendChild(fl); }   // 글꼴(2026-10-21) — 막히면 맑은 고딕
  var css = document.createElement("style");
  css.textContent = "#vmc{position:fixed;right:16px;bottom:16px;z-index:2147483000;width:640px;max-width:calc(100vw - 32px);max-height:88vh;display:flex;flex-direction:column;background:#fff;color:#1d2433;border:1px solid #d0d5dd;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.25);font:13px/1.45 'Noto Sans KR','Malgun Gothic',sans-serif}" +
    "#vmc *{box-sizing:border-box;font-family:inherit}#vmc .hd{display:flex;align-items:center;gap:8px;padding:8px 10px;background:#D9653B;color:#fff;border-radius:10px 10px 0 0;cursor:move;user-select:none}" +
    "#vmc .hd b{flex:1;font-size:14px}#vmc .hd button{background:none;border:none;color:#fff;font-size:16px;cursor:pointer;padding:0 4px}" +
    "#vmc .bd{padding:8px 10px;display:flex;flex-direction:column;gap:7px;overflow:auto}" +
    "#vmc .f{display:flex;gap:8px;flex-wrap:wrap;align-items:center}#vmc label{display:inline-flex;align-items:center;gap:4px}" +
    "#vmc input[type=text],#vmc input[type=number],#vmc select{border:1px solid #d0d5dd;border-radius:6px;padding:4px 6px;font-size:12.5px}" +
    "#vmc input.addr{flex:1;min-width:180px}#vmc input.yr{width:64px}#vmc input.km{width:52px}#vmc input.ex{width:250px}" +
    "#vmc .row{display:flex;gap:5px;flex-wrap:wrap}#vmc .row button{padding:5px 10px;border:1px solid #d0d5dd;background:#fff;border-radius:6px;cursor:pointer;font-size:12.5px}" +
    "#vmc .row button.pri{background:#D9653B;border-color:#D9653B;color:#fff;font-weight:700}#vmc .row button:disabled{opacity:.45;cursor:default}" +
    "#vmc .msg{min-height:16px;font-size:12px;color:#b45309;white-space:pre-line}#vmc .sum{font-size:12.5px;background:#FBEFE9;border:1px solid #EDB49C;border-radius:6px;padding:6px 8px}" +
    "#vmc table{border-collapse:collapse;width:100%;font-size:12px}#vmc th,#vmc td{border-bottom:1px solid #eaecf0;padding:4px 5px;text-align:left;white-space:nowrap}" +
    "#vmc th{background:#f6f7f9;position:sticky;top:0}#vmc td.n,#vmc th.n{text-align:right}#vmc tr.subj td{background:#fff7d6}#vmc tr.out td{color:#98a2b3}#vmc tbody tr{cursor:pointer}#vmc tbody tr.hl td{background:#fff3b0}#vmc tbody tr:hover td{box-shadow:inset 0 -1px 0 #f0d78c}#vmc tfoot td{background:#f6f7f9;font-weight:700;position:sticky;bottom:0}#vmc tfoot tr:nth-child(1) td{bottom:44px;border-top:2px solid #d0d5dd}#vmc tfoot tr:nth-child(2) td{bottom:22px}" +
    "#vmc td.note{white-space:normal;min-width:300px;font-size:11.5px;color:#b45309}#vmc a{color:#D9653B}#vmc .tw{overflow:auto;flex:1 1 auto;min-height:170px;max-height:none;border:1px solid #eaecf0;border-radius:6px}" +
    "#vmc.min .bd{display:none}#vmc .hint{font-size:11.5px;color:#667085}" +
    "#vmc .rz{position:absolute;left:-3px;top:-3px;width:16px;height:16px;cursor:nwse-resize;z-index:3}" +
    "#vmc .eg{position:absolute;z-index:2}#vmc .eg[data-e=l]{left:-4px;top:12px;bottom:12px;width:8px;cursor:ew-resize}#vmc .eg[data-e=r]{right:-4px;top:12px;bottom:12px;width:8px;cursor:ew-resize}" +
    "#vmc .eg[data-e=t]{top:-4px;left:12px;right:12px;height:8px;cursor:ns-resize}#vmc .eg[data-e=b]{bottom:-4px;left:12px;right:12px;height:8px;cursor:ns-resize}" +
    "#vmc .row button.hl{border-color:#D9653B;color:#D9653B;font-weight:700;box-shadow:0 0 0 2px #FBEFE9}" +
    "#vmc th button.so{border:0;background:none;color:#98a2b3;font-size:10px;cursor:pointer;padding:0 0 0 3px}#vmc th button.so.on{color:#D9653B}#vmc th button.so:hover{color:#1d2433}" +
    "#vmc .gr{color:#b0b7c3;cursor:grab;margin-right:4px;user-select:none}#vmc tr:hover .gr{color:#475467}#vmc tr.dra td{box-shadow:inset 0 -3px 0 #D9653B}#vmc tr.drb td{box-shadow:inset 0 3px 0 #D9653B}" +
    "#vmc .row label.oi{font-size:12.5px;margin-left:4px}" +
    "#vmc .bd{min-height:0}#vmc .cfg{display:flex;flex-direction:column;gap:7px}#vmc .cfg[hidden],#vmc .cfgbar[hidden]{display:none}" +
    "#vmc .cfgbar{display:flex;align-items:center;gap:8px;font-size:12px;color:#475467;background:#f6f7f9;border-radius:6px;padding:4px 8px}#vmc .cfgbar .cfgsum{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    "#vmc .cfgbar button{border:1px solid #d0d5dd;background:#fff;border-radius:6px;padding:2px 8px;font-size:12px;cursor:pointer}" +
    "#vmc select.cand{flex:1;min-width:260px}#vmc select.rg{max-width:220px}#vmc .ms{position:relative}#vmc .ms summary{list-style:none;cursor:pointer;border:1px solid #d0d5dd;border-radius:6px;padding:4px 22px 4px 7px;font-size:12.5px;max-width:250px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:#fff}" +
    "#vmc .ms summary::-webkit-details-marker{display:none}#vmc .ms summary:after{content:'▾';position:absolute;right:7px;top:4px;color:#667085}" +
    "#vmc .ms .opts{position:absolute;z-index:5;top:100%;left:0;margin-top:2px;background:#fff;border:1px solid #d0d5dd;border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.15);padding:8px;display:grid;gap:3px 12px;width:max-content;max-width:420px}" +
    "#vmc .ms .opts label{font-size:12.5px;white-space:nowrap}#vmc .ms .opts .same{grid-column:1/-1;display:flex;align-items:center;gap:10px;font-weight:700;border-bottom:1px solid #eaecf0;padding-bottom:4px;margin-bottom:2px}";
  document.head.appendChild(css);

  var P = document.createElement("div");
  P.id = "vmc";
  P.innerHTML = '<div class="rz" title="끌어서 창·글씨 크기 바꾸기 (두 번 누르면 원래대로)"></div>' +
    '<div class="eg" data-e="l"></div><div class="eg" data-e="r"></div><div class="eg" data-e="t"></div><div class="eg" data-e="b"></div>' +
    '<div class="hd"><b>밸류맵 실거래 비교사례</b><button data-a="min" title="접기">–</button><button data-a="close" title="닫기">×</button></div>' +
    '<div class="bd">' +
    '<div class="cfgbar" hidden><span class="cfgsum"></span><button type="button" data-a="cfg">조건 펴기 ▾</button></div><div class="cfg">' +
    '<div class="f"><input class="addr" type="text" placeholder="대상 주소 (예: 서울시 용산구 한강대로 100) · 지번도 됩니다">' +
    '<label>기간 <input class="yr" type="number" data-k="y1" value="' + (thisYear - 5) + '">~<input class="yr" type="number" data-k="y2" value="' + thisYear + '"></label></div>' +
    '<div class="f" data-k="candrow" hidden><select class="cand" title="찾은 필지"></select></div>' +
    '<div class="f"><label><input type="radio" name="vmcsc" value="region" checked>같은 행정구역 <select class="rg" title="행정구역"><option value="">주소를 넣으면 고를 수 있습니다</option></select></label>' +
    '<label><input type="radio" name="vmcsc" value="radius">반경 <input class="km" type="number" step="0.5" min="0.5" value="1">km</label></div>' +
    '<div class="f"><label>유형 ' + multi("pt", TYPES, 2) + '</label><label>용도지역 ' + multi("zn", ZONES, 4) + '</label>' +
    '<label title="거래내역에 섞여 온 경매 낙찰(낙찰가율·감정가가 있는 기록)을 비교사례에서 뺍니다"><input type="checkbox" data-k="noauc" checked>경매 제외</label></div>' +
    '</div>' +
    '<div class="row"><button class="pri" data-a="run">수집 시작</button><button data-a="stop" disabled>멈춤</button>' +
    '<button data-a="copy" disabled>표 복사</button><button data-a="csv" disabled>엑셀(CSV) 저장</button>' +
    '<button data-a="map" disabled>지도 열기</button><button data-a="maps" disabled>지도 HTML 저장</button><button data-a="json" disabled>원본 JSON</button>' +
    '<label class="oi" title="밸류맵 지도에서 포함한 거래의 필지만 보이고 나머지 표시는 숨깁니다(대상지는 늘 보임)"><input type="checkbox" data-k="onlyinc">밸류맵 지도에 포함 거래만</label>' +
    '<label class="oi" title="밸류맵의 위 머리줄·왼쪽 검색판·오른쪽 매물 목록을 잠시 숨기고 지도를 화면 가득"><input type="checkbox" data-k="mapbig">밸류맵 지도 크게</label></div>' +
    '<div class="msg"></div><div class="sum" hidden></div><div class="tw" hidden></div>' +
    '<div class="hint">숫자는 밸류맵 상세페이지 값입니다. 지번을 누르면 그 상세페이지(근거 화면)가 새 탭으로 열립니다. 체크를 풀면 요약에서 빠집니다.</div>' +
    '</div>';
  document.body.appendChild(P);
  var $ = function (s) { return P.querySelector(s); };
  var msg = function (t) { $(".msg").textContent = t || ""; };
  V.show = function () { P.style.display = "flex"; P.classList.remove("min"); };
  (function () {
    var rz = $(".rz"), sc = 1;
    try { sc = +localStorage.getItem("vmcScale") || 1; } catch (e) {}
    // 창이 화면 밖으로 나가지 않을 만큼까지만 키운다(기본 크기 640px 기준)
    var fit = function () { var r = P.getBoundingClientRect(), z = sc || 1; return Math.min(1.8, (innerWidth - 24) / (r.width / z), (innerHeight - 24) / (Math.min(r.height, innerHeight * 0.8 * z) / z)); };
    var apply = function (v) { sc = Math.max(0.85, Math.min(v, fit())); P.style.zoom = sc; P.style.maxHeight = (88 / sc) + "vh";   // zoom 은 높이에도 곱해진다 → 키워도 화면(88vh) 안에 머리줄이 남게
      P.style.left = ""; P.style.top = ""; P.style.right = "16px"; P.style.bottom = "16px";
      try { localStorage.setItem("vmcScale", String(sc)); } catch (e) {} };
    apply(sc);
    rz.addEventListener("mousedown", function (e) {
      e.preventDefault(); e.stopPropagation();
      var sx = e.clientX, sy = e.clientY, s0 = sc;
      var mv = function (ev) { apply(s0 + ((sx - ev.clientX) + (sy - ev.clientY)) / 500); };
      var up = function () { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); };
      document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
    });
    rz.addEventListener("dblclick", function (e) { e.stopPropagation(); P.style.width = ""; P.style.height = ""; try { localStorage.removeItem("vmcSize"); } catch (x) {} apply(1); });
    // 가장자리(2026-10-22): 왼쪽·오른쪽 = 창 폭, 위·아래 = 창 높이(글씨 크기는 그대로). 반대쪽 가장자리는 제자리에 둔다
    try { var sz = JSON.parse(localStorage.getItem("vmcSize") || "null"); if (sz) { if (sz.w) P.style.width = sz.w + "px"; if (sz.h) P.style.height = sz.h + "px"; } } catch (e) {}
    P.querySelectorAll(".eg").forEach(function (g) {
      g.addEventListener("mousedown", function (e) {
        e.preventDefault(); e.stopPropagation();
        var d = g.dataset.e, z = parseFloat(P.style.zoom) || 1, r = P.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
        var L0 = r.left / z, T0 = r.top / z, W0 = r.width / z, H0 = r.height / z;
        P.style.left = L0 + "px"; P.style.top = T0 + "px"; P.style.right = "auto"; P.style.bottom = "auto";
        if (d === "t" || d === "b") { P.style.height = H0 + "px"; }
        var mv = function (ev) {
          var dx = (ev.clientX - sx) / z, dy = (ev.clientY - sy) / z, w, h;
          var maxW = innerWidth / z - 8, maxH = innerHeight * 0.96 / z;
          if (d === "r") P.style.width = Math.max(420, Math.min(W0 + dx, maxW - L0)) + "px";
          if (d === "l") { w = Math.max(420, Math.min(W0 - dx, L0 + W0)); P.style.width = w + "px"; P.style.left = (L0 + W0 - w) + "px"; }
          if (d === "b") P.style.height = Math.max(220, Math.min(H0 + dy, innerHeight / z - T0)) + "px";
          if (d === "t") { h = Math.max(220, Math.min(H0 - dy, T0 + H0)); P.style.height = h + "px"; P.style.top = (T0 + H0 - h) + "px"; }
          P.style.maxWidth = maxW + "px"; P.style.maxHeight = maxH + "px";
        };
        var up = function () { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up);
          try { localStorage.setItem("vmcSize", JSON.stringify({ w: parseFloat(P.style.width) || 0, h: parseFloat(P.style.height) || 0 })); } catch (x) {} };
        document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
      });
    });
  })();

  // ── 여러 개 고르기(유형·용도지역): 맨 위 '대상지와 같게' + 모든 값, 중복 선택. 고른 것은 summary 에 보인다
  function multi(k, list, cols) {
    return '<details class="ms" data-k="' + k + '"><summary>대상지와 같게</summary><div class="opts" style="grid-template-columns:repeat(' + cols + ',auto)">' +
      '<div class="same"><label><input type="checkbox" value="SAME" checked>대상지와 같게</label><label title="체크하면 전부 고르기 · 풀면 전부 풀기"><input type="checkbox" class="allck">모두</label></div>' +
      list.map(function (x) { return '<label><input type="checkbox" value="' + x[0] + '">' + x[1] + "</label>"; }).join("") + "</div></details>";
  }
  function picked(k) {
    var box = $('.ms[data-k="' + k + '"]');
    return Array.prototype.map.call(box.querySelectorAll("input:checked:not(.allck)"), function (c) { return c.value; });
  }
  function msLabel(k) {
    var v = picked(k), L = k === "pt" ? typeLabel : zoneLabel;
    var box = $('.ms[data-k="' + k + '"]'), n = box.querySelectorAll('input:not([value="SAME"]):not(.allck)').length, real = v.filter(function (c) { return c !== "SAME"; });
    box.querySelector("summary").textContent = real.length === n ? "모두" : v.length ? v.map(function (c) { return c === "SAME" ? "대상지와 같게" : L(c); }).join(", ") : "(고르세요)";
    box.querySelector(".allck").checked = real.length === n;            // 하나하나 다 고르면 '모두'도 저절로 체크
  }
  // '모두' 체크 칸(2026-10-22): 체크 = 그 목록 전부 고르기, 풀기 = 전부 풀기('대상지와 같게'는 그대로)
  P.addEventListener("change", function (e) {
    if (!e.target.classList || !e.target.classList.contains("allck")) return;
    var box = e.target.closest(".ms"), on = e.target.checked;
    box.querySelectorAll('input:not([value="SAME"]):not(.allck)').forEach(function (c) { c.checked = on; });
  }, true);
  $('[data-k="onlyinc"]').onchange = function () { V.onlyInc = this.checked; save(); vmMapMark(); };
  // 밸류맵 지도 크게(2026-10-22): 지도는 원래 화면 전체 폭이고 그 위에 판들이 '덮여' 있다(fixed·absolute). 지도(.naver-maps-marker 를 품은 칸)와
  //   이 창(#vmc)을 뺀 나머지 칸을 display:none 으로 감추고 resize 를 보내 지도가 다시 그려지게 한다. 끄면 되돌린다.
  //   줌아웃하면 매매 표시가 묶음 숫자로 바뀌는 것은 밸류맵 지도 동작이라 바꿀 수 없다.
  var bigHidden = [];
  function vmMapBig(on) {
    bigHidden.forEach(function (x) { x.el.style.display = x.d; }); bigHidden = [];
    // 지도 본체 = 마커에서 위로 올라가다 처음 만나는 '화면만 한 overflow:hidden 칸'의 바로 안쪽 칸(네이버 지도). 2026-10-22 밸류맵 구조:
    //   MAIN > [왼쪽 검색판(fixed) · 지도 줄 > [overflow:hidden 칸 > [지도 · 오른쪽 매물 목록 · 떠 있는 단추] …] …]
    var mk = document.querySelector(".naver-maps-marker"), root = null;
    for (var e = mk; e && e.parentElement && e.parentElement !== document.body; e = e.parentElement) {
      var pa = e.parentElement, b = pa.getBoundingClientRect();
      if (getComputedStyle(pa).overflow === "hidden" && b.width > innerWidth * 0.6 && b.height > innerHeight * 0.6) { root = e; break; }
    }
    if (on && root) {
      // 지도 본체에서 body 까지 올라가며, 길에 없는 형제 칸(검색판·목록·머리줄·단추·광고)을 숨긴다. 이 창(#vmc)·style·script 는 그대로
      for (var a = root; a && a.parentElement && a !== document.body; a = a.parentElement) {
        Array.prototype.forEach.call(a.parentElement.children, function (sib) {
          if (sib === a || sib === P || sib.contains(P) || /^(SCRIPT|STYLE|LINK)$/.test(sib.tagName)) return;
          bigHidden.push({ el: sib, d: sib.style.display }); sib.style.display = "none";
        });
      }
    }
    setTimeout(function () { window.dispatchEvent(new Event("resize")); }, 60);
  }
  $('[data-k="mapbig"]').onchange = function () { vmMapBig(this.checked); };
  ["pt", "zn"].forEach(function (k) { $('.ms[data-k="' + k + '"]').addEventListener("change", function () { msLabel(k); }); });
  document.addEventListener("click", function (e) { P.querySelectorAll(".ms[open]").forEach(function (d) { if (!d.contains(e.target)) d.open = false; }); });

  // ── 대상 주소 → 필지 후보 → 행정구역(시·도 / 시·군·구 / 법정동) 고르기. 도로명을 넣어도 밸류맵 주소검색이 지번(법정동)을 돌려준다
  V.cands = [];
  function regionsOf(c) {
    var t = (c.address || "").split(" "), sido = t[0] || "", i = 1, sgg = [];
    while (i < t.length - 1 && /(시|군|구)$/.test(t[i])) sgg.push(t[i++]);
    var dong = t.slice(i, t.length - 1).filter(function (w) { return !/^산$/.test(w); }).join(" ");
    var p = c.pnu, out = [];
    if (dong) out.push({ code: p.slice(0, 10), depth: 3, name: dong, full: [sido].concat(sgg, [dong]).join(" ") });
    if (sgg.length) out.push({ code: p.slice(0, 5), depth: 2, name: sgg.join(" "), full: [sido].concat(sgg).join(" ") });
    if (sido) out.push({ code: p.slice(0, 2), depth: 1, name: sido, full: sido });
    return out;
  }
  function fillRegions() {
    var c = V.cands[+$(".cand").value || 0], sel = $(".rg");
    if (!c) { sel.innerHTML = '<option value="">주소를 넣으면 고를 수 있습니다</option>'; return; }
    var keep = sel.dataset.depth || "3";
    sel.innerHTML = regionsOf(c).map(function (r) {
      return '<option value="' + r.code + '" data-depth="' + r.depth + '" data-full="' + esc(r.full) + '">' + esc(r.name) + (r.depth === 3 ? " (법정동)" : r.depth === 2 ? " (시·군·구)" : " (시·도 — 오래 걸림)") + "</option>";
    }).join("");
    var o = sel.querySelector('[data-depth="' + keep + '"]'); if (o) o.selected = true;
  }
  $(".rg").onchange = function () { var o = this.options[this.selectedIndex]; this.dataset.depth = o ? o.dataset.depth : "3"; P.querySelector('input[value="region"]').checked = true; };
  var candTimer = null, candSeq = 0;
  async function findCands(q) {
    var my = ++candSeq;
    q = q.trim(); if (q.length < 3) return;
    try {
      var ad = await getJSON("/api/properties/addresses?keyword=" + encodeURIComponent(q));
      if (my !== candSeq) return;
      V.cands = ad.addresses || [];
    } catch (e) { V.cands = []; }
    V.candFor = q;                              // 수집 시작 때 같은 주소면 다시 찾지 않는다(고른 후보 유지)
    var row = $('[data-k="candrow"]'), sel = $(".cand");
    if (!V.cands.length) { row.hidden = true; fillRegions(); msg("주소를 찾지 못했습니다: " + q); return; }
    sel.innerHTML = V.cands.map(function (c, i) {
      return '<option value="' + i + '">' + esc(c.address) + (c.roadAddress && c.roadAddress !== c.address ? " (" + esc(c.roadAddress.split(" ").slice(2).join(" ")) + ")" : "") + "</option>";
    }).join("");
    row.hidden = V.cands.length < 2;          // 하나뿐이면 바로 그 필지
    if (V.cands.length > 1) msg("필지 후보가 " + V.cands.length + "개입니다. 대상 필지를 고르세요.");
    else msg("대상 필지: " + V.cands[0].address);
    fillRegions();
  }
  $(".addr").addEventListener("input", function () { clearTimeout(candTimer); var v = this.value; candTimer = setTimeout(function () { findCands(v); }, 450); });
  $(".cand").onchange = function () { fillRegions(); msg("대상 필지: " + V.cands[+this.value].address); };

  // 끌어서 옮기기
  (function () {
    var hd = $(".hd"), sx, sy, ox, oy;
    hd.addEventListener("mousedown", function (e) {
      if (e.target.tagName === "BUTTON" || e.target.closest(".rz")) return;
      e.preventDefault();   // 글자 선택이 끌려 다니지 않게
      // 창 크기(CSS zoom)를 바꾼 뒤에는 left·top 이 그 배율만큼 곱해져 그려진다 → 화면 좌표를 배율로 나눠 넣어야 창이 마우스를 그대로 따라온다(2026-10-22 고침)
      var z = parseFloat(P.style.zoom) || 1, r = P.getBoundingClientRect(); sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      var mv = function (ev) {
        var x = Math.max(0, Math.min(ox + ev.clientX - sx, innerWidth - 60)), y = Math.max(0, Math.min(oy + ev.clientY - sy, innerHeight - 40));
        P.style.left = x / z + "px"; P.style.top = y / z + "px"; P.style.right = "auto"; P.style.bottom = "auto"; };
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
    // 현재 공시지가(원/㎡)와 기준 연월('26.01') — 해마다 목록(/official-prices)은 멤버십이 없으면 403 이라 이것을 예비로 쓴다
    var offNow = t.match(/"officialPrice":(\d+),"landCategory"/), offYm = t.match(/"officialPriceEvaluationDate":"(\d{2})\.(\d{2})"/);
    var lands = J(g(/"lands":(\[[^\]]*\])/));
    var attr = {};
    (summ || []).forEach(function (a) { attr[a.title] = a.content.description || a.content.squareMeter; });
    var m2 = function (v) { return v ? +String(v).replace(/[^\d.]/g, "") || null : null; };
    return {
      pnu: pnu, address: g(/"address":"([^"]*)","shortAddress"/), roadAddress: g(/"roadAddress":"([^"]*)"/),
      zoneCode: zone ? zone[1] : null, zoneLabel: zone ? zone[2] : null,
      propertyTypeCode: ptype ? ptype[1] : null, propertyTypeLabel: ptype ? ptype[2] : null,
      approvalDate: attr["사용승인일"] || null, landM2: m2(attr["총 대지면적"]), bldgM2: m2(attr["총 연면적"]), lands: (lands || []).map(function (l) { return l.address; }),
      officialNow: offNow ? +offNow[1] : null, officialNowYm: offYm ? "20" + offYm[1] + "." + offYm[2] : null,
      histories: hist ? hist.contents : [], historiesHasNext: hist ? hist.hasNext : null, ok: !!summ
    };
  }

  // ── 거래 당시 공시지가(2026-10-22): 토지이음 연도별 공시지가 luLandDetYearAjax.jsp?pnu= (EUC-KR, Access-Control-Allow-Origin: * —
  //   밸류맵 화면에서 불러도 된다. Referer 가 아예 없으면 빈 응답이라 브라우저 기본 referrer 로 부른다). 밸류맵 /api/properties/{pnu}/official-prices 는
  //   멤버십이 없으면 403 이라 쓰지 않는다. 결과 {연도: 원/㎡}, 못 받으면 null → 표 칸은 빈칸.
  async function officialPrices(pnu) {
    try {
      var r = await fetch("https://www.eum.go.kr/web/ar/lu/luLandDetYearAjax.jsp?pnu=" + pnu, { referrerPolicy: "strict-origin-when-cross-origin" });
      if (!r.ok) return null;
      var h = new TextDecoder("euc-kr").decode(await r.arrayBuffer()), out = {}, m, re = /(\d{4})\/\d{2}\s*<\/td>\s*<td>\s*([\d,]+)\s*원/g;
      while ((m = re.exec(h))) out[+m[1]] = +m[2].replace(/,/g, "");
      return Object.keys(out).length ? out : null;
    } catch (e) { return null; }
  }
  // 거래 당시 공시지가 = 거래한 해의 공시지가(그해 1월 1일 기준). 없으면 그 해보다 앞선 가장 가까운 해
  function officialAt(off, date) {
    if (!off || !date) return null;
    var want = +date.slice(0, 4);
    if (off[want]) return off[want];
    var ys = Object.keys(off).map(Number).filter(function (v) { return v <= want; }).sort(function (a, b) { return b - a; });
    return ys.length ? off[ys[0]] : null;
  }
  // 공시지가대비 = ㎡당 토지단가 ÷ ㎡당 공시지가. 해마다 목록이 있으면 거래 당시 값, 없으면 현재 공시지가(now=true → 표에 * 표시)
  var offRatio = function (lot, price, landM2, date) {
    var o = officialAt(lot.official, date), now = false;
    return o && price && landM2 ? { x: price / landM2 / o, now: now } : null;
  };

  // ── 수집
  async function collect(cfg) {
    var me = await fetch("/api/accounts/users/me");
    if (!me.ok) throw new Error("밸류맵에 로그인한 뒤 다시 눌러 주세요. (오른쪽 위 MY → 로그인)");
    var S = cfg.cand;
    if (!S) {
      var ad = await getJSON("/api/properties/addresses?keyword=" + encodeURIComponent(cfg.address));
      if (!ad.addresses || !ad.addresses.length) throw new Error("주소를 찾지 못했습니다: " + cfg.address);
      S = ad.addresses[0];
    }
    var lat0 = S.latitude, lng0 = S.longitude, subjectPnu = S.pnu;
    msg("대상지 확인 중… " + S.address);
    var subject = await parseDetail(subjectPnu);
    Object.assign(subject, { lat: lat0, lng: lng0, distKm: 0, official: await officialPrices(subjectPnu) });
    // '대상지와 같게'를 대상지 값으로 풀어 고른 값과 합친다(못 알아내면 알려 주고 그 조건은 넓힌다)
    var warn = [];
    var spt = CODE2PT[subject.propertyTypeCode] || null;
    var ptList = cfg.types.filter(function (t) { return t !== "SAME"; });
    if (cfg.types.indexOf("SAME") >= 0) { if (spt) ptList.push(spt); else warn.push("대상지 유형을 몰라 상업업무로 찾습니다"); }
    if (!ptList.length) ptList.push("BUILDING");
    ptList = ptList.filter(function (t, i) { return ptList.indexOf(t) === i; });
    var znList = cfg.zones.filter(function (z) { return z !== "SAME"; });
    if (cfg.zones.indexOf("SAME") >= 0) { if (subject.zoneCode) znList.push(subject.zoneCode); else warn.push("대상지 용도지역을 몰라 용도지역은 거르지 않습니다"); }
    znList = znList.filter(function (z, i) { return znList.indexOf(z) === i; });
    if (ZONES.every(function (z) { return znList.indexOf(z[0]) >= 0; })) znList = [];     // '모두' = 용도지역으로 거르지 않음
    Object.assign(cfg, { ptList: ptList, znList: znList, typeLabel: ptList.map(typeLabel).join("·"),
      useDistrictsLabel: znList.length ? znList.map(zoneLabel).join("·") : null, propertyTypes: ptList.join(","), useDistricts: znList.join(",") || null });
    if (warn.length) msg(warn.join(" · "));
    var zoneCode = cfg.useDistricts;
    var region = cfg.region || { code: subjectPnu.slice(0, 10), depth: 3 };
    var districtCode = region.code;
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
      // 경계: depth 1 = 시·도(2자리), 2 = 시·군·구(5자리), 3 = 법정동(10자리, PNU 앞부분)
      var poly = await (await fetch("/api/properties/cadastrals/districts/polygons?depth=" + region.depth + "&districtCode=" + districtCode)).text();
      var pts = Array.from(poly.matchAll(/\[(1[23]\d\.\d+),\s*(3[3-8]\.\d+)\]/g)).map(function (m) { return [+m[1], +m[2]]; });
      if (!pts.length) throw new Error("행정구역 경계를 받지 못했습니다(" + districtCode + "). 반경으로 해 보세요.");
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
    var N = cfg.radiusKm ? 6 : region.depth === 1 ? 16 : region.depth === 2 ? 10 : 8, jobs = [];
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
    if (!pnus.length) throw new Error("조건에 맞는 거래 필지가 없습니다. 기간·범위·유형·용도지역을 넓혀 보세요.");
    if (pnus.length > 150 && !confirm(pnus.length + "개 필지의 상세를 불러옵니다(약 " + Math.ceil(pnus.length / 120) + "분). 계속할까요?\n취소하고 반경을 줄이면 더 가까운 사례만 빨리 볼 수 있습니다."))
      throw new Error("취소했습니다 — 필지 " + pnus.length + "개. 반경이나 기간을 줄여 보세요.");
    var lots = [];
    for (var s = 0; s < pnus.length; s += 4) {
      if (V.stop) throw new Error("멈췄습니다.");
      msg("거래내역 읽는 중… " + Math.min(s + 4, pnus.length) + " / " + pnus.length + " 필지");
      var part = await Promise.all(pnus.slice(s, s + 4).map(async function (pn) { var l = await parseDetail(pn); l.official = await officialPrices(pn); return l; }));
      part.forEach(function (l) { var m = byPnu[l.pnu]; Object.assign(l, { lat: m.latitude, lng: m.longitude, distKm: m.distKm }); lots.push(l); });
      await sleep(150);
    }
    return {
      generatedAt: new Date().toISOString(), config: cfg, subject: subject, zoneCode: zoneCode,
      districtCode: cfg.radiusKm ? null : districtCode, regionName: cfg.radiusKm ? null : (region.full || null), bbox: bbox,
      meta: { tileCalls: calls, saturatedLeaves: saturated, lotCount: lots.length, center: [lat0, lng0],
        parseFailures: lots.filter(function (l) { return !l.ok; }).map(function (l) { return l.pnu; }),
        pagedHistories: lots.filter(function (l) { return l.historiesHasNext; }).map(function (l) { return l.pnu; }) },
      lots: lots
    };
  }

  // ── 표로 바꾸기 + 자동 판정(build_xlsx.py 와 같은 규칙)
  var short = function (a) { var p = (a || "").split(" "); return p.length > 2 ? p.slice(2).join(" ") : (a || ""); };
  function toRows(d) {
    var c = d.config, newer = !!c.ptList;          // 예전 결과(제외 유형 칸)는 예전 규칙 그대로
    var excl = newer ? [] : (c.excludeTypes || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    var tz = d.subject.zoneLabel, y1 = c.years[0], y2 = c.years[c.years.length - 1];
    var okZones = newer ? (c.znList || []).map(zoneLabel) : null;
    var catOf = function (t) {
      var pd = t.propertyTypeDetail || {};
      var hit = DETAIL2PT.find(function (x) { return x[0].test(pd.label || ""); });   // 글자 먼저('다가구' → 단독/다가구)
      return hit ? hit[1] : (CODE2PT[pd.code] || null);
    };
    var rows = [], seenKey = {};
    // 경매 낙찰 기록: 밸류맵은 실거래(TRADE)와 경매(AUCTION)를 따로 두지만, 거래내역에 낙찰가율·낙찰가·감정가가 붙은 기록이 섞여 오면 뺀다.
    //   t.rate 는 낙찰가율이 아니라 '직전 거래 대비 변동률'(±%)이다 — 쓰면 안 된다(2026-10-21 저장 결과 418건 중 140건에 있음, 경매 0건).
    var isAuction = function (t) {
      var bt = t.brokerageAgentType || {};
      return t.biddingRate != null || t.auctionSellPrice != null || t.auctionAppraisePrice != null ||
        /AUCTION|경매/.test([t.type, t.tradeType, t.dealType, t.tradeTypeLabel, bt.code, bt.label].filter(Boolean).join(" "));
    };
    V.aucOut = 0;
    d.lots.forEach(function (lot) {
      var nl = (lot.lands || []).length;
      (lot.histories || []).forEach(function (t) {
        var y = +t.tradeDate.slice(0, 4);
        if (y < y1 || y > y2) return;
        if (c.noAuction !== false && isAuction(t)) { V.aucOut++; return; }   // 경매 제외(기본)
        // 용도를 바꿔 되판 필지(예 2021 다가구 → 2024 근린)는 앞 거래 줄을 싣지 않는다 — 뒤 거래 비고에 '2021년 다가구 xx억원 거래 후 용도변경하여 매각'
        var next = (lot.histories || []).filter(function (x) { return x.tradeDate > t.tradeDate && !isAuction(x); })
          .sort(function (p, q) { return p.tradeDate < q.tradeDate ? -1 : 1; })[0];
        var ntyp = next && next.propertyTypeDetail ? next.propertyTypeDetail.label : "", ttyp = t.propertyTypeDetail ? t.propertyTypeDetail.label : "";
        if (ntyp && ttyp && ntyp !== ttyp && +next.tradeDate.slice(0, 4) <= y2) return;
        var key = lot.pnu + "|" + t.tradePrice, ms = Date.parse(t.tradeDate);
        var typ = t.propertyTypeDetail ? t.propertyTypeDetail.label : "", inc = true, notes = [];
        var twin = (seenKey[key] || []).filter(function (x) { return Math.abs(x - ms) <= 548 * 864e5; });
        if (twin.length) { inc = false; notes.push("같은 필지·같은 가격 거래가 1년 반 안에 또 있음 → 중복 신고 의심(맞으면 체크)"); }
        (seenKey[key] = seenKey[key] || []).push(ms);
        if (newer) {
          var cat = catOf(t);
          if (cat && c.ptList.indexOf(cat) < 0) { inc = false; notes.push("거래당시 유형 " + typ + "(" + typeLabel(cat) + ") → 고른 유형 아님"); }
          else if (!cat && typ) notes.push("거래당시 유형 " + typ + " — 유형 확인");
          if (okZones.length && lot.zoneLabel && okZones.indexOf(lot.zoneLabel) < 0) { inc = false; notes.push("현재 용도지역 " + lot.zoneLabel + " → 고른 용도지역 아님(확인 필요)"); }
        } else {
          if (excl.indexOf(typ) >= 0) { inc = false; notes.push("거래당시 유형 " + typ + " → 대상 유형 아님"); }
          if (tz && lot.zoneLabel && lot.zoneLabel !== tz) { inc = false; notes.push("현재 용도지역 " + lot.zoneLabel + "(대상지 " + tz + ") — 확인 필요"); }
        }
        // 같은 필지의 바로 앞 거래와 유형이 다르면(예 2021 다가구 → 2024 근린) 용도를 바꿔 되판 거래로 적는다(2026-10-22 사용자 요청)
        var prev = (lot.histories || []).filter(function (x) { return x.tradeDate < t.tradeDate && !isAuction(x); })
          .sort(function (p, q) { return p.tradeDate < q.tradeDate ? 1 : -1; })[0];
        var ptyp = prev && prev.propertyTypeDetail ? prev.propertyTypeDetail.label : "";
        if (ptyp && typ && ptyp !== typ) notes.unshift(prev.tradeDate.slice(0, 4) + "년 " + ptyp + " " + (Math.round(prev.tradePrice / 1e6) / 100).toLocaleString("ko-KR") + "억원 거래 후 " +
          (ptyp === "토지" ? "신축하여 매각" : "용도변경하여 매각" + ((lot.approvalDate || "").replace(/\./g, "-") > prev.tradeDate ? "(" + lot.approvalDate.slice(0, 7) + " 사용승인 — 신축)" : "")));   // 앞이 토지 = 신축, 그 사이 사용승인이면 덧붙임
        var ap = (lot.approvalDate || "").replace(/\./g, "-");
        if (ap && ap > t.tradeDate) notes.push("거래 후 신축 → 사용승인일은 신축건물 기준");
        if (t.tradePrice % 1000000) notes.push("거래가 끝자리 비정형 → 지분·특수거래 확인");
        if ((t.buildingPricePerPyeong || 0) >= 1e8) notes.push("연면적단가 1억/평 이상 → 토지가치 위주 거래");
        if (nl > 1) notes.push(nl + "필지 일괄거래 — 단가 직접비교 유의");
        if (t.annexedBuildings && t.annexedBuildings.length) notes.push("부속건물 포함");
        if (lot.historiesHasNext) notes.push("거래내역이 더 있음 — 상세페이지 확인");
        var key = lot.pnu + "|" + t.tradeDate + "|" + t.tradePrice; while (rows.some(function (x) { return x.key === key; })) key += "+";
        var ofr = offRatio(lot, t.tradePrice, t.landArea, t.tradeDate);
        rows.push({ key: key, offx: ofr ? ofr.x : null, offNow: ofr ? ofr.now : false, offYm: ofr && ofr.now ? lot.officialNowYm : "",
          date: t.tradeDate, jibun: short(lot.address) + (nl > 1 ? " 외 " + (nl - 1) + "필지" : ""), road: short(lot.roadAddress),
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
      appr: s.approvalDate || "", note: h ? "대상지 가장 최근 거래 내역" : "대상지 거래 이력 없음", pnu: s.pnu, lat: s.lat, lng: s.lng, dist: 0,
      offx: h && offRatio(s, h.tradePrice, h.landArea, h.tradeDate) ? offRatio(s, h.tradePrice, h.landArea, h.tradeDate).x : null,
      offNow: h && offRatio(s, h.tradePrice, h.landArea, h.tradeDate) ? offRatio(s, h.tradePrice, h.landArea, h.tradeDate).now : false, offYm: s.officialNowYm || "" };
  }
  function stats(rows) {
    var a = rows.filter(function (r) { return r.inc; }).map(unitLand).filter(function (v) { return v; });
    var b = rows.filter(function (r) { return r.inc; }).map(unitBldg).filter(function (v) { return v; });
    var f = function (x) { return x.length ? { n: x.length, avg: x.reduce(function (p, c) { return p + c; }, 0) / x.length, min: Math.min.apply(null, x), max: Math.max.apply(null, x) } : null; };
    return { land: f(a), bldg: f(b), n: rows.filter(function (r) { return r.inc; }).length };
  }
  // 비교사례 적용 시 대상지 추정가격(2026-10-22): 토지단가 × 대상지 대지(평), 연면적단가 × 대상지 연면적(평). 단위 백만원
  //   대상지 면적 = 상세의 '총 대지면적'·'총 연면적'(지금 기준), 없으면 가장 최근 거래의 면적
  function estimate(d, st) {
    var s = d.subject, h = (s.histories || [])[0] || {}, L2 = s.landM2 || h.landArea, B2 = s.bldgM2 || h.buildingTotalArea;
    var one = function (u, a) { return u && a ? { avg: u.avg * a * M2P / 100, min: u.min * a * M2P / 100, max: u.max * a * M2P / 100 } : null; };
    return { land: one(st.land, L2), bldg: one(st.bldg, B2) };
  }
  function estText(e) {
    var f = function (x) { return "<b>" + fmt(x.avg) + "백만원</b> (최소 " + fmt(x.min) + "백만원 ~ 최대 " + fmt(x.max) + "백만원)"; };
    return e.land || e.bldg ? "비교사례 적용 시 대상지 추정가격: " + [e.land ? "토지단가 기준 " + f(e.land) : "", e.bldg ? "연면적단가 기준 " + f(e.bldg) : ""].filter(Boolean).join(", ") : "";
  }
  function scopeText(d) {
    var c = d.config, z = d.subject.zoneLabel || "";
    return (c.radiusKm ? "대상지 반경 " + c.radiusKm + "km" : d.regionName ? d.regionName : "같은 법정동") + " · " + (c.useDistrictsLabel || (c.ptList ? "용도지역 전체" : z || "용도지역 전체")) + " · " + c.typeLabel + " · " + c.years[0] + "~" + c.years[c.years.length - 1] + " 실거래";
  }

  var HEAD = ["No", "포함", "거래일", "지번", "거래시 유형", "용도지역", "실거래가(억)", "대지(평)", "연면적(평)", "토지단가(만원/평)", "연면적단가(만원/평)", "사용승인일", "공시지가대비", "거리(km)", "비고"];
  // 정렬할 수 있는 열(HEAD 순번 → 값). 같은 열을 다시 누르면 오름차순 ↔ 내림차순
  var SORT = { 1: function (r) { return r.inc ? 1 : 0; }, 2: function (r) { return r.date; }, 6: function (r) { return r.price; }, 7: function (r) { return r.land; }, 8: function (r) { return r.bldg; },
    9: function (r) { return unitLand(r); }, 10: function (r) { return unitBldg(r); }, 11: function (r) { return (r.appr || "").replace(/\D/g, ""); },
    12: function (r) { return r.offx; }, 13: function (r) { return r.dist; } };
  function cells(r) {
    return [r.no, r.no === "대상" ? "-" : (r.inc ? "Y" : "N"), r.date, r.jibun, r.typ, r.zone, r.price ? fmt(r.price / 1e8, 2) : "",
      r.land ? fmt(r.land * M2P, 1) : "", r.bldg ? fmt(r.bldg * M2P, 1) : "", fmt(unitLand(r)), fmt(unitBldg(r)), r.appr,
      r.offx ? "x" + fmt(r.offx, 1) : "", r.dist != null ? fmt(r.dist, 2) : "", r.note];
  }

  // 표 맨 아래 평균·최대·최소(2026-10-22): 포함(Y)한 거래만, 값이 숫자인 열만(실거래가·대지·연면적·토지단가·연면적단가·공시지가대비·거리)
  var FOOTV = { 6: [function (r) { return r.price ? r.price / 1e8 : null; }, 2], 7: [function (r) { return r.land ? r.land * M2P : null; }, 1], 8: [function (r) { return r.bldg ? r.bldg * M2P : null; }, 1],
    9: [unitLand, 0], 10: [unitBldg, 0], 12: [function (r) { return r.offx; }, 1, "x"], 13: [function (r) { return r.dist; }, 2] };
  function footRows(rows) {
    var inc = rows.filter(function (r) { return r.inc; });
    return [["평균", "avg"], ["최대", "max"], ["최소", "min"]].map(function (k) {
      return HEAD.map(function (h, i) {
        if (i === 0) return k[0] + (k[1] === "avg" ? "(포함 " + inc.length + "건)" : "");
        var f = FOOTV[i]; if (!f) return "";
        var v = inc.map(f[0]).filter(function (x) { return x != null && isFinite(x); }); if (!v.length) return "";
        var x = k[1] === "avg" ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : k[1] === "max" ? Math.max.apply(null, v) : Math.min.apply(null, v);
        return (f[2] || "") + fmt(x, f[1]);
      });
    });
  }
  function render() {
    var d = V.data; if (!d) return;
    var rows = V.rows, st = stats(rows), sr = subjRow(d), su = unitLand(sr);
    var sum = $(".sum"); sum.hidden = false;
    sum.innerHTML = "<b>" + esc(sr.jibun) + "</b> (" + esc(sr.zone) + ", " + esc(d.subject.propertyTypeLabel || "") + ") · " + esc(scopeText(d)) + "<br>" +
      "전체 " + rows.length + "건 중 비교사례 <b>" + st.n + "건</b>" +
      (st.land ? " · 토지단가 평균 <b>" + fmt(st.land.avg) + "</b> (최소 " + fmt(st.land.min) + " ~ 최대 " + fmt(st.land.max) + ") 만원/평" : "") +
      (st.bldg ? " · 연면적단가 평균 <b>" + fmt(st.bldg.avg) + "</b> (최소 " + fmt(st.bldg.min) + " ~ 최대 " + fmt(st.bldg.max) + ") 만원/평" : "") +
      (estText(estimate(d, st)) ? "<br>" + estText(estimate(d, st)) : "") +
      (rows.some(function (r) { return r.offx; }) ? "<br>* 공시지가대비 = 거래 당시 공시지가 대비 토지단가 배수" : "") +
      (d.meta.parseFailures.length ? "<br>상세를 못 읽은 필지 " + d.meta.parseFailures.length + "개 — 다시 수집하거나 직접 확인" : "");
    var link = function (r) { return '<a href="/properties/trades/' + r.pnu + '" target="_blank" rel="noopener">' + esc(r.jibun) + "</a>"; };
    var tr = function (r, cls) {
      var c = cells(r), subj = r.no === "대상";
      if (subj ? V.hlSubj : r.hl) cls += " hl";
      return '<tr class="' + cls + '"' + (subj ? "" : ' data-i="' + (r.no - 1) + '"') + "><td>" + (subj ? "" : '<span class="gr" title="끌어서 순서 바꾸기">⠿</span>') + esc(c[0]) + "</td><td>" +
        (subj ? "-" : '<input type="checkbox" data-i="' + (r.no - 1) + '"' + (r.inc ? " checked" : "") + ">") +
        "</td><td>" + esc(c[2]) + "</td><td>" + link(r) + "</td>" + c.slice(4, 14).map(function (v, k) { return "<td" + (k >= 2 && k <= 6 || k >= 8 ? ' class="n"' : "") + ">" + esc(v) + "</td>"; }).join("") +
        '<td class="note">' + esc(c[14]) + "</td></tr>";
    };
    var tw = $(".tw"); tw.hidden = false;
    var srt = V.sort || {};
    tw.innerHTML = "<table><thead><tr>" + HEAD.map(function (h, k) {
      var btn = SORT[k] ? '<button class="so' + (srt.k === k ? " on" : "") + '" data-so="' + k + '" title="오름차순·내림차순">' + (srt.k === k ? (srt.dir > 0 ? "▲" : "▼") : "↕") + "</button>" : "";
      return "<th" + (k >= 6 && k <= 13 && k !== 11 ? ' class="n"' : "") + ">" + (h === "공시지가대비" ? h + "<sup>*</sup>" : h) + btn + "</th>"; }).join("") + "</tr></thead><tbody>" +
      tr(sr, "subj") + rows.map(function (r) { return tr(r, r.inc ? "" : "out"); }).join("") + "</tbody><tfoot>" +
      footRows(rows).map(function (c) { return '<tr><td colspan="6">' + esc(c[0]) + "</td>" + c.slice(6, 14).map(function (v) { return '<td class="n">' + esc(v) + "</td>"; }).join("") + "<td></td></tr>"; }).join("") + "</tfoot></table>";
    tw.querySelectorAll("input[type=checkbox]").forEach(function (cb) {
      cb.onchange = function () { V.rows[+cb.dataset.i].inc = cb.checked; save(); render(); };
    });
    // 줄 누르면 연한 노란색 표시(읽기 편하게, 2026-10-22) — 다시 누르면 지움. 체크 칸·지번 링크·⠿ 를 누를 때는 그대로
    tw.querySelector("tbody").addEventListener("click", function (e) {
      if (e.target.closest("input,a,.gr")) return;
      var tr = e.target.closest("tr"); if (!tr) return;
      var on = !tr.classList.contains("hl"); tr.classList.toggle("hl", on);
      if (tr.dataset.i != null) V.rows[+tr.dataset.i].hl = on; else V.hlSubj = on;
    });
    // 정렬: 값이 없는 행은 늘 아래로
    tw.querySelectorAll("button.so").forEach(function (b) {
      b.onclick = function () {
        var k = +b.dataset.so, dir = V.sort && V.sort.k === k ? -V.sort.dir : 1, f = SORT[k];
        V.sort = { k: k, dir: dir };
        V.rows.sort(function (a, c) { var x = f(a), y = f(c), ex = x == null || x === "", ey = y == null || y === ""; if (ex || ey) return ex - ey; return (x > y ? 1 : x < y ? -1 : 0) * dir; });
        renumber(); save(); render();
      };
    });
    // 끌어다 놓기: ⠿ 를 잡고 다른 행 위(위쪽 반 = 그 앞, 아래쪽 반 = 그 뒤)에 놓는다. 대상지 줄은 늘 맨 위.
    //   놓기는 표 전체(tbody)에서 받는다 — 표 칸이 스스로 스크롤되며 놓는 순간 마우스 아래가 행이 아니면 drop 이 취소됐다(2026-10-22 실측)
    var drag = null, tgt = null, unmark = function () { tw.querySelectorAll(".dra,.drb").forEach(function (x) { x.classList.remove("dra", "drb"); }); };
    var tb = tw.querySelector("tbody");
    tw.querySelectorAll("tbody tr[data-i]").forEach(function (row) {
      row.querySelector(".gr").addEventListener("mousedown", function () { row.draggable = true; });
      row.addEventListener("dragstart", function (e) { drag = +row.dataset.i; tgt = null; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(drag)); });
      row.addEventListener("dragend", function () { drag = null; row.draggable = false; unmark(); });
    });
    tb.addEventListener("dragover", function (e) {
      if (drag == null) return; e.preventDefault();
      var row = e.target.closest && e.target.closest("tr[data-i]"); if (!row) return;
      var b = row.getBoundingClientRect(); unmark(); tgt = { i: +row.dataset.i, after: e.clientY > b.top + b.height / 2 };
      row.classList.add(tgt.after ? "dra" : "drb");
    });
    tb.addEventListener("drop", function (e) {
      if (drag == null) return; e.preventDefault();
      var from = drag; drag = null; unmark(); if (!tgt) return;
      var to = tgt.i + (tgt.after ? 1 : 0); if (to > from) to--; if (to === from) return;
      var it = V.rows.splice(from, 1)[0]; V.rows.splice(to, 0, it); V.sort = null; renumber(); save(); render();
    });
    vmMapMark();
    P.querySelectorAll('[data-a="copy"],[data-a="csv"],[data-a="map"],[data-a="maps"],[data-a="json"]').forEach(function (b) { b.disabled = false; });
    $('[data-a="map"]').classList.add("hl");          // 결과가 생기면 '지도 열기'를 테라코타로 눈에 띄게
  }
  // 조건 칸 접기(2026-10-22): 노트북 화면에서 표가 2줄만 보여서, 결과가 있으면 조건을 한 줄 요약으로 접는다
  function cfgFold(fold) {
    $(".cfg").hidden = fold; $(".cfgbar").hidden = !V.data;          // 결과가 있으면 이 줄은 늘 보인다(펴도 다시 접을 수 있게)
    if (V.data) $(".cfgsum").textContent = "조건: " + V.data.config.address + " · " + scopeText(V.data);
    $('[data-a="cfg"]').textContent = fold ? "조건 펴기 ▾" : "조건 접기 ▴";
  }
  function renumber() { V.rows.forEach(function (r, i) { r.no = i + 1; }); }
  // 순서(정렬·끌기)와 포함 체크를 거래 고유 키로 저장한다(다시 열어도 그대로)
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ data: V.data, order: V.rows.map(function (r) { return r.key; }),
    incBy: V.rows.reduce(function (o, r) { o[r.key] = r.inc; return o; }, {}), sort: V.sort || null, onlyInc: !!V.onlyInc })); } catch (e) {} }
  // ── 밸류맵 지도 위 표시(2026-10-22): 지도 표시는 div.naver-maps-marker[data-pnu] 라서 CSS 로 고른다(지도를 움직여도 그대로).
  //   포함한 거래의 필지 = 테라코타 테두리, '밸류맵 지도에 포함 거래만'을 켜면 나머지 필지 표시는 숨긴다(대상지는 늘 보임). 창을 닫으면 원래대로.
  function vmMapMark() {
    var el = document.getElementById("vmcMapMark") || document.head.appendChild(Object.assign(document.createElement("style"), { id: "vmcMapMark" }));
    if (!V.data || P.style.display === "none") { el.textContent = ""; return; }
    var inc = V.rows.filter(function (r) { return r.inc; }).map(function (r) { return r.pnu; }).filter(function (x, i, a) { return a.indexOf(x) === i; });
    var sel = function (pn, tail) { return '.naver-maps-marker[data-pnu="' + pn + '"]' + (tail || ""); };
    var css = inc.length ? inc.map(function (pn) { return sel(pn, " > div"); }).join(",") + "{outline:3px solid #D9653B;outline-offset:2px;border-radius:10px;box-shadow:0 0 0 6px rgba(217,101,59,.25)}" : "";
    css += sel(V.data.subject.pnu, " > div") + "{outline:3px dashed #1d2433;outline-offset:2px;border-radius:10px}";
    if (V.onlyInc) css += ".naver-maps-marker[data-pnu]{display:none!important}" + inc.concat([V.data.subject.pnu]).map(function (pn) { return sel(pn); }).join(",") + "{display:block!important}";
    el.textContent = css;
  }

  // ── 내보내기
  function table2d() { return [HEAD].concat([subjRow(V.data)].concat(V.rows).map(cells)); }
  function download(name, text, type) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  function baseName() { var d = V.data; return ("밸류맵_" + short(d.subject.address) + "_" + d.config.years[0] + "-" + d.config.years[d.config.years.length - 1]).replace(/[\\/:*?"<>|\s]+/g, "_"); }
  // ── '지도 열기' 화면: 위 지도(일반/위성/지적편집도, 배경 투명도, 번호 색, 크게 보기) + 아래 표(표 복사)
  //   지도 화면 코드는 mapPage 함수 그대로 새 문서에 넣는다(문자열로 잇지 않아 고치기 쉽다). 번호 색 기본 테라코타 주황 #D9653B(2026-10-20).
  function mapPage(P, R, TSV) {
    var C = "#D9653B";
    try { var sc = localStorage.getItem("vmMapPinColor"); if (sc && sc.toLowerCase() !== "#fd5108") C = sc; } catch (e) {}   // 예전 기본색은 새 기본으로
    var crs = new L.Proj.CRS("EPSG:5181", "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=500000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
      { resolutions: [2048, 1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1, 0.5, 0.25], origin: [-30000, -60000],
        bounds: L.bounds([-30000 - Math.pow(2, 19) * 4, -60000], [-30000 + Math.pow(2, 19) * 5, -60000 + Math.pow(2, 19) * 5]) });
    var K = function (u) { return L.tileLayer(u, { minZoom: 3, maxZoom: 13, zoomReverse: true, zoomOffset: 1, tms: true, continuousWorld: true, attribution: "지도 &copy; Kakao · 자료 밸류맵" }); };
    var T = "https://mts.kakaocdn.net/api/v1/tile/";
    var B = [[K(T + "PNG02/v26_blse3/latest/{z}/{y}/{x}.png")],
      [K("https://map.kakaocdn.net/map_skyview_hd/L{z}/{y}/{x}.jpg?v=160107"), K(T + "PNG_SKYH02/v24_kikr3/latest/{z}/{y}/{x}.png")],
      [K(T + "PNG02/v26_blse3/latest/{z}/{y}/{x}.png"), K(T + "PNG_CAD02/v22_53657/latest/{z}/{y}/{x}.png")]];
    var m = L.map("map", { crs: crs }), cur = [], op = 1;
    function base(i) { cur.forEach(function (l) { m.removeLayer(l); }); cur = B[i]; cur.forEach(function (l, k) { l.addTo(m); l.setZIndex(k + 1); l.setOpacity(op); }); }
    base(0);
    document.querySelectorAll(".lay button[data-l]").forEach(function (b) {
      b.onclick = function () { base(+b.dataset.l); document.querySelectorAll(".lay button[data-l]").forEach(function (x) { x.classList.toggle("on", x === b); }); };
    });
    // 배경 투명도: 0% = 진하게, 90% = 거의 안 보이게(번호만 또렷이)
    var tr = document.getElementById("tr"), tro = document.getElementById("tro");
    tr.oninput = function () { op = 1 - tr.value / 100; tro.textContent = tr.value + "%"; cur.forEach(function (l) { l.setOpacity(op); }); };
    // 번호 색(채운 동그라미 = 비교사례, 속 빈 동그라미 = 뺀 거래, ★ = 대상지)
    var layer = L.layerGroup().addTo(m), g = [], onlyInc = false;
    function draw() {
      layer.clearLayers(); g = [];
      P.forEach(function (p) {
        if (onlyInc && p.inc === false) return;
        var s = p.inc === null, sz = s ? 28 : 24;
        var bg = s ? "#1d2433" : (p.inc ? C : "#fff"), fg = s ? "#ffd60a" : (p.inc ? "#fff" : C), bd = s ? "#fff" : C;
        var ic = L.divIcon({ className: "", iconSize: [sz, sz], html: '<div class="pin" style="width:' + sz + "px;height:" + sz + "px;line-height:" + (sz - 4) + "px;background:" + bg + ";color:" + fg + ";border-color:" + bd + '">' + (s ? "★" : p.no) + "</div>" });
        L.marker([p.lat, p.lng], { icon: ic, zIndexOffset: s ? 1000 : 0 }).addTo(layer)
          .bindPopup("<b>" + p.t[0] + ". " + p.t[3] + "</b><br>" + p.t[2] + " · " + p.t[4] + "<br>" + p.t[6] + "억 · 토지 " + p.t[9] + "만원/평 · 연면적 " + p.t[10] + "만원/평" + (p.t[12] ? " · 공시지가대비 " + p.t[12] : "") + (p.t[14] ? '<br><span style="color:#b45309">' + p.t[14] + "</span>" : ""));
        g.push([p.lat, p.lng]);
      });
      document.querySelectorAll("td.no").forEach(function (td) { td.style.color = td.parentNode.classList.contains("out") ? "" : C; });
    }
    var col = document.getElementById("col"); col.value = C;
    col.oninput = function () { C = col.value; try { localStorage.setItem("vmMapPinColor", C); } catch (e) {} draw(); };
    document.getElementById("col0").onclick = function () { col.value = "#D9653B"; col.oninput(); };
    draw();
    // 포함만 보기: 뺀 거래(N)의 번호·표 줄을 숨긴다. 다시 누르면 전부
    var oib = document.getElementById("oinc");
    oib.onclick = function () {
      onlyInc = !onlyInc; oib.classList.toggle("on", onlyInc); oib.textContent = onlyInc ? "전부 보기" : "포함만 보기";
      document.querySelectorAll("tbody tr.out").forEach(function (tr) { tr.style.display = onlyInc ? "none" : ""; });
      draw(); if (g.length > 1) m.fitBounds(g, { padding: [30, 30] });
    };
    if (R && P.length) L.circle([P[0].lat, P[0].lng], { radius: R * 1000, color: "#e5383b", weight: 1.5, dashArray: "6 6", fill: false }).addTo(m);
    if (g.length > 1) m.fitBounds(g, { padding: [30, 30] }); else if (g.length) m.setView(g[0], 11); else m.setView([37.5665, 126.978], 7);   // 좌표가 없어도 빈 화면이 되지 않게
    // 지도 크게 보기(전체 화면). 막힌 곳에선 창을 꽉 채운다
    var box = document.getElementById("mapbox"), fsb = document.getElementById("fs");
    function fsOn() { return document.fullscreenElement === box || box.classList.contains("big"); }
    function sync() { fsb.textContent = fsOn() ? "✕ 작게 보기" : "⛶ 지도 크게 보기"; setTimeout(function () { m.invalidateSize(); }, 120); }
    fsb.onclick = function () {
      if (fsOn()) { if (document.fullscreenElement) document.exitFullscreen(); else box.classList.remove("big"); }
      else if (box.requestFullscreen) box.requestFullscreen().catch(function () { box.classList.add("big"); sync(); });
      else box.classList.add("big");
      sync();
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && box.classList.contains("big")) { box.classList.remove("big"); sync(); } });
    // 표 복사(엑셀에 붙여넣기)
    document.getElementById("cp").onclick = function () {
      var b = this, done = function () { b.textContent = "복사했습니다 ✓"; setTimeout(function () { b.textContent = "표 복사"; }, 1500); };
      var old = function () { var t = document.createElement("textarea"); t.value = TSV; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); done(); };
      if (navigator.clipboard) navigator.clipboard.writeText(TSV).then(done, old); else old();
    };
  }
  function tsvOf(t) { return t.map(function (r) { return r.map(function (v) { return String(v == null ? "" : v).replace(/[\t\n]/g, " "); }).join("\t"); }).join("\n"); }
  function rangeText(s) { return s ? "평균 " + fmt(s.avg) + "만원/평(" + fmt(s.min) + "~" + fmt(s.max) + ")" : "—"; }
  function mapHtml() {
    var d = V.data, sr = subjRow(d), st = stats(V.rows);
    var pts = [sr].concat(V.rows).filter(function (r) { return r.lat && r.lng; }).map(function (r) {
      return { no: r.no, inc: r.no === "대상" ? null : r.inc, lat: r.lat, lng: r.lng, t: cells(r) };
    });
    var body = table2d(), foot = footRows(V.rows);
    var J = function (v) { return JSON.stringify(v).replace(/</g, "\\u003c"); };
    return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(sr.jibun) + " 실거래 비교사례</title>" +
      '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">' +
      ["leaflet/1.9.4/leaflet.min.js", "proj4js/2.11.0/proj4.min.js", "proj4leaflet/1.0.2/proj4leaflet.min.js"].map(function (u) { return '<script src="https://cdnjs.cloudflare.com/ajax/libs/' + u + '"></scr' + 'ipt>'; }).join("") +
      '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap">' + "<style>body{margin:0;font:13px/1.5 'Noto Sans KR','Malgun Gothic',sans-serif;color:#1d2433;background:#f6f7f9}header{padding:14px 18px;background:#fff;border-bottom:1px solid #e4e7ec}h1{font-size:18px;margin:0 0 4px}" +
      ".kpi{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:6px}.kpi b{color:#A04626}.est{margin-top:4px}.est b{color:#A04626}" +
      "#mapbox{position:relative;height:58vh;background:#fff}#mapbox.big{position:fixed;inset:0;height:auto;z-index:9999}#mapbox:fullscreen{height:100vh}#map{position:absolute;inset:0}" +
      ".wrap{padding:12px 18px}.tbar{display:flex;align-items:center;gap:8px;margin-bottom:6px}.tbar b{flex:1;font-size:14px}" +
      "button{font:inherit;cursor:pointer}.btn{border:1px solid #d0d5dd;background:#fff;border-radius:6px;padding:4px 10px}.btn:hover{background:#f2f4f7}" +
      "table{border-collapse:collapse;width:100%;background:#fff;font-size:12px}th,td{border:1px solid #e4e7ec;padding:4px 6px;white-space:nowrap}th{background:#f2f4f7}td.no{font-weight:700}" +
      "td.note{white-space:normal}tr.subj td{background:#fff7d6}tr.out td{color:#98a2b3}tfoot td{font-weight:700;background:#f6f7f9}.pin{border-radius:50%;font-weight:700;font-size:11px;text-align:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);box-sizing:border-box}" +
      ".lay{position:absolute;z-index:1000;top:10px;right:10px;display:flex;flex-direction:column;gap:6px;align-items:flex-end}.lay>div{background:#fff;border-radius:6px;padding:4px 6px;box-shadow:0 1px 4px rgba(0,0,0,.3);display:flex;align-items:center;gap:6px}" +
      ".lay button[data-l]{border:0;background:#fff;padding:4px 8px;border-radius:4px}.lay button.on{background:#D9653B;color:#fff}#oinc.on{background:#D9653B;color:#fff}.lay input[type=range]{width:110px;accent-color:#D9653B}" +
      ".lay input[type=color]{width:28px;height:22px;padding:0;border:1px solid #d0d5dd;border-radius:4px;background:#fff}.lay .lk{border:0;background:none;color:#667085;text-decoration:underline;font-size:12px;padding:0}</style></head><body>" +
      "<header><h1>" + esc(sr.jibun) + " 주변 실거래 비교사례</h1><div>" + esc(scopeText(d)) + " · 출처 밸류맵(valueupmap.com) " + d.generatedAt.slice(0, 10) + " 조회</div>" +
      '<div class="kpi"><span>비교사례 <b>' + st.n + "건</b></span><span>토지단가 <b>" + rangeText(st.land) + "</b></span><span>연면적단가 <b>" + rangeText(st.bldg) + "</b></span></div>" + (estText(estimate(d, st)) ? '<div class="est">' + estText(estimate(d, st)) + "</div>" : "") + "</header>" +
      '<div id="mapbox"><div id="map"></div><div class="lay">' +
      '<div><button class="on" data-l="0">일반</button><button data-l="1">위성</button><button data-l="2">지적편집도</button></div>' +
      '<div>배경 투명도 <input id="tr" type="range" min="0" max="90" step="5" value="0"><span id="tro">0%</span></div>' +
      '<div>번호 색 <input id="col" type="color" value="#D9653B" title="동그라미 번호 색"><button id="col0" class="lk" title="기본색으로">기본색</button></div>' +
      '<div><button id="oinc" class="btn" style="border:0" title="포함(Y)으로 체크한 거래와 대상지만 지도·표에 보이기">포함만 보기</button><button id="fs" class="btn" style="border:0">⛶ 지도 크게 보기</button></div></div></div>' +
      '<div class="wrap"><div class="tbar"><b>비교사례 표</b><button id="cp" class="btn">표 복사</button></div><table><thead><tr>' + body[0].map(function (h) { return "<th>" + (h === "공시지가대비" ? esc(h) + "<sup>*</sup>" : esc(h)) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      body.slice(1).map(function (c, i) { return '<tr class="' + (i === 0 ? "subj" : (c[1] === "N" ? "out" : "")) + '">' + c.map(function (v, k) { return "<td" + (k === 14 ? ' class="note"' : k === 0 ? ' class="no"' : "") + ">" + esc(v) + "</td>"; }).join("") + "</tr>"; }).join("") +
      "</tbody><tfoot>" + foot.map(function (c) { return "<tr>" + c.map(function (v) { return "<td>" + esc(v) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tfoot></table><p style=\"color:#667085\">* 공시지가대비 = 거래 당시 공시지가 대비 토지단가 배수. 채운 동그라미 = 비교사례, 속 빈 동그라미 = 뺀 거래, ★ = 대상지. 단가는 실거래가 ÷ (면적㎡ × 0.3025). 표 복사는 엑셀에 그대로 붙습니다.</p></div><script>" +
      "(" + mapPage.toString().replace(/<\//g, "<\\/") + ")(" + J(pts) + "," + (d.config.radiusKm || 0) + "," + J(tsvOf(body.concat(foot))) + ");</scr" + "ipt></body></html>";
  }


  P.addEventListener("click", async function (e) {
    var b = e.target.closest("button"); if (!b) return;
    var a = b.dataset.a;
    if (a === "min") P.classList.toggle("min");
    else if (a === "close") { P.style.display = "none"; vmMapMark(); if ($('[data-k="mapbig"]').checked) { $('[data-k="mapbig"]').checked = false; vmMapBig(false); } }
    else if (a === "stop") { V.stop = true; msg("멈추는 중…"); }
    else if (a === "cfg") cfgFold(!$(".cfg").hidden);
    else if (a === "run") {
      var addr = $(".addr").value.trim(); if (!addr) { msg("대상 주소를 넣어 주세요."); return; }
      var y1 = +$('[data-k="y1"]').value, y2 = +$('[data-k="y2"]').value;
      if (!(y1 >= 2006 && y2 >= y1 && y2 <= thisYear + 1)) { msg("기간을 확인해 주세요."); return; }
      var years = []; for (var y = y1; y <= y2; y++) years.push(y);
      var types = picked("pt"), zones = picked("zn");
      if (!types.length) { msg("유형을 하나 이상 고르세요."); return; }
      if (!zones.length) { msg("용도지역을 하나 이상 고르세요('대상지와 같게' 포함)."); return; }
      if (!V.cands.length || V.candFor !== addr) await findCands(addr);
      var cand = V.cands[+$(".cand").value || 0];
      if (!cand) { msg("주소를 찾지 못했습니다: " + addr); return; }
      var radius = P.querySelector('input[name="vmcsc"]:checked').value === "radius" ? +$(".km").value : 0;
      var ro = $(".rg").options[$(".rg").selectedIndex];
      var region = !radius && ro && ro.value ? { code: ro.value, depth: +ro.dataset.depth, full: ro.dataset.full } : null;
      var cfg = { address: addr, cand: cand, years: years, types: types, zones: zones, region: region, radiusKm: radius || null, noAuction: $('[data-k="noauc"]').checked };
      V.stop = false; b.disabled = true; $('[data-a="stop"]').disabled = false;
      try {
        V.data = await collect(cfg); V.rows = toRows(V.data); save(); render(); cfgFold(true);
        if (V.aucOut) setTimeout(function () { msg($(".msg").textContent + " (경매 낙찰 " + V.aucOut + "건은 '경매 제외'로 뺐습니다.)"); }, 0);
        msg(V.data.meta.saturatedLeaves ? "주의: 거래가 아주 촘촘한 곳이 있어 일부가 빠졌을 수 있습니다. 반경을 줄여 다시 해 보세요." : "다 모았습니다. 필지 " + V.data.meta.lotCount + "개, 거래 " + V.rows.length + "건.");
      } catch (err) { msg(err.message || String(err)); }
      b.disabled = false; $('[data-a="stop"]').disabled = true;
    }
    else if (a === "copy") {
      var tsv = tsvOf(table2d().concat(footRows(V.rows)));
      try { await navigator.clipboard.writeText(tsv); msg("표를 복사했습니다. 엑셀에 붙여 넣으세요."); } catch (err) { msg("복사가 막혔습니다. 엑셀(CSV) 저장을 쓰세요."); }
    }
    else if (a === "csv") {
      var csv = table2d().concat(footRows(V.rows)).map(function (r) { return r.map(function (v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }).join("\r\n");
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
      if (last.order) {
        var pos = {}; last.order.forEach(function (k, i) { pos[k] = i; });
        V.rows.sort(function (a, b) { return (pos[a.key] == null ? 1e9 : pos[a.key]) - (pos[b.key] == null ? 1e9 : pos[b.key]); });
        V.rows.forEach(function (r) { if (last.incBy && r.key in last.incBy) r.inc = last.incBy[r.key]; });
        renumber(); V.sort = last.sort || null; V.onlyInc = !!last.onlyInc; $('[data-k="onlyinc"]').checked = V.onlyInc;
      } else (last.inc || []).forEach(function (v, i) { if (V.rows[i]) V.rows[i].inc = v; });
      $(".addr").value = V.data.config.address; render(); V.candFor = null;
      findCands(V.data.config.address);
      cfgFold(true);
      msg("지난번 결과(" + V.data.generatedAt.slice(0, 10) + ")입니다. 새로 하려면 조건을 고치고 수집 시작.");
    }
  } catch (e) {}
})();

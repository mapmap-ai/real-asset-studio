// 토지이음 지도(eum.go.kr/web/mp/mpMapDet.jsp) 위에 '여러 필지 선택' 패널을 얹는다. 북마클릿으로 실행.
// 페이지 안의 전역(map=OpenLayers 3.20 지도, server=경계 서버, mapObj.version, context, jQuery)을 그대로 쓴다.
// 경계: server/MapPlan?req=search&layer=FA&code=<PNU19> (또는 mbr=x,y,x,y), EPSG:5179 GeoJSON — 토지이음이 쓰는 그 경계.
// 지번 검색: /web/mp/mpMapDetGisAjaxXml.jsp sId=selectGisAddrList → jibunBonBuList(XML 문자열) 안의 pnu.
// 지목·면적·용도지역: /web/ar/lu/luLandDet.jsp (EUC-KR), 공시지가: luLandDetYearAjax.jsp 마지막 행.
(function () {
  if (!/eum\.go\.kr$/.test(location.hostname) || typeof map === "undefined" || typeof ol === "undefined" || !window.server) {
    alert("토지이음 지도 화면(www.eum.go.kr/web/mp/mpMapDet.jsp)에서 눌러 주세요.");
    return;
  }
  if (window.__EUM_MULTI) { window.__EUM_MULTI.show(); return; }

  var KEY = "eumMultiParcels";
  var E = window.__EUM_MULTI = { list: [], pick: false, sel: null, gen: 0 };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var fmt = function (v, d) { return v == null || v === "" || isNaN(v) ? "" : Number(v).toLocaleString("ko-KR", { maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 }); };

  // ── 필지 색: 기본 테라코타 주황(#D9653B, 2026-10-20 사용자 선택 — 그 전 기본 #FD5108 로 기억된 색은 새 기본으로 옮김). 패널의 '필지 색'으로 바꾸고 브라우저에 기억한다.
  var DEF_COLOR = "#D9653B";
  E.color = DEF_COLOR;
  try { var sc = localStorage.getItem(KEY + "Color"); if (/^#[0-9a-f]{6}$/i.test(sc || "") && sc.toLowerCase() !== "#fd5108") E.color = sc; } catch (e) {}
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function rgba(hex, a) { return "rgba(" + rgb(hex).join(",") + "," + a + ")"; }
  function shade(hex, k) {   // k<1 이면 어둡게 (고른 필지 테두리·이름표 글자)
    return "#" + rgb(hex).map(function (c) { return ("0" + Math.round(c * k).toString(16)).slice(-2); }).join("");
  }

  // ── 지도 위 그림층
  var src = new ol.source.Vector();
  var layer = new ol.layer.Vector({
    source: src,
    style: function (f) {
      var on = f.get("pnu") === E.sel, g = f.getGeometry();
      var pt = g.getType() === "MultiPolygon" ? g.getInteriorPoints() : g.getInteriorPoint();
      return [
        new ol.style.Style({
          stroke: new ol.style.Stroke({ color: on ? shade(E.color, .7) : E.color, width: on ? 4 : 2.5 }),
          fill: new ol.style.Fill({ color: on ? "rgba(255,214,10,.45)" : rgba(E.color, .25) })
        }),
        new ol.style.Style({
          geometry: pt,
          text: new ol.style.Text({
            text: f.get("label"), font: "bold 13px 'Noto Sans KR','Malgun Gothic',sans-serif",
            fill: new ol.style.Fill({ color: shade(E.color, .45) }), stroke: new ol.style.Stroke({ color: "#fff", width: 4 })
          })
        })
      ];
    }
  });
  layer.set("name", "eumMultiParcel");
  layer.setZIndex(9999);
  map.addLayer(layer);
  // 토지이음이 다른 화면으로 바꾸며 층을 지우면 다시 붙인다
  setInterval(function () { if (map.getLayers().getArray().indexOf(layer) < 0) { map.addLayer(layer); layer.setZIndex(9999); } }, 1500);

  // ── 배경지도: 토지이음 도면 아래에 위성/일반지도를 깔고 도면층(ol.layer.Tile)을 흐리게 한다.
  // 카카오 타일은 EPSG:5181 이라 OL 래스터 재투영으로 5179 에 맞춘다. CORS 헤더가 없어 캔버스가 오염된다
  // → 토지이음 '저장'(canvas.toBlob)이 막히고, 새로고침 전까지 풀리지 않는다. (Esri 위성은 2026-10-19 사용자 요청으로 뺐다.)
  proj4.defs("EPSG:5181", "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=500000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
  ol.proj.get("EPSG:5181").setExtent([-30000 - 524288 * 4, -60000, -30000 + 524288 * 5, -60000 + 524288 * 5]);
  var kgrid = new ol.tilegrid.TileGrid({ origin: [-30000, -60000], resolutions: [2048, 1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1, 0.5, 0.25], tileSize: 256 });
  var kakao = function (tpl) {   // 카카오 레벨 = 14 - OL z, y 는 아래→위(OL3 와 같은 방향)
    // 카카오 조각은 512×512(2배 해상도, 2026-10-22 확인) → tilePixelRatio 2. 빼면 256 으로 줄였다가 좌표계를 바꾸며 흐려진다
    return new ol.layer.Tile({ source: new ol.source.TileImage({ projection: "EPSG:5181", tileGrid: kgrid, tilePixelRatio: 2, reprojectionErrorThreshold: 0.25,
      tileUrlFunction: function (tc) { return tpl.replace("{z}", 14 - tc[0]).replace("{x}", tc[1]).replace("{y}", tc[2]); } }) });
  };
  var MTS = "https://mts.kakaocdn.net/api/v1/tile/";
  var BG = {
    none: [],
    ksky: [kakao("https://map.kakaocdn.net/map_skyview_hd/L{z}/{y}/{x}.jpg?v=160107"), kakao(MTS + "PNG_SKYH02/v24_kikr3/latest/{z}/{y}/{x}.png")],
    kmap: [kakao(MTS + "PNG02/v26_blse3/latest/{z}/{y}/{x}.png")]
  };
  var bgAll = [].concat(BG.ksky, BG.kmap);
  // 카카오 배경(2026-10-21 사용자 요청): 토지이음 도면·이음지도 바탕을 모두 감추고 칠한 필지만 카카오 위에. 막대는 '배경 투명도'(카카오를 흐리게).
  //   토지이음 도면만: 지금처럼 '도면 진하기'. 지도 바탕 칸(viewport) 을 흰색으로 덮어 그 아래 이음지도(네이버 지도 iframe)도 비치지 않게 한다.
  E.bg = "none"; E.op = 100; E.bt = 0;
  var kakaoOn = function () { return E.bg !== "none"; };
  function eumTiles() { return map.getLayers().getArray().filter(function (l) { return l instanceof ol.layer.Tile && bgAll.indexOf(l) < 0; }); }
  function syncEum() {
    var on = kakaoOn();
    eumTiles().forEach(function (l) { if (l.getVisible() === on) l.setVisible(!on); if (!on && l.getOpacity() !== E.op / 100) l.setOpacity(E.op / 100); });
    BG[E.bg].forEach(function (l) { l.setOpacity(1 - E.bt / 100); });
    map.getViewport().style.background = on ? "#fff" : "";
  }
  function applyBg() {
    bgAll.forEach(function (l) { map.removeLayer(l); });
    BG[E.bg].forEach(function (l, i) { l.setZIndex(-20 + i); map.addLayer(l); });
    syncEum();
  }
  setInterval(syncEum, 1500);   // 토지이음이 층을 다시 만들면 감추기·진하기를 다시 맞춘다

  // 고르기 모드 동안 토지이음 자체 클릭(한 필지 선택·팝업)을 막는다
  var origClick = $.fn.clickPnu;
  $.fn.clickPnu = function () { if (E.pick) return; return origClick.apply(this, arguments); };

  // ── 패널
  if (!document.getElementById("rasFont")) { var fl = document.createElement("link"); fl.id = "rasFont"; fl.rel = "stylesheet";
    fl.href = "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap"; document.head.appendChild(fl); }   // 글꼴(2026-10-21) — 막히면 맑은 고딕
  var css = document.createElement("style");
  css.textContent = "#emp{position:fixed;left:16px;bottom:16px;z-index:2147483000;width:600px;max-width:calc(100vw - 32px);max-height:72vh;display:flex;flex-direction:column;background:#fff;color:#1d2433;border:1px solid #d0d5dd;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.25);font:13px/1.45 'Noto Sans KR','Malgun Gothic',sans-serif}" +
    "#emp *{box-sizing:border-box;font-family:inherit}#emp .hd{display:flex;align-items:center;gap:8px;padding:8px 10px;background:#D9653B;color:#fff;border-radius:10px 10px 0 0;cursor:move;user-select:none}" +
    "#emp .eg{position:absolute;z-index:2}#emp .eg[data-e=l]{left:-4px;top:12px;bottom:12px;width:8px;cursor:ew-resize}#emp .eg[data-e=r]{right:-4px;top:12px;bottom:12px;width:8px;cursor:ew-resize}" +
    "#emp .eg[data-e=t]{top:-4px;left:12px;right:12px;height:8px;cursor:ns-resize}#emp .eg[data-e=b]{bottom:-4px;left:12px;right:12px;height:8px;cursor:ns-resize}" +
    "#emp .eg[data-e=tr]{top:-4px;right:-4px;width:16px;height:16px;cursor:nesw-resize;z-index:3}#emp .eg[data-e=br]{bottom:-4px;right:-4px;width:16px;height:16px;cursor:nwse-resize;z-index:3}" +
    "#emp.sized .bd{flex:1 1 auto;min-height:0}#emp.sized .tw{max-height:none;flex:1 1 auto;min-height:80px}" +
    "#emp .hd b{flex:1;font-size:14px}#emp .hd button{background:none;border:none;color:#fff;font-size:16px;cursor:pointer;padding:0 4px}" +
    "#emp .bd{padding:8px 10px;display:flex;flex-direction:column;gap:6px;overflow:auto}#emp textarea{width:100%;height:58px;resize:vertical;border:1px solid #d0d5dd;border-radius:6px;padding:5px 7px;font-size:12.5px}" +
    "#emp .row{display:flex;gap:5px;flex-wrap:wrap}#emp .row button{padding:5px 9px;border:1px solid #d0d5dd;background:#fff;border-radius:6px;cursor:pointer;font-size:12.5px}" +
    "#emp .row button.pri{background:#D9653B;border-color:#D9653B;color:#fff}#emp .row button.pri2{border-color:#D9653B;color:#D9653B;font-weight:700}#emp .row button.on{background:#fee2e2;border-color:#e5383b;color:#b91c1c;font-weight:700}" +
    "#emp .msg{min-height:16px;font-size:12px;color:#b45309}#emp table{border-collapse:collapse;width:100%;font-size:12px}" +
    "#emp th,#emp td{border-bottom:1px solid #eaecf0;padding:4px 5px;text-align:left;white-space:nowrap}#emp th{background:#f6f7f9;position:sticky;top:0}" +
    "#emp td.n,#emp th.n{text-align:right}#emp td.z{white-space:normal;min-width:86px;max-width:130px}#emp tbody tr{cursor:pointer}#emp tbody tr:hover td{background:#f3f6fb}#emp tr.sel td{background:#fff7d6}" +
    "#emp .gr{display:inline-block;width:12px;margin-right:3px;color:#b0b7c3;cursor:grab;font-size:13px;user-select:none}#emp tr:hover .gr{color:#475467}" +
    "#emp tr.drag td{opacity:.35}#emp tr.drb td{box-shadow:inset 0 3px 0 var(--emp-c,#D9653B)}#emp tr.dra td{box-shadow:inset 0 -3px 0 var(--emp-c,#D9653B)}" +
    "#emp tfoot td{font-weight:700;background:#f6f7f9}#emp .no{display:inline-block;min-width:19px;height:19px;line-height:19px;border-radius:10px;background:var(--emp-c,#D9653B);color:#fff;text-align:center;font-size:11px;font-weight:700}" +
    "#emp .sw{display:inline-flex;align-items:center;gap:4px;cursor:pointer;font-weight:600}#emp .sw input{position:absolute;opacity:0;width:0;height:0}" +
    "#emp .sw i{position:relative;width:24px;height:14px;border-radius:7px;background:#d0d5dd;transition:background .15s}" +
    "#emp .sw i:after{content:'';position:absolute;left:2px;top:2px;width:10px;height:10px;border-radius:50%;background:#fff;transition:left .15s}" +
    "#emp .sw input:checked+i{background:#D9653B}#emp .sw input:checked+i:after{left:12px}#emp .sw input:focus-visible+i{outline:2px solid #EDB49C}" +
    "#emp .x{border:none;background:none;color:#98a2b3;font-size:15px;cursor:pointer}#emp .x:hover{color:#e5383b}#emp .tw{overflow:auto;max-height:34vh}" +
    "#emp .bgrow{align-items:center;gap:12px;font-size:12.5px}#emp .bgrow select{font-size:12.5px;padding:3px}#emp .bgrow input{vertical-align:middle;width:110px}#emp input[type=range]{accent-color:var(--emp-c,#D9653B)}" +
    "#emp .bgrow input[type=color]{width:30px;height:22px;padding:0 1px;border:1px solid #d0d5dd;border-radius:4px;cursor:pointer;background:#fff}#emp .bgrow .rs{border:none;background:none;color:#667085;font-size:11.5px;cursor:pointer;text-decoration:underline;padding:0}" +
    "#emp.min .bd{display:none}body.emp-pick #gisMapContainer,body.emp-pick canvas{cursor:crosshair!important}";
  document.head.appendChild(css);

  var P = document.createElement("div");
  P.id = "emp";
  P.innerHTML = '<div class="eg" data-e="l"></div><div class="eg" data-e="r"></div><div class="eg" data-e="t"></div><div class="eg" data-e="b"></div><div class="eg" data-e="tr"></div><div class="eg" data-e="br"></div>' +
    '<div class="hd"><b>여러 필지 선택</b><button data-a="reset" title="새로고침 — 고른 필지·배경·이름표를 지우고 처음 상태로">↻</button><button data-a="min" title="접기">–</button><button data-a="close" title="닫기">×</button></div>' +
    '<div class="bd"><textarea placeholder="지번을 한 줄에 하나씩 (예: 용산구 한강로2가 424) · PNU 19자리도 됩니다"></textarea>' +
    '<div class="row"><button class="pri" data-a="add">목록 추가</button><button data-a="stopadd" class="on" hidden>추가 멈춤</button><button data-a="pick">지도 클릭으로 고르기</button><button data-a="fit">전체 보기</button>' +
    '<button data-a="mapopen" class="pri2" title="칠한 필지를 새 창의 선명한 카카오 지도 위에 — 캡처하기 좋게">지도 열기</button><button data-a="copy">표 복사</button><button data-a="link">링크 복사</button><button data-a="clear">모두 지우기</button></div>' +
    '<div class="row bgrow"><label>배경 <select data-x="bg"><option value="none">토지이음 도면만</option><option value="kmap">카카오 지도</option>' +
    '<option value="ksky">카카오 위성</option></select></label>' +
    '<label><span data-x="opl">도면 진하기</span> <input type="range" data-x="op" min="0" max="100" step="5" value="100"> <output>100%</output></label>' +
    '<label>필지 색 <input type="color" data-x="color" value="' + E.color + '"></label><button class="rs" data-a="color0" title="기본색으로 되돌리기">기본색</button></div>' +
    '<div class="msg" role="status"></div><div class="tw"><table><thead><tr><th><label class="sw" title="지도에 번호 표시 켜기/끄기">#<input type="checkbox" data-x="showNo" checked><i></i></label></th><th><label class="sw" title="지도에 지번 표시 켜기/끄기">지번<input type="checkbox" data-x="showJibun" checked><i></i></label></th><th>지목</th><th class="n">면적(㎡)</th><th class="n">평</th><th>용도지역</th><th class="n" title="원/㎡">공시지가</th><th></th></tr></thead>' +
    '<tbody></tbody><tfoot><tr><td></td><td class="cnt"></td><td></td><td class="n sum"></td><td class="n sump"></td><td></td><td class="n sumv"></td><td></td></tr></tfoot></table></div></div>';
  document.body.appendChild(P);
  P.style.setProperty("--emp-c", E.color);
  var $p = function (s) { return P.querySelector(s); };
  var msg = function (t) { $p(".msg").textContent = t || ""; };
  E.show = function () { P.style.display = "flex"; };

  // 끌어서 옮기기
  (function () {
    var hd = $p(".hd"), sx, sy, ox, oy;
    hd.addEventListener("mousedown", function (e) {
      if (e.target.tagName === "BUTTON") return;
      e.preventDefault();
      var r = P.getBoundingClientRect(); sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      function mv(ev) { P.style.left = Math.max(0, Math.min(ox + ev.clientX - sx, innerWidth - 60)) + "px"; P.style.top = Math.max(0, Math.min(oy + ev.clientY - sy, innerHeight - 40)) + "px"; P.style.bottom = "auto"; }
      function up() { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); }
      document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
    });
  })();

  // 창 크기(2026-10-22): 왼쪽·오른쪽 가장자리 = 폭, 위·아래 = 높이, 오른쪽 위·아래 모서리 = 폭과 높이 함께. 반대쪽 가장자리는 제자리
  (function () {
    try { var sz = JSON.parse(localStorage.getItem("empSize") || "null"); if (sz) { if (sz.w) P.style.width = sz.w + "px"; if (sz.h) { P.style.height = sz.h + "px"; P.style.maxHeight = "96vh"; P.classList.add("sized"); } } } catch (e) {}
    P.querySelectorAll(".eg").forEach(function (g) {
      g.addEventListener("mousedown", function (e) {
        e.preventDefault(); e.stopPropagation();
        var d = g.dataset.e, r = P.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
        var L0 = r.left, T0 = r.top, W0 = r.width, H0 = r.height;
        P.style.left = L0 + "px"; P.style.top = T0 + "px"; P.style.right = "auto"; P.style.bottom = "auto"; P.style.maxWidth = "none"; P.style.maxHeight = "96vh";
        if (/[tb]/.test(d)) { P.style.height = H0 + "px"; P.classList.add("sized"); }
        function mv(ev) {
          var dx = ev.clientX - sx, dy = ev.clientY - sy, w, h;
          if (/r/.test(d)) P.style.width = Math.max(380, Math.min(W0 + dx, innerWidth - L0 - 4)) + "px";
          if (d === "l") { w = Math.max(380, Math.min(W0 - dx, L0 + W0)); P.style.width = w + "px"; P.style.left = L0 + W0 - w + "px"; }
          if (d === "b" || d === "br") P.style.height = Math.max(200, Math.min(H0 + dy, innerHeight - T0)) + "px";
          if (d === "t" || d === "tr") { h = Math.max(200, Math.min(H0 - dy, T0 + H0)); P.style.height = h + "px"; P.style.top = T0 + H0 - h + "px"; }
        }
        function up() { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up);
          try { localStorage.setItem("empSize", JSON.stringify({ w: parseFloat(P.style.width) || 0, h: parseFloat(P.style.height) || 0 })); } catch (x) {} }
        document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
      });
      g.addEventListener("dblclick", function () { P.style.width = ""; P.style.height = ""; P.style.maxWidth = ""; P.style.maxHeight = ""; P.classList.remove("sized"); try { localStorage.removeItem("empSize"); } catch (x) {} });
    });
  })();

  // ── 자료 받기
  function getJSON(params) {
    return new Promise(function (res, rej) {
      $.getJSON(server + "/MapPlan?req=search", $.extend({ version: mapObj.version, layer: "FA" }, params), res).fail(function (x) { rej("경계 조회 실패(" + x.status + ")"); });
    });
  }
  function eucKr(url) {
    return fetch(url, { credentials: "include" }).then(function (r) { return r.arrayBuffer(); }).then(function (b) { return new TextDecoder("euc-kr").decode(b); });
  }
  function searchPnu(keyword) {
    var k = keyword.replace(/\s+/g, " ").trim();
    if (/^\d{19}$/.test(k)) return Promise.resolve(k);
    if ($.fn.changeGisSearchKeyword) k = $.fn.changeGisSearchKeyword(k);
    return new Promise(function (res, rej) {
      $.ajax({ type: "POST", url: context + "/mp/mpMapDetGisAjaxXml.jsp", dataType: "json", data: { sId: "selectGisAddrList", keyword: k },
        success: function (d) {
          var x = d && d.jibunBonBuList ? new DOMParser().parseFromString(d.jibunBonBuList, "text/xml") : null;
          var nodes = x ? Array.prototype.slice.call(x.getElementsByTagName("node")) : [];
          if (!nodes.length) return rej("지번을 찾지 못함: " + keyword);
          var m = /(산)?\s*(\d+)(?:-(\d+))?\s*$/.exec(keyword), pick = nodes[0];
          if (m) nodes.some(function (n) {   // 본번·부번·산 여부가 맞는 것을 고른다
            var t = function (tag) { var e = n.getElementsByTagName(tag)[0]; return e ? e.textContent : ""; };
            var p = t("pnu");
            if (+t("bonbun") === +m[2] && +(t("bubun") || 0) === +(m[3] || 0) && (p.charAt(10) === "2") === !!m[1]) { pick = n; return true; }
          });
          res(pick.getElementsByTagName("pnu")[0].textContent);
        },
        error: function (x) { rej("지번 검색 실패(" + x.status + ")"); } });
    });
  }
  // 용도지역: 「국토계획법」 칸(#present_mark1)에는 '도시지역, 일반상업지역, 지구단위계획구역, …'처럼 큰 분류·세부 분류·지구가 섞여 있다.
  // 각 링크 뒤 hidden mark_ucode 의 UQA(도시지역 계열)·UQB(관리)·UQC(농림)·UQD(자연환경보전)만 용도지역이다.
  // 큰 분류(도시지역·관리지역)는 세부 분류가 있으면 뺀다 → '일반상업'. 두 용도지역에 걸치면 ', ' 로 잇는다.
  function zoneOf(td) {
    if (!td) return "";
    var names = [];
    Array.prototype.forEach.call(td.querySelectorAll("a"), function (a) {
      var c = a.nextElementSibling, code = c && c.name === "mark_ucode" ? c.value : "";
      var n = a.textContent.replace(/\(\d{4}-\d{2}-\d{2}\)/g, "").trim();
      if (/^UQ[A-D]/.test(code) && n && names.indexOf(n) < 0) names.push(n);
    });
    var fine = names.filter(function (n) { return !/^(도시|관리)지역$/.test(n); });
    // 세부 분류는 끝의 '지역'을 뗀다(일반상업지역 → 일반상업, 제1종일반주거지역 → 제1종일반주거). 표·복사 모두 같은 이름.
    if (fine.length) return fine.map(function (n) { return n.replace(/지역$/, ""); }).join(", ");
    if (names.length) return names.join(", ");
    var first = td.querySelector("a");   // 코드가 없는 옛 화면: 예전처럼 첫 링크
    return first ? first.textContent.replace(/\(\d{4}-\d{2}-\d{2}\)/g, "").trim() : "";
  }
  function landInfo(p) {
    var base = location.origin + "/web/ar/lu/";
    var a = eucKr(base + "luLandDet.jsp?pnu=" + p.pnu + "&mode=search&isNoScr=script&selGbn=umd").then(function (h) {
      var d = new DOMParser().parseFromString(h, "text/html"), q = function (s) { var e = d.querySelector(s); return e ? e : null; };
      var addr = q("#present_addr"); addr = addr ? addr.parentNode.textContent.trim() : "";
      var cls = q("#present_class_val"); p.jimok = cls ? cls.value : p.jimok;
      var ar = q("#present_area"); p.area = ar ? +ar.textContent.replace(/[^\d.]/g, "") : null;
      p.zone = zoneOf(q("#present_mark1"));
      if (addr) p.address = addr;
    });
    var b = eucKr(base + "luLandDetYearAjax.jsp?pnu=" + p.pnu).then(function (h) {
      var all = h.match(/(\d{4}\/\d{2})\s*<\/td>\s*<td>\s*([\d,]+)\s*원/g) || [];
      var rows = all.map(function (s) { var m = /(\d{4}\/\d{2})[\s\S]*?([\d,]+)\s*원/.exec(s); return [m[1], +m[2].replace(/,/g, "")]; }).sort();
      if (rows.length) { p.price = rows[rows.length - 1][1]; p.priceYm = rows[rows.length - 1][0]; }
    });
    return Promise.all([a.catch(function () {}), b.catch(function () {})]);
  }
  function addFeatures(data, origin) {
    var fs = new ol.format.GeoJSON().readFeatures(data);
    if (!fs.length) throw "경계 없음";
    var f = fs[0], pr = f.getProperties(), pnu = pr.pnu;
    if (E.list.some(function (x) { return x.pnu === pnu; })) return { dup: pnu };
    var j = String(pr.jibun || "").replace(/^산\s*/, ""), jm = /^(.*?\d)([^\d]*)$/.exec(j);
    var p = { pnu: pnu, jibun: (pnu.charAt(10) === "2" ? "산 " : "") + (jm ? jm[1] : j), jimok: jm ? jm[2] : "", address: "", feature: f, origin: origin };
    E.list.push(p); src.addFeature(f); E.sel = pnu;
    return p;
  }
  function addPnu(pnu) {
    if (E.list.some(function (x) { return x.pnu === pnu; })) return Promise.resolve({ dup: pnu });
    return getJSON({ code: pnu }).then(function (d) { var p = addFeatures(d); if (p.dup) return p; return landInfo(p).then(function () { return p; }); });
  }

  // ── 그리기·표
  function render() {
    E.list.forEach(function (p, i) {   // 지도 이름표: 표 머리의 # · 지번 스위치에 따라 "1. 10-95" / "1" / "10-95" / 없음
      p.feature.set("label", [E.showNo ? (i + 1) + (E.showJibun ? "." : "") : "", E.showJibun ? p.jibun : ""].join(E.showNo && E.showJibun ? " " : ""));  p.feature.set("pnu", p.pnu); });
    src.changed();
    var tb = $p("tbody"); tb.innerHTML = "";
    var sum = 0, val = 0, noPrice = 0;
    E.list.forEach(function (p, i) {
      sum += +p.area || 0;
      if (p.area && p.price) val += p.area * p.price; else noPrice++;
      var tr = document.createElement("tr");
      if (p.pnu === E.sel) tr.className = "sel";
      tr.innerHTML = "<td><span class=gr title='끌어서 순서 바꾸기'>⠿</span><span class=no>" + (i + 1) + "</span></td><td title='" + esc(p.address) + "'>" + esc(p.jibun) + "</td><td>" + esc(p.jimok) +
        "</td><td class=n>" + fmt(p.area) + "</td><td class=n>" + fmt(p.area * 0.3025, 1) + "</td><td class=z>" + esc(p.zone || "") +
        "</td><td class=n title='" + esc(p.priceYm || "") + "'>" + fmt(p.price) + "</td><td><button class=x title='빼기'>×</button></td>";
      tr.onclick = function (e) {   // 고른 행을 다시 누르면 노란 표시를 끈다(지도 이동 없음)
        if (e.target.className === "x") return remove(p.pnu);
        if (E.sel === p.pnu) { E.sel = null; render(); return; }
        E.sel = p.pnu; render(); zoomTo([p.feature]);
      };
      // 끌어다 놓기로 순서 바꾸기(2026-10-19 사용자 요청): 행 위쪽 반에 놓으면 그 앞, 아래쪽 반이면 그 뒤. 번호·이름표·표 복사 순서가 같이 바뀐다
      tr.draggable = true;
      tr.addEventListener("dragstart", function (e) { E.drag = i; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", p.jibun); tr.classList.add("drag"); });
      tr.addEventListener("dragend", function () { E.drag = null; unmark(); });
      tr.addEventListener("dragover", function (e) {
        if (E.drag == null) return; e.preventDefault();
        var r = tr.getBoundingClientRect(); unmark(); tr.classList.add(e.clientY > r.top + r.height / 2 ? "dra" : "drb");
      });
      tr.addEventListener("drop", function (e) {
        if (E.drag == null) return; e.preventDefault();
        var r = tr.getBoundingClientRect(), to = i + (e.clientY > r.top + r.height / 2 ? 1 : 0), from = E.drag;
        E.drag = null; unmark();
        if (to > from) to--;
        if (to === from) return render();
        var it = E.list.splice(from, 1)[0]; E.list.splice(to, 0, it);
        render(); msg(it.jibun + " → " + (to + 1) + "번");
      });
      tb.appendChild(tr);
    });
    $p(".cnt").textContent = E.list.length + "필지 합계";
    $p(".sum").textContent = fmt(sum); $p(".sump").textContent = fmt(sum * 0.3025, 1);
    // 공시지가 합계 = Σ(면적㎡ × 공시지가 원/㎡), 백만원
    var sv = $p(".sumv");
    sv.textContent = E.list.length ? fmt(val / 1e6) + " 백만원" + (noPrice && noPrice < E.list.length ? "*" : "") : "";
    sv.title = "면적(㎡) × 공시지가(원/㎡) 합계" + (noPrice ? " · 공시지가나 면적이 없는 " + noPrice + "필지는 빠짐" : "");
    try { localStorage.setItem(KEY, JSON.stringify(E.list.map(function (p) { return p.pnu; }))); } catch (e) {}
  }
  function unmark() { Array.prototype.forEach.call(P.querySelectorAll(".drag,.dra,.drb"), function (x) { x.classList.remove("drag", "dra", "drb"); }); }
  // ── '지도 열기'(2026-10-22 사용자 요청: 캡처용). 칠한 필지 경계(EPSG:5179)를 WGS84 로 바꿔 새 창에 넘기고, 그 창에서 카카오 지도(원래 좌표계
  //   EPSG:5181, 512px 고해상도 조각)를 Leaflet 으로 깔아 다시 그린다 — 토지이음 화면처럼 좌표계를 바꿔 그리며 흐려지는 일이 없다.
  //   확대·축소는 0.25 단계(+/− 단추, 휠도 잘게), 필지에 맞추기, 지도 크게 보기(전체 화면), 배경 투명도, 필지 색, 번호·지번 이름표, 아래 표·표 복사.
  //   지도 화면 코드는 eumMapPage 함수 그대로 새 문서에 넣는다(문자열로 잇지 않아 고치기 쉽다).
  function eumMapPage(D) {
    var C = D.color, showNo = true, showJb = true;
    var crs = new L.Proj.CRS("EPSG:5181", "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=500000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
      { resolutions: [2048, 1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1, 0.5, 0.25], origin: [-30000, -60000],
        bounds: L.bounds([-30000 - Math.pow(2, 19) * 4, -60000], [-30000 + Math.pow(2, 19) * 5, -60000 + Math.pow(2, 19) * 5]) });
    var K = function (u) { return L.tileLayer(u, { minZoom: 0, maxZoom: 13, maxNativeZoom: 13, zoomReverse: true, zoomOffset: 1, tms: true, continuousWorld: true, attribution: "지도 &copy; Kakao · 경계 토지이음" }); };
    var T = "https://mts.kakaocdn.net/api/v1/tile/";
    var B = { map: [K(T + "PNG02/v26_blse3/latest/{z}/{y}/{x}.png")],
      sky: [K("https://map.kakaocdn.net/map_skyview_hd/L{z}/{y}/{x}.jpg?v=160107"), K(T + "PNG_SKYH02/v24_kikr3/latest/{z}/{y}/{x}.png")],
      cad: [K(T + "PNG02/v26_blse3/latest/{z}/{y}/{x}.png"), K(T + "PNG_CAD02/v22_53657/latest/{z}/{y}/{x}.png")], none: [] };
    var m = L.map("map", { crs: crs, zoomSnap: 0.25, zoomDelta: 0.25, wheelPxPerZoomLevel: 180, zoomControl: false }), cur = [], op = 1;
    function base(k) { cur.forEach(function (l) { m.removeLayer(l); }); cur = B[k]; cur.forEach(function (l, i) { l.addTo(m); l.setZIndex(i + 1); l.setOpacity(op); }); }
    var g = L.layerGroup().addTo(m), shapes = [];
    function draw() {
      g.clearLayers(); shapes = [];
      D.parcels.forEach(function (p, i) {
        var ly = L.geoJSON(p.geo, { style: { color: C, weight: 2.5, fillColor: C, fillOpacity: 0.28 } }).addTo(g);
        var lab = [showNo ? String(i + 1) + (showJb ? "." : "") : "", showJb ? p.jibun : ""].join(showNo && showJb ? " " : "");
        if (lab) ly.bindTooltip(lab, { permanent: true, direction: "center", className: "plb" });
        ly.bindPopup("<b>" + (i + 1) + ". " + p.jibun + "</b><br>" + (p.jimok || "") + " · " + (p.area ? p.area.toLocaleString() + "㎡" : "") + "<br>" + (p.zone || "") + (p.price ? " · 공시지가 " + p.price.toLocaleString() + "원/㎡" : ""));
        shapes.push(ly);
      });
      document.querySelectorAll("td.no span").forEach(function (s) { s.style.background = C; });
    }
    function fit() { var b = L.featureGroup(shapes).getBounds(); if (b.isValid()) m.fitBounds(b, { padding: [40, 40] }); else m.setView([37.5665, 126.978], 7); }
    base(D.bg || "map"); draw(); fit();
    var $ = function (id) { return document.getElementById(id); };
    $("bg").value = D.bg || "map"; $("bg").onchange = function () { base(this.value); };
    $("tr").oninput = function () { op = 1 - this.value / 100; $("tro").textContent = this.value + "%"; cur.forEach(function (l) { l.setOpacity(op); }); };
    $("col").value = C; $("col").oninput = function () { C = this.value; draw(); };
    $("sno").onchange = function () { showNo = this.checked; draw(); };
    $("sjb").onchange = function () { showJb = this.checked; draw(); };
    $("zin").onclick = function () { m.setZoom(m.getZoom() + 0.25); };
    $("zout").onclick = function () { m.setZoom(m.getZoom() - 0.25); };
    $("zfit").onclick = fit;
    m.on("zoomend", function () { $("zl").textContent = m.getZoom().toFixed(2); }); $("zl").textContent = m.getZoom().toFixed(2);
    var box = $("mapbox"), fsb = $("fs");
    function fsOn() { return document.fullscreenElement === box || box.classList.contains("big"); }
    function sync() { fsb.textContent = fsOn() ? "✕ 작게 보기" : "⛶ 지도 크게 보기"; setTimeout(function () { m.invalidateSize(); }, 150); }
    fsb.onclick = function () {
      if (fsOn()) { if (document.fullscreenElement) document.exitFullscreen(); else box.classList.remove("big"); }
      else if (box.requestFullscreen) box.requestFullscreen().catch(function () { box.classList.add("big"); sync(); });
      else box.classList.add("big");
      sync();
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && box.classList.contains("big")) { box.classList.remove("big"); sync(); } });
    $("cp").onclick = function () {
      var b = this, done = function () { b.textContent = "복사했습니다 ✓"; setTimeout(function () { b.textContent = "표 복사"; }, 1500); };
      var old = function () { var t = document.createElement("textarea"); t.value = D.tsv; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); done(); };
      if (navigator.clipboard) navigator.clipboard.writeText(D.tsv).then(done, old); else old();
    };
  }
  function openMapWindow() {
    if (!E.list.length) return msg("칠한 필지가 없습니다.");
    var gj = new ol.format.GeoJSON(), proj = map.getView().getProjection();
    var parcels = E.list.map(function (p) {
      return { jibun: p.jibun, address: p.address || p.jibun, jimok: p.jimok || "", area: p.area || null, zone: p.zone || "", price: p.price || null,
        geo: gj.writeFeatureObject(p.feature, { featureProjection: proj, dataProjection: "EPSG:4326", decimals: 7 }) };
    });
    var sum = 0, val = 0; E.list.forEach(function (p) { sum += +p.area || 0; if (p.area && p.price) val += p.area * p.price; });
    var head = ["번호", "소재지", "지목", "면적(㎡)", "면적(평)", "용도지역", "공시지가(원/㎡)", "공시지가 합계(백만원)"];
    var body = E.list.map(function (p, i) { return [i + 1, p.address || p.jibun, p.jimok || "", fmt(p.area), fmt(p.area * 0.3025, 1), p.zone || "", fmt(p.price), p.area && p.price ? fmt(p.area * p.price / 1e6) : ""]; });
    var foot = ["", E.list.length + "필지 합계", "", fmt(sum), fmt(sum * 0.3025, 1), "", "", fmt(val / 1e6)];
    var tsv = [head].concat(body, [foot]).map(function (r) { return r.join("\t"); }).join("\n");
    // 제목: 첫 필지의 동 이름 + 지번(서울특별시 용산구 한강로2가 424번지 → 한강로2가 424)
    var first = (E.list[0].address || "").replace(/\s+(산\s*)?\d[\d-]*\s*(번지)?\s*$/, "").trim().split(/\s+/).slice(-1)[0] || "";
    var title = (first ? first + " " : "") + E.list[0].jibun + (E.list.length > 1 ? " 외 " + (E.list.length - 1) + "필지" : "");
    var D = { parcels: parcels, color: E.color, bg: E.bg === "ksky" ? "sky" : "map", tsv: tsv };
    var J = function (v) { return JSON.stringify(v).replace(/</g, "\\u003c"); };
    var html = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(title) + " 위치도</title>" +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap">' +
      '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">' +
      ["leaflet/1.9.4/leaflet.min.js", "proj4js/2.11.0/proj4.min.js", "proj4leaflet/1.0.2/proj4leaflet.min.js"].map(function (u) { return '<script src="https://cdnjs.cloudflare.com/ajax/libs/' + u + '"></scr' + "ipt>"; }).join("") +
      "<style>body{margin:0;font:13px/1.5 'Noto Sans KR','Malgun Gothic',sans-serif;color:#1d2433;background:#f6f7f9}header{padding:12px 18px;background:#fff;border-bottom:1px solid #e4e7ec}" +
      "h1{font-size:18px;margin:0 0 2px;outline:none}h1:focus{background:#fff7f2}.kpi{display:flex;gap:16px;flex-wrap:wrap;color:#475467}.kpi b{color:#A04626}" +
      "#mapbox{position:relative;height:66vh;background:#fff}#mapbox.big{position:fixed;inset:0;height:auto;z-index:9999}#mapbox:fullscreen{height:100vh}#map{position:absolute;inset:0;background:#fff}" +
      ".lay{position:absolute;z-index:1000;top:10px;right:10px;display:flex;flex-direction:column;gap:6px;align-items:flex-end}.lay>div{background:#fff;border-radius:6px;padding:4px 7px;box-shadow:0 1px 4px rgba(0,0,0,.3);display:flex;align-items:center;gap:6px}" +
      ".lay select,.lay button{font:inherit;font-size:12.5px}.lay button{border:1px solid #d0d5dd;background:#fff;border-radius:5px;padding:2px 8px;cursor:pointer}.lay button:hover{background:#f2f4f7}" +
      ".lay input[type=range]{width:100px;accent-color:#D9653B}.lay input[type=color]{width:26px;height:22px;padding:0;border:1px solid #d0d5dd;border-radius:4px}" +
      ".zm{position:absolute;z-index:1000;left:10px;top:10px;display:flex;flex-direction:column;background:#fff;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,.3);overflow:hidden}" +
      ".zm button{border:0;border-bottom:1px solid #eaecf0;background:#fff;width:34px;height:30px;font-size:17px;cursor:pointer}.zm button:hover{background:#fff1ea}.zm span{font-size:10.5px;color:#667085;text-align:center;padding:2px 0}" +
      ".plb{background:rgba(255,255,255,.92);border:1px solid rgba(0,0,0,.15);border-radius:4px;padding:1px 5px;font-weight:700;font-size:12px;color:#1d2433;box-shadow:none}.plb:before{display:none}" +
      ".wrap{padding:12px 18px}.tbar{display:flex;align-items:center;gap:8px;margin-bottom:6px}.tbar b{flex:1;font-size:14px}.btn{border:1px solid #d0d5dd;background:#fff;border-radius:6px;padding:4px 10px;cursor:pointer;font:inherit}" +
      "table{border-collapse:collapse;width:100%;background:#fff;font-size:12.5px}th,td{border:1px solid #e4e7ec;padding:4px 7px;white-space:nowrap}th{background:#f2f4f7}td.n{text-align:right}" +
      "td.no span{display:inline-block;min-width:20px;height:20px;line-height:20px;border-radius:10px;color:#fff;text-align:center;font-size:11px;font-weight:700}tfoot td{font-weight:700;background:#f6f7f9}</style></head><body>" +
      '<header><h1 contenteditable="true" spellcheck="false" title="눌러서 고칠 수 있음">' + esc(title) + " 위치도</h1>" +
      '<div class="kpi"><span>' + E.list.length + "필지</span><span>면적 합계 <b>" + fmt(sum) + "㎡</b> (" + fmt(sum * 0.3025, 1) + "평)</span>" +
      (val ? "<span>공시지가 합계 <b>" + fmt(val / 1e6) + " 백만원</b></span>" : "") + "<span>경계: 토지이음 · 배경: 카카오맵</span></div></header>" +
      '<div id="mapbox"><div id="map"></div>' +
      '<div class="zm"><button id="zin" title="확대(0.25단계)">+</button><button id="zout" title="축소(0.25단계)">−</button><button id="zfit" title="필지에 맞추기" style="font-size:13px">⊡</button><span id="zl"></span></div>' +
      '<div class="lay"><div>배경 <select id="bg"><option value="map">카카오 지도</option><option value="sky">카카오 위성</option><option value="cad">지적편집도</option><option value="none">흰 바탕</option></select></div>' +
      '<div>배경 투명도 <input id="tr" type="range" min="0" max="90" step="5" value="0"><span id="tro">0%</span></div>' +
      '<div>필지 색 <input id="col" type="color"> <label><input id="sno" type="checkbox" checked>번호</label> <label><input id="sjb" type="checkbox" checked>지번</label></div>' +
      '<div><button id="fs">⛶ 지도 크게 보기</button></div></div></div>' +
      '<div class="wrap"><div class="tbar"><b>필지 표</b><button id="cp" class="btn">표 복사</button></div><table><thead><tr>' + head.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      body.map(function (r) { return "<tr>" + r.map(function (v, k) { return k === 0 ? '<td class="no"><span>' + v + "</span></td>" : "<td" + (k >= 3 && k !== 5 ? ' class="n"' : "") + ">" + esc(v) + "</td>"; }).join("") + "</tr>"; }).join("") +
      "</tbody><tfoot><tr>" + foot.map(function (v, k) { return "<td" + (k >= 3 ? ' class="n"' : "") + ">" + esc(v) + "</td>"; }).join("") + "</tr></tfoot></table>" +
      '<p style="color:#667085">토지이음 정보는 법적 효력이 없는 참고자료입니다. 확대·축소는 왼쪽 위 +/−(0.25단계)·마우스 휠, ⊡ = 필지에 맞추기.</p></div><script>' +
      "(" + eumMapPage.toString().replace(/<\//g, "<\\/") + ")(" + J(D) + ");</scr" + "ipt></body></html>";
    var w = window.open(URL.createObjectURL(new Blob([html], { type: "text/html" })), "_blank");
    if (!w) msg("팝업이 막혔습니다. 브라우저 주소창 오른쪽의 팝업 허용을 눌러 주세요.");
  }
  function zoomTo(fs) {
    if (!fs.length) return;
    var ext = ol.extent.createEmpty();
    fs.forEach(function (f) { ol.extent.extend(ext, f.getGeometry().getExtent()); });
    map.getView().fit(ext, map.getSize(), { padding: [80, 80, 80, 80], maxZoom: 19 });
  }
  function remove(pnu) {
    E.list = E.list.filter(function (p) { if (p.pnu === pnu) src.removeFeature(p.feature); return p.pnu !== pnu; });
    if (E.sel === pnu) E.sel = null;
    render(); msg("필지를 뺐습니다.");
  }
  // 여러 지번 추가: 한 번에 하나씩. '추가 멈춤'(2026-10-20 사용자 요청)을 누르면 지금 찾는 것까지만 넣고 멈춘다 —
  //   남은 지번은 입력 칸에 되돌려 두어 [목록 추가]를 다시 누르면 이어서 넣는다.
  function addMany(keys) {
    var ok = 0, bad = [], i = 0, stopBtn = $p("[data-a=stopadd]"), addBtn = $p("[data-a=add]"), g = E.gen;
    E.stopAdd = false; stopBtn.hidden = false; addBtn.disabled = true;
    function next() {
      if (g !== E.gen) { stopBtn.hidden = true; addBtn.disabled = false; return; }     // 새로고침했으면 남은 지번은 버린다
      if (i >= keys.length || E.stopAdd) {
        var left = keys.slice(i);
        stopBtn.hidden = true; addBtn.disabled = false;
        if (left.length) { var ta = $p("textarea"); ta.value = left.join("\n") + (ta.value ? "\n" + ta.value : ""); }
        render(); zoomTo(E.list.map(function (p) { return p.feature; }));
        msg((E.stopAdd && left.length ? "멈췄습니다 — " : "") + ok + "필지 추가" + (bad.length ? " · 못 찾음: " + bad.join(", ") : "")
          + (E.stopAdd && left.length ? " · 남은 " + left.length + "개는 위 칸에 되돌려 두었습니다([목록 추가]로 이어서)" : ""));
        return;
      }
      var k = keys[i++]; msg("찾는 중… " + k + " (" + i + "/" + keys.length + ")");
      searchPnu(k).then(function (r) { if (g !== E.gen) throw new Error("새로고침"); return addPnu(r); }).then(function (p) { if (!p.dup) ok++; render(); }).catch(function (e) { bad.push(k); console.warn(e); }).then(next);
    }
    next();
  }

  // ── 지도 클릭으로 고르기
  map.on("singleclick", function (e) {
    if (!E.pick) return;
    var c = e.coordinate;
    var hit = map.forEachFeatureAtPixel(e.pixel, function (f) { return f; }, { layerFilter: function (l) { return l === layer; } });
    if (hit) return remove(hit.get("pnu"));
    msg("필지 찾는 중…");
    getJSON({ mbr: [c[0], c[1], c[0], c[1]].join(",") }).then(function (d) {
      var p = addFeatures(d, "click");
      if (p.dup) return msg("이미 고른 필지입니다.");
      render(); msg((p.jibun) + " 추가");
      return landInfo(p).then(render);
    }).catch(function (er) { msg(String(er)); });
  });

  // ── 단추
  P.addEventListener("click", function (e) {
    var a = e.target.getAttribute && e.target.getAttribute("data-a");
    if (!a) return;
    if (a === "close") { P.style.display = "none"; E.pick = false; document.body.classList.remove("emp-pick"); }
    if (a === "stopadd") { E.stopAdd = true; msg("멈추는 중… (지금 찾는 지번까지만 넣습니다)"); }
    if (a === "min") P.classList.toggle("min");
    // 새로고침(2026-10-23 사용자 요청): 고른 필지·입력 칸·배경·이름표를 처음 상태로(필지 색·창 크기는 그대로). 추가 중이면 멈춘다
    if (a === "reset") {
      if (!confirm("고른 필지와 설정을 지우고 처음 상태로 돌아갈까요?")) return;
      E.gen++; E.stopAdd = true;
      src.clear(); E.list = []; E.sel = null; $p("textarea").value = "";
      E.pick = false; $p("[data-a=pick]").classList.remove("on"); document.body.classList.remove("emp-pick");
      E.bg = "none"; E.op = 100; E.bt = 0; selBg.value = "none"; applyBg(); slider();
      E.showNo = true; E.showJibun = true; $p("[data-x=showNo]").checked = true; $p("[data-x=showJibun]").checked = true;
      try { [KEY, KEY + "Bg", KEY + "Lbl"].forEach(function (k) { localStorage.removeItem(k); }); } catch (x) {}
      if (/[#&]multi=/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search);
      render(); msg("지번을 적고 '목록 추가'를 누르거나, '지도 클릭으로 고르기'를 켜세요.");
    }
    if (a === "add") {
      var keys = $p("textarea").value.split(/\n|;/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (!keys.length) return msg("지번을 적어 주세요.");
      $p("textarea").value = ""; addMany(keys);
    }
    if (a === "pick") {
      E.pick = !E.pick; e.target.classList.toggle("on", E.pick); document.body.classList.toggle("emp-pick", E.pick);
      msg(E.pick ? "지도에서 필지를 누르면 추가, 칠해진 필지를 누르면 뺍니다. (토지이음 기본 클릭은 잠시 꺼짐)" : "");
    }
    if (a === "fit") zoomTo(E.list.map(function (p) { return p.feature; }));
    if (a === "color0") setColor(DEF_COLOR);
    if (a === "clear") { if (!confirm("고른 필지를 모두 지울까요?")) return; src.clear(); E.list = []; E.sel = null; render(); msg(""); }
    if (a === "mapopen") openMapWindow();
    if (a === "copy") {
      var head = ["번호", "소재지", "지목", "면적(㎡)", "면적(평)", "용도지역", "공시지가(원/㎡)", "공시지가 합계(백만원)", "기준연월", "PNU"], sum = 0, val = 0;
      var rows = E.list.map(function (p, i) {
        var v = p.area && p.price ? p.area * p.price / 1e6 : "";
        sum += +p.area || 0; val += +v || 0;
        return [i + 1, p.address || p.jibun, p.jimok, p.area, (p.area * 0.3025).toFixed(1), p.zone || "", p.price || "", v === "" ? "" : v.toFixed(1), p.priceYm || "", "'" + p.pnu];
      });
      rows.push(["", "합계", "", Math.round(sum * 100) / 100, (sum * 0.3025).toFixed(1), "", "", val.toFixed(1), "", ""]);
      var tsv = [head].concat(rows).map(function (r) { return r.join("\t"); }).join("\n");
      navigator.clipboard.writeText(tsv).then(function () { msg("표를 복사했습니다. 엑셀에 붙여 넣으세요."); }, function () { prompt("복사해서 쓰세요", tsv); });
    }
    if (a === "link") {
      var pn = E.list.map(function (p) { return p.pnu; });
      if (!pn.length) return msg("고른 필지가 없습니다.");
      var url = location.origin + "/web/mp/mpMapDet.jsp?pnu=" + pn[0] + "#multi=" + pn.join(",");
      navigator.clipboard.writeText(url).then(function () { msg("링크를 복사했습니다. 그 링크를 연 뒤 이 북마크를 누르면 같은 필지들이 다시 칠해집니다."); }, function () { prompt("링크", url); });
    }
  });

  // ── 시작: 주소창 #multi= 또는 지난번 목록을 불러온다
  // 배경 고르기·도면 진하기
  var selBg = $p("[data-x=bg]"), rng = $p("[data-x=op]"), outOp = P.querySelector(".bgrow output");
  // 막대 하나: 토지이음 도면만 = 도면 진하기(0~100), 카카오 = 배경 투명도(0~90)
  function slider() {
    var k = kakaoOn(), v = k ? E.bt : E.op;
    $p("[data-x=opl]").textContent = k ? "배경 투명도" : "도면 진하기";
    rng.max = k ? 90 : 100; rng.value = v; outOp.textContent = v + "%";
  }
  function setOp(v) { if (kakaoOn()) E.bt = +v; else E.op = +v; outOp.textContent = v + "%"; syncEum(); }
  var saveBg = function () { try { localStorage.setItem(KEY + "Bg", JSON.stringify([E.bg, E.op, E.bt])); } catch (e) {} };
  selBg.onchange = function () {
    E.bg = selBg.value;
    applyBg(); slider(); saveBg();
    msg(E.bg.charAt(0) === "k" ? "카카오 배경을 쓰면 토지이음 '저장' 단추가 막힙니다(새로고침하면 풀림). 그림 파일이 필요하면 Win+Shift+S 로 캡처하세요." : "");
  };
  rng.oninput = function () { setOp(rng.value); };
  // 필지 색
  var colIn = $p("[data-x=color]");
  function setColor(c) {
    E.color = c; colIn.value = c; P.style.setProperty("--emp-c", c); src.changed();
    try { localStorage.setItem(KEY + "Color", c); } catch (e) {}
  }
  colIn.oninput = function () { setColor(colIn.value); };
  // 지도 이름표 스위치(# · 지번)
  E.showNo = true; E.showJibun = true;
  try { var lv = JSON.parse(localStorage.getItem(KEY + "Lbl") || "null"); if (lv) { E.showNo = lv[0]; E.showJibun = lv[1]; } } catch (e) {}
  $p("[data-x=showNo]").checked = E.showNo; $p("[data-x=showJibun]").checked = E.showJibun;
  P.querySelectorAll(".sw input").forEach(function (cb) {
    cb.onchange = function () {
      E.showNo = $p("[data-x=showNo]").checked; E.showJibun = $p("[data-x=showJibun]").checked; render();
      try { localStorage.setItem(KEY + "Lbl", JSON.stringify([E.showNo, E.showJibun])); } catch (e) {}
    };
  });
  rng.onchange = saveBg;
  (function () { try { var v = JSON.parse(localStorage.getItem(KEY + "Bg") || "null"); if (v && BG[v[0]]) { selBg.value = v[0]; E.bg = v[0]; E.op = +v[1] || 100; E.bt = +v[2] || 0; applyBg(); } } catch (e) {} slider(); })();

  var start = (/[#&]multi=([\d,]+)/.exec(location.hash) || [])[1];
  var keys = start ? start.split(",") : (function () { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; } })();
  render();
  if (keys.length) addMany(keys); else msg("지번을 적고 '목록 추가'를 누르거나, '지도 클릭으로 고르기'를 켜세요.");
})();

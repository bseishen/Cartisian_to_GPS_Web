"use strict";

var TrackMap = (function () {
  var map;
  var originMarker;
  var overlayGroup;
  var onOriginDrag;
  var onHeadingDrag;
  var lastOriginLat, lastOriginLon;
  var mapInteracting = false;
  var programmaticMove = false;
  var lastPoints = [];
  var measureGroup;
  var measureActive = false;
  var measurePts = [];
  var measureUseFeet = true;
  var measureBtn;

  var ESRI_SATELLITE = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      attribution: "Tiles &copy; Esri",
      maxNativeZoom: 19,
      maxZoom: 21
    }
  );

  var OSM = L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      attribution: "&copy; OpenStreetMap contributors",
      maxNativeZoom: 19,
      maxZoom: 21
    }
  );

  var originIcon = L.divIcon({
    className: "origin-marker",
    html: '<svg width="32" height="44" viewBox="0 0 32 44">'
      + '<path d="M16 0C7.2 0 0 7.2 0 16c0 12 16 28 16 28s16-16 16-28C32 7.2 24.8 0 16 0z" fill="#e74c3c" stroke="#fff" stroke-width="1.5"/>'
      + '<text x="16" y="20" text-anchor="middle" font-size="11" font-weight="bold" fill="#fff" font-family="sans-serif">0,0</text>'
      + '</svg>',
    iconSize: [32, 44],
    iconAnchor: [16, 44],
    popupAnchor: [0, -44]
  });

  function bearingFromOrigin(endLat, endLon) {
    var dLat = endLat - lastOriginLat;
    var dLon = (endLon - lastOriginLon) * Math.cos(lastOriginLat * Math.PI / 180);
    return (Math.atan2(dLon, dLat) * (180 / Math.PI) + 360) % 360;
  }

  function init(containerId, dragCallback, headingCallback) {
    onOriginDrag = dragCallback;
    onHeadingDrag = headingCallback;
    map = L.map(containerId, {
      center: [35.31, -89.92],
      zoom: 4,
      layers: [ESRI_SATELLITE],
      zoomControl: false
    });

    L.control.zoom({ position: "topright" }).addTo(map);
    L.control.layers(
      { "Satellite": ESRI_SATELLITE, "Street": OSM },
      null,
      { position: "topright" }
    ).addTo(map);

    overlayGroup = L.layerGroup().addTo(map);
    measureGroup = L.layerGroup().addTo(map);
    initMeasure();

    map.on("dragstart zoomstart", function () {
      if (!programmaticMove) mapInteracting = true;
    });

    return map;
  }

  function setOrigin(lat, lon) {
    if (!map) return;
    lastOriginLat = lat;
    lastOriginLon = lon;
    var latlng = L.latLng(lat, lon);

    if (originMarker) {
      originMarker.setLatLng(latlng);
    } else {
      originMarker = L.marker(latlng, {
        icon: originIcon,
        draggable: true,
        zIndexOffset: 1000
      }).addTo(map);
      originMarker.bindTooltip("Origin (0, 0)", {
        direction: "right",
        offset: [12, -22],
        className: "waypoint-label"
      });
      originMarker.on("dragstart", function () { mapInteracting = true; });
      originMarker.on("dragend", function () {
        var pos = originMarker.getLatLng();
        if (onOriginDrag) onOriginDrag(pos.lat, pos.lng);
      });
    }
  }

  function drawArrow(latlng, angleRad, color) {
    var angleDeg = angleRad * (180 / Math.PI);
    var icon = L.divIcon({
      className: "heading-arrow",
      html: '<svg width="20" height="20" viewBox="0 0 20 20" style="transform:rotate(' + (-angleDeg + 90) + 'deg)">'
        + '<polygon points="10,0 20,20 10,14 0,20" fill="' + color + '" stroke="#fff" stroke-width="1"/>'
        + '</svg>',
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });
    L.marker(latlng, { icon: icon, interactive: false }).addTo(overlayGroup);
  }

  function makeDraggableEnd(lat, lon, color, size, axisType) {
    var px = Math.max(size, 36);
    var icon = L.divIcon({
      className: "drag-handle",
      html: '<div style="width:' + px + 'px;height:' + px + 'px;border-radius:50%;'
        + 'background:' + color + ';opacity:0.45;border:2px solid ' + color + ';cursor:grab"></div>',
      iconSize: [px, px],
      iconAnchor: [px / 2, px / 2]
    });
    var handle = L.marker([lat, lon], {
      icon: icon,
      draggable: true,
      zIndexOffset: 900
    });

    handle.on("dragstart", function () { mapInteracting = true; });
    handle.on("drag", function () {
      var pos = handle.getLatLng();
      var bearing = bearingFromOrigin(pos.lat, pos.lng);
      if (axisType === "x") {
        bearing = (bearing - 90 + 360) % 360;
      }
      if (onHeadingDrag) onHeadingDrag(bearing, false);
    });
    handle.on("dragend", function () {
      var pos = handle.getLatLng();
      var bearing = bearingFromOrigin(pos.lat, pos.lng);
      if (axisType === "x") {
        bearing = (bearing - 90 + 360) % 360;
      }
      if (onHeadingDrag) onHeadingDrag(bearing, true);
    });

    return handle;
  }

  // --- Measure tool ---
  var SNAP_PX = 14;

  function initMeasure() {
    var MeasureControl = L.Control.extend({
      options: { position: "topright" },
      onAdd: function () {
        var bar = L.DomUtil.create("div", "leaflet-bar measure-control");
        measureBtn = L.DomUtil.create("a", "", bar);
        measureBtn.href = "#";
        measureBtn.title = "Measure distance";
        measureBtn.setAttribute("role", "button");
        measureBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">'
          + '<rect x="1" y="8" width="22" height="8" rx="1" transform="rotate(-45 12 12)"/>'
          + '<path d="M9.5 9.5l1.5 1.5M12 7l2 2M14.5 4.5l1.5 1.5M7 12l2 2M4.5 14.5l1.5 1.5"/>'
          + '</svg>';
        L.DomEvent.disableClickPropagation(bar);
        L.DomEvent.on(measureBtn, "click", function (e) {
          L.DomEvent.preventDefault(e);
          setMeasureActive(!measureActive);
        });
        return bar;
      }
    });
    new MeasureControl().addTo(map);

    map.on("click", function (e) {
      if (!measureActive) return;
      if (measurePts.length >= 2) measurePts = [];
      measurePts.push(snapLatLng(e.latlng));
      drawMeasure(null);
    });

    map.on("mousemove", function (e) {
      if (!measureActive || measurePts.length !== 1) return;
      drawMeasure(snapLatLng(e.latlng));
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && measureActive) setMeasureActive(false);
    });
  }

  function setMeasureActive(active) {
    measureActive = active;
    measurePts = [];
    measureGroup.clearLayers();
    L.DomUtil[active ? "addClass" : "removeClass"](map.getContainer(), "measuring");
    L.DomUtil[active ? "addClass" : "removeClass"](measureBtn, "active");
    if (active) map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
  }

  // Snap to the origin or a waypoint when the click lands close to one
  function snapLatLng(latlng) {
    var candidates = [];
    if (originMarker) candidates.push(originMarker.getLatLng());
    for (var i = 0; i < lastPoints.length; i++) {
      candidates.push(L.latLng(lastPoints[i].lat, lastPoints[i].lon));
    }
    var clickPx = map.latLngToContainerPoint(latlng);
    var best = latlng, bestDist = SNAP_PX;
    for (var j = 0; j < candidates.length; j++) {
      var d = clickPx.distanceTo(map.latLngToContainerPoint(candidates[j]));
      if (d < bestDist) {
        bestDist = d;
        best = candidates[j];
      }
    }
    return best;
  }

  function formatMeasure(meters) {
    var val = measureUseFeet ? meters / 0.3048 : meters;
    var unit = measureUseFeet ? "ft" : "m";
    return val.toFixed(val < 100 ? 2 : 1) + " " + unit;
  }

  function drawMeasure(cursorLatLng) {
    measureGroup.clearLayers();
    if (measurePts.length === 0) return;
    var a = measurePts[0];
    var b = measurePts.length > 1 ? measurePts[1] : cursorLatLng;

    var dot = { radius: 5, color: "#fff", weight: 2, fillColor: "#e67e22", fillOpacity: 1, interactive: false };
    L.circleMarker(a, dot).addTo(measureGroup);
    if (!b) return;
    if (measurePts.length > 1) L.circleMarker(b, dot).addTo(measureGroup);

    L.polyline([a, b], {
      color: "#e67e22",
      weight: 3,
      dashArray: measurePts.length > 1 ? null : "6,6",
      interactive: false
    }).addTo(measureGroup);

    var mid = L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2);
    L.marker(mid, {
      icon: L.divIcon({
        className: "measure-label",
        html: "<span>" + formatMeasure(map.distance(a, b)) + "</span>",
        iconSize: [0, 0],
        iconAnchor: [0, 14]
      }),
      interactive: false,
      zIndexOffset: 2000
    }).addTo(measureGroup);
  }

  function fitAll(points, originLat, originLon) {
    if (!map) return;
    var bounds = L.latLngBounds();
    if (originMarker) bounds.extend(originMarker.getLatLng());
    if (points) {
      for (var i = 0; i < points.length; i++) {
        bounds.extend([points[i].lat, points[i].lon]);
      }
    }
    if (bounds.isValid()) {
      programmaticMove = true;
      map.fitBounds(bounds.pad(0.15));
      programmaticMove = false;
    }
  }

  function render(points, originLat, originLon, headingDeg, useFeet, showLabels, showAxes) {
    if (!map) return;
    overlayGroup.clearLayers();
    lastPoints = points || [];
    if (showLabels === undefined) showLabels = true;
    if (showAxes === undefined) showAxes = true;
    if (measureUseFeet !== useFeet) {
      measureUseFeet = useFeet;
      if (measurePts.length === 2) drawMeasure(null);
    }

    var hasOrigin = !isNaN(originLat) && !isNaN(originLon);

    if (showAxes && hasOrigin && !isNaN(headingDeg) && points && points.length > 0) {
      var rLat = (Math.PI / 180) * originLat;
      var latMpd = 111132.954 - 559.822 * Math.cos(2 * rLat) + 1.175 * Math.cos(4 * rLat);
      var lonMpd = 111412.84 * Math.cos(rLat) - 93.5 * Math.cos(3 * rLat);

      var maxY = 0, minY = 0, maxX = 0, minX = 0;
      for (var k = 0; k < points.length; k++) {
        var py = points[k].yMeters;
        var px = points[k].xMeters;
        if (py > maxY) maxY = py;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (px < minX) minX = px;
      }

      var yRad = (Math.PI / 180) * (90 - headingDeg);
      var xRad = (Math.PI / 180) * (90 - (headingDeg + 90));

      function axisEnd(dist, angleRad) {
        return [
          originLat + (dist * Math.sin(angleRad)) / latMpd,
          originLon + (dist * Math.cos(angleRad)) / lonMpd
        ];
      }

      function formatDim(meters) {
        var val = Math.abs(meters);
        if (useFeet) val = val / 0.3048;
        var unit = useFeet ? "ft" : "m";
        return Math.round(val * 10) / 10 + " " + unit;
      }

      function dimLabel(start, end, text, color) {
        if (!showLabels) return;
        var midLat = (start[0] + end[0]) / 2;
        var midLon = (start[1] + end[1]) / 2;
        var icon = L.divIcon({
          className: "dim-label",
          html: '<span style="background:rgba(0,0,0,0.6);color:#fff;padding:1px 5px;border-radius:3px;font-size:11px;white-space:nowrap">' + text + '</span>',
          iconSize: [0, 0],
          iconAnchor: [0, 12]
        });
        L.marker([midLat, midLon], { icon: icon, interactive: false }).addTo(overlayGroup);
      }

      function grayLine(dist, angleRad) {
        var end = axisEnd(dist, angleRad);
        L.polyline(
          [[originLat, originLon], end],
          { color: "#cccccc", weight: 2, dashArray: "6,4", opacity: 0.8 }
        ).addTo(overlayGroup);
        dimLabel([originLat, originLon], end, formatDim(dist), "#cccccc");
        return end;
      }

      // Heading arrow (yellow) — always present, length = max |Y|
      var headingLen = Math.max(maxY, Math.abs(minY));
      if (headingLen === 0) headingLen = 10;
      var yEnd = axisEnd(headingLen, yRad);
      L.polyline(
        [[originLat, originLon], yEnd],
        { color: "#f1c40f", weight: 3, dashArray: "8,6", opacity: 0.9 }
      ).addTo(overlayGroup);
      drawArrow(yEnd, yRad, "#f1c40f");
      dimLabel([originLat, originLon], yEnd, formatDim(headingLen), "#f1c40f");
      var yHandle = makeDraggableEnd(yEnd[0], yEnd[1], "#f1c40f", 12, "y");
      yHandle.bindTooltip("Heading — drag to rotate", { direction: "right", offset: [10, 0], className: "waypoint-label" });
      overlayGroup.addLayer(yHandle);

      // Gray axis lines — only appear if points exist in that quadrant
      if (minY < 0) grayLine(minY, yRad);
      if (maxX > 0) grayLine(maxX, xRad);
      if (minX < 0) grayLine(minX, xRad);
    }

    if (!points || points.length === 0) {
      if (hasOrigin && !mapInteracting) {
        programmaticMove = true;
        map.panTo([originLat, originLon]);
        programmaticMove = false;
      }
      return;
    }

    // Auto-fit only when user is not interacting with the map
    if (!mapInteracting) {
      var bounds = L.latLngBounds();
      if (originMarker) bounds.extend(originMarker.getLatLng());
      for (var b = 0; b < points.length; b++) {
        bounds.extend([points[b].lat, points[b].lon]);
      }
      if (bounds.isValid()) {
        programmaticMove = true;
        map.fitBounds(bounds.pad(0.15));
        programmaticMove = false;
      }
    }

    // Waypoint markers with collision-avoiding labels
    var CHAR_W = 6.5;
    var LABEL_H = 18;
    var LABEL_PAD = 12;
    var BASE_GAP = 10;

    var pixelPositions = [];
    for (var i = 0; i < points.length; i++) {
      pixelPositions.push(map.latLngToContainerPoint([points[i].lat, points[i].lon]));
    }

    function labelRect(px, dir, offset, textLen) {
      var w = textLen * CHAR_W + LABEL_PAD;
      var h = LABEL_H;
      var ox = offset[0], oy = offset[1];
      var x, y;
      if (dir === "right") { x = px.x + ox; y = px.y + oy - h / 2; }
      else if (dir === "left") { x = px.x + ox - w; y = px.y + oy - h / 2; }
      else if (dir === "top") { x = px.x + ox - w / 2; y = px.y + oy - h; }
      else { x = px.x + ox - w / 2; y = px.y + oy; }
      return { x: x, y: y, w: w, h: h };
    }

    function rectsOverlap(a, b) {
      return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    var placedRects = [];
    var directions = ["right", "left", "top", "bottom"];

    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      var ll = [p.lat, p.lon];
      var px = pixelPositions[i];
      var nameLen = p.name.length;

      var marker = L.circleMarker(ll, {
        radius: 7,
        color: "#3498db",
        fillColor: "#2980b9",
        fillOpacity: 0.9,
        weight: 2
      });

      var bestDir = "right";
      var bestOffset = [BASE_GAP, 0];
      var placed = false;

      for (var mult = 1; mult <= 3 && !placed; mult++) {
        for (var d = 0; d < directions.length; d++) {
          var dir = directions[d];
          var gap = BASE_GAP * mult;
          var off;
          if (dir === "right") off = [gap, 0];
          else if (dir === "left") off = [-gap, 0];
          else if (dir === "top") off = [0, -gap];
          else off = [0, gap];

          var rect = labelRect(px, dir, off, nameLen);
          var collides = false;
          for (var r = 0; r < placedRects.length; r++) {
            if (rectsOverlap(rect, placedRects[r])) {
              collides = true;
              break;
            }
          }
          if (!collides) {
            bestDir = dir;
            bestOffset = off;
            placedRects.push(rect);
            placed = true;
            break;
          }
        }
      }

      if (!placed) {
        var fallbackOff = [BASE_GAP, -LABEL_H * placedRects.length % 4];
        bestDir = "right";
        bestOffset = [BASE_GAP, 0];
        placedRects.push(labelRect(px, bestDir, bestOffset, nameLen));
      }

      if (!showLabels) {
        // Labels hidden: show the name on hover only
        marker.bindTooltip(p.name, { direction: "right", offset: [BASE_GAP, 0], className: "waypoint-label" });
        overlayGroup.addLayer(marker);
        continue;
      }

      marker.bindTooltip(p.name, {
        permanent: true,
        direction: bestDir,
        offset: bestOffset,
        className: "waypoint-label"
      });
      overlayGroup.addLayer(marker);
    }

  }

  function getMap() {
    return map;
  }

  return {
    init: init,
    setOrigin: setOrigin,
    render: render,
    fitAll: fitAll,
    resetInteraction: function () { mapInteracting = false; },
    getMap: getMap
  };
})();

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
    var touchSize = Math.max(size, 18);
    var handle = L.circleMarker([lat, lon], {
      radius: touchSize,
      color: color,
      fillColor: color,
      fillOpacity: color === "transparent" ? 0 : 1,
      weight: 2,
      className: "axis-handle",
      bubblingMouseEvents: false
    });

    function startDrag(e) {
      if (e.originalEvent) {
        e.originalEvent.preventDefault();
        e.originalEvent.stopPropagation();
      }
      mapInteracting = true;
      map.dragging.disable();
      map.scrollWheelZoom.disable();
      map.doubleClickZoom.disable();
      if (map.touchZoom) map.touchZoom.disable();

      function onMove(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var pt = ev.touches ? ev.touches[0] : ev;
        var rect = map.getContainer().getBoundingClientRect();
        var latlng = map.containerPointToLatLng(L.point(pt.clientX - rect.left, pt.clientY - rect.top));
        handle.setLatLng(latlng);

        var bearing = bearingFromOrigin(latlng.lat, latlng.lng);
        if (axisType === "x") {
          bearing = (bearing - 90 + 360) % 360;
        }
        if (onHeadingDrag) onHeadingDrag(bearing);
      }

      function onUp(ev) {
        ev.preventDefault();
        map.dragging.enable();
        map.scrollWheelZoom.enable();
        map.doubleClickZoom.enable();
        if (map.touchZoom) map.touchZoom.enable();
        document.removeEventListener("mousemove", onMove, true);
        document.removeEventListener("mouseup", onUp, true);
        document.removeEventListener("touchmove", onMove, true);
        document.removeEventListener("touchend", onUp, true);
      }

      document.addEventListener("mousemove", onMove, { capture: true });
      document.addEventListener("mouseup", onUp, { capture: true });
      document.addEventListener("touchmove", onMove, { capture: true, passive: false });
      document.addEventListener("touchend", onUp, { capture: true });
    }

    handle.on("mousedown", startDrag);
    handle.on("touchstart", startDrag);

    return handle;
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

  function render(points, originLat, originLon, headingDeg) {
    if (!map) return;
    overlayGroup.clearLayers();

    var hasOrigin = !isNaN(originLat) && !isNaN(originLon);

    if (hasOrigin && !isNaN(headingDeg) && points && points.length > 0) {
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

      function grayLine(dist, angleRad) {
        var end = axisEnd(dist, angleRad);
        L.polyline(
          [[originLat, originLon], end],
          { color: "#cccccc", weight: 2, dashArray: "6,4", opacity: 0.8 }
        ).addTo(overlayGroup);
        L.circleMarker(end, {
          radius: 5, color: "#cccccc", fillColor: "#cccccc", fillOpacity: 1, weight: 1
        }).addTo(overlayGroup);
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
      var yHandle = makeDraggableEnd(yEnd[0], yEnd[1], "transparent", 10, "y");
      yHandle.bindTooltip("Heading — drag to rotate", { direction: "right", offset: [10, 0], className: "waypoint-label" });
      overlayGroup.addLayer(yHandle);

      // Gray axis lines — only appear if points exist in that quadrant
      if (minY < 0) grayLine(minY, yRad);
      if (maxX > 0) {
        var xPosEnd = grayLine(maxX, xRad);
        var xHandle = makeDraggableEnd(xPosEnd[0], xPosEnd[1], "transparent", 8, "x");
        xHandle.bindTooltip("X+ axis — drag to rotate", { direction: "right", offset: [10, 0], className: "waypoint-label" });
        overlayGroup.addLayer(xHandle);
      }
      if (minX < 0) grayLine(minX, xRad);
    }

    if (!points || points.length === 0) return;

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

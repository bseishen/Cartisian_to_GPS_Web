"use strict";

var Export = (function () {
  function escapeXml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function buildMetadata(config, trackName, rawPoints) {
    var csv = "";
    for (var i = 0; i < rawPoints.length; i++) {
      var p = rawPoints[i];
      if (i > 0) csv += "\n";
      csv += p.x + "," + p.y + "," + p.name;
    }
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      origin: { lat: parseFloat(config.lat), lon: parseFloat(config.lon) },
      heading: parseFloat(config.heading),
      units: config.feet ? "feet" : "meters",
      mirrorX: !!config.invertX,
      mirrorY: !!config.invertY,
      swapAxes: !!config.swapAxes,
      trackName: trackName || "track",
      csv: csv
    };
  }

  function timestampStr() {
    var d = new Date();
    var pad = function (n) { return n < 10 ? "0" + n : "" + n; };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
      + "_" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  }

  function generateKML(points, trackName, config, rawPoints) {
    var name = trackName || "Track";
    var kml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    kml += '<kml xmlns="http://www.opengis.net/kml/2.2">\n';
    kml += '<Document>\n';
    kml += '  <name>' + escapeXml(name) + '</name>\n';
    if (config && rawPoints) {
      var meta = buildMetadata(config, trackName, rawPoints);
      kml += '  <ExtendedData>\n';
      kml += '    <Data name="cartesian_to_gps"><value>' + escapeXml(JSON.stringify(meta)) + '</value></Data>\n';
      kml += '  </ExtendedData>\n';
    }
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      kml += '  <Placemark>\n';
      kml += '    <name>' + escapeXml(p.name) + '</name>\n';
      kml += '    <Point>\n';
      kml += '      <coordinates>' + p.lon + ',' + p.lat + ',0</coordinates>\n';
      kml += '    </Point>\n';
      kml += '  </Placemark>\n';
    }
    kml += '</Document>\n';
    kml += '</kml>';
    return kml;
  }

  function generateGPX(points, trackName, config, rawPoints) {
    var gpx = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.0">\n';
    if (config && rawPoints) {
      var meta = buildMetadata(config, trackName, rawPoints);
      gpx += '  <metadata>\n';
      gpx += '    <extensions>\n';
      gpx += '      <cartesian_to_gps>' + escapeXml(JSON.stringify(meta)) + '</cartesian_to_gps>\n';
      gpx += '    </extensions>\n';
      gpx += '  </metadata>\n';
    }
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      gpx += '     <wpt lat="' + p.lat + '" lon="' + p.lon + '">\n';
      gpx += '          <name>' + escapeXml(p.name) + '</name>\n';
      gpx += '     </wpt>\n';
    }
    gpx += '</gpx>';
    return gpx;
  }

  function generateGeoJSON(points, trackName, config, rawPoints) {
    var obj = {
      type: "FeatureCollection",
      crs: {
        type: "name",
        properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" }
      },
      features: []
    };
    if (config && rawPoints) {
      obj.cartesian_to_gps = buildMetadata(config, trackName, rawPoints);
    }
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      obj.features.push({
        type: "Feature",
        properties: { name: p.name },
        geometry: {
          type: "Point",
          coordinates: [p.lon, p.lat, 0]
        }
      });
    }
    return JSON.stringify(obj, null, 2);
  }

  function download(content, filename, mimeType) {
    var blob = new Blob([content], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function safeFilename(trackName) {
    var base = (trackName || "track").replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_");
    return base + "_" + timestampStr();
  }

  function downloadKML(points, trackName, config, rawPoints) {
    download(generateKML(points, trackName, config, rawPoints), safeFilename(trackName) + ".kml", "application/vnd.google-earth.kml+xml");
  }

  function downloadGPX(points, trackName, config, rawPoints) {
    download(generateGPX(points, trackName, config, rawPoints), safeFilename(trackName) + ".gpx", "application/gpx+xml");
  }

  function downloadGeoJSON(points, trackName, config, rawPoints) {
    download(generateGeoJSON(points, trackName, config, rawPoints), safeFilename(trackName) + ".geojson", "application/geo+json");
  }

  // --- Import / parse metadata from uploaded files ---

  function parseImport(text, filename) {
    var ext = (filename || "").split(".").pop().toLowerCase();
    var result = { metadata: null, waypoints: [] };

    if (ext === "geojson" || (ext !== "kml" && ext !== "gpx" && text.trim().charAt(0) === "{")) {
      return parseGeoJSONImport(text, result);
    }
    if (ext === "gpx" || (ext !== "kml" && text.indexOf("<gpx") !== -1)) {
      return parseGPXImport(text, result);
    }
    return parseKMLImport(text, result);
  }

  function parseGeoJSONImport(text, result) {
    try {
      var obj = JSON.parse(text);
      if (obj.cartesian_to_gps) {
        result.metadata = obj.cartesian_to_gps;
      }
      if (obj.features) {
        for (var i = 0; i < obj.features.length; i++) {
          var f = obj.features[i];
          if (f.geometry && f.geometry.type === "Point" && f.geometry.coordinates) {
            result.waypoints.push({
              lat: f.geometry.coordinates[1],
              lon: f.geometry.coordinates[0],
              name: (f.properties && f.properties.name) || ("Point " + (i + 1))
            });
          }
        }
      }
    } catch (e) {}
    return result;
  }

  function getXmlTextContent(parent, tagName) {
    var el = parent.getElementsByTagName(tagName);
    if (el.length > 0 && el[0].textContent) return el[0].textContent.trim();
    return "";
  }

  function parseKMLImport(text, result) {
    try {
      var parser = new DOMParser();
      var doc = parser.parseFromString(text, "text/xml");
      var dataEls = doc.getElementsByTagName("Data");
      for (var d = 0; d < dataEls.length; d++) {
        if (dataEls[d].getAttribute("name") === "cartesian_to_gps") {
          var val = getXmlTextContent(dataEls[d], "value");
          if (val) result.metadata = JSON.parse(val);
        }
      }
      var placemarks = doc.getElementsByTagName("Placemark");
      for (var i = 0; i < placemarks.length; i++) {
        var name = getXmlTextContent(placemarks[i], "name");
        var coords = getXmlTextContent(placemarks[i], "coordinates");
        if (coords) {
          var parts = coords.split(",");
          if (parts.length >= 2) {
            result.waypoints.push({
              lat: parseFloat(parts[1]),
              lon: parseFloat(parts[0]),
              name: name || ("Point " + (i + 1))
            });
          }
        }
      }
    } catch (e) {}
    return result;
  }

  function parseGPXImport(text, result) {
    try {
      var parser = new DOMParser();
      var doc = parser.parseFromString(text, "text/xml");
      var extEls = doc.getElementsByTagName("cartesian_to_gps");
      if (extEls.length > 0 && extEls[0].textContent) {
        result.metadata = JSON.parse(extEls[0].textContent.trim());
      }
      var wpts = doc.getElementsByTagName("wpt");
      for (var i = 0; i < wpts.length; i++) {
        var lat = parseFloat(wpts[i].getAttribute("lat"));
        var lon = parseFloat(wpts[i].getAttribute("lon"));
        var name = getXmlTextContent(wpts[i], "name");
        if (!isNaN(lat) && !isNaN(lon)) {
          result.waypoints.push({
            lat: lat,
            lon: lon,
            name: name || ("Point " + (i + 1))
          });
        }
      }
    } catch (e) {}
    return result;
  }

  return {
    generateKML: generateKML,
    generateGPX: generateGPX,
    generateGeoJSON: generateGeoJSON,
    downloadKML: downloadKML,
    downloadGPX: downloadGPX,
    downloadGeoJSON: downloadGeoJSON,
    parseImport: parseImport
  };
})();

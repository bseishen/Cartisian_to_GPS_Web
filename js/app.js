"use strict";

(function () {
  var els = {
    lat: document.getElementById("inputLat"),
    lon: document.getElementById("inputLon"),
    heading: document.getElementById("inputHeading"),
    invertX: document.getElementById("invertX"),
    invertY: document.getElementById("invertY"),
    swapAxes: document.getElementById("swapAxes"),
    unitMeters: document.getElementById("unitMeters"),
    unitFeet: document.getElementById("unitFeet"),
    sampleSelect: document.getElementById("sampleSelect"),
    csvInput: document.getElementById("csvInput"),
    uploadZone: document.getElementById("uploadZone"),
    trackInfo: document.getElementById("trackInfo"),
    pointList: document.getElementById("pointList"),
    btnGPS: document.getElementById("btnGPS"),
    exportFormat: document.getElementById("exportFormat"),
    btnExport: document.getElementById("btnExport"),
    presetLocation: document.getElementById("presetLocation"),
    panel: document.getElementById("panel"),
    sheetToggle: document.getElementById("sheetToggle"),
    sheetHandle: document.getElementById("sheetHandle"),
    trackNameField: document.getElementById("trackNameField"),
    trackNameInput: document.getElementById("trackNameInput")
  };

  var PRESET_LOCATIONS = [
    { name: "Barnstormers", lat: 35.31073903227626, lon: -89.91878539323808, heading: 200 }
  ];

  var currentPoints = [];
  var convertedPoints = [];
  var currentTrackName = "";
  var debounceTimer = null;

  function getConfig() {
    return {
      lat: els.lat.value,
      lon: els.lon.value,
      heading: els.heading.value,
      invertX: els.invertX.checked,
      invertY: els.invertY.checked,
      swapAxes: els.swapAxes.checked,
      feet: els.unitFeet.checked
    };
  }

  function update() {
    var config = getConfig();
    var lat = parseFloat(config.lat);
    var lon = parseFloat(config.lon);
    var heading = parseFloat(config.heading);

    if (currentPoints.length > 0 && !isNaN(lat) && !isNaN(lon)) {
      convertedPoints = Converter.convertPoints(config, currentPoints);
    } else {
      convertedPoints = [];
    }

    if (!isNaN(lat) && !isNaN(lon)) {
      TrackMap.setOrigin(lat, lon);
    }
    TrackMap.render(convertedPoints, lat, lon, heading, els.unitFeet.checked);

    saveSettings();
  }

  function debouncedUpdate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(update, 150);
  }

  function setTrack(points, name) {
    currentPoints = points;
    currentTrackName = name || "track";
    if (points.length > 0) {
      els.trackInfo.innerHTML = "<strong>" + escapeHtml(currentTrackName) + "</strong> &mdash; " + points.length + " points";
      els.trackInfo.setAttribute("data-has-points", "");
      els.trackNameInput.value = currentTrackName;
      els.trackNameField.hidden = false;
      buildPointList(points);
    } else {
      els.trackInfo.textContent = "";
      els.trackInfo.removeAttribute("data-has-points");
      els.pointList.hidden = true;
      els.trackInfo.classList.remove("expanded");
      els.trackNameField.hidden = true;
    }
    TrackMap.resetInteraction();
    update();
  }

  function escapeHtml(str) {
    var d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function buildPointList(points) {
    var html = "<table><thead><tr><th>#</th><th>X</th><th>Y</th><th>Name</th></tr></thead><tbody>";
    for (var i = 0; i < points.length; i++) {
      html += "<tr><td>" + (i + 1) + "</td><td>" + points[i].x + "</td><td>" + points[i].y + "</td><td>" + escapeHtml(points[i].name) + "</td></tr>";
    }
    html += "</tbody></table>";
    els.pointList.innerHTML = html;
    els.pointList.hidden = true;
    els.trackInfo.classList.remove("expanded");
  }

  els.trackInfo.addEventListener("click", function () {
    if (!els.trackInfo.hasAttribute("data-has-points")) return;
    var show = els.pointList.hidden;
    els.pointList.hidden = !show;
    els.trackInfo.classList.toggle("expanded", show);
  });

  els.trackNameInput.addEventListener("input", function () {
    currentTrackName = els.trackNameInput.value || "track";
    els.trackInfo.innerHTML = "<strong>" + escapeHtml(currentTrackName) + "</strong> &mdash; " + currentPoints.length + " points";
    els.trackInfo.setAttribute("data-has-points", "");
    saveSettings();
  });

  // --- Preset locations ---
  function populatePresets() {
    for (var i = 0; i < PRESET_LOCATIONS.length; i++) {
      var opt = document.createElement("option");
      opt.value = i;
      opt.textContent = PRESET_LOCATIONS[i].name;
      els.presetLocation.appendChild(opt);
    }
  }

  els.presetLocation.addEventListener("change", function () {
    var idx = this.value;
    if (idx === "") return;
    var preset = PRESET_LOCATIONS[parseInt(idx)];
    els.lat.value = preset.lat;
    els.lon.value = preset.lon;
    els.heading.value = preset.heading;
    TrackMap.resetInteraction();
    update();
  });

  // Clear preset dropdown when user manually edits lat/lon/heading
  function clearPresetOnManualEdit() {
    els.presetLocation.value = "";
  }
  els.lat.addEventListener("input", clearPresetOnManualEdit);
  els.lon.addEventListener("input", clearPresetOnManualEdit);
  els.heading.addEventListener("input", clearPresetOnManualEdit);

  // --- Sample tracks ---
  function populateSamples() {
    var names = CSV.getSampleNames();
    for (var i = 0; i < names.length; i++) {
      var opt = document.createElement("option");
      opt.value = names[i];
      opt.textContent = names[i];
      els.sampleSelect.appendChild(opt);
    }
  }

  els.sampleSelect.addEventListener("change", function () {
    var name = this.value;
    if (!name) return;
    var points = CSV.loadSample(name);
    els.csvInput.value = "";
    setTrack(points, name);
  });

  // --- File upload ---
  var IMPORTABLE_EXTS = ["kml", "gpx", "geojson"];

  function handleFileUpload(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var text = e.target.result;
      var ext = (file.name || "").split(".").pop().toLowerCase();

      if (IMPORTABLE_EXTS.indexOf(ext) !== -1) {
        importGeoFile(text, file.name);
      } else {
        var points = CSV.parse(text);
        els.sampleSelect.value = "";
        setTrack(points, file.name.replace(/\.\w+$/, ""));
      }
    };
    reader.readAsText(file);
  }

  function importGeoFile(text, filename) {
    var result = Export.parseImport(text, filename);
    els.sampleSelect.value = "";

    if (result.metadata && result.metadata.csv) {
      var meta = result.metadata;
      if (meta.origin) {
        els.lat.value = meta.origin.lat;
        els.lon.value = meta.origin.lon;
      }
      if (meta.heading !== undefined) {
        els.heading.value = meta.heading;
      }
      if (meta.units === "meters") {
        els.unitMeters.checked = true;
      } else {
        els.unitFeet.checked = true;
      }
      els.invertX.checked = !!meta.mirrorX;
      els.invertY.checked = !!meta.mirrorY;
      els.swapAxes.checked = !!meta.swapAxes;

      els.presetLocation.value = "";

      var points = CSV.parse(meta.csv);
      var trackName = meta.trackName || filename.replace(/\.\w+$/, "");
      setTrack(points, trackName);
    } else if (result.waypoints.length > 0) {
      var fallbackName = filename.replace(/\.\w+$/, "");
      var wpPoints = [];
      for (var i = 0; i < result.waypoints.length; i++) {
        wpPoints.push({
          x: 0, y: 0,
          name: result.waypoints[i].name
        });
      }
      currentPoints = wpPoints;
      currentTrackName = fallbackName;
      convertedPoints = result.waypoints;
      els.trackInfo.innerHTML = "<strong>" + escapeHtml(fallbackName) + "</strong> &mdash; " + result.waypoints.length + " points (imported GPS)";
      els.trackInfo.setAttribute("data-has-points", "");
      TrackMap.resetInteraction();
      if (!isNaN(parseFloat(els.lat.value)) && !isNaN(parseFloat(els.lon.value))) {
        TrackMap.setOrigin(parseFloat(els.lat.value), parseFloat(els.lon.value));
      }
      TrackMap.render(convertedPoints, parseFloat(els.lat.value), parseFloat(els.lon.value), parseFloat(els.heading.value), els.unitFeet.checked);
    }
  }

  els.uploadZone.addEventListener("click", function () {
    els.csvInput.click();
  });

  els.csvInput.addEventListener("change", function () {
    if (!this.files || !this.files[0]) return;
    handleFileUpload(this.files[0]);
  });

  els.uploadZone.addEventListener("dragover", function (e) {
    e.preventDefault();
    this.classList.add("dragover");
  });

  els.uploadZone.addEventListener("dragleave", function () {
    this.classList.remove("dragover");
  });

  els.uploadZone.addEventListener("drop", function (e) {
    e.preventDefault();
    this.classList.remove("dragover");
    if (!e.dataTransfer.files || !e.dataTransfer.files[0]) return;
    handleFileUpload(e.dataTransfer.files[0]);
  });

  // --- GPS button ---
  els.btnGPS.addEventListener("click", function () {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by this browser.");
      return;
    }
    els.btnGPS.textContent = "Locating...";
    els.btnGPS.disabled = true;
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        els.lat.value = pos.coords.latitude;
        els.lon.value = pos.coords.longitude;
        els.btnGPS.innerHTML = "&#9737; My Location";
        els.btnGPS.disabled = false;
        TrackMap.resetInteraction();
        update();
      },
      function () {
        alert("Unable to get location. Make sure location access is allowed.");
        els.btnGPS.innerHTML = "&#9737; My Location";
        els.btnGPS.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  // --- Export ---
  els.btnExport.addEventListener("click", function () {
    if (convertedPoints.length === 0) return;
    var fmt = els.exportFormat.value;
    var cfg = getConfig();
    if (fmt === "gpx") {
      Export.downloadGPX(convertedPoints, currentTrackName, cfg, currentPoints);
    } else if (fmt === "geojson") {
      Export.downloadGeoJSON(convertedPoints, currentTrackName, cfg, currentPoints);
    } else {
      Export.downloadKML(convertedPoints, currentTrackName, cfg, currentPoints);
    }
  });

  // --- Bottom sheet (mobile) ---
  els.sheetToggle.addEventListener("click", function () {
    els.panel.classList.add("open");
  });

  els.sheetHandle.addEventListener("click", function () {
    els.panel.classList.remove("open");
  });

  document.addEventListener("click", function (e) {
    if (window.innerWidth >= 768) return;
    if (!els.panel.classList.contains("open")) return;
    if (els.panel.contains(e.target) || e.target === els.sheetToggle) return;
    els.panel.classList.remove("open");
  });

  // --- Heading wrapping ---
  function wrapHeading() {
    var val = parseFloat(els.heading.value);
    if (isNaN(val)) return;
    val = ((val % 360) + 360) % 360;
    els.heading.value = Math.round(val * 100) / 100;
  }

  els.heading.addEventListener("change", wrapHeading);

  // --- Live update listeners ---
  var inputs = [els.lat, els.lon, els.heading];
  for (var i = 0; i < inputs.length; i++) {
    inputs[i].addEventListener("input", debouncedUpdate);
  }

  var checks = [els.invertX, els.invertY, els.swapAxes, els.unitMeters, els.unitFeet];
  for (var j = 0; j < checks.length; j++) {
    checks[j].addEventListener("change", update);
  }

  // --- localStorage ---
  var STORAGE_KEY = "cartesian_to_gps_settings";

  function saveSettings() {
    try {
      var data = {
        lat: els.lat.value,
        lon: els.lon.value,
        heading: els.heading.value,
        invertX: els.invertX.checked,
        invertY: els.invertY.checked,
        swapAxes: els.swapAxes.checked,
        feet: els.unitFeet.checked,
        sampleTrack: els.sampleSelect.value,
        trackName: currentTrackName
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function loadSettings() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data.lat) els.lat.value = data.lat;
      if (data.lon) els.lon.value = data.lon;
      if (data.heading) els.heading.value = data.heading;
      els.invertX.checked = !!data.invertX;
      els.invertY.checked = !!data.invertY;
      els.swapAxes.checked = !!data.swapAxes;
      if (data.feet) {
        els.unitFeet.checked = true;
      } else {
        els.unitMeters.checked = true;
      }
      if (data.sampleTrack) {
        els.sampleSelect.value = data.sampleTrack;
        var pts = CSV.loadSample(data.sampleTrack);
        if (pts.length > 0) {
          currentPoints = pts;
          currentTrackName = data.trackName || data.sampleTrack;
          els.trackInfo.innerHTML = "<strong>" + escapeHtml(currentTrackName) + "</strong> &mdash; " + pts.length + " points";
          els.trackInfo.setAttribute("data-has-points", "");
          els.trackNameInput.value = currentTrackName;
          els.trackNameField.hidden = false;
        }
      }
    } catch (e) {}
  }

  // --- Map drag callbacks ---
  function onOriginDrag(lat, lon) {
    els.lat.value = lat;
    els.lon.value = lon;
    update();
  }

  function onHeadingDrag(bearing) {
    els.heading.value = Math.round(bearing * 100) / 100;
    update();
  }

  // --- Sample CSV download ---
  document.getElementById("downloadSampleCSV").addEventListener("click", function (e) {
    e.preventDefault();
    var names = CSV.getSampleNames();
    var csv = CSV.getSampleCSV(names[0]);
    if (!csv) return;
    var blob = new Blob([csv], { type: "text/csv" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "sample_track.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // --- Init ---
  TrackMap.init("map", onOriginDrag, onHeadingDrag);
  populatePresets();
  populateSamples();
  loadSettings();
  update();
})();

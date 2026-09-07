"use strict";

var CSV = (function () {
  var SAMPLE_TRACKS = {
    "2018 Regional Qualifier (Metric)": "0,14,Start Pad\n28,14,Gate 1\n42,14,Flag 1\n56,14,Flag 2\n70,14,Flag 3\n84,14,Gate 2\n77,28,Hurdle 3\n63,35,Gate 4\n49,28,Flag 4\n49,42,Gate 5\n49,49,Gate 6\n70,42,Gate 7\n49,63,Gate 8\n28,42,Gate 9\n35,49,Flag 5\n28,56,Flag 6\n7,42,Gate 10\n7,28,Flag 7",
    "2018 Regional Final (Metric)": "42,0,Start Gate\n28,0,Orbit Ladder\n14,0,Flag 1\n3,0,Double Gate 1\n7,24,Double Gate 2\n3,41,Triple Gate 3\n0,55,Flag 2\n14,55,Gate 4\n35,55,Gate 5\n56,55,Gate 6\n73,55,Flag 3\n77,38,Gate 7\n63,41.5,Hurdle 1\n49,38,Gate 8\n35,41.5,Hurdle 2\n21,38,Gate 9\n14,31,Flag 4\n14,17,Flag 5\n21,10,Gate 10\n28,10,Gravity Gate 1\n70,17,Gravity Gate 2\n49,17,Gate 11\n49,24,Gate 12\n49,31,Gate 13\n77,31,Gate 14\n84,24,Gate 15\n70,1.5,SUPER HURDLE",
    "2019 Global Qualifier Track": "10.668,0,Start Gate\n35.052,12.192,G2\n35.052,0,G3\n58.5216,12.192,F4\n53.34,12.192,G5\n61.5696,12.192,G6\n59.436,18.288,G7\n47.244,18.288,G9\n47.244,20.4216,F8\n16.764,18.288,G11\n9.144,21.336,F13\n4.572,15.24,F14\n0,9.144,F15"
  };

  function parse(csvText) {
    var lines = csvText.trim().split(/\r?\n/);
    var points = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var parts = line.split(",");
      if (parts.length < 3) continue;
      var x = parseFloat(parts[0]);
      var y = parseFloat(parts[1]);
      var name = parts.slice(2).join(",").trim();
      if (isNaN(x) || isNaN(y)) continue;
      points.push({ x: x, y: y, name: name });
    }
    return points;
  }

  function getSampleNames() {
    return Object.keys(SAMPLE_TRACKS);
  }

  function loadSample(name) {
    var csv = SAMPLE_TRACKS[name];
    if (!csv) return [];
    return parse(csv);
  }

  function getSampleCSV(name) {
    return SAMPLE_TRACKS[name] || "";
  }

  return {
    parse: parse,
    getSampleNames: getSampleNames,
    loadSample: loadSample,
    getSampleCSV: getSampleCSV
  };
})();

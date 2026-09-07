"use strict";

var Converter = (function () {
  function transpose(originLat, originLon, x, y, h, latMetersPerDeg, lonMetersPerDeg) {
    var xprime = x * Math.cos(h) - y * Math.sin(h);
    var yprime = x * Math.sin(h) + y * Math.cos(h);
    return {
      lat: originLat + yprime / latMetersPerDeg,
      lon: originLon + xprime / lonMetersPerDeg
    };
  }

  function convertPoints(config, rawPoints) {
    var olat = parseFloat(config.lat) || 0;
    var olon = parseFloat(config.lon) || 0;
    var headingDeg = parseFloat(config.heading) || 0;

    var h = (Math.PI / 180) * (360 - headingDeg);
    var rLat = (Math.PI / 180) * olat;
    var latMetersPerDeg = 111132.954 - 559.822 * Math.cos(2 * rLat) + 1.175 * Math.cos(4 * rLat);
    var lonMetersPerDeg = 111412.84 * Math.cos(rLat) - 93.5 * Math.cos(3 * rLat);

    var results = [];
    for (var i = 0; i < rawPoints.length; i++) {
      var x = rawPoints[i].x;
      var y = rawPoints[i].y;

      if (config.invertX) x = x * -1;
      if (config.invertY) y = y * -1;

      if (config.swapAxes) {
        var temp = y;
        y = x;
        x = temp;
      }

      if (config.feet) {
        x = x * 0.3048;
        y = y * 0.3048;
      }

      var result = transpose(olat, olon, x, y, h, latMetersPerDeg, lonMetersPerDeg);
      results.push({
        lat: result.lat,
        lon: result.lon,
        name: rawPoints[i].name,
        xMeters: x,
        yMeters: y
      });
    }
    return results;
  }

  return { convertPoints: convertPoints };
})();

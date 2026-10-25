/*
 * TML shared basemaps for the lab dashboards
 * ------------------------------------------
 * Every basemap here is free and needs no API key, account, or server:
 *
 *   light / dark / streets  OpenFreeMap vector tiles (Positron, Dark, Liberty styles)
 *                           https://openfreemap.org  - free, no keys, no request limits,
 *                           commercial use allowed; attribution required (added below).
 *                           Drawn with MapLibre GL JS.
 *   satellite               USGS The National Map imagery (US public domain).
 *
 * If a browser cannot draw vector maps (no WebGL, or MapLibre failed to load), the
 * light/dark/streets choices fall back to USGS Topo raster tiles (also public domain),
 * restyled with a CSS filter. Nothing here uses tile.openstreetmap.org, whose volunteer
 * servers block requests without a Referer (for example pages opened as local files).
 *
 * Change the look of every dashboard by editing BASEMAPS below.
 *
 * Load order in a dashboard <head>:
 *   leaflet.js -> maplibre-gl.js (+ .css) -> leaflet-maplibre-gl.js -> basemaps.js
 *
 * Leaflet:   TMLBasemaps.addTo(map, 'light');        // 'light' | 'dark' | 'streets' | 'satellite'
 *            TMLBasemaps.addTo(map, 'dark', {switcher: false});
 *            TMLBasemaps.layer('light')              // a single Leaflet layer
 *            TMLBasemaps.rasterLayer('light')        // always a plain tile layer (e.g. for a minimap)
 * deck.gl:   var base = TMLBasemaps.underlay('container-id', 'dark');  // vector map under the deck canvas
 *            base && base.sync(viewState);                              // call whenever the view changes
 *            TMLBasemaps.loadTile('dark', z, x, y)   // raster tile Promise, for a deck TileLayer fallback
 */
(function (global) {
  'use strict';

  var OFM = 'https://tiles.openfreemap.org/styles/';
  var OFM_ATTR = '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' +
    '&copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> ' +
    'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
  var USGS = 'https://basemap.nationalmap.gov/arcgis/rest/services/';
  var USGS_ATTR = 'Basemap: <a href="https://www.usgs.gov/programs/national-geospatial-program/national-map" target="_blank" rel="noopener">USGS The National Map</a>';

  var BASEMAPS = {
    light:     { label: 'Map (light)', type: 'vector', style: OFM + 'positron', attribution: OFM_ATTR, fallback: 'usgsLight' },
    dark:      { label: 'Map (dark)',  type: 'vector', style: OFM + 'dark',     attribution: OFM_ATTR, fallback: 'usgsDark' },
    streets:   { label: 'Streets',     type: 'vector', style: OFM + 'liberty',  attribution: OFM_ATTR, fallback: 'usgsTopo' },
    satellite: { label: 'Satellite (USGS)', type: 'raster', url: USGS + 'USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
                 attribution: USGS_ATTR, maxNativeZoom: 16 },
    // Raster fallbacks (used automatically, not shown as separate choices)
    usgsLight: { label: 'Map (light)', type: 'raster', url: USGS + 'USGSTopo/MapServer/tile/{z}/{y}/{x}', attribution: USGS_ATTR,
                 maxNativeZoom: 16, filter: 'grayscale(100%) brightness(1.12) contrast(0.8)' },
    usgsDark:  { label: 'Map (dark)',  type: 'raster', url: USGS + 'USGSTopo/MapServer/tile/{z}/{y}/{x}', attribution: USGS_ATTR,
                 maxNativeZoom: 16, filter: 'invert(100%) grayscale(100%) brightness(0.75) contrast(1.1)' },
    usgsTopo:  { label: 'Streets',     type: 'raster', url: USGS + 'USGSTopo/MapServer/tile/{z}/{y}/{x}', attribution: USGS_ATTR,
                 maxNativeZoom: 16, filter: '' }
  };
  var ALIASES = { osm: 'streets', topo: 'streets', imagery: 'satellite' };
  var CHOICES = ['light', 'dark', 'streets', 'satellite'];

  function key(k) { k = ALIASES[k] || k; return BASEMAPS[k] ? k : 'light'; }

  var webgl = null;
  function hasWebGL() {
    if (webgl === null) {
      try { var c = document.createElement('canvas'); webgl = !!c.getContext('webgl2'); } catch (e) { webgl = false; }
    }
    return webgl;
  }
  function canDrawVector() { return !!(global.maplibregl && hasWebGL()); }
  function canDrawVectorInLeaflet() { return canDrawVector() && !!(global.L && global.L.maplibreGL); }

  // Resolve a choice to a raster definition (its fallback when it is a vector style)
  function rasterKey(k) { k = key(k); return BASEMAPS[k].type === 'vector' ? BASEMAPS[k].fallback : k; }

  var cssDone = false;
  function injectCss() {
    if (cssDone || !global.document) return;
    var css = '.tml-has-underlay>canvas{position:absolute;left:0;top:0;z-index:1}' +
              '.tml-basemap-underlay .maplibregl-ctrl-attrib{font-size:10px}';
    Object.keys(BASEMAPS).forEach(function (k) {
      var f = BASEMAPS[k].filter;
      if (f) css += '.tml-basemap-' + k + '{-webkit-filter:' + f + ';filter:' + f + ';}';
    });
    var el = document.createElement('style');
    el.setAttribute('data-tml-basemaps', '');
    el.appendChild(document.createTextNode(css));
    (document.head || document.documentElement).appendChild(el);
    cssDone = true;
  }

  function rasterLayer(k, extra) {
    injectCss();
    var rk = rasterKey(k), b = BASEMAPS[rk];
    var o = { attribution: b.attribution, maxNativeZoom: b.maxNativeZoom, maxZoom: 20, className: 'tml-basemap-' + rk };
    if (extra) { for (var p in extra) { if (Object.prototype.hasOwnProperty.call(extra, p)) o[p] = extra[p]; } }
    return global.L.tileLayer(b.url, o);
  }

  function layer(k, extra) {
    k = key(k);
    var b = BASEMAPS[k];
    if (b.type === 'vector' && canDrawVectorInLeaflet()) {
      return global.L.maplibreGL({ style: b.style, attribution: b.attribution });
    }
    return rasterLayer(k, extra);
  }

  function addTo(map, k, opts) {
    opts = opts || {};
    k = key(k);
    var keys = (opts.choices || CHOICES).map(key);
    if (keys.indexOf(k) < 0) keys.unshift(k);
    var layers = {}, def = null;
    keys.forEach(function (c) {
      if (layers[BASEMAPS[c].label]) return;
      var l = layer(c, opts.layerOptions);
      layers[BASEMAPS[c].label] = l;
      if (c === k) def = l;
    });
    def.addTo(map);
    if (def.bringToBack) def.bringToBack();
    if (opts.switcher !== false && keys.length > 1 && global.L.control && global.L.control.layers) {
      global.L.control.layers(layers, null, { position: opts.position || 'topright', collapsed: true }).addTo(map);
    }
    return def;
  }

  // A non-interactive MapLibre map placed underneath another renderer (deck.gl) in the same container.
  function underlay(container, k) {
    k = key(k);
    var el = typeof container === 'string' ? document.getElementById(container) : container;
    var b = BASEMAPS[k];
    if (!el || b.type !== 'vector' || !canDrawVector()) return null;
    injectCss();
    var div = document.createElement('div');
    div.className = 'tml-basemap-underlay';
    div.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;z-index:0;';
    el.insertBefore(div, el.firstChild);
    el.classList.add('tml-has-underlay');
    var glMap;
    try {
      glMap = new global.maplibregl.Map({
        container: div, style: b.style, interactive: false, center: [-79.3, 35.6], zoom: 6,
        attributionControl: { compact: false }   // credits come from the OpenFreeMap tile source
      });
    } catch (e) { el.removeChild(div); el.classList.remove('tml-has-underlay'); return null; }
    if (global.ResizeObserver) { new global.ResizeObserver(function () { glMap.resize(); }).observe(el); }
    return {
      map: glMap,
      sync: function (vs) {
        if (!vs) return;
        glMap.jumpTo({ center: [vs.longitude, vs.latitude], zoom: vs.zoom, bearing: vs.bearing || 0, pitch: vs.pitch || 0 });
      }
    };
  }

  function tileUrl(k, z, x, y) {
    return BASEMAPS[rasterKey(k)].url.replace('{z}', z).replace('{x}', x).replace('{y}', y);
  }

  function loadTile(k, z, x, y) {
    var b = BASEMAPS[rasterKey(k)];
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        if (!b.filter) { resolve(img); return; }
        try {
          var c = document.createElement('canvas');
          c.width = img.naturalWidth || 256; c.height = img.naturalHeight || 256;
          var ctx = c.getContext('2d');
          if (!('filter' in ctx)) { resolve(img); return; }
          ctx.filter = b.filter;
          ctx.drawImage(img, 0, 0);
          resolve(c);
        } catch (e) { resolve(img); }
      };
      img.onerror = reject;
      img.src = tileUrl(k, z, x, y);
    });
  }

  global.TMLBasemaps = {
    list: BASEMAPS,
    layer: layer,
    rasterLayer: rasterLayer,
    addTo: addTo,
    underlay: underlay,
    tileUrl: tileUrl,
    loadTile: loadTile,
    canDrawVector: canDrawVector,
    maxNativeZoom: function (k) { return BASEMAPS[rasterKey(k)].maxNativeZoom; },
    attribution: function (k) { return BASEMAPS[key(k)].attribution; }
  };
})(window);

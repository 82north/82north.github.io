(function () {
    var stage = document.querySelector(".season-stage");
    var canvas = document.getElementById("season-flash");
    if (!stage || !canvas || !window.L) return;

    var loopMs = 48000;
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var playing = true;
    var ships = [];
    var span = { start: 0, end: 1 };
    var ctx = canvas.getContext("2d");

    var map = L.map("season-map", {
        zoomControl: false,
        attributionControl: true,
        scrollWheelZoom: false,
        worldCopyJump: false,
        minZoom: 2,
        maxZoom: 8,
        zoomSnap: 1
    });

    L.control.zoom({ position: "topright" }).addTo(map);

    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
        attribution: "Esri, Garmin, USGS",
        maxZoom: 16,
        detectRetina: true
    }).addTo(map);

    function frameArchipelago() {
        var narrow = window.innerWidth < 760;
        if (narrow) {
            map.setView([73.2, -95], 6, { animate: false });
            return;
        }
        map.fitBounds([[69.7, -110], [76.7, -80]], {
            paddingTopLeft: [20, 40],
            paddingBottomRight: [20, 16],
            animate: false,
            maxZoom: 5
        });
        map.setZoom(Math.min(map.getMaxZoom(), map.getZoom() + 2), { animate: false });
    }

    function dayMs(iso) {
        return Date.parse(iso + "T00:00:00Z");
    }

    function prepare(ship) {
        var seg = [];
        var total = 0;
        for (var i = 1; i < ship.line.length; i++) {
            var dy = ship.line[i][0] - ship.line[i - 1][0];
            var dx = ship.line[i][1] - ship.line[i - 1][1];
            if (dx > 180) dx -= 360;
            if (dx < -180) dx += 360;
            var mid = (ship.line[i][0] + ship.line[i - 1][0]) * Math.PI / 360;
            var d = Math.hypot(dy, dx * Math.cos(mid));
            total += d;
            seg.push(d);
        }
        ship.seg = seg;
        ship.total = total || 1;
        ship.t0 = dayMs(ship.start);
        ship.t1 = dayMs(ship.end);
        ship.offset = (ship.name.length * 370) % 2100;
    }

    function inFrame(lat, lon) {
        return lat >= 69.5 && lat <= 77 && lon >= -112 && lon <= -78;
    }

    function entryU(ship) {
        var walked = 0;
        for (var i = 0; i < ship.seg.length; i++) {
            var a = ship.line[i];
            var b = ship.line[i + 1];
            if (!inFrame(b[0], b[1])) {
                walked += ship.seg[i];
                continue;
            }
            if (inFrame(a[0], a[1])) return walked / ship.total;
            return (walked + ship.seg[i]) / ship.total;
        }
        return 0;
    }

    function along(ship, u) {
        var target = Math.max(0, Math.min(1, u)) * ship.total;
        var walked = 0;
        for (var i = 0; i < ship.seg.length; i++) {
            if (walked + ship.seg[i] >= target || i === ship.seg.length - 1) {
                var f = ship.seg[i] ? (target - walked) / ship.seg[i] : 0;
                f = Math.max(0, Math.min(1, f));
                var a = ship.line[i];
                var b = ship.line[i + 1];
                var lon = a[1] + (b[1] - a[1]) * f;
                return [a[0] + (b[0] - a[0]) * f, lon];
            }
            walked += ship.seg[i];
        }
        return ship.line[ship.line.length - 1];
    }

    function resize() {
        var rect = stage.getBoundingClientRect();
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.round(rect.width * dpr));
        canvas.height = Math.max(1, Math.round(rect.height * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        map.invalidateSize();
    }

    function clockAt(now) {
        var u = reduce ? 0.42 : ((performance.now() % loopMs) / loopMs);
        var fade = 1;
        if (!reduce) {
            if (u < 0.02) fade = u / 0.02;
            else if (u > 0.93) fade = (1 - u) / 0.07;
        }
        return { when: span.start + u * (span.end - span.start), fade: fade };
    }

    function drawTrail(ship, u, alpha) {
        var tail = 1.15;
        var target = Math.max(0, Math.min(1, u)) * ship.total;
        var startDist = Math.max(0, target - tail);
        if (target - startDist < 0.05) return;
        var steps = 16;
        var w = stage.clientWidth;
        var prev = null;
        for (var i = 0; i <= steps; i++) {
            var dist = startDist + (target - startDist) * (i / steps);
            var pt = map.latLngToContainerPoint(along(ship, dist / ship.total));
            if (prev && Math.abs(pt.x - prev.x) < w * 0.4) {
                var t = i / steps;
                ctx.beginPath();
                ctx.moveTo(prev.x, prev.y);
                ctx.lineTo(pt.x, pt.y);
                ctx.strokeStyle = "rgba(236,232,225," + (alpha * 0.78 * t * t) + ")";
                ctx.lineWidth = 1.05 + t * 0.85;
                ctx.lineCap = "round";
                ctx.stroke();
            }
            prev = pt;
        }
    }

    function drawFlash(x, y, phase, alpha) {
        var ring = 7 + phase * 58;
        ctx.beginPath();
        ctx.arc(x, y, ring, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(236,232,225," + ((1 - phase) * 0.75 * alpha) + ")";
        ctx.lineWidth = 1.2;
        ctx.stroke();

        var burst = phase < 0.18 ? 1 - phase / 0.18 : 0;
        var radius = 11 + burst * 22;
        var glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
        glow.addColorStop(0, "rgba(255,255,255," + (0.95 * alpha) + ")");
        glow.addColorStop(0.28, "rgba(236,232,225," + ((0.4 + burst * 0.55) * alpha) + ")");
        glow.addColorStop(1, "rgba(236,232,225,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    function frame(time) {
        if (!ships.length) return;
        var tick = clockAt(time);
        var width = stage.clientWidth;
        var height = stage.clientHeight;
        ctx.clearRect(0, 0, width, height);

        var hold = 4 * 86400000;

        ships.forEach(function (ship) {
            if (tick.when < ship.t0 || tick.when > ship.t1 + hold) return;
            var u = (tick.when - ship.t0) / (ship.t1 - ship.t0);
            var presence = 1;
            if (u >= 1) {
                presence = 1 - (tick.when - ship.t1) / hold;
                u = 1;
            }
            var alpha = presence * tick.fade;
            if (alpha <= 0.02) return;
            drawTrail(ship, u, alpha);
            var ll = along(ship, u);
            var pt = map.latLngToContainerPoint(ll);
            if (pt.x < -80 || pt.y < -80 || pt.x > width + 80 || pt.y > height + 80) return;
            var phase = reduce ? 0.15 : ((time + ship.offset) % 2100) / 2100;
            drawFlash(pt.x, pt.y, phase, alpha);
        });

        if (playing && !reduce) requestAnimationFrame(frame);
    }

    map.on("move zoom resize", function () {
        if (reduce) frame(0);
    });

    resize();
    frameArchipelago();
    window.addEventListener("resize", function () {
        resize();
        frameArchipelago();
    });

    var watch = new IntersectionObserver(function (entries) {
        playing = entries[0].isIntersecting;
        if (playing) requestAnimationFrame(frame);
    }, { threshold: 0.05 });
    watch.observe(stage);

    fetch("season.json")
        .then(function (response) { return response.json(); })
        .then(function (season) {
            ships = season.ships.filter(function (ship) { return ship.passage === "nwp"; });
            ships.forEach(prepare);
            var first = ships.reduce(function (min, ship) {
                return Math.min(min, ship.t0 + entryU(ship) * (ship.t1 - ship.t0));
            }, Infinity);
            span.start = first - 1.5 * 86400000;
            span.end = ships.reduce(function (max, ship) { return Math.max(max, ship.t1); }, ships[0].t1) + 2 * 86400000;
            requestAnimationFrame(frame);
        });
})();

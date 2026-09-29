(function () {
  function absolutize(selector, attr) {
    document.querySelectorAll(selector).forEach(function (el) {
      var value = el.getAttribute(attr);
      if (value && value.charAt(0) === "/") {
        el.setAttribute(attr, location.origin + value);
      }
    });
  }
  absolutize('link[rel="canonical"]', "href");
  absolutize('link[rel="alternate"]', "href");
  absolutize('meta[property="og:url"]', "content");
  absolutize('meta[property="og:image"]', "content");
  absolutize('meta[name="twitter:image"]', "content");

  document.querySelectorAll('script[type="application/ld+json"]').forEach(function (el) {
    try {
      var data = JSON.parse(el.textContent || "{}");
      function walk(node) {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node)) {
          node.forEach(walk);
          return;
        }
        Object.keys(node).forEach(function (key) {
          if ((key === "url" || key === "logo" || key === "image") && typeof node[key] === "string" && node[key].charAt(0) === "/") {
            node[key] = location.origin + node[key];
          } else {
            walk(node[key]);
          }
        });
      }
      walk(data);
      el.textContent = JSON.stringify(data);
    } catch (error) {
      // Keep original JSON-LD if parsing fails.
    }
  });

  var header = document.querySelector(".av-header");
  var navToggle = document.querySelector(".av-nav-toggle");
  var nav = document.getElementById("av-nav");
  var revealItems = document.querySelectorAll("[data-reveal]");
  var counters = document.querySelectorAll("[data-count]");

  function closeNav() {
    if (!header || !navToggle) return;
    header.classList.remove("is-open");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "Open menu");
  }

  if (navToggle && header && nav) {
    navToggle.addEventListener("click", function () {
      var open = header.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
      navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", closeNav);
    });
    window.addEventListener("resize", function () {
      if (window.innerWidth > 1099) closeNav();
    });
  }

  function onScroll() {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 8);
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.16 },
    );
    revealItems.forEach(function (item) {
      io.observe(item);
    });
  } else {
    revealItems.forEach(function (item) {
      item.classList.add("is-in");
    });
  }

  var toc = document.querySelector(".av-docs-toc");
  var tocRail = document.querySelector(".av-docs-rail");
  var tocBody = document.querySelector(".av-docs-body");
  if (toc && tocRail && tocBody) {
    var tocLinks = Array.prototype.slice.call(toc.querySelectorAll('a[href^="#"]'));
    var tocSections = tocLinks
      .map(function (link) {
        return document.querySelector(link.getAttribute("href"));
      })
      .filter(Boolean);

    function pinDocsToc() {
      if (window.innerWidth <= 1099) {
        toc.classList.remove("is-pinned");
        toc.style.top = "";
        toc.style.left = "";
        toc.style.width = "";
        tocRail.style.minHeight = "";
        return;
      }

      var headerOffset = 88;
      var tocHeight = toc.offsetHeight;
      tocRail.style.minHeight = tocHeight + "px";
      var railRect = tocRail.getBoundingClientRect();
      var bodyRect = tocBody.getBoundingClientRect();
      var stopAt = bodyRect.bottom - tocHeight;

      if (railRect.top >= headerOffset) {
        toc.classList.remove("is-pinned");
        toc.style.top = "";
        toc.style.left = "";
        toc.style.width = "";
        return;
      }

      toc.classList.add("is-pinned");
      toc.style.left = railRect.left + "px";
      toc.style.width = railRect.width + "px";
      toc.style.top = (stopAt < headerOffset ? Math.max(16, stopAt) : headerOffset) + "px";
    }

    function setCurrentToc() {
      var current = tocSections[0];
      tocSections.forEach(function (section) {
        if (section.getBoundingClientRect().top <= 120) current = section;
      });
      tocLinks.forEach(function (link) {
        link.classList.toggle("is-current", current && link.getAttribute("href") === "#" + current.id);
      });
    }

    function onDocsScroll() {
      pinDocsToc();
      setCurrentToc();
    }

    window.addEventListener("scroll", onDocsScroll, { passive: true });
    window.addEventListener("resize", onDocsScroll);
    onDocsScroll();
  }

  counters.forEach(function (el) {
    var target = Number(el.getAttribute("data-count") || "0");
    var suffix = el.getAttribute("data-suffix") || "";
    var prefix = el.getAttribute("data-prefix") || "";
    var started = false;
    function run() {
      if (started) return;
      started = true;
      var start = performance.now();
      function tick(now) {
        var progress = Math.min((now - start) / 900, 1);
        var value = Math.round(target * progress);
        el.textContent = prefix + value.toLocaleString() + suffix;
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }
    if ("IntersectionObserver" in window) {
      var cio = new IntersectionObserver(function (entries) {
        if (entries.some(function (entry) { return entry.isIntersecting; })) {
          run();
          cio.disconnect();
        }
      });
      cio.observe(el);
    } else {
      run();
    }
  });
})();

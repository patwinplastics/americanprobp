(function () {
  "use strict";

  var grid = document.getElementById("galleryGrid");
  if (!grid) return;

  var buttons = Array.prototype.slice.call(
    document.querySelectorAll(".filter-btn")
  );
  var cards = Array.prototype.slice.call(grid.querySelectorAll(".card"));
  var empty = document.getElementById("galleryEmpty");

  function applyFilter(filter) {
    var visible = 0;
    cards.forEach(function (card) {
      var tags = (card.getAttribute("data-tags") || "").split(/\s+/);
      var show = filter === "all" || tags.indexOf(filter) !== -1;
      card.hidden = !show;
      if (show) visible++;
    });
    if (empty) empty.classList.toggle("is-visible", visible === 0);
  }

  function setActive(activeBtn) {
    buttons.forEach(function (btn) {
      var isActive = btn === activeBtn;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  buttons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      setActive(btn);
      applyFilter(btn.getAttribute("data-filter") || "all");
    });
  });
})();

(function () {
  var input = document.getElementById("orders");
  var usage = document.getElementById("usage");
  var prevented = document.getElementById("prevented");
  var savings = document.getElementById("savings");
  var roi = document.getElementById("roi");
  var rateLabel = document.getElementById("rate");
  if (!input) return;

  function money(value) {
    return "$" + Number(value).toFixed(2);
  }

  function pricePerOrder(orderCount) {
    var count = Math.max(0, Math.floor(orderCount || 0));
    if (count === 0 || count <= 500) return 0.4;
    if (count <= 1500) return 0.3;
    return 0.2;
  }

  function update() {
    var monthlyOrders = Number(input.value) || 0;
    var rate = pricePerOrder(monthlyOrders);
    var monthlyErrors = Math.round(monthlyOrders * 0.062);
    var preventedCount = Math.round(monthlyErrors * 0.7);
    var savedShipping = Math.round(preventedCount * 12);
    var savedSupport = Math.round(monthlyErrors * 8);
    var total = savedShipping + savedSupport;
    var usageCost = Math.round(monthlyOrders * rate * 100) / 100;
    [usage, prevented, savings, roi].forEach(function (node) {
      if (!node) return;
      node.style.transform = "scale(1.04)";
      setTimeout(function () { node.style.transform = "none"; }, 180);
    });
    if (rateLabel) rateLabel.textContent = money(rate) + " / order";
    usage.textContent = money(usageCost);
    prevented.textContent = preventedCount.toLocaleString();
    savings.textContent = money(total);
    roi.textContent = usageCost ? (Math.round((total / usageCost) * 10) / 10) + "x" : "0x";
  }

  input.addEventListener("input", update);
  update();
})();

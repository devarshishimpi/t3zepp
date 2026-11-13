function animateEntry(element) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !element.animate) return;
  element.animate(
    [
      { opacity: 0, transform: "translateY(7px)" },
      { opacity: 1, transform: "translateY(0)" },
    ],
    { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  );
}

function showStatus(status) {
  status.style.display = "block";
  animateEntry(status);
}

function showTab(tab) {
  document.querySelectorAll(".tab-btn").forEach((button) => {
    const selected = button.dataset.tab === tab;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  ["pair", "update", "revoke"].forEach((name) => {
    const panel = document.getElementById("tab-" + name);
    const selected = name === tab;
    panel.style.display = selected ? "block" : "none";
    panel.setAttribute("aria-hidden", String(!selected));
    if (selected) animateEntry(panel);
  });
}

document.querySelector(".tabs").addEventListener("keydown", (event) => {
  const buttons = Array.from(document.querySelectorAll(".tab-btn"));
  const current = buttons.indexOf(document.activeElement);
  if (current < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length;
  buttons[next].focus();
  showTab(buttons[next].dataset.tab);
});

async function handlePair(e) {
  e.preventDefault();
  const btn = document.getElementById("pair-btn");
  const status = document.getElementById("pair-status");
  const resultBox = document.getElementById("pair-result");
  btn.disabled = true;
  btn.textContent = "Generating...";
  status.style.display = "none";
  const timer = document.getElementById("res-timer");

  try {
    const res = await fetch("/api/pair/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        t3BaseUrl: document.getElementById("t3BaseUrl").value.trim(),
        t3AccessToken: document.getElementById("t3Token").value.trim(),
        label: document.getElementById("label").value.trim() || "Amazfit watch",
      }),
    });
    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error("The pairing service returned an unreadable response. Check the gateway and try again.");
    }
    if (!res.ok) throw new Error(data.error || "Failed to generate pairing code");

    document.getElementById("res-code").textContent = data.pairingCode;
    document.getElementById("res-key").textContent = data.deviceKey;
    resultBox.style.display = "block";
    animateEntry(resultBox);
    const expiresAt = Date.parse(data.expiresAt);
    if (Number.isFinite(expiresAt)) {
      window.clearInterval(window.pairingExpiryTimer);
      const updateTimer = () => {
        const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
        timer.textContent = remaining
          ? `Expires in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
          : "Pairing code expired. Create a new code to continue.";
        if (!remaining) window.clearInterval(window.pairingExpiryTimer);
      };
      updateTimer();
      window.pairingExpiryTimer = window.setInterval(updateTimer, 1000);
    }
    status.className = "status-msg status-success";
    status.textContent =
      "Pairing code generated! Type " + data.pairingCode + " in T3 Zepp settings in Zepp.";
    showStatus(status);
  } catch (err) {
    status.className = "status-msg status-error";
    status.textContent = err.message;
    showStatus(status);
  } finally {
    btn.disabled = false;
    btn.textContent = "Create pairing code";
  }
}

async function copyText(event) {
  const target = document.getElementById(event.currentTarget.dataset.copy);
  const status = document.getElementById("pair-status");
  try {
    await navigator.clipboard.writeText(target.textContent.trim());
    status.className = "status-msg status-success";
    status.textContent = "Copied to clipboard.";
    showStatus(status);
  } catch {
    status.className = "status-msg status-error";
    status.textContent = "Clipboard unavailable. Select and copy the value above.";
    showStatus(status);
  }
}

async function handleUpdate(e) {
  e.preventDefault();
  const status = document.getElementById("update-status");
  showStatus(status);
  status.className = "status-msg";
  status.textContent = "Updating...";
  try {
    const res = await fetch("/api/device/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deviceKey: document.getElementById("update-key").value.trim(),
        t3BaseUrl: document.getElementById("update-url").value.trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to update");
    status.className = "status-msg status-success";
    status.textContent = "Updated successfully! Watch will now route to the new tunnel.";
  } catch (err) {
    status.className = "status-msg status-error";
    status.textContent = err.message;
  }
}

async function handleRevoke(e) {
  e.preventDefault();
  if (!confirm("Are you sure you want to revoke this Device Key? The watch will disconnect."))
    return;
  const status = document.getElementById("revoke-status");
  showStatus(status);
  status.className = "status-msg";
  status.textContent = "Revoking...";
  try {
    const res = await fetch("/api/device/revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deviceKey: document.getElementById("revoke-key").value.trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to revoke");
    status.className = "status-msg status-success";
    status.textContent = "Device Key revoked successfully.";
  } catch (err) {
    status.className = "status-msg status-error";
    status.textContent = err.message;
  }
}

document.querySelectorAll(".tab-btn").forEach((button) => {
  button.addEventListener("click", () => showTab(button.dataset.tab));
});
document.getElementById("pair-form").addEventListener("submit", handlePair);
document.getElementById("update-form").addEventListener("submit", handleUpdate);
document.getElementById("revoke-form").addEventListener("submit", handleRevoke);
document.querySelectorAll(".copy-btn").forEach((button) => {
  button.addEventListener("click", copyText);
});

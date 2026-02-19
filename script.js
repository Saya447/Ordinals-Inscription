const API_CONFIG = {
  baseUrl: "https://api.hiro.so",
  inscriptionsByAddressPath: "/ordinals/v1/inscriptions",
};

function buildInscriptionsUrl(address) {
  const trimmed = address.trim();
  const query = `?address=${encodeURIComponent(trimmed)}`;
  return `${API_CONFIG.baseUrl}${API_CONFIG.inscriptionsByAddressPath}${query}`;
}

function clearResults(container) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
}

function setStatus(statusEl, message, type) {
  statusEl.textContent = message || "";
  statusEl.className = "status";
  if (type) {
    statusEl.classList.add(`status--${type}`);
  }
}

function renderInscriptionCard(inscription) {
  const card = document.createElement("article");
  card.className = "inscription-card";

  const contentType =
    inscription.contentType || inscription.content_type || "unknown";
  const inscriptionId = inscription.id;

  const normalizedType =
    typeof contentType === "string" ? contentType.toLowerCase() : "";

  const hasImage = normalizedType.startsWith("image/");

  const renderUrl =
    inscription.renderUrl ||
    inscription.render_url ||
    inscription.previewUrl ||
    inscription.preview_url ||
    inscription.contentUrl ||
    inscription.content_url ||
    (inscriptionId
      ? `https://api.hiro.so/ordinals/v1/inscriptions/${inscriptionId}/content`
      : null);

  if (hasImage && renderUrl) {
    const imageWrapper = document.createElement("div");
    imageWrapper.className = "inscription-card__image-wrapper";

    const img = document.createElement("img");
    img.src = renderUrl;
    img.alt = `Inscription #${inscription.number ?? inscription.id}`;
    img.loading = "lazy";
    img.className = "inscription-card__image";

    imageWrapper.appendChild(img);
    card.appendChild(imageWrapper);
  }

  const title = document.createElement("h3");
  title.className = "inscription-card__title";
  const shortId =
    typeof inscription.id === "string"
      ? `${inscription.id.slice(0, 8)}…`
      : "Unknown";
  const numberLabel =
    typeof inscription.number === "number"
      ? `#${inscription.number}`
      : "Unnumbered";
  title.textContent = `${numberLabel} · ${shortId}`;
  card.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "inscription-card__meta";

  const typeSpan = document.createElement("span");
  typeSpan.textContent = `Type: ${contentType}`;
  meta.appendChild(typeSpan);

  const blockHeight =
    inscription.blockHeight ?? inscription.block_height ?? null;
  if (typeof blockHeight === "number") {
    const blockSpan = document.createElement("span");
    blockSpan.textContent = `Block: ${blockHeight}`;
    meta.appendChild(blockSpan);
  }

  const timestampRaw =
    inscription.lastTransferTimestamp ?? inscription.timestamp ?? null;
  if (typeof timestampRaw === "number") {
    const millis =
      timestampRaw > 1e12 ? timestampRaw : timestampRaw * 1000;
    const date = new Date(millis);
    const transferSpan = document.createElement("span");
    transferSpan.textContent = `Last transfer: ${date.toLocaleString()}`;
    meta.appendChild(transferSpan);
  }

  card.appendChild(meta);

  if (renderUrl || inscriptionId) {
    const linkWrapper = document.createElement("div");
    linkWrapper.className = "inscription-card__link";

    const link = document.createElement("a");
    if (inscriptionId) {
      // Use Ordinals explorer URL when we have an inscription id
      link.href = `https://ordinals.com/inscription/${inscriptionId}`;
    } else {
      link.href = renderUrl;
    }
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "View inscription";

    linkWrapper.appendChild(link);
    card.appendChild(linkWrapper);
  }

  return card;
}

async function fetchInscriptions(address) {
  const url = buildInscriptionsUrl(address);

  const headers = {
    Accept: "application/json",
  };

  const response = await fetch(url, { headers });

  if (!response.ok) {
    let errorDetail = "";
    try {
      const errJson = await response.json();
      errorDetail = errJson.message || JSON.stringify(errJson);
    } catch {
      errorDetail = await response.text();
    }
    throw new Error(
      `API error ${response.status}${
        errorDetail ? `: ${errorDetail.slice(0, 200)}` : ""
      }`
    );
  }

  const data = await response.json();
  const inscriptions = Array.isArray(data.results) ? data.results : [];
  return inscriptions;
}

async function fetchBalanceSats(address) {
  const trimmed = address.trim();
  const url = `https://mempool.space/api/address/${encodeURIComponent(
    trimmed
  )}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Balance API error ${response.status}`);
  }
  const data = await response.json();
  const funded = Number(data.chain_stats?.funded_txo_sum ?? 0);
  const spent = Number(data.chain_stats?.spent_txo_sum ?? 0);
  const mempoolFunded = Number(data.mempool_stats?.funded_txo_sum ?? 0);
  const mempoolSpent = Number(data.mempool_stats?.spent_txo_sum ?? 0);
  const confirmed = funded - spent;
  const mempool = mempoolFunded - mempoolSpent;
  return { confirmed, mempool };
}

function formatBtcFromSats(sats) {
  const btc = sats / 1e8;
  if (!Number.isFinite(btc)) return "0 BTC";
  return `${btc.toFixed(8)} BTC`;
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("address-form");
  const addressInput = document.getElementById("address");
  const statusEl = document.getElementById("status");
  const balanceEl = document.getElementById("balance");
  const resultsContainer = document.getElementById("results");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const address = addressInput.value.trim();

    if (!address) {
      setStatus(statusEl, "Please enter a Bitcoin address.", "error");
      return;
    }

    clearResults(resultsContainer);
    if (balanceEl) {
      balanceEl.textContent = "";
      balanceEl.className = "status";
    }
    setStatus(statusEl, "Loading inscriptions…", "loading");

    try {
      const [inscriptions, balance] = await Promise.all([
        fetchInscriptions(address),
        fetchBalanceSats(address),
      ]);

      if (!inscriptions.length) {
        setStatus(
          statusEl,
          "No inscriptions found for this address.",
          "info"
        );
        return;
      }

      const count = inscriptions.length;
      setStatus(
        statusEl,
        `Found ${count} inscription${count === 1 ? "" : "s"}.`,
        "success"
      );

      inscriptions.forEach((inscription) => {
        const card = renderInscriptionCard(inscription);
        resultsContainer.appendChild(card);
      });

      if (balanceEl && balance) {
        const confirmedLabel = formatBtcFromSats(balance.confirmed);
        const mempoolLabel = formatBtcFromSats(balance.mempool);
        balanceEl.textContent =
          balance.mempool && balance.mempool !== 0
            ? `Address balance: ${confirmedLabel} (confirmed) + ${mempoolLabel} (pending)`
            : `Address balance: ${confirmedLabel} (confirmed)`;
        balanceEl.className = "status status--info";
      }
    } catch (error) {
      console.error(error);
      setStatus(
        statusEl,
        `Failed to fetch inscriptions. ${
          error instanceof Error ? error.message : ""
        }`,
        "error"
      );
    }
  });
});


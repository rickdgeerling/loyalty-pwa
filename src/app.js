import Alpine from "alpinejs";
import bwipjs from "bwip-js";
import { BrowserMultiFormatReader, BarcodeFormat } from "@zxing/library";

// ===== Constants =====
const STORAGE_KEY = "loyalty-cards";
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const ZXING_MAP = {
  [BarcodeFormat.EAN_13]: "ean13",
  [BarcodeFormat.EAN_8]: "ean8",
  [BarcodeFormat.UPC_A]: "ean13",
  [BarcodeFormat.CODE_39]: "code39",
  [BarcodeFormat.CODE_128]: "code128",
  [BarcodeFormat.ITF]: "interleaved2of5",
  [BarcodeFormat.QR_CODE]: "qrcode",
};

const barcodeReader = new BrowserMultiFormatReader();

// ===== Helpers =====
function generateId() {
  return Date.now().toString(36);
}

function computeTextColor(hex) {
  if (!HEX_COLOR_RE.test(hex)) return "#ffffff";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5
    ? "#ffffff"
    : "#000000";
}

function parseHash() {
  const hash = location.hash.slice(1) || "list";
  const match = hash.match(/^(view|edit)\/(.+)$/);
  if (match) return { page: match[1], cardId: match[2] };
  return {
    page: ["list", "add", "settings"].includes(hash) ? hash : "list",
    cardId: null,
  };
}

// ===== Alpine App =====
Alpine.data("loyaltyApp", () => ({
  cards: [],
  toasts: [],
  form: {
    name: "",
    color: "#ffffff",
    code: "",
    barcodeType: "ean13",
    manualTypeOverride: false,
  },
  editingId: null,
  restoreText: "",

  // ---- Lifecycle ----
  init() {
    this.loadCards();
    this.syncRoute();
    window.addEventListener("hashchange", () => this.syncRoute());
  },

  // ---- Reactive Getters ----
  get currentPage() {
    return parseHash().page;
  },

  get currentCardId() {
    return parseHash().cardId;
  },

  get currentCard() {
    if (!this.currentCardId) return null;
    return this.cards.find((c) => c.id === this.currentCardId) || null;
  },

  // ---- Routing ----
  navigateTo(page, cardId) {
    if (cardId) {
      location.hash = "#" + page + "/" + cardId;
    } else {
      location.hash = "#" + page;
    }
  },

  syncRoute() {
    const { page, cardId } = parseHash();

    // Reset form when navigating to add
    if (page === "add") {
      this.form = {
        name: "",
        color: "#ffffff",
        code: "",
        barcodeType: "ean13",
        manualTypeOverride: false,
      };
      this.editingId = null;
    }

    // Set editingId when navigating to edit
    if (page === "edit" && cardId) {
      this.editingId = cardId;
      const card = this.cards.find((c) => c.id === cardId);
      if (card) {
        this.form = {
          name: card.name,
          color: card.color,
          code: card.code,
          barcodeType: card.barcodeType,
          manualTypeOverride: true,
        };
      }
    }

    if (page !== "edit") {
      this.editingId = null;
    }
  },

  // ---- localStorage ----
  loadCards() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        this.cards = [];
        return;
      }
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.cards)) {
        this.cards = [];
        return;
      }
      this.cards = data.cards.filter(this._isValidCard);
    } catch (e) {
      this.showToast("Could not load saved cards — starting fresh.");
      this.cards = [];
    }
  },

  saveCards() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ cards: this.cards }));
    } catch (e) {
      this.showToast(
        "Could not save changes — storage may be full or unavailable.",
      );
    }
  },

  // ---- Card Validation ----
  _isValidCard(c) {
    return (
      c &&
      typeof c.id === "string" &&
      typeof c.name === "string" &&
      typeof c.code === "string" &&
      typeof c.barcodeType === "string" &&
      typeof c.barcodeDataURL === "string" &&
      c.barcodeDataURL.length > 0
    );
  },

  _sanitizeCard(card) {
    return {
      ...card,
      color: HEX_COLOR_RE.test(card.color) ? card.color : "#ffffff",
      textColor: HEX_COLOR_RE.test(card.color)
        ? computeTextColor(card.color)
        : "#000000",
    };
  },

  // ---- Card CRUD ----
  addCard() {
    if (!this.form.name.trim() || !this.form.code.trim()) {
      this.showToast("Name and code are required.");
      return;
    }

    let barcodeDataURL;
    try {
      barcodeDataURL = this.renderBarcode(
        this.form.barcodeType,
        this.form.code.trim(),
      );
    } catch (e) {
      this.showToast(
        "Invalid code for " +
          this.form.barcodeType +
          ": " +
          (e.message || "encoding failed"),
      );
      return;
    }

    const card = {
      id: generateId(),
      name: this.form.name.trim(),
      color: this.form.color,
      textColor: computeTextColor(this.form.color),
      code: this.form.code.trim(),
      barcodeType: this.form.barcodeType,
      barcodeDataURL,
      createdAt: new Date().toISOString(),
    };
    this.cards.push(card);
    this.saveCards();
    this.navigateTo("list");
    this.showToast("Card added.");
  },

  updateCard() {
    if (!this.form.name.trim() || !this.form.code.trim()) {
      this.showToast("Name and code are required.");
      return;
    }

    const idx = this.cards.findIndex((c) => c.id === this.editingId);
    if (idx === -1) return;

    let barcodeDataURL;
    try {
      barcodeDataURL = this.renderBarcode(
        this.form.barcodeType,
        this.form.code.trim(),
      );
    } catch (e) {
      this.showToast(
        "Invalid code for " +
          this.form.barcodeType +
          ": " +
          (e.message || "encoding failed"),
      );
      return;
    }

    this.cards[idx] = {
      ...this.cards[idx],
      name: this.form.name.trim(),
      color: this.form.color,
      textColor: computeTextColor(this.form.color),
      code: this.form.code.trim(),
      barcodeType: this.form.barcodeType,
      barcodeDataURL,
    };
    this.saveCards();
    this.navigateTo("view", this.editingId);
    this.showToast("Card updated.");
  },

  deleteCard(id) {
    if (!confirm("Delete this card?")) return;
    this.cards = this.cards.filter((c) => c.id !== id);
    this.saveCards();
    this.navigateTo("list");
    this.showToast("Card deleted.");
  },

  // ---- Barcode Rendering ----
  renderBarcode(bcid, code) {
    const canvas = document.createElement("canvas");
    bwipjs.toCanvas(canvas, {
      bcid,
      text: code,
      scale: 3,
      height: 10,
      includetext: false,
    });
    return canvas.toDataURL("image/png");
  },

  // ---- Barcode Scanning ----
  async scanBarcode(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      const result = await barcodeReader.decodeFromImageUrl(url);
      // Only apply results if still on the form page
      const page = this.currentPage;
      if (page !== "add" && page !== "edit") return;

      const format = result.getBarcodeFormat();
      const bcid = ZXING_MAP[format];
      if (!bcid) {
        this.showToast("Unsupported barcode type detected.");
        return;
      }
      this.form.code = result.getText();
      this.form.barcodeType = bcid;
      this.form.manualTypeOverride = false;
    } catch (e) {
      this.showToast("No barcode detected in image.");
    } finally {
      URL.revokeObjectURL(url);
    }
  },

  // ---- Auto-Detection ----
  autoDetectType() {
    if (this.form.manualTypeOverride) return;

    const code = this.form.code;
    if (!code) return;

    if (/^\d{12,13}$/.test(code)) {
      this.form.barcodeType = "ean13";
      // Pad 12-digit UPC-A codes with leading zero for EAN-13
      if (code.length === 12 && this.form.code.length === 12) {
        this.form.code = "0" + code;
      }
    } else if (/^\d{7,8}$/.test(code)) {
      this.form.barcodeType = "ean8";
      // Pad 7-digit codes with leading zero for EAN-8
      if (code.length === 7 && this.form.code.length === 7) {
        this.form.code = "0" + code;
      }
    } else if (/^[A-Z0-9\-. $/+%]+$/.test(code) && /[A-Z]/.test(code)) {
      this.form.barcodeType = "code39";
      // Auto-uppercase for Code 39
      if (this.form.code !== this.form.code.toUpperCase()) {
        this.form.code = this.form.code.toUpperCase();
      }
    } else if (
      /^\d+$/.test(code) &&
      code.length % 2 === 0 &&
      code.length >= 8
    ) {
      this.form.barcodeType = "interleaved2of5";
    } else if (/^[\x20-\x7E]+$/.test(code)) {
      this.form.barcodeType = "code128";
    } else {
      this.form.barcodeType = "qrcode";
    }
  },

  // ---- Toast System ----
  showToast(message) {
    if (this.toasts.length >= 3) this.toasts.shift();
    const id = Date.now();
    this.toasts.push({ id, message });
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== id);
    }, 5000);
  },

  removeToast(id) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  },

  // ---- Settings ----
  exportJSON() {
    return JSON.stringify({ cards: this.cards }, null, 2);
  },

  copyExport() {
    const json = this.exportJSON();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(json)
        .then(() => {
          this.showToast("Copied.");
        })
        .catch(() => {
          this.showToast("Could not copy. Select the text manually.");
        });
    } else {
      const el = document.getElementById("settings-export");
      if (el) {
        el.select();
        this.showToast("Select the text and copy manually.");
      }
    }
  },

  restoreFromJSON(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      if (!data || !Array.isArray(data.cards))
        throw new Error("Invalid schema");

      const validCards = data.cards.filter(this._isValidCard);
      const skipped = data.cards.length - validCards.length;

      if (
        !confirm(
          "Replace all " +
            this.cards.length +
            " cards with " +
            validCards.length +
            " cards from backup?",
        )
      )
        return;

      this.cards = validCards.map((c) => this._sanitizeCard(c));
      this.saveCards();
      this.restoreText = "";
      this.navigateTo("list");
      if (skipped > 0) {
        this.showToast(
          "Cards restored. Skipped " + skipped + " invalid entries.",
        );
      } else {
        this.showToast("Cards restored.");
      }
    } catch (e) {
      this.showToast("Invalid JSON format.");
    }
  },
}));

Alpine.start();

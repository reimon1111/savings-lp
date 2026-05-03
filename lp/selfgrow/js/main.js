(function () {
  const page = document.querySelector(".tcl-page");
  if (!page) return;

  const header = page.querySelector(".tcl-header");
  const toggle = page.querySelector("[data-tcl-nav-toggle]");
  const nav = page.querySelector("#tcl-nav");

  if (header && toggle && nav) {
    const toggleLabel = toggle.querySelector(".visually-hidden");
    toggle.addEventListener("click", () => {
      const open = header.classList.toggle("tcl-header--open");
      toggle.setAttribute("aria-expanded", String(open));
      if (toggleLabel) {
        toggleLabel.textContent = open ? "メニューを閉じる" : "メニューを開く";
      }
    });

    nav.querySelectorAll("a[href^='#']").forEach((a) => {
      a.addEventListener("click", () => {
        header.classList.remove("tcl-header--open");
        toggle.setAttribute("aria-expanded", "false");
        if (toggleLabel) toggleLabel.textContent = "メニューを開く";
      });
    });
  }

  page.querySelectorAll('a[href^="#"]').forEach((a) => {
    const href = a.getAttribute("href");
    if (!href || href === "#") return;
    const id = href.slice(1);
    const el = document.getElementById(id);
    if (!el) return;
    a.addEventListener("click", (e) => {
      e.preventDefault();
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  /** 以下、lp/js/main.js の initForm / microCMS site 取得と同等（タイトル変更などページ全体への副作用は除く） */

  const LP_SITE_DEFAULT = {
    siteName: "セルフグロウ",
    documentTitleSuffix: "｜10年で2,000人のカウンセリング実績",
    contactEmail: "",
  };

  function getMicrocmsSiteConfig() {
    const cfg = window.LP_MICROCMS_SITE || {};
    return {
      serviceDomain: String(cfg.serviceDomain || "").trim(),
      apiKey: String(cfg.apiKey || "").trim(),
      endpoint: String(cfg.endpoint || "site").trim(),
    };
  }

  function logSiteFallback(reason, detail) {
    const lines = ["[site] FALLBACK（セルフグロウ：問い合わせ送信先メールのみ）", `  理由: ${reason}`];
    if (detail) lines.push(`  詳細: ${detail}`);
    console.error(lines.join("\n"));
  }

  function microcmsPlainText(value) {
    if (value == null) return "";
    if (typeof value === "string") {
      const s = value.trim();
      if (!s.includes("<")) return s;
      if (typeof document !== "undefined" && document.createElement) {
        const tmp = document.createElement("div");
        tmp.innerHTML = s;
        return (tmp.textContent || tmp.innerText || "").trim();
      }
      return s.replace(/<[^>]*>/g, "").trim();
    }
    if (typeof value === "object") {
      if (typeof value.text === "string") return microcmsPlainText(value.text);
      if (typeof value.html === "string") return microcmsPlainText(value.html);
      if (typeof value.richText === "string") return microcmsPlainText(value.richText);
    }
    return String(value).trim();
  }

  function normalizeSiteFields(raw) {
    if (!raw || typeof raw !== "object") return null;
    const siteName = microcmsPlainText(raw.siteName ?? raw.title ?? raw.name ?? "").trim();
    const logoUrl =
      raw.logo && typeof raw.logo === "object" && raw.logo.url
        ? String(raw.logo.url).trim()
        : String(raw.logoUrl || raw.logoURL || "").trim();
    const contactEmail = String(raw.contactEmail ?? raw.mail ?? raw.inquiryEmail ?? raw.emailRecipient ?? "").trim();
    return {
      siteName: siteName || LP_SITE_DEFAULT.siteName,
      logoUrl: logoUrl || "",
      contactEmail,
    };
  }

  function extractSiteDocumentFromMicrocmsResponse(json) {
    if (!json || typeof json !== "object") return null;
    if (Array.isArray(json.contents) && json.contents.length > 0) {
      return normalizeSiteFields(json.contents[0]);
    }
    if (json.siteName || json.title || json.logo || json.contactEmail || json.mail) {
      return normalizeSiteFields(json);
    }
    return null;
  }

  async function fetchMicrocmsSite() {
    const cfg = getMicrocmsSiteConfig();
    const url = `https://${cfg.serviceDomain}.microcms.io/api/v1/${cfg.endpoint}`;

    if (!cfg.serviceDomain || !cfg.apiKey) {
      logSiteFallback(
        "設定不足",
        !cfg.serviceDomain ? "serviceDomain が空（lp/js/microcms.site.config.js）" : "apiKey が空",
      );
      return { ok: false, site: null, url, error: new Error("microCMS site config missing") };
    }

    try {
      const res = await fetch(url, {
        cache: "no-store",
        headers: { "X-MICROCMS-API-KEY": cfg.apiKey },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        logSiteFallback("HTTP エラー", `${res.status} ${res.statusText}${text ? ` — ${text}` : ""} | ${url}`);
        throw new Error(`microCMS site request failed: ${res.status}`);
      }
      const json = await res.json();
      const site = extractSiteDocumentFromMicrocmsResponse(json);
      if (!site) {
        logSiteFallback(
          "レスポンスから HP情報を解釈できません",
          `endpoint=${cfg.endpoint} keys=${Object.keys(json).join(",")}`,
        );
        return { ok: false, site: null, json, url, error: new Error("unexpected site payload") };
      }
      return { ok: true, site, json, url, error: null };
    } catch (err) {
      if (!String(err?.message || "").includes("microCMS site request failed")) {
        logSiteFallback("fetch 失敗", String(err?.message || err));
      }
      return { ok: false, site: null, url, error: err };
    }
  }

  function applyTclSiteForContactOnly(site, meta) {
    const s = site && typeof site === "object" ? site : normalizeSiteFields({});
    const source = meta && meta.source ? String(meta.source) : "fallback";
    const name = (s.siteName || LP_SITE_DEFAULT.siteName).trim();
    const logoUrl = (s.logoUrl || "").trim();
    const contactEmail = (s.contactEmail || "").trim();

    window.LP_SITE = {
      siteName: name,
      logoUrl: logoUrl || null,
      contactEmail,
      source,
    };

    const hiddenRecipient = document.getElementById("lp-site-contact-email");
    if (hiddenRecipient) hiddenRecipient.value = contactEmail;
  }

  async function initTclSiteMicrocms() {
    const { ok, site } = await fetchMicrocmsSite();
    if (!ok || !site) {
      applyTclSiteForContactOnly(normalizeSiteFields({}), { source: "fallback" });
      return;
    }
    applyTclSiteForContactOnly(site, { source: "microcms" });
  }

  function initLpContactForm() {
    const form = document.getElementById("lp-contact-form");
    if (!form) return;
    const contactLead = document.querySelector(".lp-contact__lead");
    const defaultContactLeadText = contactLead ? contactLead.textContent : "";
    const submitBtn = form.querySelector('button[type="submit"]');
    if (!submitBtn) return;

    const fieldName = form.querySelector("#field-name");
    const fieldPhone = form.querySelector("#field-phone");
    const fieldEmail = form.querySelector("#field-email");
    const fieldMessage = form.querySelector("#field-message");

    let mode = "edit";
    let confirmEl = null;
    let backBtn = null;
    let toastEl = null;
    let resetTimerId = null;

    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    function getValue(el) {
      if (!el) return "";
      return String(el.value || "").trim();
    }

    function buildConfirm() {
      if (confirmEl) confirmEl.remove();
      if (backBtn) backBtn.remove();

      const name = getValue(fieldName);
      const phone = getValue(fieldPhone);
      const email = getValue(fieldEmail);
      const message = getValue(fieldMessage);

      confirmEl = document.createElement("div");
      confirmEl.className = "lp-form__confirm";
      confirmEl.setAttribute("role", "region");
      confirmEl.setAttribute("aria-label", "入力内容の確認");
      confirmEl.innerHTML = `
      <h3 class="lp-form__confirm-title">入力内容の確認</h3>
      <dl class="lp-form__confirm-list">
        <div class="lp-form__confirm-item">
          <dt>お名前</dt>
          <dd>${escapeHtml(name)}</dd>
        </div>
        <div class="lp-form__confirm-item">
          <dt>電話番号</dt>
          <dd>${phone ? escapeHtml(phone) : "（未入力）"}</dd>
        </div>
        <div class="lp-form__confirm-item">
          <dt>メールアドレス</dt>
          <dd>${escapeHtml(email)}</dd>
        </div>
        <div class="lp-form__confirm-item">
          <dt>ご相談内容</dt>
          <dd class="lp-form__confirm-message">${escapeHtml(message).replaceAll("\n", "<br />")}</dd>
        </div>
      </dl>
    `;

      backBtn = document.createElement("button");
      backBtn.type = "button";
      backBtn.className = "lp-form__back";
      backBtn.textContent = "戻って修正する";
      backBtn.addEventListener("click", () => {
        setMode("edit");
        if (fieldName) fieldName.focus();
      });

      const submitWrap = form.querySelector(".lp-form__submit");
      if (submitWrap) {
        submitWrap.insertAdjacentElement("beforebegin", confirmEl);
        submitWrap.insertAdjacentElement("afterend", backBtn);
      } else {
        form.appendChild(confirmEl);
        form.appendChild(backBtn);
      }
    }

    function showToast(message) {
      if (toastEl) toastEl.remove();
      toastEl = document.createElement("div");
      toastEl.className = "lp-form__toast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      toastEl.textContent = message;

      const submitWrap = form.querySelector(".lp-form__submit");
      if (submitWrap) submitWrap.insertAdjacentElement("beforebegin", toastEl);
      else form.appendChild(toastEl);
    }

    function clearToast() {
      if (toastEl) toastEl.remove();
      toastEl = null;
    }

    function setDisabled(disabled) {
      [fieldName, fieldPhone, fieldEmail, fieldMessage].forEach((el) => {
        if (el) el.disabled = disabled;
      });
    }

    function setMode(next) {
      mode = next;
      if (mode === "edit") {
        form.classList.remove("is-confirm");
        clearToast();
        if (resetTimerId) window.clearTimeout(resetTimerId);
        resetTimerId = null;
        if (contactLead) contactLead.textContent = defaultContactLeadText;
        setDisabled(false);
        if (confirmEl) confirmEl.remove();
        confirmEl = null;
        if (backBtn) backBtn.remove();
        backBtn = null;
        submitBtn.textContent = "内容を確認する";
      }
      if (mode === "confirm") {
        form.classList.add("is-confirm");
        clearToast();
        if (contactLead) {
          contactLead.innerHTML =
            "ご入力いただいた内容をご確認ください。<br />内容にお間違いがなければ、「送信する」ボタンを押して送信を完了してください。";
        }
        setDisabled(true);
        buildConfirm();
        submitBtn.textContent = "送信する";
      }
      if (mode === "sent") {
        form.classList.remove("is-confirm");
        clearToast();
        if (contactLead) contactLead.textContent = defaultContactLeadText;
        setDisabled(true);
        if (confirmEl) confirmEl.remove();
        confirmEl = null;
        if (backBtn) backBtn.remove();
        backBtn = null;
        submitBtn.textContent = "送信しました";
        submitBtn.disabled = true;
      } else {
        submitBtn.disabled = false;
      }
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();

      if (mode === "edit") {
        if (!form.reportValidity()) return;
        setMode("confirm");
        submitBtn.focus();
        return;
      }

      if (mode === "confirm") {
        const recipientEl = document.getElementById("lp-site-contact-email");
        const recipient =
          (recipientEl && recipientEl.value) || (window.LP_SITE && window.LP_SITE.contactEmail) || "";
        form.dataset.lpMailRecipient = recipient;
        submitBtn.disabled = true;
        if (backBtn) backBtn.disabled = true;
        showToast("送信されました");

        if (resetTimerId) window.clearTimeout(resetTimerId);
        resetTimerId = window.setTimeout(() => {
          clearToast();
          form.reset();
          setMode("edit");
        }, 1600);
      }
    });

    form.addEventListener("input", () => {
      if (mode !== "edit") setMode("edit");
    });
  }

  initTclSiteMicrocms().then(() => {
    initLpContactForm();
  });
})();

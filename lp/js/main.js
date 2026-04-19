const PART_MAIN = [
  "hero",
  "profile",
  "services",
  "reason",
  "flow",
  "examples",
  "values",
  "faq",
  "cta",
  "contact",
];

/** lp ルート（index.html があるディレクトリ）を main.js の配置から決める（ページ URL に依存しない） */
function getLpAssetBase() {
  const scripts = document.getElementsByTagName("script");
  for (let i = scripts.length - 1; i >= 0; i--) {
    const src = scripts[i].src;
    if (src && /\/js\/main\.js(\?|#|$)/.test(src)) {
      return new URL("..", src).href;
    }
  }
  return new URL("./", window.location.href).href;
}

function resolveLpAsset(relativePath) {
  const clean = String(relativePath || "").replace(/^\//, "");
  return new URL(clean, getLpAssetBase()).href;
}

async function loadHtml(relativePath) {
  const url = resolveLpAsset(relativePath);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.text();
}

async function inject(targetSelector, fileBase, append) {
  const el = document.querySelector(targetSelector);
  if (!el) return;
  const html = await loadHtml(`components/${fileBase}.html`);
  if (append) el.insertAdjacentHTML("beforeend", html);
  else el.innerHTML = html;
}

/** HP情報のフォールバック（microCMS 未取得時は HTML 初期表示と一致） */
const LP_SITE_DEFAULT = {
  siteName: "家計の見直し相談室",
  documentTitleSuffix: "｜ご家庭の固定費をまとめてご相談",
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
  const lines = ["[site] FALLBACK（HP情報は静的デフォルト）", `  理由: ${reason}`];
  if (detail) lines.push(`  詳細: ${detail}`);
  console.error(lines.join("\n"));
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
      logSiteFallback("レスポンスから HP情報を解釈できません", `endpoint=${cfg.endpoint} keys=${Object.keys(json).join(",")}`);
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

function applySiteInfoToPage(site, meta) {
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

  document.querySelectorAll("[data-site-name-text]").forEach((el) => {
    el.textContent = name;
  });

  const brand = document.querySelector("[data-site-brand]");
  const logoEl = document.querySelector("[data-site-logo]");
  if (brand && logoEl) {
    if (logoUrl) {
      logoEl.src = logoUrl;
      logoEl.alt = name;
      logoEl.removeAttribute("hidden");
      brand.classList.add("lp-header__brand--has-logo");
    } else {
      logoEl.removeAttribute("src");
      logoEl.setAttribute("hidden", "");
      logoEl.alt = "";
      brand.classList.remove("lp-header__brand--has-logo");
    }
  }

  const hiddenRecipient = document.getElementById("lp-site-contact-email");
  if (hiddenRecipient) hiddenRecipient.value = contactEmail;

  const docTitle = `${name}${LP_SITE_DEFAULT.documentTitleSuffix}`;
  if (document.body.dataset.lpPage !== "privacy-policy") {
    document.title = docTitle;
  }

  document.documentElement.dataset.lpSiteSource = source;
}

async function initSiteMicrocms() {
  const cfg = getMicrocmsSiteConfig();
  const { ok, site, url } = await fetchMicrocmsSite();

  if (url) document.documentElement.dataset.lpSiteApiUrl = url;
  document.documentElement.dataset.lpSiteEndpoint = cfg.endpoint;

  if (!ok || !site) {
    applySiteInfoToPage(normalizeSiteFields({}), { source: "fallback" });
    return;
  }

  applySiteInfoToPage(site, { source: "microcms" });
}

function getMicrocmsExamplesConfig() {
  const cfg = window.LP_MICROCMS_EXAMPLES || {};
  return {
    serviceDomain: String(cfg.serviceDomain || "").trim(),
    apiKey: String(cfg.apiKey || "").trim(),
    endpoint: String(cfg.endpoint || "examples").trim(),
  };
}

/** microCMS の文字列・リッチテキスト風オブジェクトをカード見出し用の平文にする */
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

function logExamplesFallback(reason, detail) {
  const lines = [
    "[examples] FALLBACK を表示しています（microCMS のカードではありません）",
    `  理由: ${reason}`,
  ];
  if (detail != null && detail !== "") lines.push(`  詳細: ${detail}`);
  lines.push("  確認: DevTools の Elements で [data-examples-grid] の data-lp-examples-source が \"fallback\" か確認してください。");
  console.error(lines.join("\n"));
}

async function fetchMicrocmsExamples() {
  const cfg = getMicrocmsExamplesConfig();
  const url = `https://${cfg.serviceDomain}.microcms.io/api/v1/${cfg.endpoint}`;

  if (!cfg.serviceDomain || !cfg.apiKey) {
    logExamplesFallback(
      "設定不足（API に接続していません）",
      !cfg.serviceDomain
        ? "serviceDomain が空です（lp/js/microcms.examples.config.js の serviceDomain）"
        : "apiKey が空です（読み取り用 API キーを lp/js/microcms.examples.config.js に設定）",
    );
    return {
      ok: false,
      examples: [],
      json: null,
      url,
      error: new Error("microCMS config missing"),
    };
  }

  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        "X-MICROCMS-API-KEY": cfg.apiKey,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const msg = `HTTP ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`;
      logExamplesFallback("microCMS のレスポンスがエラー", `${msg} | URL: ${url}`);
      throw new Error(`microCMS request failed: ${msg}`);
    }
    const json = await res.json();
    const examples = extractExamplesFromMicrocmsResponse(cfg.endpoint, json);
    return { ok: true, examples, json, url, error: null };
  } catch (err) {
    if (!String(err?.message || "").includes("microCMS request failed")) {
      logExamplesFallback(
        "fetch / JSON の処理に失敗",
        `${err?.message || err} | URL: ${url}`,
      );
    }
    return { ok: false, examples: [], json: null, url, error: err };
  }
}

function extractExamplesFromMicrocmsResponse(endpoint, json) {
  // 既定 endpoint=examples: リスト API の contents または単一 API の examples 配列を想定
  if (!json || typeof json !== "object") return [];

  if (Array.isArray(json.examples)) {
    return json.examples;
  }

  if (Array.isArray(json.contents)) {
    const looksLikeCard = (v) =>
      v &&
      typeof v === "object" &&
      ("title" in v || "beforePrice" in v || "afterPrice" in v || "monthlySaving" in v || "yearlySaving" in v);

    if (json.contents.some(looksLikeCard)) return json.contents;

    const flattened = [];
    json.contents.forEach((c) => {
      if (c && typeof c === "object" && Array.isArray(c.examples)) flattened.push(...c.examples);
    });
    if (flattened.length > 0) return flattened;
  }

  console.error(
    `[examples] 想定外のレスポンスです（endpoint="${endpoint}"）。` +
      `API 名が examples か、レスポンスに examples または contents 配列があるか確認してください。`,
    Object.keys(json),
  );
  return [];
}

function renderExamplesFallback(gridEl) {
  const tpl = document.getElementById("lp-examples-fallback");
  if (tpl && tpl.content) {
    gridEl.replaceChildren(tpl.content.cloneNode(true));
    return;
  }
  gridEl.innerHTML = `<div class="lp-example-card lp-card-soft"><div class="lp-example-card__body"><p>見直しの一例を準備中です。</p></div></div>`;
}

function renderExamplesFromMicrocms(gridEl, examples) {
  if (!Array.isArray(examples) || examples.length === 0) {
    gridEl.innerHTML = `
      <article class="lp-example-card lp-card-soft">
        <div class="lp-example-card__body">
          <div class="lp-example-card__head">
            <h3 class="lp-example-card__label">見直しの一例</h3>
          </div>
          <div class="lp-example-card__rows">
            <p class="lp-example-card__muted">現在、表示できるデータがありません。</p>
          </div>
        </div>
      </article>
    `;
    return;
  }

  const frag = document.createDocumentFragment();

  examples.forEach((item) => {
    const titleRaw = microcmsPlainText(item?.title);
    const title = titleRaw || "見直しの一例";
    const beforeLabel = item?.beforeLabel ? String(item.beforeLabel) : "見直し前";
    const beforePrice = item?.beforePrice ? String(item.beforePrice) : "";
    const afterLabel = item?.afterLabel ? String(item.afterLabel) : "見直し後";
    const afterPrice = item?.afterPrice ? String(item.afterPrice) : "";
    const monthlySaving = item?.monthlySaving ? String(item.monthlySaving) : "";
    const yearlySaving = item?.yearlySaving ? String(item.yearlySaving) : "";
    const imageUrl = item?.image?.url ? String(item.image.url) : "";

    const article = document.createElement("article");
    article.className = "lp-example-card lp-card-soft";

    const media = document.createElement("div");
    media.className = "lp-example-card__media";
    if (imageUrl) {
      const img = document.createElement("img");
      img.className = "lp-example-card__img";
      img.src = imageUrl;
      img.alt = title;
      img.loading = "lazy";
      img.decoding = "async";
      media.appendChild(img);
    }

    const body = document.createElement("div");
    body.className = "lp-example-card__body";
    body.innerHTML = `
      <div class="lp-example-card__head">
        <h3 class="lp-example-card__label"></h3>
      </div>
      <div class="lp-example-card__rows">
        <div class="lp-example-card__row">
          <span class="lp-example-card__muted"></span>
          <span class="lp-example-card__before"></span>
        </div>
        <div class="lp-example-card__arrow" aria-hidden="true">↓</div>
        <div class="lp-example-card__row">
          <span class="lp-example-card__muted"></span>
          <span class="lp-example-card__after"><span class="lp-example-card__mark"></span></span>
        </div>
      </div>
      <div class="lp-example-card__foot">
        <p class="lp-example-card__saving"><span class="lp-example-card__mark"></span></p>
        <p class="lp-example-card__year"></p>
      </div>
    `;

    body.querySelector(".lp-example-card__label").textContent = title;
    const muted = body.querySelectorAll(".lp-example-card__muted");
    if (muted[0]) muted[0].textContent = beforeLabel;
    if (muted[1]) muted[1].textContent = afterLabel;
    body.querySelector(".lp-example-card__before").textContent = beforePrice;
    body.querySelector(".lp-example-card__after .lp-example-card__mark").textContent = afterPrice;
    body.querySelector(".lp-example-card__saving .lp-example-card__mark").textContent = monthlySaving;
    body.querySelector(".lp-example-card__year").textContent = yearlySaving;

    // If some fields are empty, keep layout but avoid stray blanks
    if (!afterPrice) body.querySelector(".lp-example-card__after .lp-example-card__mark").textContent = "—";
    if (!monthlySaving) body.querySelector(".lp-example-card__saving .lp-example-card__mark").textContent = "";
    if (!yearlySaving) body.querySelector(".lp-example-card__year").textContent = "";

    if (imageUrl) article.appendChild(media);
    article.appendChild(body);
    frag.appendChild(article);
  });

  gridEl.replaceChildren(frag);
}

async function initExamplesMicrocms() {
  const gridEl = document.querySelector("[data-examples-grid]");
  if (!gridEl) return;

  const cfg = getMicrocmsExamplesConfig();
  const { ok, examples, url } = await fetchMicrocmsExamples();

  gridEl.dataset.lpExamplesEndpoint = cfg.endpoint;
  gridEl.dataset.lpExamplesApiKeySet = cfg.apiKey ? "true" : "false";

  if (!ok) {
    gridEl.dataset.lpExamplesSource = "fallback";
    if (url) gridEl.dataset.lpExamplesUrl = url;
    renderExamplesFallback(gridEl);
    return;
  }

  if (!Array.isArray(examples) || examples.length === 0) {
    logExamplesFallback(
      "接続は成功したがカード配列が0件",
      `endpoint="${cfg.endpoint}" で examples 配列または contents を解釈できませんでした。microCMS のフィールドと公開状態を確認してください。`,
    );
    gridEl.dataset.lpExamplesSource = "empty";
    if (url) gridEl.dataset.lpExamplesUrl = url;
    renderExamplesFromMicrocms(gridEl, examples);
    return;
  }

  gridEl.dataset.lpExamplesSource = "microcms";
  if (url) gridEl.dataset.lpExamplesUrl = url;
  renderExamplesFromMicrocms(gridEl, examples);
}

function getMicrocmsFaqConfig() {
  const cfg = window.LP_MICROCMS_FAQ || {};
  return {
    serviceDomain: String(cfg.serviceDomain || "").trim(),
    apiKey: String(cfg.apiKey || "").trim(),
    endpoint: String(cfg.endpoint || "faq").trim(),
  };
}

function logFaqFallback(reason, detail) {
  const lines = [
    "[faq] FALLBACK を表示しています（microCMS の FAQ ではありません）",
    `  理由: ${reason}`,
  ];
  if (detail != null && detail !== "") lines.push(`  詳細: ${detail}`);
  lines.push("  確認: [data-faq-list] の data-lp-faq-source が \"fallback\" か確認してください。");
  console.error(lines.join("\n"));
}

async function fetchMicrocmsFaq() {
  const cfg = getMicrocmsFaqConfig();
  const url = `https://${cfg.serviceDomain}.microcms.io/api/v1/${cfg.endpoint}`;

  if (!cfg.serviceDomain || !cfg.apiKey) {
    logFaqFallback(
      "設定不足（API に接続していません）",
      !cfg.serviceDomain
        ? "serviceDomain が空です（lp/js/microcms.faq.config.js）"
        : "apiKey が空です（lp/js/microcms.faq.config.js）",
    );
    return {
      ok: false,
      items: [],
      json: null,
      url,
      error: new Error("microCMS FAQ config missing"),
    };
  }

  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        "X-MICROCMS-API-KEY": cfg.apiKey,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const msg = `HTTP ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`;
      logFaqFallback("microCMS のレスポンスがエラー", `${msg} | URL: ${url}`);
      throw new Error(`microCMS FAQ request failed: ${msg}`);
    }
    const json = await res.json();
    const items = extractFaqItemsFromMicrocmsResponse(cfg.endpoint, json);
    return { ok: true, items, json, url, error: null };
  } catch (err) {
    if (!String(err?.message || "").includes("microCMS FAQ request failed")) {
      logFaqFallback("fetch / JSON の処理に失敗", `${err?.message || err} | URL: ${url}`);
    }
    return { ok: false, items: [], json: null, url, error: err };
  }
}

function extractFaqItemsFromMicrocmsResponse(endpoint, json) {
  if (!json || typeof json !== "object") return [];

  const arrayKeys = ["faq", "faqs", "faqItems", "items"];
  for (const key of arrayKeys) {
    if (Array.isArray(json[key])) return json[key];
  }

  if (Array.isArray(json.contents)) {
    const looksLikeFaq = (v) =>
      v &&
      typeof v === "object" &&
      (("question" in v && ("answer" in v || "body" in v || "content" in v)) ||
        ("title" in v && ("answer" in v || "body" in v || "content" in v)) ||
        ("q" in v && "a" in v));

    if (json.contents.some(looksLikeFaq)) return json.contents;

    const flattened = [];
    json.contents.forEach((c) => {
      if (!c || typeof c !== "object") return;
      for (const key of arrayKeys) {
        if (Array.isArray(c[key])) {
          flattened.push(...c[key]);
          return;
        }
      }
    });
    if (flattened.length > 0) return flattened;
  }

  console.error(
    `[faq] 想定外のレスポンスです（endpoint="${endpoint}"）。` +
      `API 名が faq か、contents / faq 系の配列があるか確認してください。`,
    Object.keys(json),
  );
  return [];
}

function pickFaqQuestion(item) {
  const raw = item?.question ?? item?.title ?? item?.q ?? item?.name;
  return microcmsPlainText(raw);
}

function pickFaqAnswerRaw(item) {
  const raw = item?.answer ?? item?.body ?? item?.content ?? item?.a;
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "object") {
    if (typeof raw.html === "string") return raw.html;
    if (typeof raw.richText === "string") return raw.richText;
  }
  return microcmsPlainText(raw);
}

function appendFaqAnswerToPanel(panelEl, rawAnswer) {
  const s = rawAnswer == null ? "" : String(rawAnswer);
  const trimmed = s.trim();
  if (!trimmed) {
    const p = document.createElement("p");
    p.className = "lp-faq__answer";
    p.textContent = "";
    panelEl.appendChild(p);
    return;
  }
  const looksLikeHtml = /<[^>]+>/.test(trimmed);
  if (looksLikeHtml) {
    const wrap = document.createElement("div");
    wrap.className = "lp-faq__answer";
    wrap.innerHTML = trimmed;
    panelEl.appendChild(wrap);
    return;
  }
  const p = document.createElement("p");
  p.className = "lp-faq__answer";
  p.textContent = microcmsPlainText(trimmed);
  panelEl.appendChild(p);
}

function renderFaqFallback(listEl) {
  const tpl = document.getElementById("lp-faq-fallback");
  if (tpl && tpl.content) {
    listEl.replaceChildren(tpl.content.cloneNode(true));
    return;
  }
  const p = document.createElement("p");
  p.className = "lp-faq__empty";
  p.textContent = "よくあるご質問を読み込めませんでした。";
  listEl.replaceChildren(p);
}

function renderFaqEmpty(listEl) {
  const p = document.createElement("p");
  p.className = "lp-faq__empty";
  p.textContent = "現在、表示できる質問がありません。";
  listEl.replaceChildren(p);
}

function renderFaqFromMicrocms(listEl, items) {
  if (!Array.isArray(items) || items.length === 0) {
    renderFaqEmpty(listEl);
    return;
  }

  const frag = document.createDocumentFragment();
  const iconSrc = "assets/icons/icon-plus.svg";

  items.forEach((item, idx) => {
    const q = pickFaqQuestion(item);
    const answerRaw = pickFaqAnswerRaw(item);
    if (!q.trim() && !String(answerRaw).trim()) return;

    const n = frag.childNodes.length + 1;
    const qId = `faq-q${n}`;
    const aId = `faq-a${n}`;

    const row = document.createElement("div");
    row.className = "lp-faq__item";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lp-faq__trigger";
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", aId);
    btn.id = qId;

    const span = document.createElement("span");
    span.textContent = q.trim() || "（質問）";
    btn.appendChild(span);

    const img = document.createElement("img");
    img.className = "lp-faq__icon";
    img.src = iconSrc;
    img.alt = "";
    img.width = 20;
    img.height = 20;
    btn.appendChild(img);

    const panel = document.createElement("div");
    panel.className = "lp-faq__panel";
    panel.id = aId;
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-labelledby", qId);
    appendFaqAnswerToPanel(panel, answerRaw);

    row.appendChild(btn);
    row.appendChild(panel);
    frag.appendChild(row);
  });

  if (!frag.childNodes.length) {
    renderFaqEmpty(listEl);
    return;
  }

  listEl.replaceChildren(frag);
}

function getFaqListMountEl() {
  return document.getElementById("lp-faq-list") || document.querySelector("[data-faq-list]");
}

async function initFaqMicrocms() {
  const listEl = getFaqListMountEl();
  if (!listEl) {
    if (document.body.dataset.lpPage === "privacy-policy") return;
    console.error(
      "[faq] #lp-faq-list / [data-faq-list] が見つかりません。components/faq.html の読み込みに失敗しているか、" +
        "boot 完了前に参照している可能性があります。document.readyState と Network タブで components/faq.html を確認してください。",
    );
    return;
  }

  const cfg = getMicrocmsFaqConfig();
  const { ok, items, url } = await fetchMicrocmsFaq();

  listEl.dataset.lpFaqEndpoint = cfg.endpoint;
  listEl.dataset.lpFaqApiKeySet = cfg.apiKey ? "true" : "false";

  if (!ok) {
    listEl.dataset.lpFaqSource = "fallback";
    if (url) listEl.dataset.lpFaqUrl = url;
    renderFaqFallback(listEl);
    return;
  }

  if (!Array.isArray(items) || items.length === 0) {
    logFaqFallback(
      "接続は成功したが FAQ 配列が0件",
      `endpoint="${cfg.endpoint}" で faq / faqs / contents から1件も取り出せませんでした。`,
    );
    listEl.dataset.lpFaqSource = "empty";
    if (url) listEl.dataset.lpFaqUrl = url;
    renderFaqEmpty(listEl);
    return;
  }

  listEl.dataset.lpFaqSource = "microcms";
  if (url) listEl.dataset.lpFaqUrl = url;
  renderFaqFromMicrocms(listEl, items);
}

function initFaq() {
  const list = getFaqListMountEl();
  if (!list) return;
  if (list.dataset.lpFaqDelegated === "true") return;
  list.dataset.lpFaqDelegated = "true";

  list.addEventListener("click", (e) => {
    const btn = e.target && e.target.closest ? e.target.closest(".lp-faq__trigger") : null;
    if (!btn || !list.contains(btn)) return;
    const item = btn.closest(".lp-faq__item");
    if (!item) return;

    const wasOpen = item.classList.contains("is-open");
    list.querySelectorAll(".lp-faq__item").forEach((i) => {
      i.classList.remove("is-open");
      const b = i.querySelector(".lp-faq__trigger");
      if (b) b.setAttribute("aria-expanded", "false");
    });
    if (!wasOpen) {
      item.classList.add("is-open");
      btn.setAttribute("aria-expanded", "true");
    }
  });
}

function initForm() {
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

  let mode = "edit"; // edit | confirm | sent
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
      fieldName && fieldName.focus();
    });

    // Order: confirm -> submit -> back
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
      // 実送信時: #lp-site-contact-email または window.LP_SITE.contactEmail を送信先に利用可能
      const recipientEl = document.getElementById("lp-site-contact-email");
      const recipient =
        (recipientEl && recipientEl.value) || (window.LP_SITE && window.LP_SITE.contactEmail) || "";
      form.dataset.lpMailRecipient = recipient;
      // Here you can replace this with a real endpoint submission.
      // For now we only simulate a sent notice and reset the form.
      submitBtn.disabled = true;
      backBtn && (backBtn.disabled = true);
      showToast("送信されました");

      if (resetTimerId) window.clearTimeout(resetTimerId);
      resetTimerId = window.setTimeout(() => {
        clearToast();
        form.reset();
        setMode("edit");
      }, 1600);
      return;
    }
  });

  // If user edits any field after confirm, return to edit mode.
  form.addEventListener("input", () => {
    if (mode !== "edit") setMode("edit");
  });
}

function initHeroSlider() {
  const root = document.querySelector("[data-hero-root]");
  const titleEl = root ? root.querySelector("[data-hero-title]") : null;
  const leadEl = root ? root.querySelector("[data-hero-lead]") : null;
  if (!root || !titleEl || !leadEl) return;

  const slides = Array.from(root.querySelectorAll(".lp-hero__slide"));
  const dotsWrap = root.querySelector("[data-hero-dots]");
  const dots = dotsWrap ? Array.from(dotsWrap.querySelectorAll("[data-hero-dot]")) : [];
  const prevBtn = root.querySelector("[data-hero-prev]");
  const nextBtn = root.querySelector("[data-hero-next]");

  const SLIDES = [
    {
      titleHtml: [
        '<span class="lp-hero__line">毎月の支払い、</span>',
        '<span class="lp-hero__line"><span class="lp-hero__accent">“なんとなく”</span>のままに</span>',
        '<span class="lp-hero__line">なっていませんか？</span>',
      ].join(""),
      leadHtml: [
        "<p>携帯代や電気代、インターネットにガス代など、</p>",
        "<p>気づけば毎月かかっている固定費。</p>",
        "<p>ご家庭の支出をまとめて見直し、</p>",
        "<p>無理のない形で整えます。</p>",
      ].join(""),
    },
    {
      titleHtml: [
        "<span class=\"lp-hero__line\">気づかないうちに、</span>",
        '<span class="lp-hero__line"><span class="lp-hero__accent">払いすぎている</span>固定費があるかもしれません。</span>',
      ].join(""),
      leadHtml: [
        "<p>「なんとなく契約したまま」</p>",
        "<p>「よく分からないけどそのまま」</p>",
        "<p>そんな毎月の支払いを見直すことで、</p>",
        "<p>無理なく整えることができます。</p>",
      ].join(""),
    },
    {
      titleHtml: [
        "<span class=\"lp-hero__line\">まずは今の状況を、</span>",
        '<span class="lp-hero__line"><span class="lp-hero__accent">一緒に整理する</span>ところから始めませんか？</span>',
      ].join(""),
      leadHtml: [
        "<p>携帯・インターネット・電気・ガスなど、</p>",
        "<p>それぞれ別々にかかっている</p>",
        "<p>支払いをまとめて見直し、</p>",
        "<p>ご家庭に合った無理のない形をご提案します。</p>",
      ].join(""),
    },
  ];

  let index = 0;
  let timerId = null;
  const INTERVAL_MS = 7000;

  function renderText(i) {
    const t = SLIDES[i] || SLIDES[0];
    titleEl.innerHTML = t.titleHtml;
    leadEl.innerHTML = t.leadHtml;
  }

  function render(i) {
    index = (i + slides.length) % slides.length;
    slides.forEach((s, idx) => s.classList.toggle("is-active", idx === index));
    dots.forEach((d, idx) => {
      const active = idx === index;
      d.classList.toggle("is-active", active);
      d.setAttribute("aria-selected", active ? "true" : "false");
    });
    renderText(index);
  }

  function start() {
    stop();
    timerId = window.setInterval(() => render(index + 1), INTERVAL_MS);
  }

  function stop() {
    if (timerId) window.clearInterval(timerId);
    timerId = null;
  }

  dots.forEach((d) => {
    d.addEventListener("click", () => {
      const i = Number(d.getAttribute("data-hero-dot") || "0");
      render(i);
      start();
    });
  });

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      render(index - 1);
      start();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      render(index + 1);
      start();
    });
  }

  // Swipe (mobile)
  let startX = 0;
  let startY = 0;
  let tracking = false;

  root.addEventListener("touchstart", (e) => {
    const t = e.touches && e.touches[0];
    if (!t) return;
    tracking = true;
    startX = t.clientX;
    startY = t.clientY;
  }, { passive: true });

  root.addEventListener("touchend", (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (Math.abs(dx) < 44 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) render(index + 1);
    else render(index - 1);
    start();
  }, { passive: true });

  // Pause on hover/focus for calm UX
  root.addEventListener("mouseenter", stop);
  root.addEventListener("mouseleave", start);
  root.addEventListener("focusin", stop);
  root.addEventListener("focusout", start);

  render(0);
  start();
}

/**
 * index.html は boot で非同期注入のため、初回読み込み時に #contact が無くブラウザのハッシュスクロールが効かない。
 * パーツ挿入後に #contact へスクロールする。
 */
function scrollToContactHashIfNeeded() {
  const hash = window.location.hash;
  if (hash !== "#contact") return;
  const el = document.getElementById("contact");
  if (!el) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

async function boot() {
  try {
    const isPrivacyPolicyPage = document.body.dataset.lpPage === "privacy-policy";
    await inject("#lp-header-root", "header", false);
    if (isPrivacyPolicyPage) {
      const brand = document.querySelector("[data-site-brand]");
      if (brand) brand.setAttribute("href", "index.html");
      const headerCta = document.querySelector(".lp-header .lp-btn--header");
      if (headerCta) headerCta.setAttribute("href", "index.html#contact");
    }
    const main = document.getElementById("lp-main");
    if (main && !isPrivacyPolicyPage) {
      main.innerHTML = "";
      for (const name of PART_MAIN) {
        const html = await loadHtml(`components/${name}.html`);
        main.insertAdjacentHTML("beforeend", html);
      }
    }
    await inject("#lp-footer-root", "footer", false);
    await initSiteMicrocms();
    if (!isPrivacyPolicyPage && !document.getElementById("lp-faq-list")) {
      console.error(
        "[lp] FAQ マウント（#lp-faq-list）が DOM にありません。components/faq.html が 404 になっていないか、" +
          "index.html を lp フォルダをルートとするローカルサーバーから開いているか確認してください。",
      );
    }
    initFaq();
    initForm();
    initHeroSlider();
    initExamplesMicrocms();
    initFaqMicrocms();
    if (!isPrivacyPolicyPage) {
      scrollToContactHashIfNeeded();
    }
  } catch (err) {
    console.error(err);
    const main = document.getElementById("lp-main");
    if (main) {
      main.innerHTML = `<p class="lp-boot-error" role="alert">ページの読み込みに失敗しました。lp フォルダでローカルサーバー（例: python3 -m http.server）を起動し、http://localhost:… から開いてください。</p>`;
    }
  }
}

boot();

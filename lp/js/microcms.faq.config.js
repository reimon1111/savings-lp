/**
 * microCMS — よくあるご質問（faq）
 *
 * 対応する main.js: window.LP_MICROCMS_FAQ を参照
 * 既定 endpoint: faq（変更しないこと／管理画面の API 名と一致させる）
 *
 * 取得失敗・未設定時: components/faq.html の template#lp-faq-fallback
 * 取得成功・0件時: 「現在、表示できる質問がありません。」（.lp-faq__empty）
 */
window.LP_MICROCMS_FAQ = window.LP_MICROCMS_FAQ || {
  serviceDomain: "aclzw7c094",
  apiKey: "eSE7BCKhAguJ0JNq2CJTtcq0ucGodOFc0DuW",
  endpoint: "faq",
};

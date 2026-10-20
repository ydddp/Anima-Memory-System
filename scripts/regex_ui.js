import { describeTagRule, saveRuleForm } from "./tag_rules.js";

const escapeHtml = text => String(text ?? "").replace(/&/g, "&amp;")
  .replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function createRuleForm(original) {
  let baseline = original;
  const tags = original && describeTagRule(original);
  let mode = !original?.regex || tags ? "tags" : "custom";
  const $el = $(`<div class="anima-rule-form">
    <div class="rule-tags">
      <label>操作<select class="anima-select rule-operation">
        <option value="extract">提取正文</option><option value="exclude">删除整块</option>
        <option value="before">移除标签之前</option><option value="after">移除标签之后</option>
      </select></label>
      <div class="rule-delimiters">
        <label>开始标签<input class="anima-input rule-start" type="text" placeholder="例如：<content>" spellcheck="false"></label>
        <label>结束标签<input class="anima-input rule-end" type="text" placeholder="例如：</content>" spellcheck="false"></label>
      </div>
      <label class="rule-single" hidden>标签<input class="anima-input rule-tag" type="text" placeholder="例如：<content>" spellcheck="false"></label>
      <p class="rule-help"></p>
    </div>
    <div class="rule-custom" hidden>
      <label>规则类型<select class="anima-select edit-type">
        <option value="extract">提取</option><option value="exclude">排除</option>
      </select></label>
      <label>正则表达式<textarea class="anima-input anima-textarea edit-input" rows="3" spellcheck="false"></textarea></label>
    </div>
    <button type="button" class="rule-mode-toggle"></button>
    <div class="rule-error" role="alert" hidden></div>
  </div>`);
  $el.find(".rule-operation").val(tags?.operation || original?.type || "extract");
  $el.find(".edit-type").val(tags?.type || original?.type || "extract");
  $el.find(".rule-tag").val(tags?.tag || "");
  $el.find(".rule-start").val(tags?.start || "");
  $el.find(".rule-end").val(tags?.end || "");
  $el.find(".edit-input").val(original?.regex || "");
  const read = () => saveRuleForm({ mode, operation: $el.find(".rule-operation").val(), tag: $el.find(".rule-tag").val(),
    type: $el.find(mode === "tags" ? ".rule-operation" : ".edit-type").val(),
    start: $el.find(".rule-start").val(), end: $el.find(".rule-end").val(), regex: $el.find(".edit-input").val() }, baseline);
  const showError = error => $el.find(".rule-error").text(error.message).prop("hidden", false);
  const refresh = () => {
    $el.find(".rule-tags").prop("hidden", mode !== "tags");
    $el.find(".rule-custom").prop("hidden", mode !== "custom");
    $el.find(".rule-mode-toggle").text(mode === "tags" ? "自定义正则" : "改用标签填写");
    const operation = $el.find(".rule-operation").val();
    const single = operation === "before" || operation === "after";
    $el.find(".rule-single").prop("hidden", !single);
    $el.find(".rule-delimiters").prop("hidden", single);
    $el.find(".rule-help").text({
      exclude: "删除这两个标签及其中的全部内容，保留其余文字。",
      extract: "只保留这两个标签之间的正文，不包含标签。支持多行和多段内容。",
      before: "移除第一个标签及其之前的全部内容，保留后面的文字。找不到标签时保持原文。",
      after: "移除第一个标签及其之后的全部内容，保留前面的文字。找不到标签时保持原文。",
    }[operation]);
  };
  $el.on("input change", "input, textarea, select", () => {
    $el.find(".rule-error").prop("hidden", true); refresh();
  });
  $el.find(".rule-mode-toggle").on("click", () => {
    try {
      if (mode === "tags") {
        // An empty new form may enter custom mode without inventing a pattern.
        const single = ["before", "after"].includes($el.find(".rule-operation").val());
        const empty = single ? !$el.find(".rule-tag").val()
          : !$el.find(".rule-start").val() && !$el.find(".rule-end").val();
        if (!empty) {
          const rule = read();
          $el.find(".edit-input").val(rule.regex);
          $el.find(".edit-type").val(rule.type);
        }
        mode = "custom";
      } else {
        const empty = !$el.find(".edit-input").val().trim();
        const rule = empty ? null : read();
        const next = rule && describeTagRule(rule);
        if (!empty && !next) throw new Error("这个表达式无法转换成标签规则，请继续使用自定义正则。");
        baseline = rule;
        $el.find(".rule-start").val(next?.start || "");
        $el.find(".rule-end").val(next?.end || "");
        $el.find(".rule-tag").val(next?.tag || "");
        $el.find(".rule-operation").val(next?.operation || $el.find(".edit-type").val());
        mode = "tags";
      }
      $el.find(".rule-error").prop("hidden", true); refresh();
    } catch (error) { showError(error); }
  });
  refresh();
  return { $el, read, showError };
}

/** Shared list for summary (pre/post), status, RAG, BM25 and GC. */
export class RegexListComponent {
  constructor(containerId, getData, onSave, { field = "regex", toggle = true } = {}) {
    this.containerId = containerId;
    this.getData = getData;
    this.onSave = onSave;
    this.field = field;
    this.toggle = toggle;
    this.$container = $(`#${containerId}`);
  }

  render() {
    const listEl = this.$container;
    if (listEl.data("ui-sortable")) listEl.sortable("destroy");
    listEl.empty();
    const dataList = this.getData() || [];
    if (!dataList.length) {
      listEl.html('<div class="rule-empty">暂无规则</div>');
      return;
    }
    dataList.forEach((item, index) => {
      const rule = { regex: item[this.field], type: item.type };
      const tags = describeTagRule(rule);
      const isExclude = item.type === "exclude";
      const label = tags ? { extract: "提取正文", exclude: "删除整块", before: "移除标签之前", after: "移除标签之后" }[tags.operation]
        : (isExclude ? "自定义排除" : "自定义提取");
      const text = tags ? (tags.tag ?? `${tags.start} → ${tags.end}`) : rule.regex;
      const isEnabled = !this.toggle || item.enabled !== false;
      const $row = $(`<div class="anima-regex-item is-row" data-idx="${index}">
        <div class="view-mode">
          <i class="fa-solid fa-bars anima-drag-handle" title="拖动排序"></i>
          <div class="regex-type-badge"><span class="anima-tag ${isExclude ? "danger" : "primary"}">${label}</span></div>
          <span class="regex-text ${isEnabled ? "" : "rule-disabled"}" title="${escapeHtml(text)}">${escapeHtml(text)}</span>
          <div class="regex-actions">
            <label class="anima-switch" title="启用/禁用">
              <input type="checkbox" class="regex-toggle" aria-label="启用规则" ${isEnabled ? "checked" : ""}>
              <span class="anima-slider round"></span>
            </label>
            <button class="anima-btn secondary small btn-edit" title="编辑" aria-label="编辑规则"><i class="fa-solid fa-pen"></i></button>
            <button class="anima-btn danger small btn-del" title="删除" aria-label="删除规则"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
        <div class="edit-mode" style="display:none"></div>
      </div>`);
      if (!this.toggle) $row.find(".anima-switch").remove();
      $row.find(".regex-toggle").on("change", e => {
        item.enabled = $(e.target).prop("checked"); this.onSave(this.getData()); this.render();
      });
      $row.find(".btn-del").on("click", () => {
        if (!confirm("确定删除此规则吗？")) return;
        const list = this.getData(); list.splice(index, 1); this.onSave(list); this.render();
      });
      $row.find(".btn-edit").on("click", () => {
        const form = createRuleForm(rule);
        const $edit = $row.find(".edit-mode").empty().append(form.$el);
        const $actions = $('<div class="rule-edit-actions"><button class="anima-btn primary small btn-save">保存规则</button><button class="anima-btn secondary small btn-cancel">取消</button></div>');
        $edit.append($actions);
        $row.find(".view-mode").hide(); $edit.css("display", "flex");
        $actions.find(".btn-cancel").on("click", () => this.render());
        $actions.find(".btn-save").on("click", () => {
          try {
            const next = form.read();
            // Preserve GC's content field and every unknown setting on the record.
            item[this.field] = next.regex;
            if (next.type !== undefined) item.type = next.type;
            this.onSave(this.getData()); this.render();
          } catch (error) { form.showError(error); }
        });
      });
      listEl.append($row);
    });
    this._initSortable();
  }

  _initSortable() {
    const listEl = this.$container;
    listEl.sortable({ handle: ".anima-drag-handle", placeholder: "ui-state-highlight",
      stop: () => {
        const current = this.getData();
        const ordered = listEl.children("[data-idx]").map((_, el) => current[$(el).data("idx")]).get();
        this.onSave(ordered); this.render();
      },
    });
  }

  addRule(regexStr, type) {
    const list = this.getData();
    list.push({ [this.field]: regexStr, type, ...(this.toggle ? { enabled: true } : {}) });
    this.onSave(list); this.render();
  }

  openAddModal() {
    const modalId = `${this.containerId}-rule-modal`;
    $(`#${modalId}`).remove();
    const $modal = $(getRegexModalHTML()).attr("id", modalId);
    const form = createRuleForm();
    $modal.find(".anima-modal-body").append(form.$el);
    const close = () => $modal.remove();
    $modal.find(".anima-close-regex-modal").on("click", close);
    $modal.on("click", e => { if (e.target === $modal[0]) close(); });
    $modal.on("keydown", e => { if (e.key === "Escape") { e.stopPropagation(); close(); } });
    $modal.find(".rule-confirm").on("click", () => {
      try { const rule = form.read(); this.addRule(rule.regex, rule.type); close(); }
      catch (error) { form.showError(error); }
    });
    $("body").append($modal);
    $modal.find(".rule-operation").trigger("focus");
  }
}

export function getRegexModalHTML() {
  return `<div class="anima-modal anima-rule-modal">
    <div class="anima-modal-content" role="dialog" aria-modal="true" aria-label="添加规则">
      <div class="anima-modal-header"><h3>添加规则</h3><button class="anima-close-regex-modal rule-close" aria-label="关闭">&times;</button></div>
      <div class="anima-modal-body"></div>
      <div class="anima-modal-footer"><button class="anima-btn secondary anima-close-regex-modal">取消</button><button class="anima-btn primary rule-confirm">添加规则</button></div>
    </div></div>`;
}

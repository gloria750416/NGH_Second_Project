function extractWords(text) {
  return text
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/^[^A-Za-z]+|[^A-Za-z'-]+$/g, ""))
    .filter(Boolean);
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function detectConnector(words) {
  const connectors = ["although", "because", "if", "when", "while", "that", "which", "who", "but", "and", "so"];
  return words.find((word) => connectors.includes(word.toLowerCase())) ?? null;
}

function detectEnding(text) {
  const trimmed = text.trim();
  return trimmed ? trimmed.slice(-1) : "";
}

function normalizeSentenceBreakdown(analysis, sourceText) {
  const rawBreakdown = Array.isArray(analysis?.sentenceBreakdown) ? analysis.sentenceBreakdown : [];
  const normalized = rawBreakdown
    .map((entry) => ({
      sentence: String(entry?.sentence ?? "").trim(),
      translation: String(entry?.translation ?? "").trim(),
    }))
    .filter((entry) => entry.sentence || entry.translation);

  if (normalized.length) {
    return normalized;
  }

  const sentences = splitSentences(sourceText);
  if (!sentences.length) {
    return [];
  }

  if (sentences.length === 1) {
    return [
      {
        sentence: sentences[0],
        translation: String(analysis?.translation ?? "").trim() || String(analysis?.meaning ?? "").trim(),
      },
    ];
  }

  return sentences.map((sentence) => ({
    sentence,
    translation: "",
  }));
}

function normalizeGrammarAnalysis(analysis, sourceText) {
  const overview = String(analysis?.overview ?? "").trim();
  const translation = String(analysis?.translation ?? "").trim();
  const meaning = String(analysis?.meaning ?? "").trim();
  const structureNote = String(analysis?.structureNote ?? "").trim();
  const clauseDetail = String(analysis?.clauseDetail ?? "").trim();
  const patternDetail = String(analysis?.patternDetail ?? "").trim();

  return {
    overview,
    translation: translation || meaning || overview || structureNote,
    meaning: meaning || translation || overview || structureNote,
    sentenceBreakdown: normalizeSentenceBreakdown(analysis, sourceText),
    sentenceType: String(analysis?.sentenceType ?? "").trim(),
    tense: String(analysis?.tense ?? "").trim(),
    subject: String(analysis?.subject ?? "").trim(),
    verb: String(analysis?.verb ?? "").trim(),
    verbDetail: String(analysis?.verbDetail ?? "").trim(),
    objectOrComplement: String(analysis?.objectOrComplement ?? "").trim(),
    modifiers: Array.isArray(analysis?.modifiers) ? analysis.modifiers.map((item) => String(item).trim()).filter(Boolean) : [],
    connector: String(analysis?.connector ?? "").trim(),
    clauseDetail: clauseDetail || structureNote || overview,
    patternDetail: patternDetail || structureNote || overview,
    structureNote,
    learningTips: Array.isArray(analysis?.learningTips) ? analysis.learningTips.map((item) => String(item).trim()).filter(Boolean) : [],
  };
}

function normalizeMeaningEntries(entries) {
  return Array.isArray(entries)
    ? entries
        .map((entry) => ({
          text: String(entry?.text ?? "").trim(),
          normalized: String(entry?.normalized ?? "").trim().toLowerCase(),
          partOfSpeechKo: String(entry?.partOfSpeechKo ?? "").trim() || "표현",
          meaningKo: String(entry?.meaningKo ?? "").trim(),
          noteKo: String(entry?.noteKo ?? "").trim() || "문맥에 맞는 의미 단위입니다.",
          statsWords: Array.isArray(entry?.statsWords) ? entry.statsWords.map((item) => String(item).trim().toLowerCase()).filter(Boolean) : [],
        }))
        .filter((entry) => entry.text && entry.meaningKo)
    : [];
}

function createStateItem(message) {
  const item = document.createElement("li");
  item.className = "empty-state";
  item.textContent = message;
  return item;
}

function createUnitCard({ index, text, normalized, partOfSpeechKo, meaningKo, noteKo }) {
  const item = document.createElement("li");
  item.className = "word-card";

  const indexBadge = document.createElement("span");
  indexBadge.className = "word-index";
  indexBadge.textContent = String(index + 1);

  const textValue = document.createElement("p");
  textValue.className = "word-value";
  textValue.textContent = text;

  const textMeta = document.createElement("p");
  textMeta.className = "word-meta";
  textMeta.textContent = `정리형: ${normalized}`;

  const typeLabel = document.createElement("p");
  typeLabel.className = "meaning-label";
  typeLabel.textContent = "표현 유형";

  const typeValue = document.createElement("p");
  typeValue.className = "meaning-value";
  typeValue.textContent = partOfSpeechKo;

  const meaningLabel = document.createElement("p");
  meaningLabel.className = "meaning-label";
  meaningLabel.textContent = "문맥 뜻";

  const meaningValue = document.createElement("p");
  meaningValue.className = "meaning-value";
  meaningValue.textContent = meaningKo;

  const noteLabel = document.createElement("p");
  noteLabel.className = "meaning-label";
  noteLabel.textContent = "설명";

  const noteValue = document.createElement("p");
  noteValue.className = "meaning-value";
  noteValue.textContent = noteKo;

  item.append(
    indexBadge,
    textValue,
    textMeta,
    typeLabel,
    typeValue,
    meaningLabel,
    meaningValue,
    noteLabel,
    noteValue,
  );

  return item;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(payload?.message ?? `Request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return payload;
}

function initApp() {
  const sentenceInput = document.querySelector("#sentence-input");
  const splitButton = document.querySelector("#split-button");
  const resetButton = document.querySelector("#reset-button");
  const helperText = document.querySelector("#helper-text");
  const resultTitle = document.querySelector("#result-title");
  const wordCount = document.querySelector("#word-count");
  const wordList = document.querySelector("#word-list");
  const summaryTitle = document.querySelector("#summary-title");
  const summaryBadge = document.querySelector("#summary-badge");
  const summaryContent = document.querySelector("#summary-content");
  const grammarTitle = document.querySelector("#grammar-title");
  const grammarBadge = document.querySelector("#grammar-badge");
  const grammarContent = document.querySelector("#grammar-content");

  const requiredElements = [
    sentenceInput,
    splitButton,
    resetButton,
    helperText,
    resultTitle,
    wordCount,
    wordList,
    summaryTitle,
    summaryBadge,
    summaryContent,
    grammarTitle,
    grammarBadge,
    grammarContent,
  ];

  if (requiredElements.some((element) => !element)) {
    console.error("필수 화면 요소를 찾지 못했습니다.");
    return;
  }

  let activeRequestId = 0;

  function setButtonsDisabled(disabled) {
    splitButton.disabled = disabled;
    resetButton.disabled = disabled;
  }

  function renderEmptyState(message) {
    resultTitle.textContent = "아직 분석한 내용이 없습니다.";
    wordCount.textContent = "0 units";
    wordList.replaceChildren(createStateItem(message));
  }

  function renderSentenceSummaryEmptyState() {
    summaryTitle.textContent = "아직 지문 해석이 준비되지 않았습니다.";
    summaryBadge.textContent = "Waiting";
    summaryContent.innerHTML = "<p>문장이나 지문을 분석하면 전체 의미와 문장별 해석이 여기에 표시됩니다.</p>";
  }

  function renderSentenceSummaryLoadingState(text) {
    summaryTitle.textContent = "전체 해석을 준비하고 있습니다.";
    summaryBadge.textContent = "Preparing";
    summaryContent.innerHTML = `
      <p><strong>원문</strong>: ${text}</p>
      <p style="margin-top: 12px;">지문의 전체 의미와 각 문장 해석을 정리하고 있습니다.</p>
    `;
  }

  function renderSentenceSummaryResult(text, analysis) {
    const sentenceItems = analysis.sentenceBreakdown.length
      ? analysis.sentenceBreakdown
          .map(
            (entry, index) => `
              <li class="summary-sentence-item">
                <p class="summary-sentence-original">${index + 1}. ${entry.sentence}</p>
                <p class="summary-sentence-translation">${entry.translation}</p>
              </li>
            `,
          )
          .join("")
      : '<li class="summary-sentence-item"><p class="summary-sentence-translation">문장별 해석이 없습니다.</p></li>';

    summaryTitle.textContent = "전체 해석이 완료되었습니다.";
    summaryBadge.textContent = "Ready";
    summaryContent.innerHTML = `
      <p><strong>원문</strong>: ${text}</p>
      <p style="margin-top: 12px;"><strong>전체 해석</strong>: ${analysis.translation || "전체 해석이 없습니다."}</p>
      <p style="margin-top: 12px;"><strong>지문의 의미</strong>: ${analysis.meaning || "지문 의미 설명이 없습니다."}</p>
      <div class="summary-sentence-block">
        <p class="summary-sentence-heading">문장별 해석</p>
        <ol class="summary-sentence-list">${sentenceItems}</ol>
      </div>
    `;
  }

  function renderSentenceSummaryFallback(text, words) {
    const connector = detectConnector(words);

    summaryTitle.textContent = "전체 해석을 불러오지 못했습니다.";
    summaryBadge.textContent = "Fallback";
    summaryContent.innerHTML = `
      <p><strong>원문</strong>: ${text}</p>
      <p style="margin-top: 12px;">자동 해석을 가져오지 못했습니다. 아래 문법 분석을 참고해 지문 의미를 확인해 주세요.</p>
      <p style="margin-top: 12px;"><strong>참고</strong>: ${connector ? `${connector}가 문장 연결의 핵심 단서입니다.` : "문장 연결 요소는 자동으로 찾지 못했습니다."}</p>
    `;
  }

  function renderGrammarEmptyState() {
    grammarTitle.textContent = "아직 문법 성분 분석이 준비되지 않았습니다.";
    grammarBadge.textContent = "UI Ready";
    grammarContent.innerHTML = "<p>입력한 문장이나 지문의 핵심 문장을 기준으로 문법 구조를 여기에 표시합니다.</p>";
  }

  function renderGrammarLoadingState(text, words) {
    grammarTitle.textContent = "문법 성분 분석을 준비하고 있습니다.";
    grammarBadge.textContent = "Preparing";
    grammarContent.innerHTML = `
      <p><strong>원문</strong>: ${text}</p>
      <div class="grammar-chips">
        <span class="grammar-chip">단어 수 ${words.length}개</span>
        <span class="grammar-chip">분석 요청 중</span>
      </div>
    `;
  }

  function renderGrammarApiResult(text, analysis) {
    const modifierChips = analysis.modifiers.length
      ? analysis.modifiers.map((item) => `<span class="grammar-chip">${item}</span>`).join("")
      : '<span class="grammar-chip">수식어 정보 없음</span>';
    const learningTips = analysis.learningTips.length
      ? analysis.learningTips.map((item) => `<li>${item}</li>`).join("")
      : "<li>이 문장에서 접속사, 시제, 동사 뒤 구조를 함께 확인해 보세요.</li>";

    grammarTitle.textContent = "문법 성분 분석이 완료되었습니다.";
    grammarBadge.textContent = "AI Analyzed";
    grammarContent.innerHTML = `
      <p><strong>원문</strong>: ${text}</p>
      <div class="grammar-chips">
        <span class="grammar-chip">${analysis.sentenceType || "문장 유형 미확인"}</span>
        <span class="grammar-chip">${analysis.tense || "시제 정보 없음"}</span>
        <span class="grammar-chip">${analysis.connector || "접속 요소 없음"}</span>
      </div>
      <div class="grammar-grid">
        <article class="grammar-card">
          <p class="grammar-card-title">주어(S)</p>
          <p class="grammar-card-copy">${analysis.subject || "확인되지 않았습니다."}</p>
        </article>
        <article class="grammar-card">
          <p class="grammar-card-title">동사(V)</p>
          <p class="grammar-card-copy">${analysis.verb || "확인되지 않았습니다."}</p>
        </article>
        <article class="grammar-card">
          <p class="grammar-card-title">동사 자세히</p>
          <p class="grammar-card-copy">${analysis.verbDetail || "동사 설명이 없습니다."}</p>
        </article>
        <article class="grammar-card">
          <p class="grammar-card-title">목적어 / 보어</p>
          <p class="grammar-card-copy">${analysis.objectOrComplement || "확인되지 않았습니다."}</p>
        </article>
        <article class="grammar-card">
          <p class="grammar-card-title">절 연결 방식</p>
          <p class="grammar-card-copy">${analysis.clauseDetail || "절 구조 설명이 없습니다."}</p>
        </article>
        <article class="grammar-card">
          <p class="grammar-card-title">문장 패턴</p>
          <p class="grammar-card-copy">${analysis.patternDetail || "문장 패턴 설명이 없습니다."}</p>
        </article>
        <article class="grammar-card">
          <p class="grammar-card-title">구조 설명</p>
          <p class="grammar-card-copy">${analysis.structureNote || "구조 설명이 없습니다."}</p>
        </article>
      </div>
      <div class="grammar-summary">
        <p><strong>전체 해설</strong>: ${analysis.overview || "전체 해설이 없습니다."}</p>
        <div class="grammar-chips">${modifierChips}</div>
      </div>
      <div class="grammar-summary">
        <p><strong>학습 포인트</strong></p>
        <ul class="grammar-tip-list">${learningTips}</ul>
      </div>
    `;
  }

  function renderGrammarPreview(text, words) {
    const connector = detectConnector(words);
    const ending = detectEnding(text);
    const endingLabel = ending === "?" ? "의문문 가능성" : ending === "!" ? "감탄문 가능성" : "평서문 가능성";

    grammarTitle.textContent = "문법 성분 분석 예비 화면입니다.";
    grammarBadge.textContent = "Preview";
    grammarContent.innerHTML = `
      <p><strong>원문</strong>: ${text}</p>
      <div class="grammar-chips">
        <span class="grammar-chip">단어 수 ${words.length}개</span>
        <span class="grammar-chip">${endingLabel}</span>
        <span class="grammar-chip">${connector ? `접속사 후보: ${connector}` : "접속사 후보 없음"}</span>
      </div>
      <div class="grammar-grid">
        <article class="grammar-card">
          <p class="grammar-card-title">주어(S)</p>
          <p class="grammar-card-copy">API 결과를 바탕으로 실제 주어 성분을 표시합니다.</p>
        </article>
        <article class="grammar-card">
          <p class="grammar-card-title">동사(V)</p>
          <p class="grammar-card-copy">핵심 동사와 시제 정보를 자동으로 분리해 보여줍니다.</p>
        </article>
        <article class="grammar-card">
          <p class="grammar-card-title">목적어 / 보어</p>
          <p class="grammar-card-copy">동사 뒤 구조를 분석해 목적어인지 보어인지 구분합니다.</p>
        </article>
        <article class="grammar-card">
          <p class="grammar-card-title">상세 설명</p>
          <p class="grammar-card-copy">절 연결 방식, 문장 패턴, 학습 포인트까지 함께 정리합니다.</p>
        </article>
      </div>
      <div class="grammar-note">
        문법 분석 결과를 불러오지 못했을 때 보여주는 예비 화면입니다.
      </div>
    `;
  }

  function renderGrammarUnavailable(text, words, message) {
    const connector = detectConnector(words);

    grammarTitle.textContent = "문법 성분 분석 API를 사용할 수 없습니다.";
    grammarBadge.textContent = "API Missing";
    grammarContent.innerHTML = `
      <p><strong>원문</strong>: ${text}</p>
      <div class="grammar-chips">
        <span class="grammar-chip">단어 수 ${words.length}개</span>
        <span class="grammar-chip">${connector ? `접속사 후보: ${connector}` : "접속사 후보 없음"}</span>
      </div>
      <div class="grammar-note">
        ${message}
      </div>
    `;
  }

  function renderLoadingState(words) {
    resultTitle.textContent = "의미 단위를 정리하고 있습니다.";
    wordCount.textContent = `${words.length} words`;
    wordList.replaceChildren(
      ...words.map((word, index) =>
        createUnitCard({
          index,
          text: word,
          normalized: word.toLowerCase(),
          partOfSpeechKo: "분석 중...",
          meaningKo: "불러오는 중...",
          noteKo: "표현을 묶는 중입니다.",
        }),
      ),
    );
  }

  function renderMeaningUnits(entries) {
    resultTitle.textContent = "입력한 내용을 의미 단위로 정리했습니다.";
    wordCount.textContent = `${entries.length} units`;
    wordList.replaceChildren(
      ...entries.map((entry, index) =>
        createUnitCard({
          index,
          text: entry.text,
          normalized: entry.normalized || entry.text.toLowerCase(),
          partOfSpeechKo: entry.partOfSpeechKo,
          meaningKo: entry.meaningKo,
          noteKo: entry.noteKo,
        }),
      ),
    );
  }

  async function explainMeaningUnits(text) {
    const payload = await postJson("/api/word-explanations", { text });
    return normalizeMeaningEntries(payload.entries);
  }

  async function analyzeGrammar(text) {
    const payload = await postJson("/api/grammar-analysis", { sentence: text });
    return normalizeGrammarAnalysis(payload.analysis, text);
  }

  async function saveWordLookups(entries) {
    const words = [...new Set(entries.flatMap((entry) => entry.statsWords))];
    if (!words.length) {
      return { stats: { totalSearches: 0 } };
    }

    return postJson("/api/word-lookups", { words });
  }

  async function handleSplit() {
    const inputText = sentenceInput.value;
    const trimmedText = inputText.trim();
    const words = extractWords(inputText);
    const requestId = ++activeRequestId;

    if (!trimmedText) {
      helperText.textContent = "영어 문장이나 지문을 먼저 입력해 주세요.";
      renderEmptyState("입력된 내용이 없습니다.");
      renderSentenceSummaryEmptyState();
      renderGrammarEmptyState();
      sentenceInput.focus();
      return;
    }

    if (!words.length) {
      helperText.textContent = "영어 단어를 찾지 못했습니다. 내용을 다시 확인해 주세요.";
      renderEmptyState("분해할 영어 단어가 없습니다.");
      renderSentenceSummaryEmptyState();
      renderGrammarEmptyState();
      return;
    }

    helperText.textContent = "분석을 시작했습니다.";
    setButtonsDisabled(true);
    renderLoadingState(words);
    renderSentenceSummaryLoadingState(trimmedText);
    renderGrammarLoadingState(trimmedText, words);

    try {
      const entries = await explainMeaningUnits(trimmedText);
      if (requestId !== activeRequestId) {
        return;
      }

      renderMeaningUnits(entries);

      try {
        const analysis = await analyzeGrammar(trimmedText);
        if (requestId !== activeRequestId) {
          return;
        }

        renderSentenceSummaryResult(trimmedText, analysis);
        renderGrammarApiResult(trimmedText, analysis);
      } catch (error) {
        if (requestId !== activeRequestId) {
          return;
        }

        renderSentenceSummaryFallback(trimmedText, words);

        if (error.status === 503) {
          renderGrammarUnavailable(trimmedText, words, error.message);
        } else {
          renderGrammarPreview(trimmedText, words);
        }
      }

      try {
        const statsResponse = await saveWordLookups(entries);
        if (requestId !== activeRequestId) {
          return;
        }

        helperText.textContent = `의미 단위 ${entries.length}개를 정리했습니다. 누적 검색 수는 ${statsResponse.stats.totalSearches}회입니다.`;
      } catch (_error) {
        if (requestId !== activeRequestId) {
          return;
        }

        helperText.textContent = `의미 단위 ${entries.length}개를 정리했지만 통계 저장은 실패했습니다.`;
      }
    } catch (error) {
      if (requestId !== activeRequestId) {
        return;
      }

      helperText.textContent = error.message || "의미 단위 분석에 실패했습니다.";
      renderEmptyState("의미 단위 분석을 완료하지 못했습니다.");
      renderSentenceSummaryEmptyState();
      renderGrammarEmptyState();
    } finally {
      if (requestId === activeRequestId) {
        setButtonsDisabled(false);
      }
    }
  }

  function handleReset() {
    activeRequestId += 1;
    sentenceInput.value = "";
    helperText.textContent = "문장이나 지문을 입력하면 의미 단위, 문맥 뜻, 전체 해석, 문장별 해석, 문법 분석을 보여줍니다.";
    renderEmptyState("분석 결과가 여기에 표시됩니다.");
    renderSentenceSummaryEmptyState();
    renderGrammarEmptyState();
    setButtonsDisabled(false);
    sentenceInput.focus();
  }

  window.__studyHelperSplit = handleSplit;
  window.__studyHelperReset = handleReset;

  splitButton.addEventListener("click", handleSplit);
  resetButton.addEventListener("click", handleReset);

  helperText.textContent = "페이지 준비 완료. 문장이나 지문을 입력한 뒤 분해 버튼을 눌러 주세요.";
  renderEmptyState("분석 결과가 여기에 표시됩니다.");
  renderSentenceSummaryEmptyState();
  renderGrammarEmptyState();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp, { once: true });
} else {
  initApp();
}
